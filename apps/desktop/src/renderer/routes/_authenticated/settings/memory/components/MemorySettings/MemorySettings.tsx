import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Separator } from "@superset/ui/separator";
import { Textarea } from "@superset/ui/textarea";
import { useCallback, useState } from "react";
import {
	HiOutlinePencil,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface MemoryEntry {
	id: string;
	content: string;
	scope: "global" | "project";
	projectId: string | null;
	category: string | null;
	createdAt: number;
	updatedAt: number;
}

interface MemoryDialogState {
	open: boolean;
	mode: "create" | "edit";
	editId?: string;
	content: string;
	category: string;
	scope: "global" | "project";
}

const INITIAL_DIALOG: MemoryDialogState = {
	open: false,
	mode: "create",
	content: "",
	category: "",
	scope: "global",
};

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function MemorySettings() {
	const [dialog, setDialog] = useState<MemoryDialogState>(INITIAL_DIALOG);

	const utils = electronTrpc.useUtils();

	const { data: globalMemories = [] } = electronTrpc.memory.list.useQuery({
		scope: "global",
	});

	const { data: projects = [] } = electronTrpc.projects.getRecents.useQuery();

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);

	const { data: projectMemories = [] } = electronTrpc.memory.list.useQuery(
		{ scope: "project", projectId: selectedProjectId ?? undefined },
		{ enabled: !!selectedProjectId },
	);

	const createMemory = electronTrpc.memory.create.useMutation({
		onSuccess: () => {
			utils.memory.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const updateMemory = electronTrpc.memory.update.useMutation({
		onSuccess: () => {
			utils.memory.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const deleteMemory = electronTrpc.memory.delete.useMutation({
		onSuccess: () => {
			utils.memory.list.invalidate();
		},
	});

	const openCreateDialog = useCallback((scope: "global" | "project") => {
		setDialog({
			open: true,
			mode: "create",
			content: "",
			category: "",
			scope,
		});
	}, []);

	const openEditDialog = useCallback((memory: MemoryEntry) => {
		setDialog({
			open: true,
			mode: "edit",
			editId: memory.id,
			content: memory.content,
			category: memory.category ?? "",
			scope: memory.scope,
		});
	}, []);

	const handleSave = useCallback(() => {
		if (!dialog.content.trim()) return;

		if (dialog.mode === "create") {
			createMemory.mutate({
				content: dialog.content.trim(),
				scope: dialog.scope,
				projectId:
					dialog.scope === "project"
						? (selectedProjectId ?? undefined)
						: undefined,
				category: dialog.category.trim() || undefined,
			});
		} else if (dialog.editId) {
			updateMemory.mutate({
				id: dialog.editId,
				content: dialog.content.trim(),
				category: dialog.category.trim() || undefined,
			});
		}
	}, [dialog, createMemory, updateMemory, selectedProjectId]);

	const handleDelete = useCallback(
		(id: string) => {
			deleteMemory.mutate({ id });
		},
		[deleteMemory],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Memory</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Store coding habits, requirements, and preferences that are
					automatically included in agent sessions.
				</p>
			</div>

			{/* Global Memories */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-medium">Global Memory</h3>
						<p className="text-xs text-muted-foreground">
							Applied to all agent sessions across all projects
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => openCreateDialog("global")}
					>
						<HiOutlinePlus className="h-3.5 w-3.5 mr-1.5" />
						Add
					</Button>
				</div>

				{globalMemories.length === 0 ? (
					<div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
						No global memories yet. Add coding habits or preferences that apply
						to all projects.
					</div>
				) : (
					<div className="space-y-2">
						{globalMemories.map((memory) => (
							<MemoryCard
								key={memory.id}
								memory={memory as MemoryEntry}
								onEdit={openEditDialog}
								onDelete={handleDelete}
							/>
						))}
					</div>
				)}
			</div>

			<Separator className="my-8" />

			{/* Project Memories */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-medium">Project Memory</h3>
						<p className="text-xs text-muted-foreground">
							Specific to a selected project
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => openCreateDialog("project")}
						disabled={!selectedProjectId}
					>
						<HiOutlinePlus className="h-3.5 w-3.5 mr-1.5" />
						Add
					</Button>
				</div>

				{projects.length > 0 && (
					<Select
						value={selectedProjectId ?? ""}
						onValueChange={(val) => setSelectedProjectId(val || null)}
					>
						<SelectTrigger className="w-[280px]">
							<SelectValue placeholder="Select a project..." />
						</SelectTrigger>
						<SelectContent>
							{projects.map((project) => (
								<SelectItem key={project.id} value={project.id}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				{!selectedProjectId ? (
					<div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
						Select a project to view and manage its memories.
					</div>
				) : projectMemories.length === 0 ? (
					<div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
						No memories for this project yet.
					</div>
				) : (
					<div className="space-y-2">
						{projectMemories.map((memory) => (
							<MemoryCard
								key={memory.id}
								memory={memory as MemoryEntry}
								onEdit={openEditDialog}
								onDelete={handleDelete}
							/>
						))}
					</div>
				)}
			</div>

			{/* Create/Edit Dialog */}
			<Dialog
				open={dialog.open}
				onOpenChange={(open) => {
					if (!open) setDialog(INITIAL_DIALOG);
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{dialog.mode === "create" ? "Add Memory" : "Edit Memory"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label htmlFor="memory-category">
								Category{" "}
								<span className="text-muted-foreground font-normal">
									(optional)
								</span>
							</Label>
							<input
								id="memory-category"
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder="e.g., coding-style, requirements, preferences"
								value={dialog.category}
								onChange={(e) =>
									setDialog((d) => ({ ...d, category: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="memory-content">Content</Label>
							<Textarea
								id="memory-content"
								placeholder="Describe a coding habit, preference, or requirement..."
								value={dialog.content}
								onChange={(e) =>
									setDialog((d) => ({ ...d, content: e.target.value }))
								}
								rows={5}
								className="resize-none"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(INITIAL_DIALOG)}>
							Cancel
						</Button>
						<Button
							onClick={handleSave}
							disabled={
								!dialog.content.trim() ||
								createMemory.isPending ||
								updateMemory.isPending
							}
						>
							{dialog.mode === "create" ? "Add" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function MemoryCard({
	memory,
	onEdit,
	onDelete,
}: {
	memory: MemoryEntry;
	onEdit: (memory: MemoryEntry) => void;
	onDelete: (id: string) => void;
}) {
	return (
		<div className="group flex items-start gap-3 rounded-md border border-border p-3 hover:bg-accent/30 transition-colors">
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					{memory.category && (
						<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
							{memory.category}
						</Badge>
					)}
					<span className="text-[10px] text-muted-foreground">
						{formatDate(memory.updatedAt)}
					</span>
				</div>
				<p className="text-sm whitespace-pre-wrap break-words">
					{memory.content}
				</p>
			</div>
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={() => onEdit(memory)}
				>
					<HiOutlinePencil className="h-3.5 w-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-destructive hover:text-destructive"
					onClick={() => onDelete(memory.id)}
				>
					<HiOutlineTrash className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}
