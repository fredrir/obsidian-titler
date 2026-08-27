import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_RULE, DEFAULT_SETTINGS } from "../settings";
import type { NoteRef, TitlerSettings } from "../types";
import type { VaultPort } from "./ports";
import { TitlerEngine } from "./titler";
import { NoteTracker } from "./tracker";

/** An in-memory vault: path to note text. */
class FakeVault implements VaultPort {
	readonly notes = new Map<string, string>();
	readonly renames: Array<[string, string]> = [];
	rejectRenames = false;

	add(path: string, text = ""): NoteRef {
		this.notes.set(path, text);
		return { path, basename: path.split("/").pop()?.replace(/\.md$/, "") ?? "", createdAt: 1_700_000_000_000 };
	}

	exists(path: string): boolean {
		return this.notes.has(path);
	}

	read(note: NoteRef): Promise<string> {
		return Promise.resolve(this.notes.get(note.path) ?? "");
	}

	rename(note: NoteRef, targetPath: string): Promise<void> {
		if (this.rejectRenames) return Promise.reject(new Error("vault said no"));
		const text = this.notes.get(note.path);
		if (text === undefined) return Promise.reject(new Error("gone"));
		this.notes.delete(note.path);
		this.notes.set(targetPath, text);
		this.renames.push([note.path, targetPath]);
		return Promise.resolve();
	}
}

describe("TitlerEngine", () => {
	let vault: FakeVault;
	let tracker: NoteTracker;
	let settings: TitlerSettings;
	let saves: number;
	let engine: TitlerEngine;

	beforeEach(() => {
		vault = new FakeVault();
		tracker = new NoteTracker();
		settings = { ...DEFAULT_SETTINGS, excludedFolders: ["Transcripts"] };
		saves = 0;
		engine = new TitlerEngine({
			vault,
			tracker,
			settings: () => settings,
			formatDate: (timestamp, format) => `${format}@${timestamp}`,
			onClaimsChanged: () => void saves++,
		});
	});

	test("names an untitled note after its heading", async () => {
		const note = vault.add("Untitled.md");
		const result = await engine.evaluate(note, "# Weekly review");

		expect(result).toEqual({ kind: "renamed", from: "Untitled.md", to: "Weekly review.md" });
		expect(vault.renames).toEqual([["Untitled.md", "Weekly review.md"]]);
		expect(tracker.claimedBasename("Weekly review.md")).toBe("Weekly review");
		expect(saves).toBe(1);
	});

	test("leaves a note it does not follow alone", async () => {
		const note = vault.add("Grocery list.md");
		expect(await engine.evaluate(note, "# Weekly review")).toEqual({ kind: "skipped", reason: "unclaimed" });
		expect(vault.renames).toEqual([]);
	});

	test("forcing overrides the claim check", async () => {
		const note = vault.add("Grocery list.md");
		const result = await engine.evaluate(note, "# Weekly review", { force: true });
		expect(result).toEqual({ kind: "renamed", from: "Grocery list.md", to: "Weekly review.md" });
	});

	test("a claimed note keeps being followed once it has a real name", async () => {
		const note = vault.add("Weekly review.md");
		tracker.claim(note.path, note.basename);
		const result = await engine.evaluate(note, "# Monthly review");
		expect(result).toEqual({ kind: "renamed", from: "Weekly review.md", to: "Monthly review.md" });
	});

	test("excluded folders are never touched, even when forced", async () => {
		const note = vault.add("Transcripts/Untitled.md");
		expect(await engine.evaluate(note, "# Call notes", { force: true })).toEqual({
			kind: "skipped",
			reason: "excluded",
		});
	});

	test("the frontmatter opt-out wins", async () => {
		const note = vault.add("Untitled.md");
		const text = ["---", "titler: false", "---", "# Weekly review"].join("\n");
		expect(await engine.evaluate(note, text)).toEqual({ kind: "skipped", reason: "opted-out" });
	});

	test("a note with nothing nameable in it is left alone", async () => {
		const note = vault.add("Untitled.md");
		expect(await engine.evaluate(note, "   \n\n")).toEqual({ kind: "skipped", reason: "no-title" });
	});

	test("the matching folder rule shapes the filename", async () => {
		settings.rules = [{ ...DEFAULT_RULE, folder: "ideas", template: "{{parent}} - {{title}}" }];
		const note = vault.add("ideas/Untitled.md");
		await engine.evaluate(note, "# Coffee grinder");
		expect(vault.renames).toEqual([["ideas/Untitled.md", "ideas/ideas - Coffee grinder.md"]]);
	});

	test("a static rule names the note once and then lets go", async () => {
		settings.rules = [{ ...DEFAULT_RULE, template: "note - {{date:YYYY}}" }];
		const note = vault.add("Untitled.md");

		await engine.evaluate(note, "");
		expect(vault.renames).toEqual([["Untitled.md", "note - YYYY@1700000000000.md"]]);
		expect(tracker.size).toBe(0);
	});

	test("a static rule releases a note that is already correctly named", async () => {
		settings.rules = [{ ...DEFAULT_RULE, template: "fixed" }];
		const note = vault.add("fixed.md");
		tracker.claim(note.path, note.basename);

		expect(await engine.evaluate(note, "# Anything")).toEqual({ kind: "skipped", reason: "already-named" });
		expect(tracker.isClaimed("fixed.md")).toBe(false);
		expect(saves).toBe(1);
	});

	test("a note already carrying its derived name is claimed, but only once", async () => {
		const note = vault.add("Weekly review.md");
		tracker.claim(note.path, "Untitled");

		expect(await engine.evaluate(note, "# Weekly review")).toEqual({ kind: "skipped", reason: "already-named" });
		expect(tracker.claimedBasename("Weekly review.md")).toBe("Weekly review");
		expect(saves).toBe(1);

		await engine.evaluate(note, "# Weekly review");
		expect(saves).toBe(1);
	});

	test("a taken filename gets a numeric suffix", async () => {
		vault.add("Weekly review.md");
		const note = vault.add("Untitled.md");
		await engine.evaluate(note, "# Weekly review");
		expect(vault.renames).toEqual([["Untitled.md", "Weekly review 2.md"]]);
	});

	test("a failed rename is not retried with the same name until forced", async () => {
		const note = vault.add("Untitled.md");
		vault.rejectRenames = true;

		const failure = await engine.evaluate(note, "# Weekly review");
		expect(failure.kind).toBe("failed");

		vault.rejectRenames = false;
		expect(await engine.evaluate(note, "# Weekly review")).toEqual({ kind: "skipped", reason: "failed-before" });
		expect(await engine.evaluate(note, "# Weekly review", { force: true })).toEqual({
			kind: "renamed",
			from: "Untitled.md",
			to: "Weekly review.md",
		});
	});

	test("a different title is still tried after an earlier failure", async () => {
		const note = vault.add("Untitled.md");
		vault.rejectRenames = true;
		await engine.evaluate(note, "# First try");

		vault.rejectRenames = false;
		expect(await engine.evaluate(note, "# Second try")).toEqual({
			kind: "renamed",
			from: "Untitled.md",
			to: "Second try.md",
		});
	});

	test("a rule that renders nothing usable leaves the note alone", async () => {
		// A derived title always contains a letter or digit, so only a static
		// template can sanitize down to an empty filename.
		settings.rules = [{ ...DEFAULT_RULE, template: "{{parent}}" }];
		const note = vault.add("Untitled.md");
		expect(await engine.evaluate(note, "# Weekly review")).toEqual({ kind: "skipped", reason: "empty-filename" });
	});

	test("a note may be renamed to a different case of its own name", async () => {
		const note = vault.add("weekly review.md");
		tracker.claim(note.path, note.basename);
		await engine.evaluate(note, "# Weekly Review");
		expect(vault.renames).toEqual([["weekly review.md", "Weekly Review.md"]]);
	});

	test("forget stops the engine following a note", async () => {
		const note = vault.add("Untitled.md");
		tracker.claim(note.path, note.basename);
		expect(engine.forget(note.path)).toBe(true);

		settings.untitledBase = "Uten navn";
		expect(engine.isClaimed(note)).toBe(false);
		expect(await engine.evaluate(note, "# Weekly review")).toEqual({ kind: "skipped", reason: "unclaimed" });
	});

	test("titles are cut to the configured maximum length", async () => {
		settings.maxLength = 13;
		const note = vault.add("Untitled.md");
		await engine.evaluate(note, "# one two three four five");
		expect(vault.renames).toEqual([["Untitled.md", "one two three.md"]]);
	});
});
