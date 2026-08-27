import { debounce, moment, Plugin } from "obsidian";
import type { App, Debouncer, PluginManifest } from "obsidian";
import { ObsidianVault } from "./adapters/obsidian-vault";
import { Watcher } from "./adapters/watcher";
import { registerCommands } from "./commands";
import { defaultSettings, parseSettings, parseTrackedNotes } from "./settings";
import { TitlerEngine } from "./services/titler";
import { NoteTracker } from "./services/tracker";
import type { FormatDate, PersistedData, TitlerSettings } from "./types";
import { TitlerSettingTab } from "./ui/settings-tab";

/** How long claims may sit in memory before being written to disk. */
const SAVE_DEBOUNCE_MS = 2000;

const formatDate: FormatDate = (timestamp, format) => moment(timestamp).format(format);

export default class TitlerPlugin extends Plugin {
	settings: TitlerSettings = defaultSettings();
	readonly tracker = new NoteTracker();
	readonly vault: ObsidianVault;
	readonly engine: TitlerEngine;

	private readonly watcher: Watcher;
	private readonly saveSoon: Debouncer<[], void> = debounce(() => void this.save(), SAVE_DEBOUNCE_MS, true);

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.vault = new ObsidianVault(app);
		this.engine = new TitlerEngine({
			vault: this.vault,
			tracker: this.tracker,
			// Read lazily so setting changes take effect without rewiring.
			settings: () => this.settings,
			formatDate,
			onClaimsChanged: () => this.persistSoon(),
		});
		this.watcher = new Watcher(this);
	}

	override async onload(): Promise<void> {
		const stored: unknown = await this.loadData();
		const raw = isRecord(stored) ? stored : {};
		this.settings = parseSettings(raw.settings);
		this.tracker.reset(parseTrackedNotes(raw.tracked));

		this.watcher.refresh();
		this.watcher.start();
		this.addSettingTab(new TitlerSettingTab(this));
		registerCommands(this);
	}

	override onunload(): void {
		this.saveSoon.cancel();
		void this.save();
	}

	/** Schedules a debounced write; claims change far more often than they matter. */
	persistSoon(): void {
		this.saveSoon();
	}

	/** Persists edited settings and picks up a changed rename delay. */
	async commitSettings(): Promise<void> {
		this.watcher.refresh();
		await this.save();
	}

	private async save(): Promise<void> {
		const data: PersistedData = { settings: this.settings, tracked: this.tracker.toJSON() };
		await this.saveData(data);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
