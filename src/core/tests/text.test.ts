import { describe, expect, test } from "vitest";
import { cleanInline, firstWords, stripControlCharacters, stripLineMarkers } from "../text";

describe("stripLineMarkers", () => {
	test("unwraps nested prefixes", () => {
		expect(stripLineMarkers("> - [x] done thing")).toBe("done thing");
		expect(stripLineMarkers("| a cell |")).toBe("a cell");
	});

	test("leaves emphasis for cleanInline to handle", () => {
		expect(stripLineMarkers("*emphasis stays*")).toBe("*emphasis stays*");
	});
});

describe("cleanInline", () => {
	test("leaves ordinary text alone", () => {
		expect(cleanInline("plain words")).toBe("plain words");
		expect(cleanInline("snake_case_name stays")).toBe("snake_case_name stays");
		expect(cleanInline("\tspaced\t out  ")).toBe("spaced out");
	});

	test("drops comments and embeds entirely", () => {
		expect(cleanInline("before %% hidden %% after")).toBe("before after");
		expect(cleanInline("![alt](image.png) caption")).toBe("caption");
	});
});

describe("firstWords", () => {
	test("keeps at least one word however low the limit", () => {
		expect(firstWords("one two three", 0)).toBe("one");
		expect(firstWords("one two three", 2)).toBe("one two");
		expect(firstWords("one two", 10)).toBe("one two");
	});
});

describe("stripControlCharacters", () => {
	test("replaces control characters with spaces", () => {
		expect(stripControlCharacters("a\u0000b\u0001c\u007Fd")).toBe("a b c d");
		expect(stripControlCharacters("plain")).toBe("plain");
	});
});
