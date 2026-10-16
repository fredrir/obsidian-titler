import type { App, Debouncer, EventRef, TAbstractFile, TFile } from "obsidian";
import { debounce, TFolder } from "obsidian";
import { isUntitled } from "../core/filename";
import { basenameOf, isExcluded } from "../core/path";
import { matchRule } from "../core/rules";
import { isStaticTemplate } from "../core/template";
import type { TitlerEngine } from "../services/titler";
import type { NoteTracker } from "../services/tracker";
import type { TitlerSettings } from "../types";
import { focusNoteBody } from "./editor-focus";
import { isMarkdownFile, toNoteRef } from "./files";
import { skipTitlePromptWhen } from "./title-prompt";

/** How long to let Obsidian settle before naming a note from a static rule. */
const CREATE_SETTLE_MS = 100;

/**
 * When to reach for the editor of a new note, in milliseconds after it appears.
 * The first attempt is late enough to land after Obsidian has focused the
 * title; the rest cover a slow open, and stop as soon as one of them lands.
 */
const FOCUS_ATTEMPTS_MS = [100, 250, 500] as const;

/** How long after it appears a new note may skip Obsidian's title prompt. */
const FRESH_NOTE_MS = 1000;

/**
 * What the watcher needs from the plugin. Declared structurally so the watcher
 * does not import the plugin class, which would close an import cycle.
 */
export interface TitlerHost {
	readonly app: App;
	readonly engine: TitlerEngine;
	readonly tracker: NoteTracker;
	readonly settings: TitlerSettings;
	/** Schedules a debounced write of the plugin's state. */
	persistSoon(): void;
	registerEvent(ref: EventRef): void;
	register(cleanup: () => void): void;
}

/**
 * Turns vault and workspace activity into titling decisions.
 *
 * Keystrokes are buffered by path rather than acted on directly: the editor
 * holds text the metadata cache has not seen yet, and a burst of typing should
 * cost one rename attempt rather than one per character.
 */
export class Watcher {
	private readonly pending = new Map<string, string>();
	private readonly freshNotes = new Set<string>();
	private readonly timers = new Set<number>();
	private flushSoon: Debouncer<[], void>;

	constructor(private readonly host: TitlerHost) {
		this.flushSoon = this.createFlushDebouncer();
	}

	start(): void {
		const { app } = this.host;

		this.host.registerEvent(
			app.workspace.on("editor-change", (editor, info) => {
				const file = info.file;
				if (!isMarkdownFile(file) || !this.host.engine.isClaimed(toNoteRef(file))) return;
				this.pending.set(file.path, editor.getValue());
				this.flushSoon();
			}),
		);

		this.host.registerEvent(
			app.metadataCache.on("changed", (file, data) => {
				// Buffered keystrokes are fresher than what the cache just parsed.
				if (!app.workspace.layoutReady || this.pending.has(file.path)) return;
				if (!isMarkdownFile(file) || !this.host.engine.isClaimed(toNoteRef(file))) return;
				void this.host.engine.evaluate(toNoteRef(file), data);
			}),
		);

		this.host.registerEvent(app.vault.on("create", (file) => this.onCreate(file)));
		this.host.registerEvent(app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		this.host.registerEvent(app.vault.on("delete", (file) => this.onDelete(file)));
		this.host.registerEvent(app.workspace.on("active-leaf-change", () => this.flush()));
		this.host.register(skipTitlePromptWhen(app, (file) => this.freshNotes.delete(file.path)));

		this.host.register(() => this.stop());
		app.workspace.onLayoutReady(() => this.pruneClaims());
	}

	/** Rebuilds the debouncer after the rename delay setting changes. */
	refresh(): void {
		this.flushSoon.cancel();
		this.flushSoon = this.createFlushDebouncer();
	}

	/**
	 * Drops every scheduled callback. Buffered edits are deliberately discarded
	 * rather than flushed: renaming files while the plugin tears down would
	 * outlive the handlers meant to observe the result.
	 */
	stop(): void {
		this.flushSoon.cancel();
		for (const timer of this.timers) window.clearTimeout(timer);
		this.timers.clear();
		this.pending.clear();
		this.freshNotes.clear();
	}

	private createFlushDebouncer(): Debouncer<[], void> {
		return debounce(() => this.flush(), this.host.settings.debounceMs, true);
	}

	private flush(): void {
		if (this.pending.size === 0) return;
		const buffered = [...this.pending];
		this.pending.clear();
		for (const [path, text] of buffered) {
			const file = this.host.app.vault.getAbstractFileByPath(path);
			if (isMarkdownFile(file)) void this.host.engine.evaluate(toNoteRef(file), text);
		}
	}

	private onCreate(file: TAbstractFile): void {
		// Obsidian replays creation events for the whole vault on startup.
		if (!this.host.app.workspace.layoutReady || !isMarkdownFile(file)) return;
		if (isExcluded(file.path, this.host.settings.excludedFolders)) return;
		if (this.host.settings.skipTitlePrompt) this.startInBody(file);
		if (!isUntitled(file.basename, this.host.settings.untitledBase)) return;

		this.host.tracker.claim(file.path, file.basename);
		this.host.persistSoon();

		// A rule that ignores {{title}} can name the note right away; anything
		// else has to wait until the note actually has content.
		const rule = matchRule(file.path, this.host.settings.rules);
		if (!rule || !isStaticTemplate(rule.template)) return;
		this.defer(() => void this.host.engine.evaluate(toNoteRef(file), ""), CREATE_SETTLE_MS);
	}

	private startInBody(file: TFile): void {
		this.freshNotes.add(file.path);
		this.defer(() => this.freshNotes.delete(file.path), FRESH_NOTE_MS);
		this.focusBody(file);
	}

	/**
	 * Moves the caret into a new note's body, retrying while the note has yet to
	 * open. Retrying only after a miss keeps a later attempt from pulling focus
	 * back out of a title the user chose to write in themselves.
	 */
	private focusBody(file: TFile, attempt = 0): void {
		const delay = FOCUS_ATTEMPTS_MS[attempt];
		if (delay === undefined) return;
		this.defer(() => {
			if (!focusNoteBody(this.host.app, file)) this.focusBody(file, attempt + 1);
		}, delay);
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		const { engine, tracker } = this.host;
		if (engine.isRenaming(oldPath) || engine.isRenaming(file.path)) return;

		if (file instanceof TFolder) {
			if (tracker.moveFolder(oldPath, file.path)) this.host.persistSoon();
			return;
		}
		if (!tracker.isClaimed(oldPath)) return;

		// Same name in a new folder is a move, so the claim follows. A changed
		// name means the user named it themselves, so Titler steps back.
		if (basenameOf(oldPath) === basenameOf(file.path)) tracker.transfer(oldPath, file.path);
		engine.forget(oldPath);
		this.pending.delete(oldPath);
		this.host.persistSoon();
	}

	private onDelete(file: TAbstractFile): void {
		const released =
			file instanceof TFolder ? this.host.tracker.releaseFolder(file.path) : this.host.engine.forget(file.path);
		this.pending.delete(file.path);
		if (released) this.host.persistSoon();
	}

	/** Forgets notes that vanished or were renamed while the plugin was off. */
	private pruneClaims(): void {
		const changed = this.host.tracker.prune((path, basename) => {
			const file = this.host.app.vault.getAbstractFileByPath(path);
			return isMarkdownFile(file) && file.basename === basename;
		});
		if (changed) this.host.persistSoon();
	}

	private defer(callback: () => void, delay: number): void {
		const timer = window.setTimeout(() => {
			this.timers.delete(timer);
			callback();
		}, delay);
		this.timers.add(timer);
	}
}
