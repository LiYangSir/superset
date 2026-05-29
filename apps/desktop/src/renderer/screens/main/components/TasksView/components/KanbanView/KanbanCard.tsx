import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { LabelChip } from "../LabelChip";
import { PriorityBadge } from "../PriorityBadge";
import type { SubtaskCount } from "./KanbanView";

interface KanbanCardProps {
	task: SelectTask;
	labels: SelectTaskLabel[];
	subtaskProgress?: SubtaskCount;
	onClick: () => void;
	isDragging?: boolean;
}

function SubtaskRing({ total, done }: { total: number; done: number }) {
	const size = 12;
	const strokeWidth = 1.5;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const progress = total > 0 ? done / total : 0;
	const dashOffset = circumference * (1 - progress);

	return (
		<span className="inline-flex items-center gap-1 shrink-0">
			<svg width={size} height={size} className="-rotate-90">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					className="text-foreground/10"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={dashOffset}
					strokeLinecap="round"
					className={done === total ? "text-emerald-500" : "text-foreground/50"}
				/>
			</svg>
			<span className="text-[10px] text-foreground/40">
				{done}/{total}
			</span>
		</span>
	);
}

export function KanbanCard({
	task,
	labels,
	subtaskProgress,
	onClick,
	isDragging,
}: KanbanCardProps) {
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
				"group p-3 rounded-lg border border-border bg-card/80 hover:bg-accent/40 hover:border-border/80 cursor-pointer transition-all hover:shadow-[0_2px_10px_rgba(0,0,0,0.3)]",
				isDragging &&
					"opacity-60 rotate-1 scale-[1.03] shadow-[0_20px_60px_rgba(0,0,0,0.6)]",
			)}
		>
			<div className="flex items-start gap-2 mb-1.5">
				<PriorityBadge
					priorityId={task.priority}
					size={12}
					className="mt-0.5 shrink-0"
				/>
				<span className="text-sm text-foreground leading-tight line-clamp-2">
					{task.title}
				</span>
			</div>

			{taskLabels.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2 mb-1">
					{taskLabels.slice(0, 3).map((label) => (
						<LabelChip key={label.id} name={label.name} color={label.color} />
					))}
					{taskLabels.length > 3 && (
						<span className="text-[10px] text-foreground/40 self-center">
							+{taskLabels.length - 3}
						</span>
					)}
				</div>
			)}

			<div className="flex items-center justify-between mt-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-foreground/40 font-mono">
						{task.slug}
					</span>
					{subtaskProgress && subtaskProgress.total > 0 && (
						<SubtaskRing
							total={subtaskProgress.total}
							done={subtaskProgress.done}
						/>
					)}
				</div>
				{dueStr && (
					<span
						className={cn(
							"text-[10px]",
							overdue ? "text-red-400" : "text-foreground/40",
						)}
					>
						{dueStr}
					</span>
				)}
			</div>
		</div>
	);
}
