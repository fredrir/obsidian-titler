const FRONTMATTER_OPENER = "---";
const FRONTMATTER_CLOSERS: ReadonlySet<string> = new Set(["---", "..."]);

/** `titler: false` (or `no`, `off`, `ignore`) in frontmatter opts a note out. */
const OPT_OUT = /^titler:\s*(?:false|no|off|ignore)\s*$/im;

export interface ParsedNote {
	/** The YAML between the frontmatter delimiters, or `""` when there is none. */
	readonly frontmatter: string;
	/** Everything after the frontmatter block. */
	readonly body: string;
}

export function splitFrontmatter(text: string): ParsedNote {
	const normalized = text.replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	if (lines[0] !== FRONTMATTER_OPENER) return { frontmatter: "", body: normalized };

	for (let index = 1; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined || !FRONTMATTER_CLOSERS.has(line)) continue;
		return {
			frontmatter: lines.slice(1, index).join("\n"),
			body: lines.slice(index + 1).join("\n"),
		};
	}
	// Unterminated block: the note is all frontmatter, with no body to name it from.
	return { frontmatter: lines.slice(1).join("\n"), body: "" };
}

export function isOptedOut(frontmatter: string): boolean {
	return OPT_OUT.test(frontmatter);
}
