import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import {
	LuFilter,
	LuKanban,
	LuList,
	LuPlus,
	LuSearch,
	LuX,
} from "react-icons/lu";
import { useTasksViewStore } from "renderer/stores/tasks/store";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../constants";
import { PriorityBadge } from "../PriorityBadge";
import { StatusBadge } from "../StatusBadge";

export function TasksToolbar() {
	const viewMode = useTasksViewStore((s) => s.viewMode);
	const setViewMode = useTasksViewStore((s) => s.setViewMode);
	const search = useTasksViewStore((s) => s.search);
	const setSearch = useTasksViewStore((s) => s.setSearch);
	const filterPriority = useTasksViewStore((s) => s.filterPriority);
	const setFilterPriority = useTasksViewStore((s) => s.setFilterPriority);
	const filterStatus = useTasksViewStore((s) => s.filterStatus);
	const setFilterStatus = useTasksViewStore((s) => s.setFilterStatus);
	const setShowNewTaskDialog = useTasksViewStore((s) => s.setShowNewTaskDialog);
	const clearFilters = useTasksViewStore((s) => s.clearFilters);

	const hasFilters = !!filterPriority || !!filterStatus;

	return (
		<div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
			{/* View toggle */}
			<div className="flex items-center gap-0.5 bg-background/50 rounded-md p-0.5">
				<button
					type="button"
					onClick={() => setViewMode("kanban")}
					className={cn(
						"p-1.5 rounded-md transition-colors",
						viewMode === "kanban"
							? "bg-accent text-foreground"
							: "text-foreground/60 hover:text-foreground",
					)}
				>
					<LuKanban className="size-3.5" />
				</button>
				<button
					type="button"
					onClick={() => setViewMode("list")}
					className={cn(
						"p-1.5 rounded-md transition-colors",
						viewMode === "list"
							? "bg-accent text-foreground"
							: "text-foreground/60 hover:text-foreground",
					)}
				>
					<LuList className="size-3.5" />
				</button>
			</div>

			{/* Status filter */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={cn("h-7 gap-1 text-xs", filterStatus && "bg-accent/50")}
					>
						{filterStatus ? (
							<StatusBadge statusId={filterStatus} size={12} showLabel />
						) : (
							<>
								<LuFilter className="size-3" />
								Status
							</>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onClick={() => setFilterStatus(null)}>
						All Statuses
					</DropdownMenuItem>
					{TASK_STATUSES.map((s) => (
						<DropdownMenuItem
							key={s.id}
							onClick={() => setFilterStatus(s.id)}
							className="gap-2"
						>
							<StatusBadge statusId={s.id} size={12} />
							{s.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Priority filter */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"h-7 gap-1 text-xs",
							filterPriority && "bg-accent/50",
						)}
					>
						{filterPriority ? (
							<PriorityBadge priorityId={filterPriority} size={12} showLabel />
						) : (
							<>
								<LuFilter className="size-3" />
								Priority
							</>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onClick={() => setFilterPriority(null)}>
						All Priorities
					</DropdownMenuItem>
					{TASK_PRIORITIES.map((p) => (
						<DropdownMenuItem
							key={p.id}
							onClick={() => setFilterPriority(p.id)}
							className="gap-2"
						>
							<PriorityBadge priorityId={p.id} size={12} />
							{p.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{hasFilters && (
				<Button
					variant="ghost"
					size="sm"
					onClick={clearFilters}
					className="h-7 text-xs gap-1 text-foreground/60"
				>
					<LuX className="size-3" />
					Clear
				</Button>
			)}

			{/* Search */}
			<div className="relative flex-1 max-w-xs ml-auto">
				<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
				<Input
					type="text"
					placeholder="Search tasks..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-8 h-7 text-xs bg-background/50"
				/>
			</div>

			{/* New task button */}
			<Button
				size="sm"
				className="h-7 gap-1 text-xs"
				onClick={() => setShowNewTaskDialog(true)}
			>
				<LuPlus className="size-3" />
				New Task
			</Button>
		</div>
	);
}
