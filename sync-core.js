// Regenerates titles.js from the #region titler-core block in main.js.
// Run after editing the shared core: node sync-core.js
const fs = require("node:fs");
const path = require("node:path");

const START = "// #region titler-core";
const END = "// #endregion titler-core";
const EXPORTS = [
	"applyTemplate",
	"cleanInline",
	"deriveTitle",
	"firstWords",
	"folderOf",
	"isExcluded",
	"isOptedOut",
	"isStaticTemplate",
	"isUntitled",
	"matchRule",
	"normalizeFolder",
	"sanitizeFilename",
	"splitFrontmatter",
	"stripLineMarkers",
	"uniqueBasename",
];

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start === -1 || end <= start) throw new Error("main.js is missing its titler-core region markers");

const region = source.slice(start + START.length, end).trim();
const footer = `\n\nmodule.exports = {\n${EXPORTS.map((name) => `\t${name},`).join("\n")}\n};\n`;
fs.writeFileSync(path.join(__dirname, "titles.js"), region + footer);
console.log(`titles.js regenerated (${region.split("\n").length} lines)`);
