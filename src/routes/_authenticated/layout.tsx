import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { DndProvider } from "react-dnd";
import { NewWorkspaceModal } from "components/NewWorkspaceModal";
import { dragDropManager } from "lib/dnd";
import { electronTrpc } from "lib/trpc-react";
import { showWorkspaceAutoNameWarningToast } from "lib/workspaces/showWorkspaceAutoNameWarningToast";
import { InitGitDialog } from "react-query/projects/InitGitDialog";
import { WorkspaceInitEffects } from "screens/main/components/WorkspaceInitEffects";
import { useHotkeysSync } from "stores/hotkeys";
import { useAgentHookListener } from "stores/tabs/useAgentHookListener";
import { useWorkspaceInitStore } from "stores/workspace-init";
import { TeardownLogsDialog } from "./components/TeardownLogsDialog";

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const shownWorkspaceInitWarningsRef = useRef(new Set<string>());

	useAgentHookListener();
	useHotkeysSync();

	const updateInitProgress = useWorkspaceInitStore((s) => s.updateProgress);
	electronTrpc.workspaces.onInitProgress.useSubscription(undefined, {
		onData: (progress) => {
			updateInitProgress(progress);
			if (
				progress.warning &&
				!shownWorkspaceInitWarningsRef.current.has(progress.workspaceId)
			) {
				shownWorkspaceInitWarningsRef.current.add(progress.workspaceId);
				showWorkspaceAutoNameWarningToast({
					description: progress.warning,
					onOpenModelAuthSettings: () => {
						void navigate({ to: "/settings/models" });
					},
				});
			}
			if (progress.step === "ready" || progress.step === "failed") {
				utils.workspaces.getAllGrouped.invalidate();
				utils.workspaces.get.invalidate({ id: progress.workspaceId });
			}
		},
		onError: (error) => {
			console.error("[workspace-init-subscription] Subscription error:", error);
		},
	});

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "open-settings") {
				const section = event.data.section || "appearance";
				navigate({ to: `/settings/${section}` as "/settings/appearance" });
			} else if (event.type === "open-workspace") {
				navigate({ to: `/workspace/${event.data.workspaceId}` });
			}
		},
	});

	return (
		<DndProvider manager={dragDropManager}>
			<Outlet />
			<WorkspaceInitEffects />
			<NewWorkspaceModal />
			<InitGitDialog />
			<TeardownLogsDialog />
		</DndProvider>
	);
}
