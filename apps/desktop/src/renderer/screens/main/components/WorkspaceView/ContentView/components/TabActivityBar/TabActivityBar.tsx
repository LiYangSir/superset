import type { SelectAgentActivity } from "@superset/local-db";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuLoader } from "react-icons/lu";
import { ActivityCard } from "renderer/components/activity/ActivityCard";
import {
	formatDuration,
	formatRelativeTime,
} from "renderer/components/activity/ActivityCard/ActivityCard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";

export function TabActivityBar() {
	const { workspaceId } = useParams({ strict: false });

	const activeTabId = useTabsStore((state) => {
		if (!workspaceId) return null;
		return resolveActiveTabIdForWorkspace({
			workspaceId,
			tabs: state.tabs,
			activeTabIds: state.activeTabIds,
			tabHistoryStacks: state.tabHistoryStacks,
		});
	});

	const { data: rawActivities } = electronTrpc.agentActivities.list.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: !!workspaceId,
			refetchInterval: (query) => {
				const data = query.state.data as SelectAgentActivity[] | undefined;
				const hasActive = data?.some((a) => a.status === "in_progress");
				return hasActive ? 3000 : 30000;
			},
		},
	);
	const activities = rawActivities as SelectAgentActivity[] | undefined;

	const { current: currentActivity, history } = useMemo(() => {
		if (!activities || activities.length === 0 || !activeTabId)
			return { current: null, history: [] };

		const paneIds = new Set<string>();
		const tabsStore = useTabsStore.getState();
		for (const pane of Object.values(tabsStore.panes)) {
			if (pane.tabId === activeTabId) {
				paneIds.add(pane.id);
			}
		}

		const relevant = activities.filter(
			(a) => a.tabId === activeTabId || (a.paneId && paneIds.has(a.paneId)),
		);

		const active = relevant.find((a) => a.status === "in_progress");
		const past = relevant.filter((a) => a.status !== "in_progress");
		return { current: active ?? null, history: past };
	}, [activities, activeTabId]);

	if (!currentActivity && history.length === 0) return null;

	return (
		<HoverCard openDelay={200} closeDelay={300}>
			<HoverCardTrigger asChild>
				<div className="shrink-0 cursor-default">
					{currentActivity ? (
						<ActiveBar activity={currentActivity} />
					) : (
						<IdleBar latestActivity={history[0]} />
					)}
				</div>
			</HoverCardTrigger>
			{history.length > 0 && (
				<HoverCardContent
					side="bottom"
					align="start"
					sideOffset={0}
					className="w-[var(--radix-hover-card-trigger-width)] max-h-[50vh] overflow-y-auto p-0 rounded-t-none border-t-0"
				>
					<div className="px-3 py-1.5 border-b border-border/50">
						<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
							History ({history.length})
						</span>
					</div>
					{history.map((a) => (
						<ActivityCard key={a.id} activity={a} />
					))}
				</HoverCardContent>
			)}
		</HoverCard>
	);
}

function ActiveBar({ activity }: { activity: SelectAgentActivity }) {
	const elapsed = formatDuration(Date.now() - activity.startedAt);
	const displayText =
		activity.userMessage || activity.title || activity.tabName || "Working...";

	return (
		<div className="flex items-center gap-2 h-7 px-3 border-b border-amber-500/30 bg-amber-500/5">
			<LuLoader className="size-3 shrink-0 text-amber-500 animate-spin" />
			<span className="text-[11px] text-foreground truncate flex-1">
				{displayText}
			</span>
			<span className="text-[10px] text-amber-500/70 shrink-0 tabular-nums">
				{elapsed}
			</span>
		</div>
	);
}

function IdleBar({ latestActivity }: { latestActivity: SelectAgentActivity }) {
	const displayText =
		latestActivity.summary ||
		latestActivity.userMessage ||
		latestActivity.title ||
		"Completed";

	return (
		<div
			className={cn(
				"flex items-center gap-2 h-6 px-3 border-b border-border/50 bg-muted/20",
				"cursor-default",
			)}
		>
			<span className="size-1.5 rounded-full bg-green-500/60 shrink-0" />
			<span className="text-[11px] text-muted-foreground truncate flex-1">
				{displayText}
			</span>
			<span className="text-[10px] text-muted-foreground/60 shrink-0">
				{formatRelativeTime(latestActivity.startedAt)}
			</span>
		</div>
	);
}
