import type { TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import { MARKDOWN_EXTENSION } from "../core/path";
import type { NoteRef } from "../types";

/** Narrows a vault entry to a markdown note, the only thing Titler renames. */
export function isMarkdownFile(file: TAbstractFile | null | undefined): file is TFile {
	return file instanceof TFile && file.extension === MARKDOWN_EXTENSION;
}

export function toNoteRef(file: TFile): NoteRef {
	return { path: file.path, basename: file.basename, createdAt: file.stat.ctime };
}
