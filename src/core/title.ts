import { splitFrontmatter } from "./frontmatter";
import { cleanInline, firstWords, stripLineMarkers } from "./text";

/**
 * Only H1 to H4 name a note. Deeper headings are section markers, though
 * {@link stripLineMarkers} still lets their text seed the fallback.
 */
const HEADING = /^ {0,3}#{1,4}[ \t]+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TRAILING_HASHES = /\s+#+\s*$/;
const HTML_COMMENT_START = /^\s*<!--/;

/** A title must contain at least one letter or digit to be worth using. */
const NAMEABLE = /[\p{L}\p{N}]/u;

export const DEFAULT_MAX_WORDS = 5;

export interface DeriveTitleOptions {
	/** Opening words to keep when the note has no usable heading. */
	maxWords?: number;
}

/**
 * Names a note from its topmost heading, falling back to the opening words of
 * its first line of prose. Returns `null` when the note has neither.
 *
 * The whole body is scanned even after a fallback is found, because a heading
 * further down still wins over opening prose.
 */
export function deriveTitle(text: string, options: DeriveTitleOptions = {}): string | null {
	const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
	const lines = splitFrontmatter(text).body.split("\n");
	let openFence = "";
	let fallback = "";

	for (const line of lines) {
		const marker = fenceMarker(line);
		if (openFence) {
			if (closesFence(marker, openFence)) openFence = "";
			continue;
		}
		if (marker) {
			openFence = marker;
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			const title = cleanInline((heading[1] ?? "").replace(TRAILING_HASHES, ""));
			if (NAMEABLE.test(title)) return title;
			continue;
		}

		if (fallback || HTML_COMMENT_START.test(line)) continue;
		const cleaned = cleanInline(stripLineMarkers(line));
		if (NAMEABLE.test(cleaned)) fallback = firstWords(cleaned, maxWords);
	}

	return fallback || null;
}

function fenceMarker(line: string): string {
	return FENCE.exec(line)?.[1] ?? "";
}

/** A fence closes only with the same character and at least as many of them. */
function closesFence(marker: string, openFence: string): boolean {
	return marker.length >= openFence.length && marker[0] === openFence[0];
}
