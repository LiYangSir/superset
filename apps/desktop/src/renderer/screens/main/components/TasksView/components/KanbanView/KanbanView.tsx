import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { useCallback, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTasksViewStore } from "renderer/stores/tasks/store";
import { TASK_STATUSES } from "../../constants";
import { KanbanColumn } from "./KanbanColumn";

export interface SubtaskCount {
	taskId: string;
	total: number;
	done: number;
}

interface KanbanViewProps {
	tasks: SelectTask[];
	labels: SelectTaskLabel[];
	subtaskCounts: SubtaskCount[];
}

export function KanbanView({ tasks, labels, subtaskCounts }: KanbanViewProps) {
	const setSelectedTaskId = useTasksViewStore((s) => s.setSelectedTaskId);
	const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
	const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

	const utils = electronTrpc.useUtils();
	const reorderMutation = electronTrpc.tasks.reorder.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
		},
	});

	const columns = useMemo(() => {
		const grouped = new Map<string, SelectTask[]>();
		for (const status of TASK_STATUSES) {
			grouped.set(status.id, []);
		}
		for (const task of tasks) {
			const list = grouped.get(task.status);
			if (list) {
				list.push(task);
			} else {
				grouped.get("backlog")?.push(task);
			}
		}
		return grouped;
	}, [tasks]);

	const handleDragStart = useCallback(
		(e: React.DragEvent, taskId: string) => {
			setDraggedTaskId(taskId);
			e.dataTransfer.setData("text/plain", taskId);
			e.dataTransfer.effectAllowed = "move";
		},
		[],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent, statusId: string) => {
			e.preventDefault();
			setDragOverStatus(null);
			const taskId = e.dataTransfer.getData("text/plain");
			if (!taskId) return;

			const task = tasks.find((t) => t.id === taskId);
			if (!task || task.status === statusId) {
				setDraggedTaskId(null);
				return;
			}

			const targetTasks = columns.get(statusId) ?? [];
			const position = targetTasks.length;

			reorderMutation.mutate({
				id: taskId,
				status: statusId as
					| "backlog"
					| "todo"
					| "in_progress"
					| "in_review"
					| "done"
					| "cancelled",
				position,
			});
			setDraggedTaskId(null);
		},
		[tasks, columns, reorderMutation],
	);

	return (
		<div className="flex gap-2 p-3 h-full overflow-x-auto">
			{TASK_STATUSES.map((status) => (
				<KanbanColumn
					key={status.id}
					statusId={status.id}
					statusLabel={status.label}
					tasks={columns.get(status.id) ?? []}
					labels={labels}
					subtaskCounts={subtaskCounts}
					onTaskClick={setSelectedTaskId}
					onDragStart={handleDragStart}
					onDragOver={(e) => {
						handleDragOver(e);
						setDragOverStatus(status.id);
					}}
					onDrop={handleDrop}
					isDragOver={dragOverStatus === status.id}
				/>
			))}
		</div>
	);
}
