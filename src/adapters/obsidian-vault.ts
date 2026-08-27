import type { App } from "obsidian";
import { MarkdownView, TFile } from "obsidian";
import type { VaultPort } from "../services/ports";
import type { NoteRef } from "../types";

/** Binds the titling engine's {@link VaultPort} to a live Obsidian vault. */
export class ObsidianVault implements VaultPort {
	constructor(private readonly app: App) {}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	/** Prefers the open editor's buffer, which may hold unsaved keystrokes. */
	async read(note: NoteRef): Promise<string> {
		const file = this.resolve(note.path);
		if (!file) return "";
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file === file) return view.editor.getValue();
		return this.app.vault.cachedRead(file);
	}

	async rename(note: NoteRef, targetPath: string): Promise<void> {
		const file = this.resolve(note.path);
		if (!file) throw new Error(`${note.path} is no longer in the vault`);
		await this.app.fileManager.renameFile(file, targetPath);
	}

	private resolve(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}
