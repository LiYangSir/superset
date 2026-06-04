import type { SelectTaskSubtask } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "lib/trpc-react";

interface SubtaskListProps {
	taskId: string;
	subtasks: SelectTaskSubtask[];
}

export function SubtaskList({ taskId, subtasks }: SubtaskListProps) {
	const [newTitle, setNewTitle] = useState("");
	const utils = electronTrpc.useUtils();

	const invalidateSubtasks = () => {
		utils.tasks.get.invalidate({ id: taskId });
		utils.tasks.subtaskCounts.invalidate();
	};

	const createSubtask = electronTrpc.tasks.subtasks.create.useMutation({
		onSuccess: () => {
			invalidateSubtasks();
			setNewTitle("");
		},
	});

	const toggleSubtask = electronTrpc.tasks.subtasks.toggle.useMutation({
		onSuccess: invalidateSubtasks,
	});

	const deleteSubtask = electronTrpc.tasks.subtasks.delete.useMutation({
		onSuccess: invalidateSubtasks,
	});

	const doneCount = subtasks.filter((s) => s.done).length;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-foreground/60">Subtasks</span>
				{subtasks.length > 0 && (
					<span className="text-[10px] text-foreground/40">
						{doneCount}/{subtasks.length}
					</span>
				)}
			</div>

			{subtasks.length > 0 && (
				<div className="space-y-1">
					{subtasks.map((subtask) => (
						<div key={subtask.id} className="flex items-center gap-2 group">
							<Checkbox
								checked={subtask.done}
								onCheckedChange={() => toggleSubtask.mutate({ id: subtask.id })}
								className="size-3.5"
							/>
							<span
								className={`flex-1 text-xs ${subtask.done ? "line-through text-foreground/40" : "text-foreground/80"}`}
							>
								{subtask.title}
							</span>
							<button
								type="button"
								onClick={() => deleteSubtask.mutate({ id: subtask.id })}
								className="opacity-0 group-hover:opacity-100 text-foreground/40 hover:text-red-400 transition-opacity"
							>
								<LuTrash2 className="size-3" />
							</button>
						</div>
					))}
				</div>
			)}

			<div className="flex items-center gap-1.5">
				<Input
					value={newTitle}
					onChange={(e) => setNewTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && newTitle.trim()) {
							createSubtask.mutate({
								taskId,
								title: newTitle.trim(),
							});
						}
					}}
					placeholder="Add subtask..."
					className="h-7 text-xs flex-1"
				/>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={!newTitle.trim()}
					onClick={() => {
						if (newTitle.trim()) {
							createSubtask.mutate({
								taskId,
								title: newTitle.trim(),
							});
						}
					}}
				>
					<LuPlus className="size-3" />
				</Button>
			</div>
		</div>
	);
}
