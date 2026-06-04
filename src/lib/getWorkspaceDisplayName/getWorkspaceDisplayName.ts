export function getWorkspaceDisplayName(
	workspaceName: string,
	workspaceType: "worktree" | "branch",
	projectName?: string | null,
): string {
	const label =
		workspaceType === "branch"
			? "local"
			: workspaceName || "Unnamed";
	return [projectName, label].filter(Boolean).join(" - ");
}
