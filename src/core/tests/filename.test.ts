import { describe, expect, test } from "vitest";
import { isUntitled, sanitizeFilename, uniqueBasename } from "../filename";

describe("sanitizeFilename", () => {
	test("drops characters that break paths or wikilinks", () => {
		expect(sanitizeFilename('a/b:c*d?e"f<g>h|i', 60)).toBe("a b c d e f g h i");
		expect(sanitizeFilename("tags #one and ^two [three]", 60)).toBe("tags one and two three");
	});

	test("trims leading and trailing dots and whitespace", () => {
		expect(sanitizeFilename("...hidden", 60)).toBe("hidden");
		expect(sanitizeFilename("trailing dots...", 60)).toBe("trailing dots");
		expect(sanitizeFilename("\t  ", 60)).toBe("");
		expect(sanitizeFilename("///", 60)).toBe("");
	});

	test("cuts long filenames at a word boundary", () => {
		expect(sanitizeFilename("one two three four five", 13)).toBe("one two three");
		expect(sanitizeFilename("supercalifragilistic", 10)).toBe("supercalif");
	});

	test("keeps at least one character however low the limit", () => {
		expect(sanitizeFilename("abcdef", 0)).toBe("a");
	});
});

describe("isUntitled", () => {
	test("covers Obsidian's numbered variants", () => {
		expect(isUntitled("Untitled", "Untitled")).toBe(true);
		expect(isUntitled("Untitled 1", "Untitled")).toBe(true);
		expect(isUntitled("Untitled 42", "Untitled")).toBe(true);
		expect(isUntitled("Untitled thoughts", "Untitled")).toBe(false);
		expect(isUntitled("Uten navn", "Uten navn")).toBe(true);
	});

	test("a base with regex metacharacters is matched literally", () => {
		expect(isUntitled("New (note) 2", "New (note)")).toBe(true);
		expect(isUntitled("New xnote. 2", "New (note)")).toBe(false);
	});

	test("an empty base claims nothing", () => {
		expect(isUntitled("Untitled", "")).toBe(false);
	});
});

describe("uniqueBasename", () => {
	test("collisions get a numeric suffix", () => {
		const taken = new Set(["Notes", "Notes 2"]);
		expect(uniqueBasename("Notes", (name) => taken.has(name))).toBe("Notes 3");
		expect(uniqueBasename("Fresh", (name) => taken.has(name))).toBe("Fresh");
	});

	test("an empty base has no unique form", () => {
		expect(uniqueBasename("", () => false)).toBe("");
	});

	test("gives up rather than looping forever", () => {
		expect(uniqueBasename("Notes", () => true)).toBe("");
	});
});
