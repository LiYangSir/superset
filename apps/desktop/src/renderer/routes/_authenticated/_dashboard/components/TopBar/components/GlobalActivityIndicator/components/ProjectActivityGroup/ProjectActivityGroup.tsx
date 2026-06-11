import type { SelectAgentActivity } from "@superset/local-db";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuArchive,
	LuCheck,
	LuChevronRight,
	LuCircle,
	LuCircleAlert,
	LuLoader,
} from "react-icons/lu";
import {
	formatDuration,
	formatRelativeTime,
} from "renderer/components/activity/ActivityCard/ActivityCard";

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
	const [open, setOpen] = useState(true);

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
	const [open, setOpen] = useState(false);
	const summary =
		activity.summary || activity.userMessage || activity.title || "Completed";
	const tag = activity.presetName || "claude-code";
	const isActive = activity.status === "in_progress";

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="group/item flex w-full items-center gap-2 px-3 pl-7 py-1.5 text-left hover:bg-muted/30 transition-colors">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				{isActive ? (
					<LuLoader className="size-3 shrink-0 text-amber-500 animate-spin" />
				) : activity.status === "completed" ? (
					<LuCheck className="size-3 shrink-0 text-green-500" />
				) : activity.status === "failed" ? (
					<LuCircleAlert className="size-3 shrink-0 text-red-500" />
				) : (
					<LuCircle className="size-3 shrink-0 text-muted-foreground" />
				)}
				<span
					className={cn(
						"text-xs truncate flex-1",
						isActive && "text-amber-500",
					)}
				>
					{summary}
				</span>
				<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
					{tag}
				</span>
				<span className="text-[10px] text-muted-foreground/60 shrink-0">
					{isActive
						? formatDuration(Date.now() - activity.startedAt)
						: formatRelativeTime(activity.startedAt)}
				</span>
				{!isActive && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onArchive(activity.id);
						}}
						className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-muted transition-all shrink-0"
						aria-label="Archive"
					>
						<LuArchive className="size-3 text-muted-foreground" />
					</button>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="px-3 pb-2 pl-12 space-y-1.5">
					{activity.userMessage && (
						<p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
							{activity.userMessage}
						</p>
					)}
					{activity.summary && activity.userMessage && (
						<p className="text-[11px] text-foreground/80">{activity.summary}</p>
					)}
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
						{activity.modelName && <span>Model: {activity.modelName}</span>}
						{activity.durationMs != null && (
							<span>Duration: {formatDuration(activity.durationMs)}</span>
						)}
						{activity.status === "completed" && <span>Completed</span>}
						{activity.status === "failed" && <span>Failed</span>}
						{activity.status === "in_progress" && <span>In Progress</span>}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
