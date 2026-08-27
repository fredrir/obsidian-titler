import { FuzzySuggestModal, TFolder } from "obsidian";
import type { App } from "obsidian";

/** The empty string stands for the vault root throughout the settings. */
export const VAULT_ROOT = "";
const VAULT_ROOT_LABEL = "/ (vault root)";

export class FolderPickerModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly onPick: (folder: string) => void,
	) {
		super(app);
		this.setPlaceholder("Pick a folder");
	}

	override getItems(): string[] {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((path) => path !== "/")
			.sort();
		return [VAULT_ROOT, ...folders];
	}

	override getItemText(item: string): string {
		return item === VAULT_ROOT ? VAULT_ROOT_LABEL : item;
	}

	override onChooseItem(item: string): void {
		this.onPick(item);
	}
}
