import type { TFile } from "obsidian";
import { Notice } from "obsidian";
import { findExplorerRenameTarget, renameInExplorer } from "../adapters/file-explorer";
import { isMarkdownFile } from "../adapters/files";
import type TitlerPlugin from "../main";
import { retitleNote } from "./retitle";

/** Command IDs are part of the plugin's public surface; never rename them. */
export function registerCommands(plugin: TitlerPlugin): void {
	plugin.addCommand({
		id: "retitle-note",
		name: "Retitle this note now",
		checkCallback: (checking) => withActiveNote(plugin, checking, (file) => void retitleNote(plugin, file)),
	});

	plugin.addCommand({
		id: "stop-titling",
		name: "Stop auto-titling this note",
		checkCallback: (checking) =>
			withActiveNote(plugin, checking, (file) => {
				plugin.engine.forget(file.path);
				plugin.persistSoon();
				new Notice(`Titler released "${file.basename}"`);
			}),
	});

	plugin.addCommand({
		id: "resume-titling",
		name: "Resume auto-titling this note",
		checkCallback: (checking) =>
			withActiveNote(plugin, checking, (file) => {
				plugin.tracker.claim(file.path, file.basename);
				plugin.persistSoon();
				new Notice(`Titler is following "${file.basename}"`);
			}),
	});

	plugin.addCommand({
		id: "rename-in-explorer",
		name: "Rename in file explorer",
		checkCallback: (checking) => {
			const target = findExplorerRenameTarget(plugin.app);
			if (!target) return false;
			if (!checking) void renameInExplorer(plugin.app, target);
			return true;
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			if (!isMarkdownFile(file)) return;
			menu.addItem((item) =>
				item
					.setTitle("Retitle note")
					.setIcon("text-cursor-input")
					.onClick(() => void retitleNote(plugin, file)),
			);
		}),
	);
}

/** Runs `action` on the active note, and reports whether the command applies. */
function withActiveNote(plugin: TitlerPlugin, checking: boolean, action: (file: TFile) => void): boolean {
	const file = plugin.app.workspace.getActiveFile();
	if (!isMarkdownFile(file)) return false;
	if (!checking) action(file);
	return true;
}
