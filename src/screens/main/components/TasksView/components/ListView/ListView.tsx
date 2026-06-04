import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { useMemo } from "react";
import { useTasksViewStore } from "stores/tasks/store";
import { TASK_STATUSES } from "../../constants";
import { StatusBadge } from "../StatusBadge";
import { TaskRow } from "./TaskRow";

interface ListViewProps {
	tasks: SelectTask[];
	labels: SelectTaskLabel[];
}

export function ListView({ tasks, labels }: ListViewProps) {
	const selectedTaskId = useTasksViewStore((s) => s.selectedTaskId);
	const setSelectedTaskId = useTasksViewStore((s) => s.setSelectedTaskId);

	const grouped = useMemo(() => {
		const groups: { statusId: string; label: string; tasks: SelectTask[] }[] =
			[];
		for (const status of TASK_STATUSES) {
			const statusTasks = tasks.filter((t) => t.status === status.id);
			if (statusTasks.length > 0) {
				groups.push({
					statusId: status.id,
					label: status.label,
					tasks: statusTasks,
				});
			}
		}
		return groups;
	}, [tasks]);

	return (
		<div className="flex-1 overflow-y-auto">
			{grouped.map((group) => (
				<div key={group.statusId}>
					<div className="sticky top-0 bg-card/95 backdrop-blur-sm px-4 py-1.5 border-b border-border/50 flex items-center gap-2">
						<StatusBadge statusId={group.statusId} size={13} />
						<span className="text-xs font-medium text-foreground/70">
							{group.label}
						</span>
						<span className="text-xs text-foreground/40">
							{group.tasks.length}
						</span>
					</div>
					{group.tasks.map((task) => (
						<TaskRow
							key={task.id}
							task={task}
							labels={labels}
							onClick={() => setSelectedTaskId(task.id)}
							isSelected={selectedTaskId === task.id}
						/>
					))}
				</div>
			))}

			{tasks.length === 0 && (
				<div className="flex items-center justify-center h-32 text-foreground/50 text-sm">
					No tasks yet
				</div>
			)}
		</div>
	);
}
