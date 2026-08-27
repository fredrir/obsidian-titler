/**
 * A folder-scoped naming rule. The deepest folder whose rule matches a note
 * decides how that note is named; see {@link matchRule}.
 */
export interface FolderRule {
	/** Vault-relative folder path. An empty string means the vault root. */
	folder: string;
	/** Whether the rule also covers notes nested below {@link FolderRule.folder}. */
	includeSubfolders: boolean;
	/** Filename template, for example `"idea - {{title}}"`. */
	template: string;
	/** Disabled rules are skipped during matching. */
	enabled: boolean;
}

export interface TitlerSettings {
	/** Idle time after the last keystroke before a rename is considered, in milliseconds. */
	debounceMs: number;
	/** How many opening words become the filename when a note has no heading. */
	maxWords: number;
	/** Hard cap on a generated filename, in characters. */
	maxLength: number;
	/** The basename Obsidian gives new notes, and so the notes Titler claims. */
	untitledBase: string;
	/** Folders Titler never touches. */
	excludedFolders: string[];
	/** Whether a new note opens with the caret in its body rather than its title. */
	skipTitlePrompt: boolean;
	rules: FolderRule[];
}

/** Vault path to the basename Titler last gave that note. */
export type TrackedNotes = Record<string, string>;

/** The on-disk shape written by `Plugin.saveData()`. */
export interface PersistedData {
	settings: TitlerSettings;
	tracked: TrackedNotes;
}

/**
 * The slice of a note the titling engine needs. Keeping this structural rather
 * than depending on `TFile` lets the engine run without an Obsidian runtime.
 */
export interface NoteRef {
	/** Vault-relative path, including the `.md` extension. */
	readonly path: string;
	/** Filename without its extension. */
	readonly basename: string;
	/** Creation time in epoch milliseconds, used by the `{{date}}` token. */
	readonly createdAt: number;
}

/** Everything a filename template can interpolate. */
export interface TemplateValues {
	/** The title derived from the note body, or `""` when there is none. */
	readonly title: string;
	/** The name of the folder holding the note. */
	readonly parent: string;
	/** Renders the note's creation time in a Moment.js format string. */
	readonly formatDate: (format: string) => string;
}

/** Renders an epoch-millisecond timestamp in a Moment.js format string. */
export type FormatDate = (timestamp: number, format: string) => string;
