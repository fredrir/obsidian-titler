import { describe, expect, test } from "vitest";
import { DEFAULT_RULE } from "../settings";
import type { FolderRule } from "../types";
import { matchRule } from "./rules";

const rule = (overrides: Partial<FolderRule>): FolderRule => ({ ...DEFAULT_RULE, ...overrides });

describe("matchRule", () => {
	test("the deepest matching folder rule wins", () => {
		const rules = [
			rule({ folder: "", template: "root" }),
			rule({ folder: "Projects", template: "shallow" }),
			rule({ folder: "Projects/sndbx", template: "deep" }),
		];
		expect(matchRule("Projects/sndbx/note.md", rules)?.template).toBe("deep");
		expect(matchRule("Projects/other/note.md", rules)?.template).toBe("shallow");
		expect(matchRule("note.md", rules)?.template).toBe("root");
	});

	test("subfolder matching is honoured", () => {
		const strict = [rule({ folder: "tmp", includeSubfolders: false, template: "t" })];
		expect(matchRule("tmp/note.md", strict)?.template).toBe("t");
		expect(matchRule("tmp/deep/note.md", strict)).toBeNull();
	});

	test("disabled rules are skipped", () => {
		const off = [rule({ folder: "tmp", template: "t", enabled: false })];
		expect(matchRule("tmp/note.md", off)).toBeNull();
	});

	test("folder matching ignores case and stray slashes", () => {
		const loose = [rule({ folder: "/TMP/", template: "t" })];
		expect(matchRule("tmp/note.md", loose)?.template).toBe("t");
	});

	test("a root rule without subfolders only matches the root", () => {
		const rules = [rule({ folder: "", includeSubfolders: false, template: "root" })];
		expect(matchRule("note.md", rules)?.template).toBe("root");
		expect(matchRule("Work/note.md", rules)).toBeNull();
	});

	test("no rules means no match", () => {
		expect(matchRule("note.md", [])).toBeNull();
	});
});
