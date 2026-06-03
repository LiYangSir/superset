import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { LABEL_COLORS } from "../../constants";
import { LabelChip } from "../LabelChip";

interface LabelEditorProps {
	taskId: string;
	currentLabels: string[];
}

export function LabelEditor({ taskId, currentLabels }: LabelEditorProps) {
	const [showCreate, setShowCreate] = useState(false);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState<string>(LABEL_COLORS[0]);

	const { data: allLabels = [] } = electronTrpc.tasks.labels.list.useQuery({
		organizationId: "local",
	});

	const utils = electronTrpc.useUtils();

	const updateTask = electronTrpc.tasks.update.useMutation({
		onSuccess: () => {
			utils.tasks.get.invalidate({ id: taskId });
			utils.tasks.list.invalidate();
		},
	});

	const createLabel = electronTrpc.tasks.labels.create.useMutation({
		onSuccess: (newLabel) => {
			utils.tasks.labels.list.invalidate();
			updateTask.mutate({
				id: taskId,
				patch: { labels: [...currentLabels, newLabel.id] },
			});
			setShowCreate(false);
			setNewLabelName("");
		},
	});

	const handleAddLabel = (labelId: string) => {
		if (!currentLabels.includes(labelId)) {
			updateTask.mutate({
				id: taskId,
				patch: { labels: [...currentLabels, labelId] },
			});
		}
	};

	const handleRemoveLabel = (labelId: string) => {
		updateTask.mutate({
			id: taskId,
			patch: { labels: currentLabels.filter((id) => id !== labelId) },
		});
	};

	const assignedLabels = currentLabels
		.map((id) => allLabels.find((l) => l.id === id))
		.filter(Boolean);

	const unassignedLabels = allLabels.filter(
		(l) => !currentLabels.includes(l.id),
	);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-foreground/60">Labels</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-5">
							<LuPlus className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						{unassignedLabels.map((label) => (
							<DropdownMenuItem
								key={label.id}
								onClick={() => handleAddLabel(label.id)}
								className="gap-2"
							>
								<span
									className="size-3 rounded-sm shrink-0"
									style={{ backgroundColor: label.color }}
								/>
								<span className="text-xs">{label.name}</span>
							</DropdownMenuItem>
						))}
						{unassignedLabels.length > 0 && <DropdownMenuSeparator />}
						<DropdownMenuItem onClick={() => setShowCreate(true)}>
							<LuPlus className="size-3 mr-2" />
							<span className="text-xs">New label...</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Assigned labels */}
			{assignedLabels.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{assignedLabels.map(
						(label) =>
							label && (
								<LabelChip
									key={label.id}
									name={label.name}
									color={label.color}
									onRemove={() => handleRemoveLabel(label.id)}
								/>
							),
					)}
				</div>
			)}

			{/* Create new label inline */}
			{showCreate && (
				<div className="border border-border rounded-md p-2 space-y-2">
					<Input
						value={newLabelName}
						onChange={(e) => setNewLabelName(e.target.value)}
						placeholder="Label name"
						className="h-7 text-xs"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter" && newLabelName.trim()) {
								createLabel.mutate({
									name: newLabelName.trim(),
									color: newLabelColor,
									organizationId: "local",
								});
							}
							if (e.key === "Escape") setShowCreate(false);
						}}
					/>
					<div className="flex items-center gap-1.5">
						{LABEL_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setNewLabelColor(c)}
								className="size-5 rounded-full transition-all"
								style={{
									backgroundColor: c,
									boxShadow:
										newLabelColor === c
											? `0 0 0 2px var(--card), 0 0 0 3.5px ${c}`
											: "none",
								}}
							/>
						))}
					</div>
					<div className="flex items-center gap-1.5 justify-end">
						<Button
							variant="ghost"
							size="sm"
							className="h-6 text-xs"
							onClick={() => setShowCreate(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							className="h-6 text-xs"
							disabled={!newLabelName.trim()}
							onClick={() => {
								if (newLabelName.trim()) {
									createLabel.mutate({
										name: newLabelName.trim(),
										color: newLabelColor,
										organizationId: "local",
									});
								}
							}}
						>
							Create
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
