import { describe, expect, test } from "vitest";
import { isOptedOut, splitFrontmatter } from "./frontmatter";

const lines = (...parts: string[]): string => parts.join("\n");

describe("splitFrontmatter", () => {
	test("separates the block from the body", () => {
		const parsed = splitFrontmatter(lines("---", "titler: false", "---", "# Body"));
		expect(parsed.frontmatter).toBe("titler: false");
		expect(parsed.body).toBe("# Body");
	});

	test("a note without frontmatter is all body", () => {
		expect(splitFrontmatter("# No frontmatter")).toEqual({ frontmatter: "", body: "# No frontmatter" });
	});

	test("closes on ... as well as ---", () => {
		expect(splitFrontmatter(lines("---", "a: 1", "...", "body")).body).toBe("body");
	});

	test("an unterminated block leaves no body to name from", () => {
		expect(splitFrontmatter(lines("---", "a: 1", "b: 2"))).toEqual({ frontmatter: "a: 1\nb: 2", body: "" });
	});
});

describe("isOptedOut", () => {
	test("recognises the frontmatter opt-out", () => {
		expect(isOptedOut("titler: false")).toBe(true);
		expect(isOptedOut("tags: a\ntitler: off")).toBe(true);
		expect(isOptedOut("titler: true")).toBe(false);
		expect(isOptedOut("")).toBe(false);
	});
});
