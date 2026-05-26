import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Separator } from "@superset/ui/separator";
import { Textarea } from "@superset/ui/textarea";
import { useCallback, useEffect, useState } from "react";
import { LuCalendar, LuTrash2, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTasksViewStore } from "renderer/stores/tasks/store";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../constants";
import { PriorityBadge } from "../PriorityBadge";
import { StatusBadge } from "../StatusBadge";
import { CommentSection } from "./CommentSection";
import { LabelEditor } from "./LabelEditor";
import { SubtaskList } from "./SubtaskList";

export function TaskDetail() {
	const selectedTaskId = useTasksViewStore((s) => s.selectedTaskId);
	const setSelectedTaskId = useTasksViewStore((s) => s.setSelectedTaskId);

	const { data: taskData, isLoading, isError } = electronTrpc.tasks.get.useQuery(
		{ id: selectedTaskId ?? "" },
		{ enabled: !!selectedTaskId, retry: 1 },
	);

	const utils = electronTrpc.useUtils();
	const updateTask = electronTrpc.tasks.update.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
			if (selectedTaskId) utils.tasks.get.invalidate({ id: selectedTaskId });
		},
	});

	const deleteTask = electronTrpc.tasks.delete.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
			setSelectedTaskId(null);
		},
	});

	const [editingTitle, setEditingTitle] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	useEffect(() => {
		if (taskData) {
			setTitle(taskData.title);
			setDescription(taskData.description ?? "");
		}
	}, [taskData]);

	const handleTitleBlur = useCallback(() => {
		setEditingTitle(false);
		if (selectedTaskId && title.trim() && title !== taskData?.title) {
			updateTask.mutate({ id: selectedTaskId, patch: { title: title.trim() } });
		}
	}, [selectedTaskId, title, taskData?.title, updateTask]);

	const handleDescriptionBlur = useCallback(() => {
		if (selectedTaskId && description !== (taskData?.description ?? "")) {
			updateTask.mutate({
				id: selectedTaskId,
				patch: { description: description || null },
			});
		}
	}, [selectedTaskId, description, taskData?.description, updateTask]);

	if (!selectedTaskId) return null;

	if (isLoading) {
		return (
			<div className="w-[400px] border-l border-border bg-card flex items-center justify-center h-full shrink-0">
				<span className="text-xs text-foreground/40">Loading...</span>
			</div>
		);
	}

	if (isError || !taskData) {
		return (
			<div className="w-[400px] border-l border-border bg-card flex flex-col items-center justify-center h-full shrink-0 gap-2">
				<span className="text-xs text-foreground/40">Failed to load task</span>
				<Button variant="ghost" size="sm" onClick={() => setSelectedTaskId(null)}>
					Close
				</Button>
			</div>
		);
	}

	return (
		<div className="w-[400px] border-l border-border bg-card flex flex-col h-full shrink-0 overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
				<span className="text-[10px] text-foreground/40 font-mono">
					{taskData.slug}
				</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={() => deleteTask.mutate({ id: selectedTaskId })}
					>
						<LuTrash2 className="size-3.5 text-foreground/50" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={() => setSelectedTaskId(null)}
					>
						<LuX className="size-3.5 text-foreground/50" />
					</Button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
				{/* Title */}
				{editingTitle ? (
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={handleTitleBlur}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleTitleBlur();
						}}
						autoFocus
						className="text-sm font-medium"
					/>
				) : (
					<h3
						className="text-sm font-medium text-foreground cursor-text hover:bg-accent/30 rounded px-1 py-0.5 -mx-1"
						onClick={() => setEditingTitle(true)}
					>
						{taskData.title}
					</h3>
				)}

				{/* Properties */}
				<div className="grid grid-cols-[80px_1fr] gap-y-2 gap-x-3 items-center">
					<span className="text-xs text-foreground/50">Status</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 justify-start"
							>
								<StatusBadge statusId={taskData.status} size={13} showLabel />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							{TASK_STATUSES.map((s) => (
								<DropdownMenuItem
									key={s.id}
									onClick={() =>
										updateTask.mutate({
											id: selectedTaskId,
											patch: { status: s.id as "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled" },
										})
									}
									className="gap-2"
								>
									<StatusBadge statusId={s.id} size={13} />
									{s.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<span className="text-xs text-foreground/50">Priority</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 justify-start"
							>
								<PriorityBadge
									priorityId={taskData.priority}
									size={13}
									showLabel
								/>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							{TASK_PRIORITIES.map((p) => (
								<DropdownMenuItem
									key={p.id}
									onClick={() =>
										updateTask.mutate({
											id: selectedTaskId,
											patch: { priority: p.id as "urgent" | "high" | "medium" | "low" | "none" },
										})
									}
									className="gap-2"
								>
									<PriorityBadge priorityId={p.id} size={13} />
									{p.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<span className="text-xs text-foreground/50">Due date</span>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 justify-start text-xs font-normal"
							>
								<LuCalendar className="size-3 text-foreground/50" />
								{taskData.due_date
									? new Date(taskData.due_date).toLocaleDateString(
											"en-US",
											{ month: "short", day: "numeric", year: "numeric" },
										)
									: "Set due date"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="single"
								selected={
									taskData.due_date
										? new Date(taskData.due_date)
										: undefined
								}
								onSelect={(date) =>
									updateTask.mutate({
										id: selectedTaskId,
										patch: {
											due_date: date
												? date.toISOString().split("T")[0]
												: null,
										},
									})
								}
							/>
						</PopoverContent>
					</Popover>
				</div>

				{/* Labels */}
				<LabelEditor
					taskId={selectedTaskId}
					currentLabels={taskData.labels ?? []}
				/>

				<Separator />

				{/* Description */}
				<div className="space-y-1.5">
					<span className="text-xs font-medium text-foreground/60">
						Description
					</span>
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						onBlur={handleDescriptionBlur}
						placeholder="Add a description..."
						className="min-h-[80px] text-xs resize-none"
					/>
				</div>

				<Separator />

				{/* Subtasks */}
				<SubtaskList taskId={selectedTaskId} subtasks={taskData.subtasks} />

				<Separator />

				{/* Comments */}
				<CommentSection
					taskId={selectedTaskId}
					comments={taskData.comments}
				/>
			</div>
		</div>
	);
}
