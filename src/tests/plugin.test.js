const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FuzzySuggestModal {}
class MarkdownView {}
class Notice {}
class Plugin {}
class PluginSettingTab {}
class Setting {}
class TFile {}
class TFolder {}

const obsidian = {
	FuzzySuggestModal,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	debounce: () => () => {},
	moment: () => ({ format: () => "" }),
};

test("loads as a self-contained Obsidian entry point", () => {
	const filename = path.join(__dirname, "main.js");
	const source = fs.readFileSync(filename, "utf8");
	const module = { exports: {} };
	const requirePluginDependency = (request) => {
		assert.equal(request, "obsidian", `unexpected runtime dependency: ${request}`);
		return obsidian;
	};

	vm.runInNewContext(
		source,
		{ console, document: {}, module, require: requirePluginDependency, setTimeout, clearTimeout },
		{ filename },
	);

	assert.equal(typeof module.exports, "function");
	assert.equal(Object.getPrototypeOf(module.exports.prototype), Plugin.prototype);
});
