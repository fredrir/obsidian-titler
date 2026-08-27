const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
	applyTemplate,
	cleanInline,
	deriveTitle,
	folderOf,
	isExcluded,
	isOptedOut,
	isStaticTemplate,
	isUntitled,
	matchRule,
	sanitizeFilename,
	splitFrontmatter,
	stripLineMarkers,
	uniqueBasename,
} = require("./titles");

const lines = (...parts) => parts.join("\n");

test("the topmost heading wins whatever its level", () => {
	assert.equal(deriveTitle(lines("## Setup", "notes here", "", "# Real Title", "more")), "Setup");
	assert.equal(deriveTitle(lines("Some opening line", "", "### Deep", "")), "Deep");
	assert.equal(deriveTitle(lines("#### Fourth", "", "# First")), "Fourth");
});

test("a heading needs a space after the hashes, so tags are not headings", () => {
	assert.equal(deriveTitle(lines("#todo buy milk", "", "# Actual Heading")), "Actual Heading");
	assert.equal(deriveTitle("# todo buy milk"), "todo buy milk");
	assert.equal(sanitizeFilename(deriveTitle("#todo buy milk today"), 60), "todo buy milk today");
});

test("headings inside fenced code blocks are ignored", () => {
	assert.equal(deriveTitle(lines("```md", "# Not A Title", "```", "", "# Real Title")), "Real Title");
	assert.equal(deriveTitle(lines("~~~", "# Not A Title", "~~~", "", "## Second")), "Second");
	assert.equal(deriveTitle(lines("```", "# Fenced", "```", "just prose here")), "just prose here");
});

test("frontmatter is skipped", () => {
	assert.equal(deriveTitle(lines("---", "tags: [a]", "# not a heading", "---", "# Real Title")), "Real Title");
	assert.equal(deriveTitle(lines("---", "tags: [a]", "---", "opening words follow here")), "opening words follow here");
});

test("H5 and H6 are not naming headings but their text can seed the fallback", () => {
	assert.equal(deriveTitle(lines("##### Deep heading only")), "Deep heading only");
});

test("heading text is cleaned of markdown", () => {
	assert.equal(deriveTitle("# Real Title ###"), "Real Title");
	assert.equal(deriveTitle("# **Bold** and *italic* and `code`"), "Bold and italic and code");
	assert.equal(deriveTitle("# [[Some Note|An Alias]]"), "An Alias");
	assert.equal(deriveTitle("# [[Some Note#Section]]"), "Some Note");
	assert.equal(deriveTitle("# [A link](https://example.com) here"), "A link here");
	assert.equal(deriveTitle("# Footnoted[^1] title"), "Footnoted title");
});

test("without a heading the opening words are used, partial last word included", () => {
	assert.equal(deriveTitle("today i w"), "today i w");
	assert.equal(deriveTitle("today i went to the store yesterday"), "today i went to the");
	assert.equal(deriveTitle("one two three four five six", { maxWords: 3 }), "one two three");
});

test("the fallback strips list, task, quote and callout markers", () => {
	assert.equal(deriveTitle("- a bulleted first line"), "a bulleted first line");
	assert.equal(deriveTitle("1. an ordered first line"), "an ordered first line");
	assert.equal(deriveTitle("- [ ] a task to do"), "a task to do");
	assert.equal(deriveTitle("> quoted opening words"), "quoted opening words");
	assert.equal(deriveTitle("> [!note]- Callout title here"), "Callout title here");
});

test("the fallback skips lines with nothing nameable in them", () => {
	assert.equal(deriveTitle(lines("---", "", "real words follow")), null);
	assert.equal(deriveTitle(lines("***", "real words follow")), "real words follow");
	assert.equal(deriveTitle(lines("![[some image.png]]", "real words follow")), "real words follow");
	assert.equal(deriveTitle(lines("<!-- a comment -->", "real words follow")), "real words follow");
	assert.equal(deriveTitle(lines("|---|---|", "real words follow")), "real words follow");
});

test("an empty note yields no title", () => {
	assert.equal(deriveTitle(""), null);
	assert.equal(deriveTitle("	 \n\n\t\n"), null);
	assert.equal(deriveTitle("# "), null);
});

test("splitFrontmatter separates the block from the body", () => {
	const parsed = splitFrontmatter(lines("---", "titler: false", "---", "# Body"));
	assert.equal(parsed.frontmatter, "titler: false");
	assert.equal(parsed.body, "# Body");
	assert.equal(splitFrontmatter("# No frontmatter").frontmatter, "");
});

test("the frontmatter opt-out is recognised", () => {
	assert.equal(isOptedOut("titler: false"), true);
	assert.equal(isOptedOut("tags: a\ntitler: off"), true);
	assert.equal(isOptedOut("titler: true"), false);
	assert.equal(isOptedOut(""), false);
});

test("filenames drop characters that break paths or wikilinks", () => {
	assert.equal(sanitizeFilename('a/b:c*d?e"f<g>h|i', 60), "a b c d e f g h i");
	assert.equal(sanitizeFilename("tags #one and ^two [three]", 60), "tags one and two three");
	assert.equal(sanitizeFilename("...hidden", 60), "hidden");
	assert.equal(sanitizeFilename("trailing dots...", 60), "trailing dots");
	assert.equal(sanitizeFilename("	  ", 60), "");
	assert.equal(sanitizeFilename("///", 60), "");
});

test("long filenames are cut at a word boundary", () => {
	assert.equal(sanitizeFilename("one two three four five", 13), "one two three");
	assert.equal(sanitizeFilename("supercalifragilistic", 10), "supercalif");
});

test("untitled detection covers Obsidian's numbered variants", () => {
	assert.equal(isUntitled("Untitled", "Untitled"), true);
	assert.equal(isUntitled("Untitled 1", "Untitled"), true);
	assert.equal(isUntitled("Untitled 42", "Untitled"), true);
	assert.equal(isUntitled("Untitled thoughts", "Untitled"), false);
	assert.equal(isUntitled("Uten navn", "Uten navn"), true);
});

test("collisions get a numeric suffix", () => {
	const taken = new Set(["Notes", "Notes 2"]);
	assert.equal(uniqueBasename("Notes", (name) => taken.has(name)), "Notes 3");
	assert.equal(uniqueBasename("Fresh", (name) => taken.has(name)), "Fresh");
});

test("templates render their tokens", () => {
	const values = { title: "My note", parent: "ideas", formatDate: (format) => `<${format}>` };
	assert.equal(applyTemplate("idea - {{title}}", values), "idea - My note");
	assert.equal(applyTemplate("temporary - {{date:YYYY-MM-DD-HHmm}}", values), "temporary - <YYYY-MM-DD-HHmm>");
	assert.equal(applyTemplate("{{parent}}/{{title}}", values), "ideas/My note");
	assert.equal(applyTemplate("{{ title }}", values), "My note");
	assert.equal(applyTemplate("{{date}}", values), "<YYYY-MM-DD>");
});

test("a template without a title token is static", () => {
	assert.equal(isStaticTemplate("temporary - {{date:YYYY-MM-DD}}"), true);
	assert.equal(isStaticTemplate("idea - {{title}}"), false);
	assert.equal(isStaticTemplate("{{ title }}"), false);
});

test("the deepest matching folder rule wins", () => {
	const rules = [
		{ folder: "", includeSubfolders: true, template: "root" },
		{ folder: "Projects", includeSubfolders: true, template: "shallow" },
		{ folder: "Projects/sndbx", includeSubfolders: true, template: "deep" },
	];
	assert.equal(matchRule("Projects/sndbx/note.md", rules).template, "deep");
	assert.equal(matchRule("Projects/other/note.md", rules).template, "shallow");
	assert.equal(matchRule("note.md", rules).template, "root");
});

test("subfolder matching and disabled rules are honoured", () => {
	const strict = [{ folder: "tmp", includeSubfolders: false, template: "t" }];
	assert.equal(matchRule("tmp/note.md", strict).template, "t");
	assert.equal(matchRule("tmp/deep/note.md", strict), null);

	const off = [{ folder: "tmp", includeSubfolders: true, template: "t", enabled: false }];
	assert.equal(matchRule("tmp/note.md", off), null);

	const loose = [{ folder: "/TMP/", includeSubfolders: true, template: "t" }];
	assert.equal(matchRule("tmp/note.md", loose).template, "t");
});

test("a root rule without subfolders only matches the root", () => {
	const rules = [{ folder: "", includeSubfolders: false, template: "root" }];
	assert.equal(matchRule("note.md", rules).template, "root");
	assert.equal(matchRule("Work/note.md", rules), null);
});

test("exclusions match by path prefix and by bare folder name", () => {
	const excluded = ["Transcripts", "Obsidian/Templates", "_Agents"];
	assert.equal(isExcluded("Transcripts/Captures/a.md", excluded), true);
	assert.equal(isExcluded("Obsidian/Templates/a.md", excluded), true);
	assert.equal(isExcluded("ArchTeX/_Agents/a.md", excluded), true);
	assert.equal(isExcluded("Obsidian/Notes/a.md", excluded), false);
	assert.equal(isExcluded("a.md", excluded), false);
	assert.equal(isExcluded("Transcripts.md", excluded), false);
});

test("folderOf splits a vault path", () => {
	assert.equal(folderOf("a/b/c.md"), "a/b");
	assert.equal(folderOf("c.md"), "");
});

test("stripLineMarkers unwraps nested prefixes", () => {
	assert.equal(stripLineMarkers("> - [x] done thing"), "done thing");
	assert.equal(stripLineMarkers("| a cell |"), "a cell");
	assert.equal(stripLineMarkers("*emphasis stays*"), "*emphasis stays*");
});

test("cleanInline leaves ordinary text alone", () => {
	assert.equal(cleanInline("plain words"), "plain words");
	assert.equal(cleanInline("snake_case_name stays"), "snake_case_name stays");
	assert.equal(cleanInline("	spaced	 out  "), "spaced out");
});

test("titles.js stays in sync with the core region of main.js", () => {
	const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
	const start = source.indexOf("// #region titler-core");
	const end = source.indexOf("// #endregion titler-core");
	assert.ok(start !== -1 && end > start, "main.js is missing its titler-core region markers");
	const region = source.slice(start + "// #region titler-core".length, end).trim();

	const mirror = fs.readFileSync(path.join(__dirname, "titles.js"), "utf8");
	const footer = mirror.indexOf("module.exports = {");
	assert.ok(footer !== -1, "titles.js is missing its exports footer");

	assert.equal(
		mirror.slice(0, footer).trim(),
		region,
		"titles.js has drifted from main.js: regenerate it from the #region titler-core block",
	);
});
