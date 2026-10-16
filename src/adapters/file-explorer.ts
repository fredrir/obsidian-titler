import type { App, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { View } from "obsidian";

// Undocumented internals of the core file explorer view.
interface FileExplorerView extends View {
	tree: { focusedItem: { el: HTMLElement } | null };
	files: { get(el: HTMLElement): TAbstractFile | undefined };
	startRenameFile(file: TAbstractFile): Promise<void>;
}

export interface ExplorerRenameTarget {
	leaf: WorkspaceLeaf;
	file: TAbstractFile;
}

export function findExplorerRenameTarget(app: App): ExplorerRenameTarget | null {
	const leaf = app.workspace.getLeavesOfType("file-explorer")[0];
	if (!leaf) return null;
	const file = focusedExplorerItem(app) ?? app.workspace.getActiveFile();
	return file ? { leaf, file } : null;
}

export async function renameInExplorer(app: App, { leaf, file }: ExplorerRenameTarget): Promise<void> {
	await app.workspace.revealLeaf(leaf);
	await (leaf.view as FileExplorerView).startRenameFile(file);
}

function focusedExplorerItem(app: App): TAbstractFile | null {
	const view = app.workspace.getActiveViewOfType(View);
	if (view?.getViewType() !== "file-explorer") return null;
	const explorer = view as FileExplorerView;
	const item = explorer.tree.focusedItem;
	return item ? (explorer.files.get(item.el) ?? null) : null;
}
