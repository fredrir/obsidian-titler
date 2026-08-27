import { describe, expect, test } from "vitest";
import type { TemplateValues } from "../types";
import { applyTemplate, isStaticTemplate } from "./template";

const values: TemplateValues = {
	title: "My note",
	parent: "ideas",
	formatDate: (format) => `<${format}>`,
};

describe("applyTemplate", () => {
	test("renders its tokens", () => {
		expect(applyTemplate("idea - {{title}}", values)).toBe("idea - My note");
		expect(applyTemplate("temporary - {{date:YYYY-MM-DD-HHmm}}", values)).toBe("temporary - <YYYY-MM-DD-HHmm>");
		expect(applyTemplate("{{parent}}/{{title}}", values)).toBe("ideas/My note");
		expect(applyTemplate("{{ title }}", values)).toBe("My note");
		expect(applyTemplate("{{date}}", values)).toBe("<YYYY-MM-DD>");
	});

	test("a blank date format falls back to the default", () => {
		expect(applyTemplate("{{date:}}", values)).toBe("<YYYY-MM-DD>");
		expect(applyTemplate("{{date:   }}", values)).toBe("<YYYY-MM-DD>");
	});

	test("an empty template names the note after its title", () => {
		expect(applyTemplate("", values)).toBe("My note");
	});

	test("unknown tokens are left untouched", () => {
		expect(applyTemplate("{{author}} - {{title}}", values)).toBe("{{author}} - My note");
	});
});

describe("isStaticTemplate", () => {
	test("a template without a title token is static", () => {
		expect(isStaticTemplate("temporary - {{date:YYYY-MM-DD}}")).toBe(true);
		expect(isStaticTemplate("idea - {{title}}")).toBe(false);
		expect(isStaticTemplate("{{ title }}")).toBe(false);
	});
});
