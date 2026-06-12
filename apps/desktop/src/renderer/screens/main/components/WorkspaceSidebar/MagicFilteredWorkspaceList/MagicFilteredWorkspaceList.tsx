import { useMemo } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SidebarWorkspace } from "../types";
import { WorkspaceListItem } from "../WorkspaceListItem";
import { getMagicWorkspaces, type MagicWorkspace } from "./getMagicWorkspaces";

type SidebarGroup = {
	project: {
		id: string;
		name: string;
	};
	workspaces: SidebarWorkspace[];
	sections?: {
		id: string;
		name: string;
		workspaces: SidebarWorkspace[];
	}[];
};

interface MagicFilteredWorkspaceListProps {
	groups: SidebarGroup[];
	isCollapsed?: boolean;
}

function MagicSection({
	title,
	workspaces,
	orderedWorkspaceIds,
}: {
	title: string;
	workspaces: MagicWorkspace[];
	orderedWorkspaceIds: string[];
}) {
	return (
		<section>
			<div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border/60 bg-muted/95 px-3 py-2 backdrop-blur-sm">
				<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{title}
				</span>
				<span className="text-[10px] tabular-nums text-muted-foreground/70">
					{workspaces.length}
				</span>
			</div>
			{workspaces.map((workspace, index) => (
				<WorkspaceListItem
					key={workspace.id}
					id={workspace.id}
					projectId={workspace.projectId}
					worktreePath={workspace.worktreePath}
					name={workspace.name}
					branch={workspace.branch}
					type={workspace.type}
					isUnread={workspace.isUnread}
					index={index}
					isCollapsed={false}
					sectionId={null}
					sections={[]}
					orderedWorkspaceIds={orderedWorkspaceIds}
					projectName={workspace.projectName}
					preferBranchName
					disableDnd
					magicPage
					activateTabIdOnOpen={workspace.latestTabId}
				/>
			))}
		</section>
	);
}

export function MagicFilteredWorkspaceList({
	groups,
	isCollapsed = false,
}: MagicFilteredWorkspaceListProps) {
	const tabs = useTabsStore((state) => state.tabs);
	const panes = useTabsStore((state) => state.panes);

	const filteredWorkspaces = useMemo(
		() => getMagicWorkspaces({ groups, tabs, panes }),
		[groups, panes, tabs],
	);

	const blocked = filteredWorkspaces.filter((workspace) => workspace.isBlocked);
	const running = filteredWorkspaces.filter(
		(workspace) => !workspace.isBlocked,
	);
	const orderedWorkspaceIds = filteredWorkspaces.map(
		(workspace) => workspace.id,
	);

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-1 py-2">
				{filteredWorkspaces.map((workspace, index) => (
					<WorkspaceListItem
						key={workspace.id}
						id={workspace.id}
						projectId={workspace.projectId}
						worktreePath={workspace.worktreePath}
						name={workspace.name}
						branch={workspace.branch}
						type={workspace.type}
						isUnread={workspace.isUnread}
						index={index}
						isCollapsed
						sectionId={null}
						sections={[]}
						orderedWorkspaceIds={orderedWorkspaceIds}
						projectName={workspace.projectName}
						preferBranchName
						disableDnd
						magicPage
						activateTabIdOnOpen={workspace.latestTabId}
					/>
				))}
			</div>
		);
	}

	if (filteredWorkspaces.length === 0) {
		return (
			<div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
				<span>No running branch tabs</span>
			</div>
		);
	}

	return (
		<div className="pb-2">
			<MagicSection
				title="阻塞的分支"
				workspaces={blocked}
				orderedWorkspaceIds={orderedWorkspaceIds}
			/>
			<MagicSection
				title="正在运行的分支"
				workspaces={running}
				orderedWorkspaceIds={orderedWorkspaceIds}
			/>
		</div>
	);
}
