import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getMagicWorkspaces } from "renderer/screens/main/components/WorkspaceSidebar/MagicFilteredWorkspaceList/getMagicWorkspaces";
import { useTabsStore } from "renderer/stores/tabs/store";

export const Route = createFileRoute("/_authenticated/_dashboard/magic/")({
	component: MagicPage,
});

function MagicPage() {
	const navigate = useNavigate();
	const { data: groups = [], isLoading } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const tabs = useTabsStore((state) => state.tabs);
	const panes = useTabsStore((state) => state.panes);

	const magicWorkspaces = useMemo(
		() => getMagicWorkspaces({ groups, tabs, panes }),
		[groups, panes, tabs],
	);
	const firstWorkspace = magicWorkspaces[0];

	useEffect(() => {
		if (!firstWorkspace) return;
		navigate({
			to: "/magic/$workspaceId",
			params: { workspaceId: firstWorkspace.id },
			search: firstWorkspace.latestTabId
				? { tabId: firstWorkspace.latestTabId }
				: {},
			replace: true,
		});
	}, [firstWorkspace, navigate]);

	if (isLoading) {
		return (
			<div className="flex h-full flex-1 items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
			No running or blocked branches
		</div>
	);
}
