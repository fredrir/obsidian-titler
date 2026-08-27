import type { App } from "obsidian";
import { Setting } from "obsidian";
import { createRule } from "../settings";
import type { FolderRule } from "../types";
import { RuleEditorModal } from "./rule-modal";
import { folderLabel, previewDesc } from "./rule-preview";

export interface RuleListOptions {
	readonly container: HTMLElement;
	readonly app: App;
	readonly rules: FolderRule[];
	/** Needed to preview the same truncation a real rename would apply. */
	readonly maxLength: number;
	/** Persists the edited rules. */
	onChange(): Promise<void>;
	/** Redraws the settings tab, for changes a row cannot show on its own. */
	onRedraw(): void;
}

/**
 * Lists the folder rules, one row each: the folder it covers, the filename it
 * produces, and the three things worth reaching for without opening it. The
 * fields themselves live in {@link RuleEditorModal}.
 */
export function renderRuleList(options: RuleListOptions): void {
	new Setting(options.container)
		.setName("Folder rules")
		.setHeading()
		.addButton((button) =>
			button
				.setButtonText("Add rule")
				.setCta()
				.onClick(() => addRule(options)),
		);

	if (options.rules.length === 0) {
		options.container.createEl("p", {
			cls: "titler-empty",
		});
		return;
	}

	options.rules.forEach((rule, index) => {
		renderRuleRow(options, rule, index);
	});
}

function renderRuleRow(options: RuleListOptions, rule: FolderRule, index: number): void {
	const row = new Setting(options.container)
		.setName(folderLabel(rule))
		.setDesc(previewDesc(rule, options.maxLength))
		.addExtraButton((button) =>
			button
				.setIcon("pencil")
				.setTooltip("Edit rule")
				.onClick(() => openEditor(options, rule)),
		)
		.addExtraButton((button) =>
			button
				.setIcon("trash-2")
				.setTooltip("Delete rule")
				.onClick(() => {
					options.rules.splice(index, 1);
					void options.onChange().then(() => options.onRedraw());
				}),
		)
		.addToggle((toggle) =>
			toggle
				.setTooltip("Enable this rule")
				.setValue(rule.enabled)
				.onChange(async (value) => {
					rule.enabled = value;
					row.settingEl.toggleClass("titler-rule-off", !value);
					await options.onChange();
				}),
		);

	// A switched-off rule still says what it would do, only faded.
	row.settingEl.toggleClass("titler-rule-off", !rule.enabled);
}

/** A new rule is empty, so it opens straight into the editor. */
function addRule(options: RuleListOptions): void {
	const rule = createRule();
	options.rules.push(rule);
	void options.onChange().then(() => {
		options.onRedraw();
		openEditor(options, rule);
	});
}

function openEditor(options: RuleListOptions, rule: FolderRule): void {
	new RuleEditorModal(options.app, {
		rule,
		maxLength: options.maxLength,
		onChange: () => options.onChange(),
		onDone: () => options.onRedraw(),
	}).open();
}
