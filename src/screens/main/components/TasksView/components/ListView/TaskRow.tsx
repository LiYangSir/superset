import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { LabelChip } from "../LabelChip";
import { PriorityBadge } from "../PriorityBadge";
import { StatusBadge } from "../StatusBadge";

interface TaskRowProps {
	task: SelectTask;
	labels: SelectTaskLabel[];
	onClick: () => void;
	isSelected: boolean;
}

export function TaskRow({ task, labels, onClick, isSelected }: TaskRowProps) {
	const overdue =
		task.due_date &&
		new Date(task.due_date) < new Date() &&
		task.status !== "done" &&
		task.status !== "cancelled";

	const dueStr = task.due_date
		? new Date(task.due_date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})
		: null;

	const taskLabels = (task.labels ?? [])
		.map((id) => labels.find((l) => l.id === id))
		.filter(Boolean) as SelectTaskLabel[];

	return (
		<div
			onClick={onClick}
			className={cn(
				"flex items-center gap-3 px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/30",
				isSelected && "bg-accent/40",
				task.status === "cancelled" && "opacity-50",
			)}
		>
			<PriorityBadge priorityId={task.priority} size={12} />
			<StatusBadge statusId={task.status} size={13} />

			<span className="text-[10px] text-foreground/40 font-mono min-w-[70px]">
				{task.slug}
			</span>

			<span
				className={cn(
					"flex-1 text-sm text-foreground truncate",
					task.status === "cancelled" && "line-through",
				)}
			>
				{task.title}
			</span>

			{taskLabels.length > 0 && (
				<div className="flex items-center gap-1 shrink-0">
					{taskLabels.slice(0, 2).map((label) => (
						<LabelChip key={label.id} name={label.name} color={label.color} />
					))}
					{taskLabels.length > 2 && (
						<span className="text-[10px] text-foreground/40">
							+{taskLabels.length - 2}
						</span>
					)}
				</div>
			)}

			{dueStr && (
				<span
					className={cn(
						"text-[11px] shrink-0",
						overdue ? "text-red-400" : "text-foreground/40",
					)}
				>
					{dueStr}
				</span>
			)}
		</div>
	);
}
