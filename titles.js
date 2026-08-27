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

module.exports = {
	applyTemplate,
	cleanInline,
	deriveTitle,
	firstWords,
	folderOf,
	isExcluded,
	isOptedOut,
	isStaticTemplate,
	isUntitled,
	matchRule,
	normalizeFolder,
	sanitizeFilename,
	splitFrontmatter,
	stripLineMarkers,
	uniqueBasename,
};
