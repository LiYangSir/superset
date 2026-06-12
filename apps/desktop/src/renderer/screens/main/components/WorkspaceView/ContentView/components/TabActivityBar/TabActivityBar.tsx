import type { SelectAgentActivity } from "@superset/local-db";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCircleAlert,
	LuSquare,
} from "react-icons/lu";
import { ActivityBars } from "renderer/components/activity/ActivityBars";
import { getAgentColor } from "renderer/components/activity/agent-colors";
import { TasksProgress } from "renderer/components/activity/TasksProgress";
import {
	type ActivityMetadata,
	countSubagentProgress,
	countTaskProgress,
	parseMetadata,
} from "renderer/components/activity/types";
import {
	formatDuration,
	formatRelativeTime,
	getActivityDisplayText,
} from "renderer/components/activity/utils";
import { useNow } from "renderer/hooks/useNow";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";

export function TabActivityBar() {
	const { workspaceId } = useParams({ strict: false });
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

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
			refetchInterval: 30_000,
		},
	);
	const activities = rawActivities as SelectAgentActivity[] | undefined;

	electronTrpc.agentActivities.subscribeUpdates.useSubscription(
		{ workspaceId: workspaceId ?? undefined },
		{
			enabled: !!workspaceId,
			onData: () => {
				utils.agentActivities.list.invalidate({
					workspaceId: workspaceId ?? "",
				});
			},
		},
	);

	const { current: currentActivity, history } = useMemo(() => {
		if (!activities || activities.length === 0 || !activeTabId)
			return { current: null, history: [] as SelectAgentActivity[] };

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

	const handleJump = (activity: SelectAgentActivity) => {
		if (!activity.workspaceId) return;
		navigateToWorkspace(activity.workspaceId, navigate, {
			search: {
				tabId: activity.tabId,
				paneId: activity.paneId,
			},
		});
	};

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
			{(currentActivity || history.length > 0) && (
				<HoverCardContent
					side="bottom"
					align="start"
					sideOffset={0}
					className="w-[var(--radix-hover-card-trigger-width)] max-h-[55vh] overflow-y-auto p-0 rounded-t-none border-t-0"
				>
					{currentActivity && (
						<ActiveDetail activity={currentActivity} onJump={handleJump} />
					)}
					{history.length > 0 && (
						<>
							<div className="px-3 py-1.5 border-b border-border/50">
								<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
									History ({history.length})
								</span>
							</div>
							{history.slice(0, 20).map((a) => (
								<HistoryRow key={a.id} activity={a} onJump={handleJump} />
							))}
						</>
					)}
				</HoverCardContent>
			)}
		</HoverCard>
	);
}

function ActiveBar({ activity }: { activity: SelectAgentActivity }) {
	const now = useNow(1000, true);
	const metadata = useMetadata(activity);
	const displayText = getActivityDisplayText(activity, metadata);
	const elapsed = formatDuration(now - activity.startedAt);
	const signalMutation = electronTrpc.terminal.signal.useMutation();

	const taskCounts = countTaskProgress(metadata);
	const subagentCounts = countSubagentProgress(metadata);

	const summaryParts: string[] = [];
	if (taskCounts.total > 0) {
		summaryParts.push(`${taskCounts.completed}/${taskCounts.total} todos`);
	}
	if (subagentCounts.running > 0) {
		summaryParts.push(
			`${subagentCounts.running} subagent${subagentCounts.running > 1 ? "s" : ""} running`,
		);
	}
	if ((metadata.toolCount ?? 0) >= 5 && taskCounts.total === 0) {
		summaryParts.push(`${metadata.toolCount} tools used`);
	}

	const handleStop = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!activity.paneId) return;
		signalMutation.mutate({ paneId: activity.paneId, signal: "SIGINT" });
	};

	return (
		<div className="flex items-center gap-2 h-9 px-3 border-b border-amber-500/30 bg-amber-500/5">
			<ActivityBars
				mode="running"
				size={14}
				tint={getAgentColor(activity.presetName)}
			/>
			<div className="min-w-0 flex-1">
				<div className="text-[11px] text-foreground truncate">
					{displayText}
				</div>
				{summaryParts.length > 0 && (
					<div className="text-[10px] text-muted-foreground/80 truncate">
						{summaryParts.join(" · ")}
					</div>
				)}
			</div>
			<span className="text-[10px] text-amber-500/80 shrink-0 tabular-nums">
				{elapsed}
			</span>
			<button
				type="button"
				onClick={handleStop}
				disabled={!activity.paneId || signalMutation.isPending}
				className="shrink-0 inline-flex items-center justify-center size-5 rounded hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
				title="Stop agent (SIGINT)"
			>
				<LuSquare className="size-3 text-red-500" />
			</button>
		</div>
	);
}

function ActiveDetail({
	activity,
	onJump,
}: {
	activity: SelectAgentActivity;
	onJump: (a: SelectAgentActivity) => void;
}) {
	const metadata = useMetadata(activity);
	const signalMutation = electronTrpc.terminal.signal.useMutation();
	const hasProgress =
		(metadata.tasks?.length ?? 0) > 0 || (metadata.subagents?.length ?? 0) > 0;

	const handleStop = () => {
		if (!activity.paneId) return;
		signalMutation.mutate({ paneId: activity.paneId, signal: "SIGINT" });
	};

	return (
		<div className="px-3 py-2 border-b border-border/50 bg-amber-500/5">
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => onJump(activity)}
					className="text-[11px] text-foreground hover:underline text-left flex-1 min-w-0 truncate"
				>
					{getActivityDisplayText(activity, metadata)}
				</button>
				<button
					type="button"
					onClick={handleStop}
					disabled={!activity.paneId || signalMutation.isPending}
					className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					title="Send SIGINT"
				>
					<LuSquare className="size-2.5" />
					Stop
				</button>
			</div>
			{hasProgress && (
				<div className="mt-1.5">
					<TasksProgress metadata={metadata} isActive density="compact" />
				</div>
			)}
			{metadata.lastFailure && (
				<div className="mt-1.5 rounded border border-red-500/20 bg-red-500/5 px-2 py-1">
					<div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600 dark:text-red-400">
						<LuCircleAlert className="size-3" />
						<span>Last failure: {metadata.lastFailure.toolName}</span>
					</div>
					{metadata.lastFailure.summary && (
						<p className="mt-0.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words font-mono">
							{metadata.lastFailure.summary}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function IdleBar({ latestActivity }: { latestActivity: SelectAgentActivity }) {
	const metadata = useMetadata(latestActivity);
	const displayText = getActivityDisplayText(latestActivity, metadata);
	const taskCounts = countTaskProgress(metadata);

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
			{taskCounts.total > 0 && (
				<span className="text-[10px] text-green-600/70 dark:text-green-400/70 tabular-nums shrink-0">
					{taskCounts.completed}/{taskCounts.total}
				</span>
			)}
			<span className="text-[10px] text-muted-foreground/60 shrink-0">
				{formatRelativeTime(latestActivity.startedAt)}
			</span>
		</div>
	);
}

function HistoryRow({
	activity,
	onJump,
}: {
	activity: SelectAgentActivity;
	onJump: (a: SelectAgentActivity) => void;
}) {
	const metadata = useMetadata(activity);
	const Icon =
		activity.status === "completed"
			? LuCheck
			: activity.status === "failed"
				? LuCircleAlert
				: LuChevronRight;
	const iconClass =
		activity.status === "completed"
			? "text-green-500"
			: activity.status === "failed"
				? "text-red-500"
				: "text-muted-foreground";

	return (
		<button
			type="button"
			onClick={() => onJump(activity)}
			className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors border-b border-border/30 last:border-b-0"
		>
			<Icon className={cn("size-3 shrink-0", iconClass)} />
			<span className="text-[11px] text-foreground truncate flex-1">
				{getActivityDisplayText(activity, metadata)}
			</span>
			<span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
				{activity.durationMs != null
					? formatDuration(activity.durationMs)
					: formatRelativeTime(activity.startedAt)}
			</span>
		</button>
	);
}

function useMetadata(activity: SelectAgentActivity): ActivityMetadata {
	return useMemo(() => parseMetadata(activity.metadata), [activity.metadata]);
}
