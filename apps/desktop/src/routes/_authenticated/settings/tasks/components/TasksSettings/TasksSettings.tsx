import type { SelectTask, SelectTaskLabel } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Separator } from "@superset/ui/separator";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuArchiveRestore,
	LuCheck,
	LuCircle,
	LuCircleCheck,
	LuCircleDot,
	LuCircleMinus,
	LuClock,
	LuEye,
	LuMinus,
	LuPencil,
	LuPlus,
	LuSignalHigh,
	LuSignalLow,
	LuSignalMedium,
	LuTrash2,
	LuTriangleAlert,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

const LABEL_COLORS = [
	"#E5534B",
	"#5E6AD2",
	"#26B59A",
	"#D6A96A",
	"#A78BFA",
	"#E8704A",
	"#F59E0B",
	"#06B6D4",
] as const;

const STATUS_META: Record<
	string,
	{ label: string; color: string; icon: React.ElementType }
> = {
	backlog: { label: "Backlog", color: "#6B7280", icon: LuClock },
	todo: { label: "Todo", color: "#E2E2E9", icon: LuCircle },
	in_progress: { label: "In Progress", color: "#5E6AD2", icon: LuCircleDot },
	in_review: { label: "In Review", color: "#F59E0B", icon: LuEye },
	done: { label: "Done", color: "#26B59A", icon: LuCircleCheck },
	cancelled: { label: "Cancelled", color: "#4B4B5A", icon: LuCircleMinus },
};

const PRIORITY_META: Record<
	string,
	{ label: string; color: string; icon: React.ElementType }
> = {
	urgent: { label: "Urgent", color: "#E5534B", icon: LuTriangleAlert },
	high: { label: "High", color: "#E8704A", icon: LuSignalHigh },
	medium: { label: "Medium", color: "#D6A96A", icon: LuSignalMedium },
	low: { label: "Low", color: "#6B7280", icon: LuSignalLow },
	none: { label: "No priority", color: "#4B4B5A", icon: LuMinus },
};

export function TasksSettings() {
	return (
		<div className="p-6 max-w-2xl space-y-8">
			<div>
				<h1 className="text-lg font-semibold">Tasks</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Manage archived tasks and labels.
				</p>
			</div>

			<ArchivedTasksSection />
			<LabelsSection />
		</div>
	);
}

function ArchivedTasksSection() {
	const utils = electronTrpc.useUtils();
	const { data: archivedTasks = [] } =
		electronTrpc.tasks.listArchived.useQuery() as { data: SelectTask[] };
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

	const unarchiveTask = electronTrpc.tasks.unarchive.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
			utils.tasks.listArchived.invalidate();
		},
	});

	const deleteTask = electronTrpc.tasks.delete.useMutation({
		onSuccess: () => {
			utils.tasks.listArchived.invalidate();
			setSelectedTaskId(null);
		},
	});

	return (
		<section className="space-y-3">
			<h2 className="text-sm font-medium text-foreground/80">Archived Tasks</h2>

			{archivedTasks.length === 0 ? (
				<p className="text-xs text-muted-foreground py-4">No archived tasks.</p>
			) : (
				<div className="space-y-1">
					{archivedTasks.map((task) => (
						<button
							key={task.id}
							type="button"
							className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-card/50 group cursor-pointer hover:bg-accent/30 transition-colors w-full text-left"
							onClick={() => setSelectedTaskId(task.id)}
						>
							<StatusIcon statusId={task.status} />
							<span className="flex-1 text-sm truncate">{task.title}</span>
							<span className="text-xs text-muted-foreground">
								{task.archived_at
									? new Date(task.archived_at).toLocaleDateString()
									: ""}
							</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
								onClick={(e) => {
									e.stopPropagation();
									unarchiveTask.mutate({ id: task.id });
								}}
								title="Restore"
							>
								<LuArchiveRestore className="h-3.5 w-3.5" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-400"
								onClick={(e) => {
									e.stopPropagation();
									deleteTask.mutate({ id: task.id });
								}}
								title="Delete permanently"
							>
								<LuTrash2 className="h-3.5 w-3.5" />
							</Button>
						</button>
					))}
				</div>
			)}

			<ArchivedTaskDetailDialog
				taskId={selectedTaskId}
				onClose={() => setSelectedTaskId(null)}
				onRestore={(id) => {
					unarchiveTask.mutate({ id });
					setSelectedTaskId(null);
				}}
				onDelete={(id) => deleteTask.mutate({ id })}
			/>
		</section>
	);
}

type TaskDetail = SelectTask & {
	subtasks: Array<{
		id: string;
		taskId: string;
		title: string;
		done: boolean;
		sortOrder: number;
		createdAt: number;
	}>;
	comments: Array<{
		id: string;
		taskId: string;
		author: string;
		text: string;
		createdAt: number;
	}>;
};

function ArchivedTaskDetailDialog({
	taskId,
	onClose,
	onRestore,
	onDelete,
}: {
	taskId: string | null;
	onClose: () => void;
	onRestore: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const { data: taskData } = electronTrpc.tasks.get.useQuery(
		{ id: taskId ?? "" },
		{ enabled: !!taskId },
	) as { data: TaskDetail | undefined };

	if (!taskId) return null;

	const status = STATUS_META[taskData?.status ?? ""] ?? STATUS_META.todo;
	const priority =
		PRIORITY_META[taskData?.priority ?? ""] ?? PRIORITY_META.none;
	const StatusIcon = status.icon;
	const PriorityIcon = priority.icon;

	return (
		<Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-sm font-medium">
						{taskData?.title ?? "Loading..."}
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground font-mono">
						{taskData?.slug}
					</DialogDescription>
				</DialogHeader>

				{taskData && (
					<div className="space-y-4 mt-2">
						{/* Properties grid */}
						<div className="grid grid-cols-[80px_1fr] gap-y-2.5 gap-x-3 items-center">
							<span className="text-xs text-foreground/50">Status</span>
							<span className="inline-flex items-center gap-1.5 text-xs">
								<StatusIcon
									style={{ color: status.color, width: 14, height: 14 }}
								/>
								<span style={{ color: status.color }}>{status.label}</span>
							</span>

							<span className="text-xs text-foreground/50">Priority</span>
							<span className="inline-flex items-center gap-1.5 text-xs">
								<PriorityIcon
									style={{ color: priority.color, width: 14, height: 14 }}
								/>
								<span style={{ color: priority.color }}>{priority.label}</span>
							</span>

							{taskData.due_date && (
								<>
									<span className="text-xs text-foreground/50">Due date</span>
									<span className="text-xs text-foreground/80">
										{new Date(taskData.due_date).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
											year: "numeric",
										})}
									</span>
								</>
							)}

							<span className="text-xs text-foreground/50">Archived</span>
							<span className="text-xs text-foreground/80">
								{taskData.archived_at
									? new Date(taskData.archived_at).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
											year: "numeric",
										})
									: "—"}
							</span>
						</div>

						{/* Labels */}
						{taskData.labels && taskData.labels.length > 0 && (
							<>
								<Separator />
								<div className="space-y-1.5">
									<span className="text-xs font-medium text-foreground/60">
										Labels
									</span>
									<TaskLabels labelIds={taskData.labels} />
								</div>
							</>
						)}

						{/* Description */}
						{taskData.description && (
							<>
								<Separator />
								<div className="space-y-1.5">
									<span className="text-xs font-medium text-foreground/60">
										Description
									</span>
									<p className="text-xs text-foreground/80 whitespace-pre-wrap">
										{taskData.description}
									</p>
								</div>
							</>
						)}

						{/* Subtasks */}
						{taskData.subtasks && taskData.subtasks.length > 0 && (
							<>
								<Separator />
								<div className="space-y-1.5">
									<span className="text-xs font-medium text-foreground/60">
										Subtasks ({taskData.subtasks.filter((s) => s.done).length}/
										{taskData.subtasks.length})
									</span>
									<div className="space-y-1">
										{taskData.subtasks.map((subtask) => (
											<div
												key={subtask.id}
												className="flex items-center gap-2 text-xs"
											>
												<span
													className={cn(
														"size-3.5 rounded-sm border flex items-center justify-center shrink-0",
														subtask.done
															? "bg-primary border-primary"
															: "border-border",
													)}
												>
													{subtask.done && (
														<LuCheck className="size-2.5 text-primary-foreground" />
													)}
												</span>
												<span
													className={cn(
														subtask.done && "line-through text-foreground/40",
													)}
												>
													{subtask.title}
												</span>
											</div>
										))}
									</div>
								</div>
							</>
						)}

						{/* Comments */}
						{taskData.comments && taskData.comments.length > 0 && (
							<>
								<Separator />
								<div className="space-y-1.5">
									<span className="text-xs font-medium text-foreground/60">
										Comments ({taskData.comments.length})
									</span>
									<div className="space-y-2">
										{taskData.comments.map((comment) => (
											<div key={comment.id} className="text-xs space-y-0.5">
												<div className="flex items-center gap-2">
													<span className="font-medium text-foreground/70">
														{comment.author}
													</span>
													<span className="text-foreground/30">
														{new Date(comment.createdAt).toLocaleDateString()}
													</span>
												</div>
												<p className="text-foreground/80">{comment.text}</p>
											</div>
										))}
									</div>
								</div>
							</>
						)}

						{/* Actions */}
						<Separator />
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5"
								onClick={() => onRestore(taskId)}
							>
								<LuArchiveRestore className="size-3.5" />
								Restore
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="gap-1.5 text-red-400 hover:text-red-400"
								onClick={() => onDelete(taskId)}
							>
								<LuTrash2 className="size-3.5" />
								Delete permanently
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function TaskLabels({ labelIds }: { labelIds: string[] }) {
	const { data: allLabels = [] } = electronTrpc.tasks.labels.list.useQuery({
		organizationId: "local",
	}) as { data: SelectTaskLabel[] };

	const matched = labelIds
		.map((id) => allLabels.find((l) => l.id === id))
		.filter(Boolean) as SelectTaskLabel[];

	if (matched.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1.5">
			{matched.map((label) => (
				<span
					key={label.id}
					className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
					style={{
						backgroundColor: `${label.color}1A`,
						border: `1px solid ${label.color}30`,
						color: label.color,
					}}
				>
					{label.name}
				</span>
			))}
		</div>
	);
}

function StatusIcon({ statusId }: { statusId: string }) {
	const meta = STATUS_META[statusId];
	if (!meta) return null;
	const Icon = meta.icon;
	return (
		<Icon
			style={{ color: meta.color, width: 14, height: 14 }}
			className="shrink-0"
		/>
	);
}

function LabelsSection() {
	const utils = electronTrpc.useUtils();
	const { data: labels = [] } = electronTrpc.tasks.labels.list.useQuery({
		organizationId: "local",
	}) as { data: SelectTaskLabel[] };

	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editColor, setEditColor] = useState<string>("");

	const createLabel = electronTrpc.tasks.labels.create.useMutation({
		onSuccess: () => {
			utils.tasks.labels.list.invalidate();
			setNewName("");
		},
	});

	const updateLabel = electronTrpc.tasks.labels.update.useMutation({
		onSuccess: () => {
			utils.tasks.labels.list.invalidate();
			setEditingId(null);
		},
	});

	const deleteLabel = electronTrpc.tasks.labels.delete.useMutation({
		onSuccess: () => {
			utils.tasks.labels.list.invalidate();
		},
	});

	const startEditing = (label: { id: string; name: string; color: string }) => {
		setEditingId(label.id);
		setEditName(label.name);
		setEditColor(label.color);
	};

	const saveEdit = () => {
		if (!editingId || !editName.trim()) return;
		updateLabel.mutate({
			id: editingId,
			name: editName.trim(),
			color: editColor,
		});
	};

	return (
		<section className="space-y-3">
			<h2 className="text-sm font-medium text-foreground/80">Labels</h2>

			<div className="space-y-1">
				{labels.map((label) => (
					<div
						key={label.id}
						className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-card/50 group"
					>
						{editingId === label.id ? (
							<>
								<ColorPicker value={editColor} onChange={setEditColor} />
								<Input
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
									className="h-7 flex-1 text-sm"
									onKeyDown={(e) => {
										if (e.key === "Enter") saveEdit();
										if (e.key === "Escape") setEditingId(null);
									}}
									autoFocus
								/>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0"
									onClick={saveEdit}
								>
									<LuCheck className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0"
									onClick={() => setEditingId(null)}
								>
									<LuX className="h-3.5 w-3.5" />
								</Button>
							</>
						) : (
							<>
								<div
									className="h-3 w-3 rounded-full shrink-0"
									style={{ backgroundColor: label.color }}
								/>
								<span className="flex-1 text-sm">{label.name}</span>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
									onClick={() => startEditing(label)}
								>
									<LuPencil className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-400"
									onClick={() => deleteLabel.mutate({ id: label.id })}
								>
									<LuTrash2 className="h-3.5 w-3.5" />
								</Button>
							</>
						)}
					</div>
				))}
			</div>

			{/* Create new label */}
			<div className="flex items-center gap-2 pt-2">
				<ColorPicker value={newColor} onChange={setNewColor} />
				<Input
					placeholder="New label name..."
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					className="h-8 flex-1 text-sm"
					onKeyDown={(e) => {
						if (e.key === "Enter" && newName.trim()) {
							createLabel.mutate({
								name: newName.trim(),
								color: newColor,
								organizationId: "local",
							});
						}
					}}
				/>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 w-8 p-0"
					disabled={!newName.trim()}
					onClick={() => {
						if (newName.trim()) {
							createLabel.mutate({
								name: newName.trim(),
								color: newColor,
								organizationId: "local",
							});
						}
					}}
				>
					<LuPlus className="h-4 w-4" />
				</Button>
			</div>
		</section>
	);
}

function ColorPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (color: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div className="relative">
			<button
				type="button"
				className="h-5 w-5 rounded-full border border-border/50 cursor-pointer hover:scale-110 transition-transform"
				style={{ backgroundColor: value }}
				onClick={() => setOpen(!open)}
			/>
			{open && (
				<div className="absolute top-7 left-0 z-50 bg-popover border border-border rounded-md p-2 shadow-md grid grid-cols-4 gap-1.5">
					{LABEL_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={cn(
								"h-5 w-5 rounded-full cursor-pointer hover:scale-110 transition-transform",
								value === color &&
									"ring-2 ring-foreground ring-offset-1 ring-offset-background",
							)}
							style={{ backgroundColor: color }}
							onClick={() => {
								onChange(color);
								setOpen(false);
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}
