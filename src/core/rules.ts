import type { FolderRule } from "../types";
import { folderOf, normalizeFolder } from "./path";

/**
 * The most specific enabled rule covering `path`, or `null` when none applies.
 * Ties between equally deep folders go to the rule listed first.
 */
export function matchRule(path: string, rules: readonly FolderRule[]): FolderRule | null {
	const folder = folderOf(path);
	let best: FolderRule | null = null;
	let bestDepth = -1;

	for (const rule of rules) {
		if (!rule.enabled) continue;
		const target = normalizeFolder(rule.folder);
		if (!matchesFolder(folder, target, rule.includeSubfolders)) continue;
		const depth = target ? target.split("/").length : 0;
		if (depth > bestDepth) {
			best = rule;
			bestDepth = depth;
		}
	}

	return best;
}

/** Folder comparisons are case-insensitive, matching Obsidian's own path handling. */
function matchesFolder(folder: string, target: string, includeSubfolders: boolean): boolean {
	const current = folder.toLowerCase();
	const wanted = target.toLowerCase();
	if (!wanted) return includeSubfolders || current === "";
	if (current === wanted) return true;
	return includeSubfolders && current.startsWith(`${wanted}/`);
}
