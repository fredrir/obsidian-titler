import { around } from "monkey-around";
import type { App, Plugin, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { View } from "obsidian";

// Undocumented internals of the core file explorer view.
interface FileExplorerView extends View {
	tree: ExplorerTree;
	files: { get(el: HTMLElement): TAbstractFile | undefined };
	startRenameFile(file: TAbstractFile): Promise<void>;
	activeDom: { file: TAbstractFile } | null;
	revealActiveFile(): void;
}

export interface ExplorerTree {
	focusedItem: { el: HTMLElement } | null;
	setCollapseAll(collapsed: boolean): void;
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

export function findExplorerTree(app: App): ExplorerTree | null {
	const view = app.workspace.getLeavesOfType("file-explorer")[0]?.view as Partial<FileExplorerView> | undefined;
	return view?.tree ?? null;
}

export async function renameInExplorer(app: App, { leaf, file }: ExplorerRenameTarget): Promise<void> {
	await app.workspace.revealLeaf(leaf);
	await (leaf.view as FileExplorerView).startRenameFile(file);
}

/** Keeps auto-reveal from expanding folders to an active note where `shouldSkip` holds. */
export function skipAutoRevealWhen(plugin: Plugin, shouldSkip: (path: string) => boolean): void {
	const { workspace } = plugin.app;
	let patched = false;

	const patch = async (): Promise<void> => {
		const leaf = workspace.getLeavesOfType("file-explorer")[0];
		if (patched || !leaf) return;
		await leaf.loadIfDeferred();
		const view = leaf.view as Partial<FileExplorerView>;
		if (patched || typeof view.revealActiveFile !== "function") return;
		patched = true;
		// Patching the prototype also covers explorers opened later.
		const prototype = Object.getPrototypeOf(view) as FileExplorerView;
		plugin.register(
			around(prototype, {
				revealActiveFile: (original) =>
					function (this: FileExplorerView) {
						const path = this.activeDom?.file.path;
						if (path && shouldSkip(path)) return;
						original.call(this);
					},
			}),
		);
	};

	workspace.onLayoutReady(() => void patch());
	plugin.registerEvent(workspace.on("layout-change", () => void patch()));
}

function focusedExplorerItem(app: App): TAbstractFile | null {
	const view = app.workspace.getActiveViewOfType(View);
	if (view?.getViewType() !== "file-explorer") return null;
	const explorer = view as FileExplorerView;
	const item = explorer.tree.focusedItem;
	return item ? (explorer.files.get(item.el) ?? null) : null;
}
