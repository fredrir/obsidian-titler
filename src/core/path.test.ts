import { describe, expect, test } from "vitest";
import { basenameOf, folderOf, isExcluded, joinPath, normalizeFolder, parentFolderName } from "./path";

describe("path helpers", () => {
	test("folderOf splits a vault path", () => {
		expect(folderOf("a/b/c.md")).toBe("a/b");
		expect(folderOf("c.md")).toBe("");
	});

	test("parentFolderName names the immediate folder", () => {
		expect(parentFolderName("a/b/c.md")).toBe("b");
		expect(parentFolderName("c.md")).toBe("");
	});

	test("basenameOf drops the folder and the extension", () => {
		expect(basenameOf("a/b/c.md")).toBe("c");
		expect(basenameOf("a/b/c.MD")).toBe("c");
		expect(basenameOf("c.md")).toBe("c");
	});

	test("joinPath rebuilds a note path", () => {
		expect(joinPath("a/b", "c")).toBe("a/b/c.md");
		expect(joinPath("", "c")).toBe("c.md");
	});

	test("normalizeFolder accepts what a user types", () => {
		expect(normalizeFolder("  /tmp/  ")).toBe("tmp");
		expect(normalizeFolder("/")).toBe("");
	});
});

describe("isExcluded", () => {
	const excluded = ["Transcripts", "Obsidian/Templates", "_Agents"];

	test("matches by path prefix and by bare folder name", () => {
		expect(isExcluded("Transcripts/Captures/a.md", excluded)).toBe(true);
		expect(isExcluded("Obsidian/Templates/a.md", excluded)).toBe(true);
		expect(isExcluded("ArchTeX/_Agents/a.md", excluded)).toBe(true);
	});

	test("leaves everything else alone", () => {
		expect(isExcluded("Obsidian/Notes/a.md", excluded)).toBe(false);
		expect(isExcluded("a.md", excluded)).toBe(false);
		expect(isExcluded("Transcripts.md", excluded)).toBe(false);
	});

	test("empty entries never match", () => {
		expect(isExcluded("a/b.md", ["", "  ", "/"])).toBe(false);
	});
});
