import { electronTrpc } from "lib/trpc-react";
import { useHandleOpenedWorktree } from "./useHandleOpenedWorktree";

export function useOpenExternalWorktree(
	options?: Parameters<
		typeof electronTrpc.workspaces.openExternalWorktree.useMutation
	>[0],
) {
	const handleOpenedWorktree = useHandleOpenedWorktree();

	return electronTrpc.workspaces.openExternalWorktree.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			await handleOpenedWorktree(data);
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
