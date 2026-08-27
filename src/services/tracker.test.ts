import { beforeEach, describe, expect, test } from "vitest";
import { NoteTracker } from "./tracker";

describe("NoteTracker", () => {
	let tracker: NoteTracker;

	beforeEach(() => {
		tracker = new NoteTracker(
			new Map([
				["Work/a.md", "a"],
				["Work/deep/b.md", "b"],
				["c.md", "c"],
			]),
		);
	});

	test("claims are looked up by path", () => {
		expect(tracker.isClaimed("c.md")).toBe(true);
		expect(tracker.claimedBasename("c.md")).toBe("c");
		expect(tracker.isClaimed("missing.md")).toBe(false);
		expect(tracker.claimedBasename("missing.md")).toBeUndefined();
	});

	test("release reports whether anything was dropped", () => {
		expect(tracker.release("c.md")).toBe(true);
		expect(tracker.release("c.md")).toBe(false);
	});

	test("transfer moves a claim and keeps its basename", () => {
		expect(tracker.transfer("c.md", "Work/c.md")).toBe(true);
		expect(tracker.claimedBasename("Work/c.md")).toBe("c");
		expect(tracker.isClaimed("c.md")).toBe(false);
		expect(tracker.transfer("missing.md", "other.md")).toBe(false);
	});

	test("moveFolder rewrites every claim below the folder", () => {
		expect(tracker.moveFolder("Work", "Archive/Work")).toBe(true);
		expect(tracker.claimedBasename("Archive/Work/a.md")).toBe("a");
		expect(tracker.claimedBasename("Archive/Work/deep/b.md")).toBe("b");
		expect(tracker.claimedBasename("c.md")).toBe("c");
	});

	test("moveFolder does not touch a folder that merely shares a prefix", () => {
		expect(tracker.moveFolder("Wor", "Other")).toBe(false);
		expect(tracker.claimedBasename("Work/a.md")).toBe("a");
	});

	test("releaseFolder drops everything below a deleted folder", () => {
		expect(tracker.releaseFolder("Work")).toBe(true);
		expect(tracker.size).toBe(1);
		expect(tracker.releaseFolder("Work")).toBe(false);
	});

	test("prune keeps only the claims that still describe a note", () => {
		expect(tracker.prune((path) => path === "c.md")).toBe(true);
		expect([...Object.keys(tracker.toJSON())]).toEqual(["c.md"]);
		expect(tracker.prune(() => true)).toBe(false);
	});

	test("reset replaces the whole set of claims", () => {
		tracker.reset(new Map([["x.md", "x"]]));
		expect(tracker.toJSON()).toEqual({ "x.md": "x" });
	});
});
