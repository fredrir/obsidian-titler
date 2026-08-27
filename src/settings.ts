import { DEFAULT_TEMPLATE } from "./core/template";
import type { FolderRule, TitlerSettings, TrackedNotes } from "./types";

export interface NumericRange {
	readonly min: number;
	readonly max: number;
	readonly step: number;
}

/**
 * Bounds for the numeric settings. The settings tab renders its sliders from
 * these and {@link parseSettings} clamps persisted values to them, so the two
 * can never disagree.
 */
export const SETTING_RANGES = {
	debounceMs: { min: 200, max: 3000, step: 100 },
	maxWords: { min: 3, max: 8, step: 1 },
	maxLength: { min: 20, max: 120, step: 5 },
} as const satisfies Record<string, NumericRange>;

export const DEFAULT_RULE: FolderRule = {
	folder: "",
	includeSubfolders: true,
	template: DEFAULT_TEMPLATE,
	enabled: true,
};

export const DEFAULT_SETTINGS: TitlerSettings = {
	debounceMs: 700,
	maxWords: 5,
	maxLength: 60,
	untitledBase: "Untitled",
	excludedFolders: ["Transcripts", "Obsidian/Templates", "Obsidian/Attachments"],
	rules: [],
};

export function createRule(): FolderRule {
	return { ...DEFAULT_RULE };
}

/** A fresh copy of the defaults, safe to mutate without touching the originals. */
export function defaultSettings(): TitlerSettings {
	return { ...DEFAULT_SETTINGS, excludedFolders: [...DEFAULT_SETTINGS.excludedFolders], rules: [] };
}

/** Rebuilds settings from whatever `loadData()` returned, clamped and complete. */
export function parseSettings(value: unknown): TitlerSettings {
	const raw = isRecord(value) ? value : {};
	return {
		debounceMs: readNumber(raw.debounceMs, DEFAULT_SETTINGS.debounceMs, SETTING_RANGES.debounceMs),
		maxWords: readNumber(raw.maxWords, DEFAULT_SETTINGS.maxWords, SETTING_RANGES.maxWords),
		maxLength: readNumber(raw.maxLength, DEFAULT_SETTINGS.maxLength, SETTING_RANGES.maxLength),
		untitledBase: readNonEmptyString(raw.untitledBase, DEFAULT_SETTINGS.untitledBase),
		excludedFolders: readStringArray(raw.excludedFolders, DEFAULT_SETTINGS.excludedFolders),
		rules: Array.isArray(raw.rules) ? raw.rules.map(parseRule) : [],
	};
}

/**
 * Rebuilds the tracked-note claims as a `Map`, which keeps keys such as
 * `__proto__` from ever reaching an object prototype.
 */
export function parseTrackedNotes(value: unknown): Map<string, string> {
	const claims = new Map<string, string>();
	if (!isRecord(value)) return claims;
	for (const [path, basename] of Object.entries(value)) {
		if (typeof basename === "string" && path) claims.set(path, basename);
	}
	return claims;
}

export function toTrackedNotes(claims: ReadonlyMap<string, string>): TrackedNotes {
	return Object.fromEntries(claims);
}

function parseRule(value: unknown): FolderRule {
	if (!isRecord(value)) return createRule();
	return {
		folder: readString(value.folder, DEFAULT_RULE.folder),
		includeSubfolders: readBoolean(value.includeSubfolders, DEFAULT_RULE.includeSubfolders),
		template: readNonEmptyString(value.template, DEFAULT_RULE.template),
		enabled: readBoolean(value.enabled, DEFAULT_RULE.enabled),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function readNonEmptyString(value: unknown, fallback: string): string {
	return readString(value, "").trim() || fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, range: NumericRange): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function readStringArray(value: unknown, fallback: readonly string[]): string[] {
	if (!Array.isArray(value)) return [...fallback];
	return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}
