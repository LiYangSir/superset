import type { electronTrpc } from "lib/trpc-react";

type Utils = ReturnType<typeof electronTrpc.useUtils>;

export async function invalidateWorkspaceQueries(utils: Utils) {
	await utils.workspaces.getAll.invalidate();
	await utils.workspaces.getAllGrouped.invalidate();
	await utils.workspaces.getPreviousWorkspace.invalidate();
	await utils.workspaces.getNextWorkspace.invalidate();
}
