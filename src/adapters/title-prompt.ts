import { around } from "monkey-around";
import type { App, TFile } from "obsidian";

/** Obsidian asks for a new note's name here when no title is visible; not public API. */
interface TitlePromptFileManager {
	promptForFileRename(file: TFile): Promise<void>;
}

export function skipTitlePromptWhen(app: App, shouldSkip: (file: TFile) => boolean): () => void {
	return around(app.fileManager as unknown as TitlePromptFileManager, {
		promptForFileRename: (original) =>
			function (this: TitlePromptFileManager, file: TFile) {
				return shouldSkip(file) ? Promise.resolve() : original.call(this, file);
			},
	});
}
