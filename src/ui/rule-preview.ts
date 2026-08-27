import { moment } from "obsidian";
import { sanitizeFilename } from "../core/filename";
import { normalizeFolder } from "../core/path";
import { applyTemplate } from "../core/template";
import type { FolderRule } from "../types";

/** Stand-in title used to show the user what a template will produce. */
const SAMPLE_TITLE = "My note";

/** How a rule names itself in the settings list. */
export function folderLabel(rule: FolderRule): string {
	const folder = normalizeFolder(rule.folder) || "Vault root";
	return rule.includeSubfolders ? `${folder} and subfolders` : folder;
}

/** The filename a rule would produce for a note titled "My note". */
export function previewFilename(rule: FolderRule, maxLength: number): string {
	const rendered = applyTemplate(rule.template, {
		title: SAMPLE_TITLE,
		parent: normalizeFolder(rule.folder).split("/").pop() ?? "",
		formatDate: (format) => moment().format(format),
	});
	const name = sanitizeFilename(rendered, maxLength);
	return name ? `${name}.md` : "No filename";
}

/** The preview as a settings description, in the monospace of a real filename. */
export function previewDesc(rule: FolderRule, maxLength: number): DocumentFragment {
	return createFragment((fragment) => {
		fragment.createSpan({ cls: "titler-preview", text: previewFilename(rule, maxLength) });
	});
}
