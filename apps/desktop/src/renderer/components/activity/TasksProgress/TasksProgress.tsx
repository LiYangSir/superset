import { CircularProgress } from "@superset/ui/circular-progress";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCircle,
	LuCircleAlert,
	LuLoader,
} from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import type { ActivityMetadata, SubagentInfo, TaskInfo } from "../types";
import { countSubagentProgress, countTaskProgress } from "../types";
import { formatDuration } from "../utils";

interface TasksProgressProps {
	metadata: ActivityMetadata;
	isActive: boolean;
	density?: "compact" | "comfortable";
}

export function TasksProgress({
	metadata,
	isActive,
	density = "comfortable",
}: TasksProgressProps) {
	const tasks = metadata.tasks ?? [];
	const subagents = metadata.subagents ?? [];
	if (tasks.length === 0 && subagents.length === 0) return null;

	const taskCounts = countTaskProgress(metadata);
	const subagentCounts = countSubagentProgress(metadata);

	const compact = density === "compact";

	return (
		<div className={cn("space-y-1.5", compact && "space-y-1")}>
			{tasks.length > 0 && (
				<TaskList
					tasks={tasks}
					completed={taskCounts.completed}
					inProgress={taskCounts.inProgress}
					total={taskCounts.total}
					activeTaskId={metadata.activeTaskId}
					defaultOpen={isActive}
					compact={compact}
				/>
			)}
			{subagents.length > 0 && (
				<SubagentList
					subagents={subagents}
					running={subagentCounts.running}
					done={subagentCounts.done}
					failed={subagentCounts.failed}
					total={subagentCounts.total}
					defaultOpen={isActive && subagentCounts.running > 0}
					compact={compact}
					isActive={isActive}
				/>
			)}
		</div>
	);
}

interface TaskListProps {
	tasks: TaskInfo[];
	completed: number;
	inProgress: number;
	total: number;
	activeTaskId?: string;
	defaultOpen: boolean;
	compact: boolean;
}

function TaskList({
	tasks,
	completed,
	inProgress,
	total,
	activeTaskId,
	defaultOpen,
	compact,
}: TaskListProps) {
	const [open, setOpen] = useState(defaultOpen);
	const progress = total > 0 ? (completed / total) * 100 : 0;
	const allDone = total > 0 && completed === total;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left text-[10px] text-muted-foreground hover:text-foreground transition-colors">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span className="font-medium tabular-nums">
					Todos {completed}/{total}
				</span>
				{inProgress > 0 && (
					<span className="text-amber-500 font-medium">
						· {inProgress} active
					</span>
				)}
				<CircularProgress
					value={progress}
					size={12}
					strokeWidth={2}
					className={cn(
						"ml-auto",
						allDone ? "text-green-500" : "text-amber-500",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ul className={cn("pl-4 mt-1", compact ? "space-y-0" : "space-y-0.5")}>
					{tasks.map((task) => (
						<TaskRow
							key={task.id}
							task={task}
							highlight={task.id === activeTaskId}
						/>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	);
}

function TaskRow({ task, highlight }: { task: TaskInfo; highlight: boolean }) {
	const Icon =
		task.status === "completed"
			? LuCheck
			: task.status === "in_progress"
				? LuLoader
				: LuCircle;
	return (
		<li
			className={cn(
				"flex items-start gap-1.5 text-[11px] leading-tight px-1 py-0.5 rounded",
				highlight && "bg-amber-500/10",
			)}
		>
			<Icon
				className={cn(
					"size-3 shrink-0 mt-0.5",
					task.status === "completed" && "text-green-500",
					task.status === "in_progress" && "text-amber-500 animate-spin",
					task.status === "pending" && "text-muted-foreground/50",
				)}
			/>
			<span
				className={cn(
					task.status === "completed" && "text-muted-foreground line-through",
					task.status === "in_progress" && "text-foreground font-medium",
					task.status === "pending" && "text-muted-foreground",
				)}
			>
				{task.subject}
			</span>
		</li>
	);
}

interface SubagentListProps {
	subagents: SubagentInfo[];
	running: number;
	done: number;
	failed: number;
	total: number;
	defaultOpen: boolean;
	compact: boolean;
	isActive: boolean;
}

function SubagentList({
	subagents,
	running,
	done,
	failed,
	total,
	defaultOpen,
	compact,
	isActive,
}: SubagentListProps) {
	const [open, setOpen] = useState(defaultOpen);
	const hasRunning = running > 0;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left text-[10px] text-muted-foreground hover:text-foreground transition-colors">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span className="font-medium tabular-nums">Subagents {total}</span>
				{running > 0 && (
					<span className="text-amber-500 font-medium">
						· {running} running
					</span>
				)}
				{done > 0 && <span className="text-green-500/80">· {done} done</span>}
				{failed > 0 && <span className="text-red-500">· {failed} failed</span>}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ul className={cn("pl-4 mt-1", compact ? "space-y-0" : "space-y-0.5")}>
					{subagents.map((sa) => (
						<SubagentRow
							key={sa.id}
							subagent={sa}
							showElapsed={isActive && hasRunning}
						/>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	);
}

function SubagentRow({
	subagent,
	showElapsed,
}: { subagent: SubagentInfo; showElapsed: boolean }) {
	const isRunning = subagent.status === "in_progress";
	const now = useNow(1000, showElapsed && isRunning);
	const Icon =
		subagent.status === "completed"
			? LuCheck
			: subagent.status === "failed"
				? LuCircleAlert
				: LuLoader;

	const elapsed =
		isRunning && subagent.startedAt
			? formatDuration(now - subagent.startedAt)
			: subagent.endedAt && subagent.startedAt
				? formatDuration(subagent.endedAt - subagent.startedAt)
				: null;

	return (
		<li className="flex items-center gap-1.5 text-[11px] leading-tight">
			<Icon
				className={cn(
					"size-3 shrink-0",
					subagent.status === "completed" && "text-green-500",
					subagent.status === "in_progress" && "text-amber-500 animate-spin",
					subagent.status === "failed" && "text-red-500",
				)}
			/>
			<span className="text-muted-foreground truncate flex-1">
				{subagent.description || `Subagent ${subagent.id}`}
				{subagent.subagentType && (
					<span className="ml-1 text-[10px] text-muted-foreground/70 font-mono">
						[{subagent.subagentType}]
					</span>
				)}
			</span>
			{elapsed && (
				<span
					className={cn(
						"text-[10px] shrink-0 tabular-nums",
						isRunning
							? "text-amber-500/70"
							: "text-muted-foreground/60",
					)}
				>
					{elapsed}
				</span>
			)}
			{subagent.status === "failed" && (
				<span className="text-[10px] text-red-500 shrink-0">failed</span>
			)}
		</li>
	);
}
