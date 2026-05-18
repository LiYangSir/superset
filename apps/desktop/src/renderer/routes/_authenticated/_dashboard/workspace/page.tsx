import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSetActiveSpaceId } from "renderer/stores/active-space";

export const Route = createFileRoute("/_authenticated/_dashboard/workspace/")({
	component: WorkspaceIndexPage,
});

function LoadingSpinner() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Spinner className="size-5" />
		</div>
	);
}

function WorkspaceIndexPage() {
	const navigate = useNavigate();
	const setActiveSpaceId = useSetActiveSpaceId();
	const { data: workspaces, isLoading } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	const workspaceEntries = useMemo(
		() =>
			workspaces?.flatMap((group) => [
				...group.workspaces.map((workspace) => ({
					workspace,
					spaceId: group.project.spaceId,
				})),
				...(group.sections ?? []).flatMap((section) =>
					section.workspaces.map((workspace) => ({
						workspace,
						spaceId: group.project.spaceId,
					})),
				),
			]) ?? [],
		[workspaces],
	);
	const hasNoWorkspaces = !isLoading && workspaceEntries.length === 0;

	useEffect(() => {
		if (isLoading || !workspaces) return;

		if (workspaceEntries.length === 0) {
			navigate({ to: "/welcome", replace: true });
			return;
		}

		const lastViewedId = localStorage.getItem("lastViewedWorkspaceId");
		const targetEntry =
			workspaceEntries.find(({ workspace }) => workspace.id === lastViewedId) ??
			workspaceEntries[0];

		if (targetEntry) {
			if (targetEntry.spaceId) {
				setActiveSpaceId(targetEntry.spaceId);
			}
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: targetEntry.workspace.id },
				replace: true,
			});
		}
	}, [workspaces, isLoading, navigate, workspaceEntries, setActiveSpaceId]);

	if (hasNoWorkspaces) {
		return <LoadingSpinner />;
	}

	return <LoadingSpinner />;
}
