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
import { Textarea } from "@superset/ui/textarea";
import { useCallback, useState } from "react";
import {
	HiOutlineArchiveBox,
	HiOutlinePencil,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

const MODEL_TYPE_LABELS: Record<string, string> = {
	environment: "Environment",
	inference: "Inference",
	constraint: "Constraint",
};

const MODEL_TYPE_COLORS: Record<string, string> = {
	environment: "default",
	inference: "secondary",
	constraint: "destructive",
};

interface WorldModelDialogState {
	open: boolean;
	mode: "create" | "edit";
	editId?: string;
	modelType: string;
	content: string;
	confidence: number;
	scope: "global" | "project";
}

const INITIAL_DIALOG: WorldModelDialogState = {
	open: false,
	mode: "create",
	modelType: "environment",
	content: "",
	confidence: 0.5,
	scope: "global",
};

export function WorldModelsTab() {
	const [statusFilter, setStatusFilter] = useState<"active" | "archived">(
		"active",
	);
	const [dialog, setDialog] = useState<WorldModelDialogState>(INITIAL_DIALOG);

	const utils = electronTrpc.useUtils();

	const { data: worldModelsData } =
		electronTrpc.memory.worldModels.list.useQuery({ status: statusFilter });
	const worldModels = worldModelsData?.items ?? [];

	const createModel = electronTrpc.memory.worldModels.create.useMutation({
		onSuccess: () => {
			utils.memory.worldModels.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const updateModel = electronTrpc.memory.worldModels.update.useMutation({
		onSuccess: () => {
			utils.memory.worldModels.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const archiveModel = electronTrpc.memory.worldModels.archive.useMutation({
		onSuccess: () => utils.memory.worldModels.list.invalidate(),
	});

	const deleteModel = electronTrpc.memory.worldModels.delete.useMutation({
		onSuccess: () => utils.memory.worldModels.list.invalidate(),
	});

	const openEdit = useCallback((m: (typeof worldModels)[0]) => {
		setDialog({
			open: true,
			mode: "edit",
			editId: m.id,
			modelType: m.modelType,
			content: m.content,
			confidence: m.confidence,
			scope: m.scope,
		});
	}, []);

	const handleSave = useCallback(() => {
		if (!dialog.content.trim()) return;

		const values = {
			modelType: dialog.modelType as "environment" | "inference" | "constraint",
			content: dialog.content.trim(),
			confidence: dialog.confidence,
			scope: dialog.scope,
		};

		if (dialog.mode === "create") {
			createModel.mutate(values);
		} else if (dialog.editId) {
			updateModel.mutate({ id: dialog.editId, ...values });
		}
	}, [dialog, createModel, updateModel]);

	const grouped = {
		environment: worldModels.filter((m) => m.modelType === "environment"),
		inference: worldModels.filter((m) => m.modelType === "inference"),
		constraint: worldModels.filter((m) => m.modelType === "constraint"),
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{(["active", "archived"] as const).map((s) => (
						<Button
							key={s}
							variant={statusFilter === s ? "default" : "outline"}
							size="sm"
							onClick={() => setStatusFilter(s)}
						>
							{s.charAt(0).toUpperCase() + s.slice(1)}
						</Button>
					))}
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setDialog({ ...INITIAL_DIALOG, open: true })}
				>
					<HiOutlinePlus className="h-3.5 w-3.5 mr-1.5" />
					Add Model
				</Button>
			</div>

			{worldModels.length === 0 ? (
				<div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
					No {statusFilter} world models yet. World models are automatically
					abstracted from policies.
				</div>
			) : (
				<div className="space-y-6">
					{(Object.entries(grouped) as [string, typeof worldModels][]).map(
						([type, models]) =>
							models.length > 0 && (
								<div key={type} className="space-y-2">
									<h3 className="text-sm font-medium capitalize">
										{MODEL_TYPE_LABELS[type] ?? type}
									</h3>
									{models.map((m) => (
										<div
											key={m.id}
											className="group flex items-start justify-between gap-2 rounded-md border border-border p-3 hover:bg-accent/30 transition-colors"
										>
											<div className="flex-1 min-w-0 space-y-1">
												<div className="flex items-center gap-2">
													<Badge
														variant={
															(MODEL_TYPE_COLORS[m.modelType] ??
																"default") as "default"
														}
														className="text-[10px] px-1.5 py-0"
													>
														{MODEL_TYPE_LABELS[m.modelType] ?? m.modelType}
													</Badge>
													<span className="text-[10px] text-muted-foreground tabular-nums">
														confidence: {m.confidence.toFixed(2)}
													</span>
													<Badge
														variant="outline"
														className="text-[10px] px-1.5 py-0"
													>
														{m.scope}
													</Badge>
												</div>
												<p className="text-sm">{m.content}</p>
											</div>
											<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
												{m.status === "active" && (
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7"
														title="Archive"
														onClick={() => archiveModel.mutate({ id: m.id })}
													>
														<HiOutlineArchiveBox className="h-3.5 w-3.5" />
													</Button>
												)}
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() => openEdit(m)}
												>
													<HiOutlinePencil className="h-3.5 w-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-destructive hover:text-destructive"
													onClick={() => deleteModel.mutate({ id: m.id })}
												>
													<HiOutlineTrash className="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									))}
								</div>
							),
					)}
				</div>
			)}

			<Dialog
				open={dialog.open}
				onOpenChange={(open) => {
					if (!open) setDialog(INITIAL_DIALOG);
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{dialog.mode === "create"
								? "Add World Model"
								: "Edit World Model"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="space-y-1.5">
							<Label>Content</Label>
							<Textarea
								placeholder="A declarative knowledge statement..."
								value={dialog.content}
								onChange={(e) =>
									setDialog((d) => ({ ...d, content: e.target.value }))
								}
								rows={3}
								className="resize-none"
							/>
						</div>
						<div className="grid grid-cols-3 gap-3">
							<div className="space-y-1.5">
								<Label>Type</Label>
								<Select
									value={dialog.modelType}
									onValueChange={(v) =>
										setDialog((d) => ({ ...d, modelType: v }))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(MODEL_TYPE_LABELS).map(([val, label]) => (
											<SelectItem key={val} value={val}>
												{label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label>Scope</Label>
								<Select
									value={dialog.scope}
									onValueChange={(v) =>
										setDialog((d) => ({
											...d,
											scope: v as "global" | "project",
										}))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="global">Global</SelectItem>
										<SelectItem value="project">Project</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label>Confidence</Label>
								<input
									type="number"
									min="0"
									max="1"
									step="0.1"
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									value={dialog.confidence}
									onChange={(e) =>
										setDialog((d) => ({
											...d,
											confidence: Number.parseFloat(e.target.value) || 0.5,
										}))
									}
								/>
							</div>
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
								createModel.isPending ||
								updateModel.isPending
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
