import type { NoteRef } from "../types";

/**
 * The vault operations the titling engine needs. Implemented against Obsidian
 * in `adapters/obsidian-vault.ts`, and faked in tests.
 */
export interface VaultPort {
	/** Whether any file already sits at `path`. */
	exists(path: string): boolean;
	/** The note's current text, preferring unsaved editor content over disk. */
	read(note: NoteRef): Promise<string>;
	/** Moves the note to `targetPath`, updating links. Rejects on failure. */
	rename(note: NoteRef, targetPath: string): Promise<void>;
}
