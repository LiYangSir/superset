import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import {
	hasPersistedActiveSpaceId,
	useActiveSpaceId,
	useSetActiveSpaceId,
} from "renderer/stores/active-space";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { navigateToWorkspace } from "./utils/workspace-navigation";
import { TopBar } from "./components/TopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const activeSpaceId = useActiveSpaceId();
	const setActiveSpaceId = useSetActiveSpaceId();
	const shouldSyncSpaceFromWorkspaceRef = useRef(!hasPersistedActiveSpaceId());
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	useEffect(() => {
		if (!shouldSyncSpaceFromWorkspaceRef.current) return;
		if (!currentWorkspace?.project?.spaceId) return;
		setActiveSpaceId(currentWorkspace.project.spaceId);
		shouldSyncSpaceFromWorkspaceRef.current = false;
	}, [currentWorkspace?.project?.spaceId, setActiveSpaceId]);

	// Space switching: fetch spaces list and grouped workspaces for active space
	const { data: spaces = [] } = electronTrpc.spaces.list.useQuery();
	const { data: spaceGroups } = electronTrpc.workspaces.getAllGrouped.useQuery(
		activeSpaceId ? { spaceId: activeSpaceId } : undefined,
		{ enabled: !!activeSpaceId },
	);

	const switchSpace = useCallback(
		(direction: "prev" | "next") => {
			if (spaces.length < 2) return;
			const currentIndex = spaces.findIndex((s) => s.id === activeSpaceId);
			const idx = currentIndex === -1 ? 0 : currentIndex;
			const newIndex =
				direction === "prev"
					? (idx - 1 + spaces.length) % spaces.length
					: (idx + 1) % spaces.length;
			setActiveSpaceId(spaces[newIndex].id);
		},
		[spaces, activeSpaceId, setActiveSpaceId],
	);

	// When active space changes and current workspace doesn't belong to it, navigate to first workspace in new space
	const prevSpaceIdRef = useRef(activeSpaceId);
	useEffect(() => {
		if (!activeSpaceId || activeSpaceId === prevSpaceIdRef.current) {
			prevSpaceIdRef.current = activeSpaceId;
			return;
		}
		prevSpaceIdRef.current = activeSpaceId;

		if (!spaceGroups || spaceGroups.length === 0) return;

		const currentBelongsToSpace = currentWorkspace?.project?.spaceId === activeSpaceId;
		if (currentBelongsToSpace) return;

		const firstWorkspace = spaceGroups[0]?.workspaces[0];
		if (firstWorkspace) {
			navigateToWorkspace(firstWorkspace.id, navigate);
		}
	}, [activeSpaceId, spaceGroups, currentWorkspace?.project?.spaceId, navigate]);

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useAppHotkey(
		"OPEN_SETTINGS",
		() => navigate({ to: "/settings/account" }),
		undefined,
		[navigate],
	);

	useAppHotkey(
		"SHOW_HOTKEYS",
		() => navigate({ to: "/settings/keyboard" }),
		undefined,
		[navigate],
	);

	useAppHotkey(
		"TOGGLE_WORKSPACE_SIDEBAR",
		() => {
			if (!isWorkspaceSidebarOpen) {
				setWorkspaceSidebarOpen(true);
			} else {
				toggleWorkspaceSidebarCollapsed();
			}
		},
		undefined,
		[
			isWorkspaceSidebarOpen,
			setWorkspaceSidebarOpen,
			toggleWorkspaceSidebarCollapsed,
		],
	);

	useAppHotkey(
		"NEW_WORKSPACE",
		() => openNewWorkspaceModal(currentWorkspace?.projectId),
		undefined,
		[openNewWorkspaceModal, currentWorkspace?.projectId],
	);

	useAppHotkey("PREV_SPACE", () => switchSpace("prev"), undefined, [
		switchSpace,
	]);
	useAppHotkey("NEXT_SPACE", () => switchSpace("next"), undefined, [
		switchSpace,
	]);

	return (
		<div className="flex flex-col h-full w-full">
			<TopBar />
			<div className="flex flex-1 overflow-hidden">
				{isWorkspaceSidebarOpen && (
					<ResizablePanel
						width={workspaceSidebarWidth}
						onWidthChange={setWorkspaceSidebarWidth}
						isResizing={isWorkspaceSidebarResizing}
						onResizingChange={setWorkspaceSidebarIsResizing}
						minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
						maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
						handleSide="right"
						clampWidth={false}
						onDoubleClickHandle={() =>
							setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
						}
					>
						<WorkspaceSidebar
							isCollapsed={isWorkspaceSidebarCollapsed()}
							activeProjectId={currentWorkspace?.projectId ?? null}
							activeProjectName={currentWorkspace?.project?.name ?? null}
						/>
					</ResizablePanel>
				)}
				<Outlet />
			</div>
		</div>
	);
}
