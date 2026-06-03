import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { StatusBadge } from "../StatusBadge";
import { KanbanCard } from "./KanbanCard";
import { KanbanCardContextMenu } from "./KanbanCardContextMenu";
import type { SubtaskCount } from "./KanbanView";

interface KanbanColumnProps {
	statusId: string;
	statusLabel: string;
	tasks: SelectTask[];
	labels: SelectTaskLabel[];
	subtaskCounts: SubtaskCount[];
	onTaskClick: (taskId: string) => void;
	onDragStart: (e: React.DragEvent, taskId: string) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent, statusId: string) => void;
	isDragOver: boolean;
}

export function KanbanColumn({
	statusId,
	statusLabel,
	tasks,
	labels,
	subtaskCounts,
	onTaskClick,
	onDragStart,
	onDragOver,
	onDrop,
	isDragOver,
}: KanbanColumnProps) {
	return (
		<div
			className={cn(
				"flex flex-col min-w-[260px] max-w-[320px] flex-1 rounded-lg",
				isDragOver && "bg-accent/20",
			)}
			onDragOver={onDragOver}
			onDrop={(e) => onDrop(e, statusId)}
		>
			{/* Column header */}
			<div className="flex items-center gap-2 px-2 py-2 mb-1">
				<StatusBadge statusId={statusId} size={14} />
				<span className="text-xs font-medium text-foreground/80">
					{statusLabel}
				</span>
				<span className="text-xs text-foreground/40 ml-auto">
					{tasks.length}
				</span>
			</div>

			{/* Cards */}
			<div className="flex flex-col gap-1.5 px-1 pb-2 flex-1 overflow-y-auto hide-scrollbar">
				{tasks.map((task) => (
					<KanbanCardContextMenu key={task.id} taskId={task.id}>
						<div draggable onDragStart={(e) => onDragStart(e, task.id)}>
							<KanbanCard
								task={task}
								labels={labels}
								subtaskProgress={subtaskCounts.find(
									(s) => s.taskId === task.id,
								)}
								onClick={() => onTaskClick(task.id)}
							/>
						</div>
					</KanbanCardContextMenu>
				))}

				{tasks.length === 0 && (
					<div className="flex items-center justify-center h-20 text-foreground/30 text-xs">
						No tasks
					</div>
				)}
			</div>
		</div>
	);
}
