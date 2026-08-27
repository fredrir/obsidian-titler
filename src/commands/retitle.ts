import type { TFile } from "obsidian";
import { Notice } from "obsidian";
import { toNoteRef } from "../adapters/files";
import type TitlerPlugin from "../main";
import type { SkipReason, TitlingResult } from "../services/titler";

/**
 * What to tell the user when an explicit retitle does nothing. `null` means the
 * outcome is either invisible to the user or impossible for a forced run.
 */
const SKIP_NOTICES: Record<SkipReason, string | null> = {
	excluded: "Titler leaves that note alone: its folder is excluded.",
	"opted-out": "Titler leaves that note alone: its frontmatter says titler: false.",
	"no-title": "That note has no heading or opening words to name it from.",
	"empty-filename": "That folder rule renders an empty filename.",
	"no-free-name": "Every filename based on that title is already taken.",
	"already-named": "That note already has the name Titler would give it.",
	"rename-in-flight": null,
	unclaimed: null,
	"failed-before": null,
};

/** Renames a note on the user's say-so, ignoring whether Titler was following it. */
export async function retitleNote(plugin: TitlerPlugin, file: TFile): Promise<void> {
	const note = toNoteRef(file);
	plugin.tracker.claim(note.path, note.basename);
	const result = await plugin.engine.evaluate(note, await plugin.vault.read(note), { force: true });
	plugin.persistSoon();
	announce(result);
}

function announce(result: TitlingResult): void {
	if (result.kind === "renamed") return;
	if (result.kind === "failed") {
		console.error("Obsidian Titler: rename failed", result.cause);
		new Notice("Titler could not rename that note. See the developer console for details.");
		return;
	}
	const message = SKIP_NOTICES[result.reason];
	if (message) new Notice(message);
}
