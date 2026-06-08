import type {
	AgentActivityStatus,
	SelectAgentActivity,
} from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { LuArchive, LuCheck, LuCircleAlert, LuLoader } from "react-icons/lu";
import { parseMetadata } from "../types";
import { ActivityCardDetails } from "./components/ActivityCardDetails";
import { ActivityCardSubagents } from "./components/ActivityCardSubagents";
import { ActivityCardTasks } from "./components/ActivityCardTasks";

export function formatDuration(ms: number): string {
	if (ms < 1000) return "<1s";
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}m ${remainingSeconds}s`
			: `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

const statusConfig: Record<
	AgentActivityStatus,
	{
		icon: typeof LuLoader;
		className: string;
		iconClassName: string;
	}
> = {
	in_progress: {
		icon: LuLoader,
		className: "text-amber-500",
		iconClassName: "animate-spin",
	},
	completed: {
		icon: LuCheck,
		className: "text-green-500",
		iconClassName: "",
	},
	failed: {
		icon: LuCircleAlert,
		className: "text-red-500",
		iconClassName: "",
	},
};

interface ActivityCardProps {
	activity: SelectAgentActivity;
	onArchive?: (id: string) => void;
}

export function ActivityCard({ activity, onArchive }: ActivityCardProps) {
	const config = statusConfig[activity.status as AgentActivityStatus];
	const StatusIcon = config.icon;
	const metadata = parseMetadata(activity.metadata);

	const displayName = activity.tabName || activity.presetName || "Agent";
	const displayText =
		activity.summary || activity.userMessage || activity.title;

	const elapsed =
		activity.status === "in_progress"
			? formatDuration(Date.now() - activity.startedAt)
			: activity.durationMs != null
				? formatDuration(activity.durationMs)
				: null;

	return (
		<div className="group/card px-3 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors">
			<div className="flex items-center gap-2 min-w-0">
				<StatusIcon
					className={cn(
						"size-3.5 shrink-0",
						config.className,
						config.iconClassName,
					)}
				/>
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
							activity.status === "in_progress"
								? "text-amber-500/70"
								: "text-muted-foreground/70",
						)}
					>
						{activity.status === "in_progress"
							? elapsed
							: formatRelativeTime(activity.startedAt)}
					</span>
				)}
				{onArchive && activity.status !== "in_progress" && (
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

			<div className="mt-1 pl-5.5 space-y-0">
				<ActivityCardDetails
					activity={activity}
					formatDuration={formatDuration}
					formatRelativeTime={formatRelativeTime}
				/>
				{metadata.tasks && metadata.tasks.length > 0 && (
					<ActivityCardTasks tasks={metadata.tasks} />
				)}
				{metadata.subagents && metadata.subagents.length > 0 && (
					<ActivityCardSubagents subagents={metadata.subagents} />
				)}
			</div>
		</div>
	);
}
