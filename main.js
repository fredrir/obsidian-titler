const {
	FuzzySuggestModal,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	debounce,
	moment,
} = require("obsidian");

// #region titler-core

const HEADING_PATTERN = /^ {0,3}(#{1,4})[ \t]+(.*)$/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const ILLEGAL_PATTERN = /[\\/:*?"<>|#^[\]]/g;
const ALPHANUMERIC_PATTERN = /[\p{L}\p{N}]/u;
const TOKEN_PATTERN = /\{\{\s*(title|parent|date)(?::([^}]*))?\s*\}\}/g;
const OPT_OUT_PATTERN = /^titler:\s*(false|no|off|ignore)\s*$/im;

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isUntitled(basename, base) {
	if (!base) return false;
	return new RegExp(`^${escapeRegExp(base)}(?: \\d+)?$`).test(basename);
}

function stripControl(text) {
	let cleaned = "";
	for (const char of text) {
		const code = char.codePointAt(0);
		cleaned += code < 32 || code === 127 ? " " : char;
	}
	return cleaned;
}

function splitFrontmatter(text) {
	const normalized = String(text || "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	if (lines[0] !== "---") return { frontmatter: "", body: normalized };
	for (let index = 1; index < lines.length; index++) {
		if (lines[index] === "---" || lines[index] === "...") {
			return {
				frontmatter: lines.slice(1, index).join("\n"),
				body: lines.slice(index + 1).join("\n"),
			};
		}
	}
	return { frontmatter: lines.slice(1).join("\n"), body: "" };
}

function isOptedOut(frontmatter) {
	return OPT_OUT_PATTERN.test(frontmatter || "");
}

function fenceMarker(line) {
	const match = FENCE_PATTERN.exec(line);
	return match ? match[1] : "";
}

function closesFence(marker, fence) {
	return Boolean(marker) && marker[0] === fence[0] && marker.length >= fence.length;
}

function stripLineMarkers(line) {
	let text = line.trim();
	let previous;
	do {
		previous = text;
		text = text
			.replace(/^>\s?/, "")
			.replace(/^\[!\w+\][+-]?\s*/, "")
			.replace(/^[-*+]\s+/, "")
			.replace(/^\d+[.)]\s+/, "")
			.replace(/^\[[ xX\/-]\]\s+/, "")
			.replace(/^#{1,6}\s+/, "")
			.replace(/^\|\s*/, "");
	} while (text !== previous);
	return text.replace(/\s*\|\s*$/, "").trim();
}

function cleanInline(text) {
	return String(text || "")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/%%[\s\S]*?%%/g, " ")
		.replace(/!\[\[[^\]]*\]\]/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[\^[^\]]*\]/g, " ")
		.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
		.replace(/\[\[([^\]]*)\]\]/g, (match, target) => {
			const base = target.split(/[#^]/)[0].trim();
			return base || target.replace(/[#^]/g, " ");
		})
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/`+/g, "")
		.replace(/\*\*|__|~~|==/g, "")
		.replace(/(^|\s)[*_](\S)/g, "$1$2")
		.replace(/(\S)[*_](\s|$)/g, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
}

function firstWords(text, maxWords) {
	const words = String(text || "").split(/\s+/).filter(Boolean);
	return words.slice(0, Math.max(1, maxWords || 5)).join(" ");
}

function deriveTitle(text, options) {
	const maxWords = (options && options.maxWords) || 5;
	const lines = splitFrontmatter(text).body.split("\n");
	let fence = "";
	let fallback = "";
	for (const line of lines) {
		const marker = fenceMarker(line);
		if (fence) {
			if (closesFence(marker, fence)) fence = "";
			continue;
		}
		if (marker) {
			fence = marker;
			continue;
		}
		const heading = HEADING_PATTERN.exec(line);
		if (heading) {
			const title = cleanInline(heading[2].replace(/\s+#+\s*$/, ""));
			if (ALPHANUMERIC_PATTERN.test(title)) return title;
			continue;
		}
		if (fallback) continue;
		if (/^\s*<!--/.test(line)) continue;
		const cleaned = cleanInline(stripLineMarkers(line));
		if (ALPHANUMERIC_PATTERN.test(cleaned)) fallback = firstWords(cleaned, maxWords);
	}
	return fallback || null;
}

function sanitizeFilename(name, maxLength) {
	let cleaned = stripControl(String(name || ""))
		.replace(ILLEGAL_PATTERN, " ")
		.replace(/\s+/g, " ")
		.replace(/^[.\s]+/, "")
		.replace(/[.\s]+$/, "");
	if (!cleaned) return "";
	const limit = Math.max(1, maxLength || 60);
	if (cleaned.length > limit) {
		const cut = cleaned.slice(0, limit);
		const boundary = cut.lastIndexOf(" ");
		const trimmed = cleaned[limit] === " " || boundary <= 0 ? cut : cut.slice(0, boundary);
		cleaned = trimmed.replace(/[.\s]+$/, "");
	}
	return cleaned;
}

function folderOf(path) {
	const index = String(path || "").lastIndexOf("/");
	return index === -1 ? "" : path.slice(0, index);
}

function normalizeFolder(folder) {
	return String(folder || "")
		.trim()
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

function ruleMatches(folder, rule) {
	const target = normalizeFolder(rule && rule.folder).toLowerCase();
	const current = String(folder || "").toLowerCase();
	if (!target) return rule && rule.includeSubfolders ? true : current === "";
	if (current === target) return true;
	return Boolean(rule && rule.includeSubfolders) && current.startsWith(`${target}/`);
}

function matchRule(path, rules) {
	const folder = folderOf(path);
	let best = null;
	let bestDepth = -1;
	for (const rule of rules || []) {
		if (!rule || rule.enabled === false) continue;
		if (!ruleMatches(folder, rule)) continue;
		const target = normalizeFolder(rule.folder);
		const depth = target ? target.split("/").length : 0;
		if (depth > bestDepth) {
			best = rule;
			bestDepth = depth;
		}
	}
	return best;
}

function isStaticTemplate(template) {
	return !/\{\{\s*title\s*\}\}/.test(String(template || ""));
}

function applyTemplate(template, values) {
	const source = values || {};
	return String(template || "{{title}}").replace(TOKEN_PATTERN, (match, token, format) => {
		if (token === "title") return source.title || "";
		if (token === "parent") return source.parent || "";
		if (typeof source.formatDate !== "function") return "";
		return source.formatDate((format || "YYYY-MM-DD").trim());
	});
}

function isExcluded(path, folders) {
	const lower = String(path || "").toLowerCase();
	const segments = lower.split("/");
	segments.pop();
	return (folders || []).some((entry) => {
		const target = normalizeFolder(entry).toLowerCase();
		if (!target) return false;
		if (lower === target || lower.startsWith(`${target}/`)) return true;
		return !target.includes("/") && segments.includes(target);
	});
}

function uniqueBasename(base, exists) {
	if (!base) return "";
	if (!exists(base)) return base;
	for (let index = 2; index < 1000; index++) {
		const candidate = `${base} ${index}`;
		if (!exists(candidate)) return candidate;
	}
	return "";
}

// #endregion titler-core

const DEFAULT_SETTINGS = {
	debounceMs: 700,
	maxWords: 5,
	maxLength: 60,
	untitledBase: "Untitled",
	excludedFolders: ["Transcripts", "Obsidian/Templates", "Obsidian/Attachments"],
	rules: [],
};

const DEFAULT_TEMPLATE = "{{title}}";

class FolderPickerModal extends FuzzySuggestModal {
	constructor(app, onChoose) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a folder");
	}

	getItems() {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file) => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((path) => path !== "/");
		return ["", ...folders.sort()];
	}

	getItemText(item) {
		return item === "" ? "/ (vault root)" : item;
	}

	onChooseItem(item) {
		this.onChoose(item);
	}
}

class TitlerPlugin extends Plugin {
	async onload() {
		await this.loadState();
		this.pending = new Map();
		this.renaming = new Set();
		this.failed = new Map();
		this.timers = new Set();
		this.rebuildDebouncers();

		this.addSettingTab(new TitlerSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, info) => {
				const file = info && info.file;
				if (!this.handles(file) || !this.isTracked(file)) return;
				this.pending.set(file.path, editor.getValue());
				this.flushSoon();
			}),
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file, data) => {
				if (!this.app.workspace.layoutReady) return;
				if (!this.handles(file) || this.pending.has(file.path)) return;
				if (!this.isTracked(file)) return;
				void this.evaluate(file, data);
			}),
		);

		this.registerEvent(this.app.vault.on("create", (file) => this.onCreate(file)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.onDelete(file)));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.flushPending()));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!this.handles(file)) return;
				menu.addItem((item) =>
					item
						.setTitle("Retitle note")
						.setIcon("text-cursor-input")
						.onClick(() => void this.retitle(file)),
				);
			}),
		);

		this.addCommand({
			id: "retitle-note",
			name: "Retitle this note now",
			checkCallback: (checking) => this.withActiveFile(checking, (file) => void this.retitle(file)),
		});

		this.addCommand({
			id: "stop-titling",
			name: "Stop auto-titling this note",
			checkCallback: (checking) =>
				this.withActiveFile(checking, (file) => {
					this.release(file.path);
					this.saveStateSoon();
					new Notice(`Titler released "${file.basename}"`);
				}),
		});

		this.addCommand({
			id: "resume-titling",
			name: "Resume auto-titling this note",
			checkCallback: (checking) =>
				this.withActiveFile(checking, (file) => {
					this.tracked[file.path] = file.basename;
					this.saveStateSoon();
					new Notice(`Titler is following "${file.basename}"`);
				}),
		});

		this.app.workspace.onLayoutReady(() => this.pruneTracked());
	}

	onunload() {
		for (const timer of this.timers) clearTimeout(timer);
		this.timers.clear();
		if (this.flushSoon) this.flushSoon.cancel();
		if (this.saveStateSoon) this.saveStateSoon.cancel();
		this.flushPending();
		void this.saveState();
	}

	rebuildDebouncers() {
		if (this.flushSoon) this.flushSoon.cancel();
		if (this.saveStateSoon) this.saveStateSoon.cancel();
		this.flushSoon = debounce(() => this.flushPending(), this.settings.debounceMs, true);
		this.saveStateSoon = debounce(() => void this.saveState(), 2000, true);
	}

	async loadState() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.settings.rules = (this.settings.rules || []).map((rule) =>
			Object.assign({ folder: "", includeSubfolders: true, template: DEFAULT_TEMPLATE, enabled: true }, rule),
		);
		this.tracked = Object.assign({}, data.tracked);
	}

	async saveState() {
		await this.saveData({ settings: this.settings, tracked: this.tracked });
	}

	pruneTracked() {
		let changed = false;
		for (const path of Object.keys(this.tracked)) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile && file.basename === this.tracked[path]) continue;
			delete this.tracked[path];
			changed = true;
		}
		if (changed) this.saveStateSoon();
	}

	handles(file) {
		return file instanceof TFile && file.extension === "md";
	}

	isTracked(file) {
		if (Object.prototype.hasOwnProperty.call(this.tracked, file.path)) return true;
		return isUntitled(file.basename, this.settings.untitledBase);
	}

	release(path) {
		delete this.tracked[path];
		this.failed.delete(path);
	}

	withActiveFile(checking, action) {
		const file = this.app.workspace.getActiveFile();
		if (!this.handles(file)) return false;
		if (!checking) action(file);
		return true;
	}

	defer(callback, delay) {
		const timer = setTimeout(() => {
			this.timers.delete(timer);
			callback();
		}, delay);
		this.timers.add(timer);
	}

	flushPending() {
		if (!this.pending || this.pending.size === 0) return;
		const entries = Array.from(this.pending.entries());
		this.pending.clear();
		for (const [path, text] of entries) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (this.handles(file)) void this.evaluate(file, text);
		}
	}

	onCreate(file) {
		if (!this.app.workspace.layoutReady || !this.handles(file)) return;
		if (isExcluded(file.path, this.settings.excludedFolders)) return;
		if (!isUntitled(file.basename, this.settings.untitledBase)) return;
		this.tracked[file.path] = file.basename;
		this.saveStateSoon();
		const rule = matchRule(file.path, this.settings.rules);
		if (rule && isStaticTemplate(rule.template)) {
			this.defer(() => void this.evaluate(file, ""), 100);
		}
	}

	onRename(file, oldPath) {
		if (this.renaming.has(oldPath) || this.renaming.has(file.path)) return;
		if (file instanceof TFolder) {
			const prefix = `${oldPath}/`;
			for (const path of Object.keys(this.tracked)) {
				if (!path.startsWith(prefix)) continue;
				this.tracked[`${file.path}/${path.slice(prefix.length)}`] = this.tracked[path];
				delete this.tracked[path];
			}
			this.saveStateSoon();
			return;
		}
		if (!Object.prototype.hasOwnProperty.call(this.tracked, oldPath)) return;
		const previous = oldPath.split("/").pop().replace(/\.md$/i, "");
		if (previous === file.basename) this.tracked[file.path] = this.tracked[oldPath];
		this.release(oldPath);
		this.saveStateSoon();
	}

	onDelete(file) {
		if (Object.prototype.hasOwnProperty.call(this.tracked, file.path)) {
			this.release(file.path);
			this.saveStateSoon();
		}
		this.pending.delete(file.path);
	}

	async retitle(file) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const text = view && view.file === file ? view.editor.getValue() : await this.app.vault.cachedRead(file);
		this.tracked[file.path] = file.basename;
		this.failed.delete(file.path);
		await this.evaluate(file, text, { force: true });
		this.saveStateSoon();
	}

	async evaluate(file, text, options) {
		const force = Boolean(options && options.force);
		if (!this.handles(file) || this.renaming.has(file.path)) return;
		if (isExcluded(file.path, this.settings.excludedFolders)) return;
		if (!force && !this.isTracked(file)) return;
		if (isOptedOut(splitFrontmatter(text).frontmatter)) return;

		const title = deriveTitle(text, { maxWords: this.settings.maxWords });
		const rule = matchRule(file.path, this.settings.rules);
		const template = rule ? rule.template : DEFAULT_TEMPLATE;
		const isStatic = isStaticTemplate(template);
		if (!title && !isStatic) return;

		const rendered = applyTemplate(template, {
			title: title || "",
			parent: folderOf(file.path).split("/").pop() || "",
			formatDate: (format) => moment(file.stat.ctime).format(format),
		});
		const name = sanitizeFilename(rendered, this.settings.maxLength);
		if (!name) return;
		if (name === file.basename) {
			if (isStatic) this.release(file.path);
			else this.tracked[file.path] = name;
			return;
		}
		if (!force && this.failed.get(file.path) === name) return;
		await this.rename(file, name, isStatic);
	}

	async rename(file, name, release) {
		const folder = folderOf(file.path);
		const current = file.basename.toLowerCase();
		const toPath = (basename) => (folder ? `${folder}/${basename}.md` : `${basename}.md`);
		const target = uniqueBasename(name, (candidate) => {
			if (candidate.toLowerCase() === current) return false;
			return this.app.vault.getAbstractFileByPath(toPath(candidate)) !== null;
		});
		if (!target || target === file.basename) return;

		const oldPath = file.path;
		const nextPath = toPath(target);
		this.renaming.add(oldPath);
		this.renaming.add(nextPath);
		try {
			await this.app.fileManager.renameFile(file, nextPath);
			this.release(oldPath);
			if (!release) this.tracked[nextPath] = target;
			this.saveStateSoon();
		} catch (error) {
			this.failed.set(oldPath, name);
			console.error(`Obsidian Titler: could not rename ${oldPath} to ${nextPath}`, error);
		} finally {
			this.renaming.delete(oldPath);
			this.renaming.delete(nextPath);
		}
	}
}

class TitlerSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async commit(rebuild) {
		await this.plugin.saveState();
		if (rebuild) this.plugin.rebuildDebouncers();
	}

	display() {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Rename delay")
			.setDesc("How long to wait after you stop typing before renaming, in milliseconds.")
			.addSlider((slider) =>
				slider
					.setLimits(200, 3000, 100)
					.setValue(settings.debounceMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.debounceMs = value;
						await this.commit(true);
					}),
			);

		new Setting(containerEl)
			.setName("Words to use without a heading")
			.setDesc("How many opening words become the filename when the note has no heading.")
			.addSlider((slider) =>
				slider
					.setLimits(3, 8, 1)
					.setValue(settings.maxWords)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.maxWords = value;
						await this.commit(false);
					}),
			);

		new Setting(containerEl)
			.setName("Maximum filename length")
			.setDesc("Longer titles are cut at the last whole word that fits.")
			.addSlider((slider) =>
				slider
					.setLimits(20, 120, 5)
					.setValue(settings.maxLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.maxLength = value;
						await this.commit(false);
					}),
			);

		new Setting(containerEl)
			.setName("Untitled name")
			.setDesc("Notes with this name are the ones Titler claims. Change it if your Obsidian is not in English.")
			.addText((text) =>
				text.setValue(settings.untitledBase).onChange(async (value) => {
					settings.untitledBase = value.trim() || DEFAULT_SETTINGS.untitledBase;
					await this.commit(false);
				}),
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("One per line. A bare name like _Agents matches that folder anywhere in the vault.")
			.addTextArea((area) => {
				area.inputEl.rows = 4;
				area.setValue((settings.excludedFolders || []).join("\n")).onChange(async (value) => {
					settings.excludedFolders = value
						.split("\n")
						.map((line) => line.trim())
						.filter(Boolean);
					await this.commit(false);
				});
			});

		new Setting(containerEl).setName("Folder rules").setHeading();

		containerEl.createEl("p", {
			cls: "titler-empty",
			text:
				"Tokens: {{title}} for the derived title, {{date:FORMAT}} for the note's creation time, " +
				"{{parent}} for the folder name. A rule without {{title}} is applied once when the note is " +
				"created and then left alone.",
		});

		(settings.rules || []).forEach((rule, index) => this.renderRule(containerEl, rule, index));

		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Add rule")
				.setCta()
				.onClick(async () => {
					settings.rules.push({
						folder: "",
						includeSubfolders: true,
						template: DEFAULT_TEMPLATE,
						enabled: true,
					});
					await this.commit(false);
					this.display();
				}),
		);
	}

	renderRule(containerEl, rule, index) {
		const section = containerEl.createDiv({ cls: "titler-rule" });

		const header = new Setting(section)
			.setName(`Rule ${index + 1}`)
			.setHeading()
			.addToggle((toggle) =>
				toggle
					.setTooltip("Enable this rule")
					.setValue(rule.enabled !== false)
					.onChange(async (value) => {
						rule.enabled = value;
						await this.commit(false);
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Delete rule")
					.onClick(async () => {
						this.plugin.settings.rules.splice(index, 1);
						await this.commit(false);
						this.display();
					}),
			);
		header.setDesc(this.preview(rule));

		new Setting(section)
			.setName("Folder")
			.setDesc("Leave empty for the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("tmp")
					.setValue(rule.folder || "")
					.onChange(async (value) => {
						rule.folder = value;
						await this.commit(false);
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("folder")
					.setTooltip("Browse folders")
					.onClick(() => {
						new FolderPickerModal(this.app, async (folder) => {
							rule.folder = folder;
							await this.commit(false);
							this.display();
						}).open();
					}),
			);

		new Setting(section).setName("Filename template").addText((text) =>
			text
				.setPlaceholder(DEFAULT_TEMPLATE)
				.setValue(rule.template || DEFAULT_TEMPLATE)
				.onChange(async (value) => {
					rule.template = value;
					header.setDesc(this.preview(rule));
					await this.commit(false);
				}),
		);

		new Setting(section).setName("Include subfolders").addToggle((toggle) =>
			toggle.setValue(rule.includeSubfolders !== false).onChange(async (value) => {
				rule.includeSubfolders = value;
				await this.commit(false);
			}),
		);
	}

	preview(rule) {
		const rendered = applyTemplate(rule.template || DEFAULT_TEMPLATE, {
			title: "My note",
			parent: normalizeFolder(rule.folder).split("/").pop() || "",
			formatDate: (format) => moment().format(format),
		});
		const name = sanitizeFilename(rendered, this.plugin.settings.maxLength);
		const fragment = document.createDocumentFragment();
		fragment.createSpan({ cls: "titler-preview", text: name ? `${name}.md` : "no filename" });
		return fragment;
	}
}

module.exports = TitlerPlugin;
