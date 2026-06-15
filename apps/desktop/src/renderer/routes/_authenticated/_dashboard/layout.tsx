import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import {
	getLastWorkspaceForSpace,
	setLastWorkspaceForSpace,
	useActiveSpaceId,
	useSetActiveSpaceId,
} from "renderer/stores/active-space";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useSetPreSettingsPath } from "renderer/stores/settings-state";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { TopBar } from "./components/TopBar";
import { navigateToWorkspace } from "./utils/workspace-navigation";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

type SpaceItem = {
	id: string;
};

type SpaceWorkspaceGroup = {
	project: {
		spaceId?: string | null;
	};
	workspaces: {
		id: string;
	}[];
	sections?: {
		workspaces: {
			id: string;
		}[];
	}[];
};

function getFirstWorkspaceInSpace(
	groups: SpaceWorkspaceGroup[],
	spaceId: string,
): string | null {
	const group = groups.find(
		(candidate) => candidate.project.spaceId === spaceId,
	);
	if (!group) return null;

	return (
		group.workspaces[0]?.id ??
		group.sections?.find((section) => section.workspaces.length > 0)
			?.workspaces[0]?.id ??
		null
	);
}

function DashboardLayout() {
	const navigate = useNavigate();
	const router = useRouter();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const setPreSettingsPath = useSetPreSettingsPath();
	const activeSpaceId = useActiveSpaceId();
	const setActiveSpaceId = useSetActiveSpaceId();
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const isMagicPage = !!matchRoute({ to: "/magic", fuzzy: true });
	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const magicWorkspaceMatch = matchRoute({
		to: "/magic/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		workspaceMatch !== false
			? workspaceMatch.workspaceId
			: magicWorkspaceMatch !== false
				? magicWorkspaceMatch.workspaceId
				: null;

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const prevWorkspaceSpaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (isMagicPage) return;
		const workspaceSpaceId = currentWorkspace?.project?.spaceId;
		if (!workspaceSpaceId || !currentWorkspaceId) return;
		setLastWorkspaceForSpace(workspaceSpaceId, currentWorkspaceId);
		if (workspaceSpaceId === prevWorkspaceSpaceIdRef.current) return;
		prevWorkspaceSpaceIdRef.current = workspaceSpaceId;
		setActiveSpaceId(workspaceSpaceId);
	}, [
		currentWorkspace?.project?.spaceId,
		currentWorkspaceId,
		isMagicPage,
		setActiveSpaceId,
	]);

	// Space switching: fetch spaces list and grouped workspaces for active space
	const { data: spacesData = [] } = electronTrpc.spaces.list.useQuery();
	const spaces = spacesData as SpaceItem[];
	const { data: spaceGroups } = electronTrpc.workspaces.getAllGrouped.useQuery(
		activeSpaceId ? { spaceId: activeSpaceId } : undefined,
		{ enabled: !!activeSpaceId },
	);
	const { data: allGroupsForMagic = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery(undefined, {
			enabled: isMagicPage,
		});

	const switchSpace = useCallback(
		(direction: "prev" | "next") => {
			const itemCount = spaces.length + 1;
			if (itemCount < 2) return;
			const currentSpaceIndex = spaces.findIndex((s) => s.id === activeSpaceId);
			const currentIndex = isMagicPage
				? 0
				: currentSpaceIndex === -1
					? 1
					: currentSpaceIndex + 1;
			const idx = currentIndex === -1 ? 0 : currentIndex;
			const newIndex =
				direction === "prev"
					? (idx - 1 + itemCount) % itemCount
					: (idx + 1) % itemCount;
			if (newIndex === 0) {
				navigate({ to: "/magic" });
				return;
			}
			const targetSpace = spaces[newIndex - 1];
			setActiveSpaceId(targetSpace.id);
			if (isMagicPage) {
				const lastWorkspaceId = getLastWorkspaceForSpace(targetSpace.id);
				const targetWorkspaceId =
					lastWorkspaceId ??
					getFirstWorkspaceInSpace(
						allGroupsForMagic as SpaceWorkspaceGroup[],
						targetSpace.id,
					);
				if (targetWorkspaceId) {
					navigateToWorkspace(targetWorkspaceId, navigate);
				} else {
					navigate({ to: "/workspace" });
				}
			}
		},
		[
			activeSpaceId,
			allGroupsForMagic,
			isMagicPage,
			navigate,
			setActiveSpaceId,
			spaces,
		],
	);

	// When active space changes and current workspace doesn't belong to it, navigate to first workspace in new space
	const prevSpaceIdRef = useRef(activeSpaceId);
	useEffect(() => {
		if (!activeSpaceId || activeSpaceId === prevSpaceIdRef.current) {
			prevSpaceIdRef.current = activeSpaceId;
			return;
		}
		prevSpaceIdRef.current = activeSpaceId;

		if (isMagicPage) return;
		if (!spaceGroups || spaceGroups.length === 0) return;

		const currentBelongsToSpace =
			currentWorkspace?.project?.spaceId === activeSpaceId;
		if (currentBelongsToSpace) return;

		const lastWorkspaceId = getLastWorkspaceForSpace(activeSpaceId);
		const targetWorkspaceId =
			lastWorkspaceId ??
			getFirstWorkspaceInSpace(
				spaceGroups as SpaceWorkspaceGroup[],
				activeSpaceId,
			);
		if (targetWorkspaceId) {
			navigateToWorkspace(targetWorkspaceId, navigate);
		}
	}, [
		activeSpaceId,
		isMagicPage,
		spaceGroups,
		currentWorkspace?.project?.spaceId,
		navigate,
	]);

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
		() => {
			setPreSettingsPath(router.state.location.href);
			navigate({ to: "/settings/appearance" });
		},
		undefined,
		[navigate, router, setPreSettingsPath],
	);

	useAppHotkey(
		"SHOW_HOTKEYS",
		() => {
			setPreSettingsPath(router.state.location.href);
			navigate({ to: "/settings/keyboard" });
		},
		undefined,
		[navigate, router, setPreSettingsPath],
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
							isMagicPage={isMagicPage}
						/>
					</ResizablePanel>
				)}
				<Outlet />
			</div>
		</div>
	);
}
