import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useCallback, useState } from "react";
import { LuCalendar } from "react-icons/lu";
import { electronTrpc } from "lib/trpc-react";
import { useTasksViewStore } from "stores/tasks/store";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../constants";
import { PriorityBadge } from "../PriorityBadge";
import { StatusBadge } from "../StatusBadge";

type TaskStatus =
	| "backlog"
	| "todo"
	| "in_progress"
	| "in_review"
	| "done"
	| "cancelled";
type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

export function NewTaskDialog() {
	const showNewTaskDialog = useTasksViewStore((s) => s.showNewTaskDialog);
	const setShowNewTaskDialog = useTasksViewStore((s) => s.setShowNewTaskDialog);

	const [title, setTitle] = useState("");
	const [status, setStatus] = useState<TaskStatus>("todo");
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [dueDate, setDueDate] = useState("");

	const utils = electronTrpc.useUtils();
	const createTask = electronTrpc.tasks.create.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
			handleClose();
		},
	});

	const handleClose = useCallback(() => {
		setTitle("");
		setStatus("todo");
		setPriority("none");
		setDueDate("");
		setShowNewTaskDialog(false);
	}, [setShowNewTaskDialog]);

	const handleSubmit = useCallback(() => {
		if (!title.trim()) return;
		createTask.mutate({
			title: title.trim(),
			status,
			priority,
			due_date: dueDate || null,
			organization_id: "local",
			creator_id: "local-user",
		});
	}, [title, status, priority, dueDate, createTask]);

	return (
		<Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>New Task</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSubmit();
						}}
						placeholder="Task title..."
						autoFocus
					/>

					<div className="flex items-center gap-2 flex-wrap">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1.5">
									<StatusBadge statusId={status} size={13} />
									<span className="text-xs">
										{TASK_STATUSES.find((s) => s.id === status)?.label ??
											status}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								{TASK_STATUSES.map((s) => (
									<DropdownMenuItem
										key={s.id}
										onClick={() => setStatus(s.id as TaskStatus)}
										className="gap-2"
									>
										<StatusBadge statusId={s.id} size={13} />
										<span>{s.label}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1.5">
									<PriorityBadge priorityId={priority} size={13} />
									<span className="text-xs">
										{TASK_PRIORITIES.find((p) => p.id === priority)?.label ??
											priority}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent>
								{TASK_PRIORITIES.map((p) => (
									<DropdownMenuItem
										key={p.id}
										onClick={() => setPriority(p.id as TaskPriority)}
										className="gap-2"
									>
										<PriorityBadge priorityId={p.id} size={13} />
										<span>{p.label}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>

						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1.5">
									<LuCalendar className="size-3 text-foreground/50" />
									<span className="text-xs">
										{dueDate
											? new Date(dueDate).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})
											: "Due date"}
									</span>
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-auto p-0" align="start">
								<Calendar
									mode="single"
									selected={dueDate ? new Date(dueDate) : undefined}
									onSelect={(date) =>
										setDueDate(date ? date.toISOString().split("T")[0] : "")
									}
								/>
							</PopoverContent>
						</Popover>
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!title.trim() || createTask.isPending}
					>
						Create Task
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
