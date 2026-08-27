import { toTrackedNotes } from "../settings";
import type { TrackedNotes } from "../types";

/**
 * The notes Titler is allowed to rename, together with the basename it last
 * gave each one. Claims are persisted, so a note stays claimed across restarts
 * even once its name no longer looks untitled.
 */
export class NoteTracker {
	private readonly claims: Map<string, string>;

	constructor(claims: ReadonlyMap<string, string> = new Map()) {
		this.claims = new Map(claims);
	}

	get size(): number {
		return this.claims.size;
	}

	/** Replaces every claim, for when persisted state is (re)loaded. */
	reset(claims: ReadonlyMap<string, string>): void {
		this.claims.clear();
		for (const [path, basename] of claims) this.claims.set(path, basename);
	}

	isClaimed(path: string): boolean {
		return this.claims.has(path);
	}

	/** The basename recorded for a claimed note, or `undefined` if unclaimed. */
	claimedBasename(path: string): string | undefined {
		return this.claims.get(path);
	}

	claim(path: string, basename: string): void {
		this.claims.set(path, basename);
	}

	/** Returns whether a claim was actually dropped. */
	release(path: string): boolean {
		return this.claims.delete(path);
	}

	/** Moves a claim to a new path, keeping the recorded basename. */
	transfer(fromPath: string, toPath: string): boolean {
		const basename = this.claims.get(fromPath);
		if (basename === undefined) return false;
		this.claims.delete(fromPath);
		this.claims.set(toPath, basename);
		return true;
	}

	/** Rewrites every claim under `fromFolder` to sit under `toFolder`. */
	moveFolder(fromFolder: string, toFolder: string): boolean {
		let changed = false;
		for (const path of this.pathsUnder(fromFolder)) {
			changed = this.transfer(path, `${toFolder}/${path.slice(fromFolder.length + 1)}`) || changed;
		}
		return changed;
	}

	/** Drops every claim under `folder`, for when the folder itself is deleted. */
	releaseFolder(folder: string): boolean {
		let changed = false;
		for (const path of this.pathsUnder(folder)) {
			changed = this.release(path) || changed;
		}
		return changed;
	}

	/** Drops claims that no longer describe a note Titler last named itself. */
	prune(isStillValid: (path: string, basename: string) => boolean): boolean {
		let changed = false;
		for (const [path, basename] of [...this.claims]) {
			if (isStillValid(path, basename)) continue;
			this.claims.delete(path);
			changed = true;
		}
		return changed;
	}

	toJSON(): TrackedNotes {
		return toTrackedNotes(this.claims);
	}

	private pathsUnder(folder: string): string[] {
		const prefix = `${folder}/`;
		return [...this.claims.keys()].filter((path) => path.startsWith(prefix));
	}
}
