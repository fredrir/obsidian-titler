import { describe, expect, test } from "vitest";
import { sanitizeFilename } from "./filename";
import { deriveTitle } from "./title";

const lines = (...parts: string[]): string => parts.join("\n");

describe("deriveTitle", () => {
	test("the topmost heading wins whatever its level", () => {
		expect(deriveTitle(lines("## Setup", "notes here", "", "# Real Title", "more"))).toBe("Setup");
		expect(deriveTitle(lines("Some opening line", "", "### Deep", ""))).toBe("Deep");
		expect(deriveTitle(lines("#### Fourth", "", "# First"))).toBe("Fourth");
	});

	test("a heading needs a space after the hashes, so tags are not headings", () => {
		expect(deriveTitle(lines("#todo buy milk", "", "# Actual Heading"))).toBe("Actual Heading");
		expect(deriveTitle("# todo buy milk")).toBe("todo buy milk");
		expect(sanitizeFilename(deriveTitle("#todo buy milk today") ?? "", 60)).toBe("todo buy milk today");
	});

	test("headings inside fenced code blocks are ignored", () => {
		expect(deriveTitle(lines("```md", "# Not A Title", "```", "", "# Real Title"))).toBe("Real Title");
		expect(deriveTitle(lines("~~~", "# Not A Title", "~~~", "", "## Second"))).toBe("Second");
		expect(deriveTitle(lines("```", "# Fenced", "```", "just prose here"))).toBe("just prose here");
	});

	test("a fence only closes on the same character and at least the same length", () => {
		expect(deriveTitle(lines("````", "```", "# Still Fenced", "````", "# Real Title"))).toBe("Real Title");
		expect(deriveTitle(lines("```", "~~~", "# Still Fenced", "```", "# Real Title"))).toBe("Real Title");
	});

	test("frontmatter is skipped", () => {
		expect(deriveTitle(lines("---", "tags: [a]", "# not a heading", "---", "# Real Title"))).toBe("Real Title");
		expect(deriveTitle(lines("---", "tags: [a]", "---", "opening words follow here"))).toBe(
			"opening words follow here",
		);
	});

	test("H5 and H6 are not naming headings but their text can seed the fallback", () => {
		expect(deriveTitle("##### Deep heading only")).toBe("Deep heading only");
	});

	test("heading text is cleaned of markdown", () => {
		expect(deriveTitle("# Real Title ###")).toBe("Real Title");
		expect(deriveTitle("# **Bold** and *italic* and `code`")).toBe("Bold and italic and code");
		expect(deriveTitle("# [[Some Note|An Alias]]")).toBe("An Alias");
		expect(deriveTitle("# [[Some Note#Section]]")).toBe("Some Note");
		expect(deriveTitle("# [A link](https://example.com) here")).toBe("A link here");
		expect(deriveTitle("# Footnoted[^1] title")).toBe("Footnoted title");
	});

	test("without a heading the opening words are used, partial last word included", () => {
		expect(deriveTitle("today i w")).toBe("today i w");
		expect(deriveTitle("today i went to the store yesterday")).toBe("today i went to the");
		expect(deriveTitle("one two three four five six", { maxWords: 3 })).toBe("one two three");
	});

	test("the fallback strips list, task, quote and callout markers", () => {
		expect(deriveTitle("- a bulleted first line")).toBe("a bulleted first line");
		expect(deriveTitle("1. an ordered first line")).toBe("an ordered first line");
		expect(deriveTitle("- [ ] a task to do")).toBe("a task to do");
		expect(deriveTitle("> quoted opening words")).toBe("quoted opening words");
		expect(deriveTitle("> [!note]- Callout title here")).toBe("Callout title here");
	});

	test("the fallback skips lines with nothing nameable in them", () => {
		expect(deriveTitle(lines("---", "", "real words follow"))).toBeNull();
		expect(deriveTitle(lines("***", "real words follow"))).toBe("real words follow");
		expect(deriveTitle(lines("![[some image.png]]", "real words follow"))).toBe("real words follow");
		expect(deriveTitle(lines("<!-- a comment -->", "real words follow"))).toBe("real words follow");
		expect(deriveTitle(lines("|---|---|", "real words follow"))).toBe("real words follow");
	});

	test("an empty note yields no title", () => {
		expect(deriveTitle("")).toBeNull();
		expect(deriveTitle("\t \n\n\t\n")).toBeNull();
		expect(deriveTitle("# ")).toBeNull();
	});

	test("carriage returns do not leak into the title", () => {
		expect(deriveTitle("# Windows Title\r\nbody")).toBe("Windows Title");
	});
});
