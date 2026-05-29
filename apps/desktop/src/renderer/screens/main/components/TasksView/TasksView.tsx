import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTasksViewStore } from "renderer/stores/tasks/store";
import { KanbanView } from "./components/KanbanView";
import { ListView } from "./components/ListView";
import { NewTaskDialog } from "./components/NewTaskDialog";
import { TaskDetail } from "./components/TaskDetail";
import { TasksToolbar } from "./components/TasksToolbar";
import { filterTasks } from "./utils/filterTasks";

export function TasksView() {
	const navigate = useNavigate();
	const viewMode = useTasksViewStore((s) => s.viewMode);
	const selectedTaskId = useTasksViewStore((s) => s.selectedTaskId);
	const search = useTasksViewStore((s) => s.search);
	const filterPriority = useTasksViewStore((s) => s.filterPriority);
	const filterStatus = useTasksViewStore((s) => s.filterStatus);

	const { data: allTasks = [] } = electronTrpc.tasks.list.useQuery();
	const { data: labels = [] } = electronTrpc.tasks.labels.list.useQuery({
		organizationId: "local",
	});
	const { data: subtaskCounts = [] } =
		electronTrpc.tasks.subtaskCounts.useQuery();

	const filteredTasks = useMemo(
		() => filterTasks(allTasks, { search, filterPriority, filterStatus }),
		[allTasks, search, filterPriority, filterStatus],
	);

	return (
		<div className="flex-1 flex flex-col bg-card overflow-hidden">
			{/* Header with close button */}
			<div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
				<span className="text-xs font-medium text-foreground/70">
					Tasks
					<span className="text-foreground/40 ml-2">{allTasks.length}</span>
				</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/workspace" })}
					className="size-7 text-foreground/60 hover:text-foreground shrink-0"
				>
					<LuX className="size-4" />
				</Button>
			</div>

			{/* Toolbar */}
			<TasksToolbar />

			{/* Content area */}
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 overflow-hidden flex flex-col">
					{viewMode === "kanban" ? (
						<KanbanView
							tasks={filteredTasks}
							labels={labels}
							subtaskCounts={subtaskCounts}
						/>
					) : (
						<ListView tasks={filteredTasks} labels={labels} />
					)}
				</div>

				{/* Detail panel */}
				{selectedTaskId && <TaskDetail />}
			</div>

			{/* New task dialog */}
			<NewTaskDialog />
		</div>
	);
}
