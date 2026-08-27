import { isUntitled, sanitizeFilename, uniqueBasename } from "../core/filename";
import { isOptedOut, splitFrontmatter } from "../core/frontmatter";
import { folderOf, isExcluded, joinPath, parentFolderName } from "../core/path";
import { matchRule } from "../core/rules";
import { applyTemplate, DEFAULT_TEMPLATE, isStaticTemplate } from "../core/template";
import { deriveTitle } from "../core/title";
import type { FormatDate, NoteRef, TitlerSettings } from "../types";
import type { VaultPort } from "./ports";
import type { NoteTracker } from "./tracker";

/** Why a note was left alone. Reported so explicit retitles can explain themselves. */
export type SkipReason =
	| "excluded"
	| "unclaimed"
	| "opted-out"
	| "rename-in-flight"
	| "no-title"
	| "empty-filename"
	| "already-named"
	| "failed-before"
	| "no-free-name";

export type TitlingResult =
	| { readonly kind: "renamed"; readonly from: string; readonly to: string }
	| { readonly kind: "skipped"; readonly reason: SkipReason }
	| { readonly kind: "failed"; readonly cause: unknown };

export interface TitlerEngineDeps {
	readonly vault: VaultPort;
	readonly tracker: NoteTracker;
	/** Read fresh each time, so setting changes take effect without rewiring. */
	readonly settings: () => TitlerSettings;
	readonly formatDate: FormatDate;
	/** Called whenever a claim changed and should eventually reach disk. */
	readonly onClaimsChanged: () => void;
}

export interface EvaluateOptions {
	/** Ignores the claim check and any earlier rename failure for this note. */
	readonly force?: boolean;
}

/**
 * Decides what a note should be called and renames it. Pure decision-making
 * plus one `VaultPort` call, so it can be exercised without Obsidian.
 */
export class TitlerEngine {
	/** Paths involved in an in-flight rename, so we do not react to our own work. */
	private readonly renaming = new Set<string>();
	/** Last name that failed to apply per path, so a hopeless rename is not retried. */
	private readonly failures = new Map<string, string>();

	constructor(private readonly deps: TitlerEngineDeps) {}

	/** Whether a path is currently being renamed by this engine. */
	isRenaming(path: string): boolean {
		return this.renaming.has(path);
	}

	/** Whether the engine would consider this note without being forced. */
	isClaimed(note: NoteRef): boolean {
		if (this.deps.tracker.isClaimed(note.path)) return true;
		return isUntitled(note.basename, this.deps.settings().untitledBase);
	}

	/** Stops following a note and forgets any rename failure recorded for it. */
	forget(path: string): boolean {
		this.failures.delete(path);
		return this.deps.tracker.release(path);
	}

	async evaluate(note: NoteRef, text: string, options: EvaluateOptions = {}): Promise<TitlingResult> {
		const force = options.force ?? false;
		const settings = this.deps.settings();

		if (this.renaming.has(note.path)) return skipped("rename-in-flight");
		if (isExcluded(note.path, settings.excludedFolders)) return skipped("excluded");
		if (!force && !this.isClaimed(note)) return skipped("unclaimed");
		if (isOptedOut(splitFrontmatter(text).frontmatter)) return skipped("opted-out");

		const template = matchRule(note.path, settings.rules)?.template ?? DEFAULT_TEMPLATE;
		const isStatic = isStaticTemplate(template);
		const title = deriveTitle(text, { maxWords: settings.maxWords });
		if (!title && !isStatic) return skipped("no-title");

		const rendered = applyTemplate(template, {
			title: title ?? "",
			parent: parentFolderName(note.path),
			formatDate: (format) => this.deps.formatDate(note.createdAt, format),
		});
		const name = sanitizeFilename(rendered, settings.maxLength);
		if (!name) return skipped("empty-filename");
		if (name === note.basename) return this.settle(note, isStatic);
		if (!force && this.failures.get(note.path) === name) return skipped("failed-before");

		return this.rename(note, name, isStatic);
	}

	/**
	 * The note already carries the name its rule produces. A static rule is
	 * finished with it for good; a title-derived rule keeps following it.
	 */
	private settle(note: NoteRef, isStatic: boolean): TitlingResult {
		if (isStatic) {
			if (this.forget(note.path)) this.deps.onClaimsChanged();
		} else if (this.deps.tracker.claimedBasename(note.path) !== note.basename) {
			this.deps.tracker.claim(note.path, note.basename);
			this.deps.onClaimsChanged();
		}
		return skipped("already-named");
	}

	private async rename(note: NoteRef, name: string, releaseAfterwards: boolean): Promise<TitlingResult> {
		const folder = folderOf(note.path);
		const currentBasename = note.basename.toLowerCase();
		const target = uniqueBasename(
			name,
			// The note's own name never counts as taken, which lets a pure case
			// change such as `notes` to `Notes` go through.
			(candidate) =>
				candidate.toLowerCase() !== currentBasename && this.deps.vault.exists(joinPath(folder, candidate)),
		);
		if (!target || target === note.basename) return skipped("no-free-name");

		const fromPath = note.path;
		const toPath = joinPath(folder, target);
		this.renaming.add(fromPath);
		this.renaming.add(toPath);
		try {
			await this.deps.vault.rename(note, toPath);
			this.forget(fromPath);
			if (!releaseAfterwards) this.deps.tracker.claim(toPath, target);
			this.deps.onClaimsChanged();
			return { kind: "renamed", from: fromPath, to: toPath };
		} catch (cause) {
			this.failures.set(fromPath, name);
			return { kind: "failed", cause };
		} finally {
			this.renaming.delete(fromPath);
			this.renaming.delete(toPath);
		}
	}
}

function skipped(reason: SkipReason): TitlingResult {
	return { kind: "skipped", reason };
}
