import { electronTrpc } from "lib/trpc-react";

export function useImportAllWorktrees() {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.importAllWorktrees.useMutation({
		onSuccess: async () => {
			await utils.workspaces.invalidate();
			await utils.projects.getRecents.invalidate();
		},
	});
}
