import type { SelectAgentActivity } from "@superset/local-db";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCircle,
	LuCircleAlert,
	LuSquare,
	LuTerminal,
	LuX,
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
	getActivitySecondaryText,
} from "renderer/components/activity/utils";
import { useNow } from "renderer/hooks/useNow";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface ProjectActivityGroupProps {
	projectName: string;
	projectColor: string | null;
	activities: SelectAgentActivity[];
	activeCount: number;
	onArchive: (id: string) => void;
}

export function ProjectActivityGroup({
	projectName,
	projectColor,
	activities,
	activeCount,
	onArchive,
}: ProjectActivityGroupProps) {
	const [open, setOpen] = useState(activeCount > 0);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span
					className="size-2 rounded-full shrink-0"
					style={{ backgroundColor: projectColor ?? "#888" }}
				/>
				<span className="text-xs font-medium truncate flex-1 text-left">
					{projectName}
				</span>
				{activeCount > 0 && (
					<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium tabular-nums shrink-0">
						{activeCount} running
					</span>
				)}
				<span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
					{activities.length}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{activities.map((a) => (
					<ActivityItem key={a.id} activity={a} onArchive={onArchive} />
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

function ActivityItem({
	activity,
	onArchive,
}: {
	activity: SelectAgentActivity;
	onArchive: (id: string) => void;
}) {
	const isActive = activity.status === "in_progress";
	const isWaiting = activity.status === "waiting_for_input";
	const isRunningOrWaiting = isActive || isWaiting;
	const [open, setOpen] = useState(isRunningOrWaiting);
	const navigate = useNavigate();
	const now = useNow(1000, isActive);
	const signalMutation = electronTrpc.terminal.signal.useMutation();

	const metadata = parseMetadata(activity.metadata);
	const displayText = getActivityDisplayText(activity, metadata);
	const taskCounts = countTaskProgress(metadata);
	const subagentCounts = countSubagentProgress(metadata);

	const elapsedLabel = isRunningOrWaiting
		? formatDuration(now - activity.startedAt)
		: activity.durationMs != null
			? formatDuration(activity.durationMs)
			: formatRelativeTime(activity.startedAt);

	const StatusIcon =
		activity.status === "completed"
			? LuCheck
			: activity.status === "failed"
				? LuCircleAlert
				: LuCircle;

	const agentColor = getAgentColor(activity.presetName);

	const handleJump = () => {
		if (!activity.workspaceId) return;
		navigateToWorkspace(activity.workspaceId, navigate, {
			search: { tabId: activity.tabId, paneId: activity.paneId },
		});
	};

	const handleStop = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!activity.paneId) return;
		signalMutation.mutate({ paneId: activity.paneId, signal: "SIGINT" });
	};

	const hasProgress =
		(metadata.tasks?.length ?? 0) > 0 || (metadata.subagents?.length ?? 0) > 0;

	const progressLabel = buildProgressLabel(taskCounts, subagentCounts);

	const isStale =
		!isRunningOrWaiting &&
		activity.status === "completed" &&
		activity.startedAt < Date.now() - 20 * 60 * 1000;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div
				className={cn(
					"group/item flex w-full items-center gap-2 px-3 pl-7 py-1.5 hover:bg-muted/30 transition-colors",
					isActive && "bg-amber-500/[0.04]",
					isWaiting && "bg-violet-500/[0.06]",
					isStale && "opacity-50",
				)}
			>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 shrink-0"
						aria-label={open ? "Collapse" : "Expand"}
					>
						<LuChevronRight
							className={cn(
								"size-3 text-muted-foreground transition-transform duration-150",
								open && "rotate-90",
							)}
						/>
						{isRunningOrWaiting ? (
							<ActivityBars
								mode={isWaiting ? "waiting" : "running"}
								size={12}
								tint={agentColor}
							/>
						) : (
							<StatusIcon
								className={cn(
									"size-3 shrink-0",
									activity.status === "completed" && "text-green-500",
									activity.status === "failed" && "text-red-500",
									activity.status !== "completed" &&
										activity.status !== "failed" &&
										"text-muted-foreground",
								)}
							/>
						)}
					</button>
				</CollapsibleTrigger>
				<button
					type="button"
					onClick={handleJump}
					className="flex-1 min-w-0 text-left"
					title="Jump to tab"
				>
					<span
						className={cn(
							"text-xs truncate block",
							isActive && "text-foreground",
						)}
					>
						{displayText}
					</span>
				</button>
				{progressLabel && (
					<span
						className={cn(
							"text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded",
							taskCounts.total > 0 && taskCounts.completed === taskCounts.total
								? "bg-green-500/10 text-green-600 dark:text-green-400"
								: "bg-muted text-muted-foreground",
						)}
					>
						{progressLabel}
					</span>
				)}
				<span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
					{elapsedLabel}
				</span>
				{isRunningOrWaiting ? (
					<button
						type="button"
						onClick={handleStop}
						disabled={!activity.paneId || signalMutation.isPending}
						className="p-0.5 rounded hover:bg-red-500/10 transition-all shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
						aria-label="Stop"
						title="Send SIGINT to stop the agent"
					>
						<LuSquare className="size-3 text-red-500" />
					</button>
				) : (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onArchive(activity.id);
						}}
						className={cn(
							"p-0.5 rounded hover:bg-muted transition-all shrink-0",
							isStale
								? "opacity-60 hover:opacity-100"
								: "opacity-0 group-hover/item:opacity-100",
						)}
						aria-label="Dismiss"
						title="Archive this activity"
					>
						<LuX className="size-3 text-muted-foreground" />
					</button>
				)}
			</div>
			<CollapsibleContent>
				<div className="px-3 pb-2 pl-12 space-y-1.5">
					{(() => {
						const secondary = getActivitySecondaryText(activity, metadata);
						return secondary ? (
							<p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">
								{secondary}
							</p>
						) : null;
					})()}
					{isRunningOrWaiting && metadata.lastTool && (
						<div className="flex items-center gap-1.5">
							<LuTerminal className="size-3 text-muted-foreground/60" />
							<span className="text-[10px] text-muted-foreground font-mono">
								{metadata.lastTool}
							</span>
						</div>
					)}
					{hasProgress && (
						<TasksProgress metadata={metadata} isActive={isRunningOrWaiting} />
					)}
					{metadata.lastFailure && (
						<div className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1">
							<div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600 dark:text-red-400">
								<LuCircleAlert className="size-3" />
								<span>Failed: {metadata.lastFailure.toolName}</span>
							</div>
							{metadata.lastFailure.summary && (
								<p className="mt-0.5 text-[10px] text-muted-foreground font-mono line-clamp-2">
									{metadata.lastFailure.summary}
								</p>
							)}
						</div>
					)}
					<DetailMeta activity={activity} metadata={metadata} />
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function buildProgressLabel(
	taskCounts: { total: number; completed: number },
	subagentCounts: { running: number; total: number },
): string | null {
	const parts: string[] = [];
	if (taskCounts.total > 0) {
		parts.push(`${taskCounts.completed}/${taskCounts.total}`);
	}
	if (subagentCounts.running > 0) {
		parts.push(`${subagentCounts.running}\u2197`);
	} else if (subagentCounts.total > 0 && taskCounts.total === 0) {
		parts.push(`${subagentCounts.total} sub`);
	}
	return parts.length > 0 ? parts.join(" · ") : null;
}

function DetailMeta({
	activity,
	metadata,
}: {
	activity: SelectAgentActivity;
	metadata: ActivityMetadata;
}) {
	const parts: string[] = [];
	if (activity.modelName) parts.push(activity.modelName);
	if (activity.presetName && activity.presetName !== activity.modelName)
		parts.push(activity.presetName);
	if (metadata.toolCount) parts.push(`${metadata.toolCount} tool calls`);
	if (activity.durationMs != null)
		parts.push(formatDuration(activity.durationMs));
	if (parts.length === 0) return null;
	return (
		<div className="text-[10px] text-muted-foreground/60 truncate">
			{parts.join(" · ")}
		</div>
	);
}
