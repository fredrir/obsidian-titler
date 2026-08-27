import { PluginSettingTab, Setting } from "obsidian";
import type TitlerPlugin from "../main";
import { createRule, DEFAULT_SETTINGS, SETTING_RANGES } from "../settings";
import type { TitlerSettings } from "../types";
import { renderRuleEditor } from "./rule-editor";

/** The settings whose bounds come from {@link SETTING_RANGES}. */
type SliderSetting = keyof typeof SETTING_RANGES;

const TOKEN_HELP =
	"Tokens: {{title}} for the derived title, {{date:FORMAT}} for the note's creation time, " +
	"{{parent}} for the folder name. A rule without {{title}} is applied once when the note is " +
	"created and then left alone.";

export class TitlerSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: TitlerPlugin) {
		super(plugin.app, plugin);
	}

	override display(): void {
		this.containerEl.empty();
		this.addSlider(
			"debounceMs",
			"Rename delay",
			"How long to wait after you stop typing before renaming, in milliseconds.",
		);
		this.addSlider(
			"maxWords",
			"Words to use without a heading",
			"How many opening words become the filename when the note has no heading.",
		);
		this.addSlider(
			"maxLength",
			"Maximum filename length",
			"Longer titles are cut at the last whole word that fits.",
		);
		this.addUntitledBase();
		this.addExcludedFolders();
		this.addRules();
	}

	private get settings(): TitlerSettings {
		return this.plugin.settings;
	}

	/** Bounds and current value both come from one place, so they cannot drift. */
	private addSlider(key: SliderSetting, name: string, description: string): void {
		const range = SETTING_RANGES[key];
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addSlider((slider) =>
				slider
					.setLimits(range.min, range.max, range.step)
					.setValue(this.settings[key])
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.settings[key] = value;
						await this.commit();
					}),
			);
	}

	private addUntitledBase(): void {
		new Setting(this.containerEl)
			.setName("Untitled name")
			.setDesc("Notes with this name are the ones Titler claims. Change it if your Obsidian is not in English.")
			.addText((text) =>
				text.setValue(this.settings.untitledBase).onChange(async (value) => {
					this.settings.untitledBase = value.trim() || DEFAULT_SETTINGS.untitledBase;
					await this.commit();
				}),
			);
	}

	private addExcludedFolders(): void {
		new Setting(this.containerEl)
			.setName("Excluded folders")
			.setDesc("One per line. A bare name like _Agents matches that folder anywhere in the vault.")
			.addTextArea((area) => {
				area.inputEl.rows = 4;
				area.setValue(this.settings.excludedFolders.join("\n")).onChange(async (value) => {
					this.settings.excludedFolders = value
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean);
					await this.commit();
				});
			});
	}

	private addRules(): void {
		new Setting(this.containerEl).setName("Folder rules").setHeading();
		this.containerEl.createEl("p", { cls: "titler-empty", text: TOKEN_HELP });

		this.settings.rules.forEach((rule, index) => {
			renderRuleEditor({
				container: this.containerEl,
				app: this.plugin.app,
				rule,
				index,
				maxLength: this.settings.maxLength,
				onChange: () => this.commit(),
				onRemove: async () => {
					this.settings.rules.splice(index, 1);
					await this.commit();
					this.display();
				},
				onRedraw: () => this.display(),
			});
		});

		new Setting(this.containerEl).addButton((button) =>
			button
				.setButtonText("Add rule")
				.setCta()
				.onClick(async () => {
					this.settings.rules.push(createRule());
					await this.commit();
					this.display();
				}),
		);
	}

	private async commit(): Promise<void> {
		await this.plugin.commitSettings();
	}
}
