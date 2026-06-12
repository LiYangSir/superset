import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import type { WorkspaceSearchParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { WorkspaceRouteContent } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page";
import { NotFound } from "renderer/routes/not-found";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/magic/$workspaceId/",
)({
	component: MagicWorkspacePage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): WorkspaceSearchParams => ({
		tabId: typeof search.tabId === "string" ? search.tabId : undefined,
		paneId: typeof search.paneId === "string" ? search.paneId : undefined,
	}),
	loader: async ({ params, context }) => {
		const queryKey = [
			["workspaces", "get"],
			{ input: { id: params.workspaceId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey,
				queryFn: () =>
					trpcClient.workspaces.get.query({ id: params.workspaceId }),
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			throw error;
		}
	},
});

function MagicWorkspacePage() {
	const { workspaceId } = Route.useParams();
	const routeNavigate = Route.useNavigate();
	const { tabId: searchTabId, paneId: searchPaneId } = Route.useSearch();
	const clearSearch = useCallback(() => {
		routeNavigate({ search: {}, replace: true });
	}, [routeNavigate]);

	return (
		<WorkspaceRouteContent
			workspaceId={workspaceId}
			searchTabId={searchTabId}
			searchPaneId={searchPaneId}
			onClearSearch={clearSearch}
		/>
	);
}
