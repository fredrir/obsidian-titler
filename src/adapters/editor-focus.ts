import type { App, TFile } from "obsidian";
import { MarkdownView } from "obsidian";

/**
 * Puts the caret in the body of a note that was just created.
 *
 * Obsidian opens a new note with its title focused and selected, so the first
 * thing you type names the file instead of starting the note, and you have to
 * press Enter before you may write. Focusing the editor drops that selection;
 * the file keeps its untitled name until Titler renames it from the content.
 *
 * The title is left exactly as it was, so blurring it renames nothing.
 *
 * Returns whether the caret ended up in the note's body. A `false` means the
 * note was not open yet and the caller may try again.
 */
export function focusNoteBody(app: App, file: TFile): boolean {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.file?.path !== file.path) return false;

	// Already typing in the body: leave the caret where the user put it.
	if (view.editor.hasFocus()) return true;

	view.editor.focus();
	view.editor.setCursor({ line: 0, ch: 0 });
	return view.editor.hasFocus();
}
