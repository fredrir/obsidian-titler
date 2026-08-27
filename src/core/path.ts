export const MARKDOWN_EXTENSION = "md";

const MARKDOWN_SUFFIX = /\.md$/i;
const LEADING_SLASHES = /^\/+/;
const TRAILING_SLASHES = /\/+$/;

/** The folder holding a vault path, or `""` for the vault root. */
export function folderOf(path: string): string {
	const index = path.lastIndexOf("/");
	return index === -1 ? "" : path.slice(0, index);
}

/** The name of the folder holding a vault path, for the `{{parent}}` token. */
export function parentFolderName(path: string): string {
	return folderOf(path).split("/").pop() ?? "";
}

/** The filename of a vault path without its `.md` extension. */
export function basenameOf(path: string): string {
	return (path.split("/").pop() ?? "").replace(MARKDOWN_SUFFIX, "");
}

export function joinPath(folder: string, basename: string): string {
	const filename = `${basename}.${MARKDOWN_EXTENSION}`;
	return folder ? `${folder}/${filename}` : filename;
}

/** Accepts what a user types: trims whitespace and stray leading or trailing slashes. */
export function normalizeFolder(folder: string): string {
	return folder.trim().replace(LEADING_SLASHES, "").replace(TRAILING_SLASHES, "");
}

/**
 * A path is excluded when an entry matches it as a folder prefix, or when a
 * bare entry like `_Agents` names any folder along the path.
 */
export function isExcluded(path: string, excludedFolders: readonly string[]): boolean {
	const lower = path.toLowerCase();
	const segments = folderOf(lower).split("/").filter(Boolean);

	return excludedFolders.some((entry) => {
		const target = normalizeFolder(entry).toLowerCase();
		if (!target) return false;
		if (lower === target || lower.startsWith(`${target}/`)) return true;
		return !target.includes("/") && segments.includes(target);
	});
}
