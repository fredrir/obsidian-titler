import { moment, Setting } from "obsidian";
import type { App } from "obsidian";
import { sanitizeFilename } from "../core/filename";
import { normalizeFolder } from "../core/path";
import { applyTemplate, DEFAULT_TEMPLATE } from "../core/template";
import type { FolderRule } from "../types";
import { FolderPickerModal } from "./folder-picker-modal";

/** Stand-in title used to show the user what a template will produce. */
const SAMPLE_TITLE = "My note";

export interface RuleEditorOptions {
	readonly container: HTMLElement;
	readonly app: App;
	readonly rule: FolderRule;
	/** Position in the rule list, shown as the section heading. */
	readonly index: number;
	/** Needed to preview the same truncation a real rename would apply. */
	readonly maxLength: number;
	/** Persists the edited rule. */
	onChange(): Promise<void>;
	/** Removes this rule and redraws the tab. */
	onRemove(): Promise<void>;
	/** Redraws the tab, for changes the inline controls cannot reflect. */
	onRedraw(): void;
}

/** Renders one folder rule as an editable card. */
export function renderRuleEditor(options: RuleEditorOptions): void {
	const { app, container, index, maxLength, rule } = options;
	const section = container.createDiv({ cls: "titler-rule" });

	const header = new Setting(section)
		.setName(`Rule ${index + 1}`)
		.setHeading()
		.setDesc(previewFilename(rule, maxLength))
		.addToggle((toggle) =>
			toggle
				.setTooltip("Enable this rule")
				.setValue(rule.enabled)
				.onChange(async (value) => {
					rule.enabled = value;
					await options.onChange();
				}),
		)
		.addExtraButton((button) =>
			button
				.setIcon("trash-2")
				.setTooltip("Delete rule")
				.onClick(() => void options.onRemove()),
		);

	new Setting(section)
		.setName("Folder")
		.setDesc("Leave empty for the vault root.")
		.addText((text) =>
			text
				.setPlaceholder("tmp")
				.setValue(rule.folder)
				.onChange(async (value) => {
					rule.folder = value;
					header.setDesc(previewFilename(rule, maxLength));
					await options.onChange();
				}),
		)
		.addExtraButton((button) =>
			button
				.setIcon("folder")
				.setTooltip("Browse folders")
				.onClick(() => {
					new FolderPickerModal(app, (folder) => {
						rule.folder = folder;
						void options.onChange().then(() => options.onRedraw());
					}).open();
				}),
		);

	new Setting(section).setName("Filename template").addText((text) =>
		text
			.setPlaceholder(DEFAULT_TEMPLATE)
			.setValue(rule.template)
			.onChange(async (value) => {
				rule.template = value;
				header.setDesc(previewFilename(rule, maxLength));
				await options.onChange();
			}),
	);

	new Setting(section).setName("Include subfolders").addToggle((toggle) =>
		toggle.setValue(rule.includeSubfolders).onChange(async (value) => {
			rule.includeSubfolders = value;
			await options.onChange();
		}),
	);
}

/** Shows the filename this rule would produce for a note called "My note". */
function previewFilename(rule: FolderRule, maxLength: number): DocumentFragment {
	const rendered = applyTemplate(rule.template, {
		title: SAMPLE_TITLE,
		parent: normalizeFolder(rule.folder).split("/").pop() ?? "",
		formatDate: (format) => moment().format(format),
	});
	const name = sanitizeFilename(rendered, maxLength);
	return createFragment((fragment) => {
		fragment.createSpan({ cls: "titler-preview", text: name ? `${name}.md` : "no filename" });
	});
}
