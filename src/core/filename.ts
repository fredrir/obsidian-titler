import { stripControlCharacters } from "./text";

/** Characters that break vault paths, wikilinks or tags. */
const ILLEGAL_CHARACTERS = /[\\/:*?"<>|#^[\]]/g;
const COLLAPSIBLE_WHITESPACE = /\s+/g;
const LEADING_DOTS = /^[.\s]+/;
const TRAILING_DOTS = /[.\s]+$/;
const DIGITS_ONLY = /^\d+$/;

/** Obsidian itself gives up past this many collision suffixes. */
const MAX_COLLISION_SUFFIX = 999;

export type IsBasenameTaken = (basename: string) => boolean;

/**
 * Turns rendered template output into a filename Obsidian will accept, cut to
 * `maxLength` at the last whole word that fits. Returns `""` when nothing
 * usable survives.
 */
export function sanitizeFilename(name: string, maxLength: number): string {
	const cleaned = stripControlCharacters(name)
		.replace(ILLEGAL_CHARACTERS, " ")
		.replace(COLLAPSIBLE_WHITESPACE, " ")
		.replace(LEADING_DOTS, "")
		.replace(TRAILING_DOTS, "");
	if (!cleaned) return "";
	return truncateAtWord(cleaned, Math.max(1, maxLength));
}

/**
 * Whether a basename is one Obsidian would have generated for a new note:
 * the configured base, optionally followed by a number.
 */
export function isUntitled(basename: string, untitledBase: string): boolean {
	if (!untitledBase) return false;
	if (basename === untitledBase) return true;
	if (!basename.startsWith(`${untitledBase} `)) return false;
	return DIGITS_ONLY.test(basename.slice(untitledBase.length + 1));
}

/**
 * Appends ` 2`, ` 3` and so on until a free basename turns up. Returns `""`
 * when every candidate is taken.
 */
export function uniqueBasename(base: string, isTaken: IsBasenameTaken): string {
	if (!base) return "";
	if (!isTaken(base)) return base;
	for (let suffix = 2; suffix <= MAX_COLLISION_SUFFIX; suffix++) {
		const candidate = `${base} ${suffix}`;
		if (!isTaken(candidate)) return candidate;
	}
	return "";
}

function truncateAtWord(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit);
	const boundary = cut.lastIndexOf(" ");
	// Keep the full cut when it already lands on a word break, and keep a
	// partial word rather than nothing when the text has no break at all.
	const trimmed = text[limit] === " " || boundary <= 0 ? cut : cut.slice(0, boundary);
	return trimmed.replace(TRAILING_DOTS, "");
}
