/** Unicode control characters, which are illegal in filenames on every platform. */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/** Line prefixes that structure a document but say nothing about its subject. */
const LINE_MARKERS: readonly RegExp[] = [
	/^>\s?/, // blockquote
	/^\[!\w+\][+-]?\s*/, // callout label
	/^[-*+]\s+/, // bullet
	/^\d+[.)]\s+/, // ordered list
	/^\[[ xX/-]\]\s+/, // task checkbox
	/^#{1,6}\s+/, // heading hashes
	/^\|\s*/, // leading table cell
];

const TRAILING_TABLE_CELL = /\s*\|\s*$/;
const WIKILINK_TARGET_SEPARATOR = /[#^]/;
const COLLAPSIBLE_WHITESPACE = /\s+/g;

/** Replaces control characters with spaces so they collapse away with the rest. */
export function stripControlCharacters(text: string): string {
	return text.replace(CONTROL_CHARACTERS, " ");
}

/**
 * Peels list, task, quote, callout and table prefixes off a line, repeating
 * until nothing more comes off: `"> - [x] done thing"` becomes `"done thing"`.
 */
export function stripLineMarkers(line: string): string {
	let text = line.trim();
	let previous: string;
	do {
		previous = text;
		for (const marker of LINE_MARKERS) text = text.replace(marker, "");
	} while (text !== previous);
	return text.replace(TRAILING_TABLE_CELL, "").trim();
}

/**
 * Reduces inline markdown to the words a reader would actually see: comments
 * and embeds go away, links keep their display text, emphasis is unwrapped.
 */
export function cleanInline(text: string): string {
	return text
		.replace(/<!--[\s\S]*?-->/g, " ") // HTML comment
		.replace(/%%[\s\S]*?%%/g, " ") // Obsidian comment
		.replace(/!\[\[[^\]]*\]\]/g, " ") // embedded wikilink
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // embedded image
		.replace(/\[\^[^\]]*\]/g, " ") // footnote reference
		.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1") // aliased wikilink
		.replace(/\[\[([^\]]*)\]\]/g, unwrapWikilink) // plain wikilink
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown link
		.replace(/`+/g, "") // code span
		.replace(/\*\*|__|~~|==/g, "") // bold, strikethrough, highlight
		.replace(/(^|\s)[*_](\S)/g, "$1$2") // opening italic
		.replace(/(\S)[*_](\s|$)/g, "$1$2") // closing italic
		.replace(COLLAPSIBLE_WHITESPACE, " ")
		.trim();
}

/** Keeps at least one word, so even a very short note yields something nameable. */
export function firstWords(text: string, maxWords: number): string {
	const words = text.split(COLLAPSIBLE_WHITESPACE).filter(Boolean);
	return words.slice(0, Math.max(1, maxWords)).join(" ");
}

/** `[[Note#Section]]` names the note, not the section. */
function unwrapWikilink(_match: string, target: string): string {
	const base = target.split(WIKILINK_TARGET_SEPARATOR)[0]?.trim() ?? "";
	return base || target.replace(/[#^]/g, " ");
}
