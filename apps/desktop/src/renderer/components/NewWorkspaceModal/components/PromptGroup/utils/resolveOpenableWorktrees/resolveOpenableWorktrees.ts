export interface TrackedWorktree {
	id: string;
	branch: string;
	path: string;
	hasActiveWorkspace: boolean;
	existsOnDisk: boolean;
}

export interface ExternalWorktree {
	path: string;
	branch: string;
	hasActiveWorkspace?: boolean;
}

export type OpenableWorktreeAction =
	| { type: "tracked"; worktreeId: string }
	| { type: "external"; worktreePath: string };

export function resolveOpenableWorktrees(
	trackedWorktrees: TrackedWorktree[],
	externalWorktrees: ExternalWorktree[],
): Map<string, OpenableWorktreeAction> {
	const result = new Map<string, OpenableWorktreeAction>();

	for (const wt of externalWorktrees) {
		if (!wt.branch) continue;
		if (wt.hasActiveWorkspace) continue;
		result.set(wt.branch, {
			type: "external",
			worktreePath: wt.path,
		});
	}

	for (const wt of trackedWorktrees) {
		if (!wt.branch) continue;
		if (!wt.existsOnDisk) continue;
		if (wt.hasActiveWorkspace) continue;
		result.set(wt.branch, { type: "tracked", worktreeId: wt.id });
	}

	return result;
}
