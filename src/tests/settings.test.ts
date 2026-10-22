import { describe, expect, test } from "vitest";
import { DEFAULT_RULE, DEFAULT_SETTINGS, parseSettings, parseTrackedNotes, toTrackedNotes } from "../settings";

describe("parseSettings", () => {
	test("fills in everything that is missing", () => {
		expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
	});

	test("clamps numbers to the range the sliders offer", () => {
		expect(parseSettings({ debounceMs: 5 }).debounceMs).toBe(200);
		expect(parseSettings({ debounceMs: 999_999 }).debounceMs).toBe(3000);
		expect(parseSettings({ maxWords: 4.6 }).maxWords).toBe(5);
		expect(parseSettings({ maxLength: Number.NaN }).maxLength).toBe(DEFAULT_SETTINGS.maxLength);
		expect(parseSettings({ maxLength: "60" }).maxLength).toBe(DEFAULT_SETTINGS.maxLength);
	});

	test("an empty untitled base falls back, so Titler still claims new notes", () => {
		expect(parseSettings({ untitledBase: "   " }).untitledBase).toBe("Untitled");
		expect(parseSettings({ untitledBase: "Uten navn" }).untitledBase).toBe("Uten navn");
	});

	test("an explicitly empty exclusion list is respected", () => {
		expect(parseSettings({ excludedFolders: [] }).excludedFolders).toEqual([]);
		expect(parseSettings({ excludedFolders: ["  a  ", "", 7] }).excludedFolders).toEqual(["a"]);
		expect(parseSettings({ revealExcludedFolders: [] }).revealExcludedFolders).toEqual([]);
	});

	test("the title-prompt toggle only bends to a real boolean", () => {
		expect(parseSettings({ skipTitlePrompt: false }).skipTitlePrompt).toBe(false);
		expect(parseSettings({ skipTitlePrompt: "no" }).skipTitlePrompt).toBe(true);
	});

	test("partial rules are completed from the defaults", () => {
		expect(parseSettings({ rules: [{ folder: "tmp" }] }).rules).toEqual([{ ...DEFAULT_RULE, folder: "tmp" }]);
		expect(parseSettings({ rules: [null] }).rules).toEqual([DEFAULT_RULE]);
		expect(parseSettings({ rules: "nope" }).rules).toEqual([]);
	});
});

describe("parseTrackedNotes", () => {
	test("keeps well-formed claims and drops the rest", () => {
		const claims = parseTrackedNotes({ "a.md": "a", "b.md": 7, "": "c" });
		expect([...claims]).toEqual([["a.md", "a"]]);
	});

	test("survives junk", () => {
		expect(parseTrackedNotes(null).size).toBe(0);
		expect(parseTrackedNotes(["a"]).size).toBe(0);
	});

	test("a __proto__ key cannot reach an object prototype", () => {
		const claims = parseTrackedNotes(JSON.parse('{"__proto__": "pwned"}'));
		const record = toTrackedNotes(claims);
		expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
		expect(({} as Record<string, unknown>).pwned).toBeUndefined();
	});

	test("round-trips through the persisted shape", () => {
		const claims = new Map([["a/b.md", "b"]]);
		expect([...parseTrackedNotes(toTrackedNotes(claims))]).toEqual([...claims]);
	});
});
