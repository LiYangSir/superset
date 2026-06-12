import type { Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import type { PaneStatus } from "shared/tabs-types";
import { getHighestPriorityStatus } from "shared/tabs-types";
import type { SidebarWorkspace } from "../types";

type MagicWorkspaceGroup = {
	project: {
		name: string;
	};
	workspaces: SidebarWorkspace[];
	sections?: {
		workspaces: SidebarWorkspace[];
	}[];
};

export interface MagicWorkspace extends SidebarWorkspace {
	projectName: string;
	tabCount: number;
	latestTabId: string | null;
	latestActivityAt: number;
	isBlocked: boolean;
}

function getLatestWorkspaceTab(tabs: Tab[]): Tab | null {
	if (tabs.length === 0) return null;

	return [...tabs].sort(
		(a, b) =>
			(b.lastActivityAt ?? b.createdAt) - (a.lastActivityAt ?? a.createdAt),
	)[0];
}

export function getMagicWorkspaces({
	groups,
	tabs,
	panes,
}: {
	groups: MagicWorkspaceGroup[];
	tabs: Tab[];
	panes: Record<string, { status?: PaneStatus } | undefined>;
}): MagicWorkspace[] {
	const workspacesById = new Map<
		string,
		SidebarWorkspace & { projectName: string }
	>();

	for (const group of groups) {
		for (const workspace of group.workspaces) {
			workspacesById.set(workspace.id, {
				...workspace,
				projectName: group.project.name,
			});
		}
		for (const section of group.sections ?? []) {
			for (const workspace of section.workspaces) {
				workspacesById.set(workspace.id, {
					...workspace,
					projectName: group.project.name,
				});
			}
		}
	}

	return Array.from(workspacesById.values())
		.map((workspace) => {
			const workspaceTabs = tabs.filter(
				(tab) => tab.workspaceId === workspace.id,
			);
			const latestTab = getLatestWorkspaceTab(workspaceTabs);
			const workspaceStatus = getHighestPriorityStatus(
				workspaceTabs.flatMap((tab) =>
					extractPaneIdsFromLayout(tab.layout).map(
						(paneId) => panes[paneId]?.status,
					),
				),
			);

			return {
				...workspace,
				tabCount: workspaceTabs.length,
				latestTabId: latestTab?.id ?? null,
				latestActivityAt:
					latestTab?.lastActivityAt ??
					latestTab?.createdAt ??
					workspace.tabOrder,
				isBlocked:
					workspaceStatus === "permission" || workspaceStatus === "review",
			};
		})
		.filter((workspace) => workspace.tabCount > 0)
		.sort((a, b) => b.latestActivityAt - a.latestActivityAt);
}
