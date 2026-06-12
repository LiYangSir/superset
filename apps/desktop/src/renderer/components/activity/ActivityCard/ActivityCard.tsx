import type {
	AgentActivityStatus,
	SelectAgentActivity,
} from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { LuArchive, LuCheck, LuCircleAlert } from "react-icons/lu";
import { ActivityBars } from "../ActivityBars";
import { getAgentColor } from "../agent-colors";
import { TasksProgress } from "../TasksProgress";
import { parseMetadata } from "../types";
import {
	formatDuration,
	formatRelativeTime,
	getActivityDisplayText,
} from "../utils";

export { formatDuration, formatRelativeTime } from "../utils";

interface ActivityCardProps {
	activity: SelectAgentActivity;
	onArchive?: (id: string) => void;
}

export function ActivityCard({ activity, onArchive }: ActivityCardProps) {
	const metadata = parseMetadata(activity.metadata);
	const isActive = activity.status === "in_progress";
	const isWaiting = activity.status === "waiting_for_input";
	const isRunningOrWaiting = isActive || isWaiting;

	const displayName = activity.tabName || activity.presetName || "Agent";
	const displayText = getActivityDisplayText(activity, metadata);
	const agentColor = getAgentColor(activity.presetName);

	const elapsed = isRunningOrWaiting
		? formatDuration(Date.now() - activity.startedAt)
		: activity.durationMs != null
			? formatDuration(activity.durationMs)
			: null;

	const hasProgress =
		(metadata.tasks?.length ?? 0) > 0 || (metadata.subagents?.length ?? 0) > 0;

	return (
		<div className="group/card px-3 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors">
			<div className="flex items-center gap-2 min-w-0">
				{isRunningOrWaiting ? (
					<ActivityBars
						mode={isWaiting ? "waiting" : "running"}
						size={14}
						tint={agentColor}
					/>
				) : (
					<CompletionIcon status={activity.status as AgentActivityStatus} />
				)}
				<span className="text-xs font-medium truncate flex-1">
					{displayName}
				</span>
				{activity.modelName && (
					<span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
						{activity.modelName}
					</span>
				)}
				{elapsed && (
					<span
						className={cn(
							"text-[10px] shrink-0",
							isRunningOrWaiting
								? "text-amber-500/70"
								: "text-muted-foreground/70",
						)}
					>
						{isRunningOrWaiting
							? elapsed
							: formatRelativeTime(activity.startedAt)}
					</span>
				)}
				{onArchive && !isRunningOrWaiting && (
					<button
						type="button"
						onClick={() => onArchive(activity.id)}
						className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
						aria-label="Archive activity"
					>
						<LuArchive className="size-3 text-muted-foreground" />
					</button>
				)}
			</div>

			{displayText && (
				<p className="text-[11px] text-muted-foreground mt-1 pl-5.5 truncate">
					{displayText}
				</p>
			)}

			{hasProgress && (
				<div className="mt-1.5 pl-5.5">
					<TasksProgress metadata={metadata} isActive={isRunningOrWaiting} />
				</div>
			)}

			{metadata.lastFailure && (
				<div className="mt-1.5 ml-5.5 rounded border border-red-500/20 bg-red-500/5 px-2 py-1">
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

function CompletionIcon({ status }: { status: AgentActivityStatus }) {
	if (status === "completed") {
		return <LuCheck className="size-3.5 shrink-0 text-green-500" />;
	}
	if (status === "failed") {
		return <LuCircleAlert className="size-3.5 shrink-0 text-red-500" />;
	}
	return <LuCheck className="size-3.5 shrink-0 text-muted-foreground" />;
}
