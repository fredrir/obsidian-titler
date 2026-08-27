import type { App, TextComponent } from "obsidian";
import { Modal, Setting } from "obsidian";
import { DEFAULT_TEMPLATE } from "../core/template";
import type { FolderRule } from "../types";
import { FolderPickerModal } from "./folder-picker-modal";
import { previewDesc } from "./rule-preview";

const TOKENS = ["{{title}}", "{{parent}}", "{{date:YYYY-MM-DD}}"] as const;

export interface RuleModalOptions {
	readonly rule: FolderRule;
	/** Needed to preview the same truncation a real rename would apply. */
	readonly maxLength: number;
	/** Persists the edited rule. */
	onChange(): Promise<void>;
	/** Redraws the settings tab once the rule is done being edited. */
	onDone(): void;
}

/**
 * Edits one folder rule.
 *
 * The fields live here rather than in the settings tab so the tab can show one
 * row per rule. Edits are saved as they are made, so the only way out is done.
 */
export class RuleEditorModal extends Modal {
	private readonly rule: FolderRule;
	/** Assigned while the modal is open; the field handlers refresh it. */
	private preview: Setting | undefined;

	constructor(
		app: App,
		private readonly options: RuleModalOptions,
	) {
		super(app);
		this.rule = options.rule;
	}

	override onOpen(): void {
		this.titleEl.setText("Edit rule");
		this.addFolder();
		this.addSubfolders();
		this.addTemplate();
		this.preview = new Setting(this.contentEl).setName("Preview");
		this.refreshPreview();
		this.addDoneButton();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.preview = undefined;
		this.options.onDone();
	}

	private addFolder(): void {
		let field: TextComponent | undefined;
		new Setting(this.contentEl)
			.setName("Folder")
			.setDesc("Leave empty for the vault root.")
			.addText((text) => {
				field = text;
				text.setPlaceholder("Journal")
					.setValue(this.rule.folder)
					.onChange((value) =>
						this.edit(() => {
							this.rule.folder = value;
						}),
					);
			})
			.addExtraButton((button) =>
				button
					.setIcon("folder")
					.setTooltip("Browse folders")
					.onClick(() => {
						new FolderPickerModal(this.app, (folder) => {
							field?.setValue(folder);
							this.edit(() => {
								this.rule.folder = folder;
							});
						}).open();
					}),
			);
	}

	private addSubfolders(): void {
		new Setting(this.contentEl)
			.setName("Include subfolders")
			.setDesc("Whether the rule also covers notes nested below the folder.")
			.addToggle((toggle) =>
				toggle.setValue(this.rule.includeSubfolders).onChange((value) =>
					this.edit(() => {
						this.rule.includeSubfolders = value;
					}),
				),
			);
	}

	private addTemplate(): void {
		new Setting(this.contentEl)
			.setName("Filename template")
			.setDesc(tokenHelp())
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_TEMPLATE)
					.setValue(this.rule.template)
					.onChange((value) =>
						this.edit(() => {
							this.rule.template = value;
						}),
					),
			);
	}

	private addDoneButton(): void {
		const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
		footer.createEl("button", { cls: "mod-cta", text: "Done" }).addEventListener("click", () => this.close());
	}

	/** Applies one edit, keeps the preview honest, and persists the result. */
	private edit(change: () => void): void {
		change();
		this.refreshPreview();
		void this.options.onChange();
	}

	private refreshPreview(): void {
		this.preview?.setDesc(previewDesc(this.rule, this.options.maxLength));
	}
}

/** Names the tokens where they are typed, so the tab needs no legend of its own. */
function tokenHelp(): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText("Tokens: ");
		TOKENS.forEach((token, index) => {
			if (index >= 0) fragment.appendText(", ");
			fragment.createEl("code", { text: token });
		});
	});
}
