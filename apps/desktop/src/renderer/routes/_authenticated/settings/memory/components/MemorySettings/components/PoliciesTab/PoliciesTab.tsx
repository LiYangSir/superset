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
	HiOutlineArrowUp,
	HiOutlinePencil,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

type PolicyStatus = "candidate" | "active" | "archived";

interface PolicyDialogState {
	open: boolean;
	mode: "create" | "edit";
	editId?: string;
	trigger: string;
	procedure: string;
	verification: string;
	boundary: string;
	experienceType: string;
	category: string;
	scope: "global" | "project";
}

const INITIAL_DIALOG: PolicyDialogState = {
	open: false,
	mode: "create",
	trigger: "",
	procedure: "",
	verification: "",
	boundary: "",
	experienceType: "preference",
	category: "",
	scope: "global",
};

const EXP_TYPE_LABELS: Record<string, string> = {
	success_pattern: "Success Pattern",
	failure_avoidance: "Failure Avoidance",
	preference: "Preference",
	workflow: "Workflow",
	style: "Style",
};

export function PoliciesTab() {
	const [statusFilter, setStatusFilter] = useState<PolicyStatus>("active");
	const [dialog, setDialog] = useState<PolicyDialogState>(INITIAL_DIALOG);

	const utils = electronTrpc.useUtils();

	const { data: policiesData } = electronTrpc.memory.policies.list.useQuery({
		status: statusFilter,
	});
	const policies = policiesData?.items ?? [];

	const createPolicy = electronTrpc.memory.policies.create.useMutation({
		onSuccess: () => {
			utils.memory.policies.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const updatePolicy = electronTrpc.memory.policies.update.useMutation({
		onSuccess: () => {
			utils.memory.policies.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const promotePolicy = electronTrpc.memory.policies.promote.useMutation({
		onSuccess: () => utils.memory.policies.list.invalidate(),
	});

	const archivePolicy = electronTrpc.memory.policies.archive.useMutation({
		onSuccess: () => utils.memory.policies.list.invalidate(),
	});

	const deletePolicy = electronTrpc.memory.policies.delete.useMutation({
		onSuccess: () => utils.memory.policies.list.invalidate(),
	});

	const openEdit = useCallback((p: (typeof policies)[0]) => {
		setDialog({
			open: true,
			mode: "edit",
			editId: p.id,
			trigger: p.trigger,
			procedure: p.procedure,
			verification: p.verification ?? "",
			boundary: p.boundary ?? "",
			experienceType: p.experienceType,
			category: p.category ?? "",
			scope: p.scope,
		});
	}, []);

	const handleSave = useCallback(() => {
		if (!dialog.trigger.trim() || !dialog.procedure.trim()) return;

		const values = {
			trigger: dialog.trigger.trim(),
			procedure: dialog.procedure.trim(),
			verification: dialog.verification.trim() || undefined,
			boundary: dialog.boundary.trim() || undefined,
			experienceType: dialog.experienceType as
				| "success_pattern"
				| "failure_avoidance"
				| "preference"
				| "workflow"
				| "style",
			category: dialog.category.trim() || undefined,
			scope: dialog.scope,
		};

		if (dialog.mode === "create") {
			createPolicy.mutate(values);
		} else if (dialog.editId) {
			updatePolicy.mutate({ id: dialog.editId, ...values });
		}
	}, [dialog, createPolicy, updatePolicy]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{(["active", "candidate", "archived"] as PolicyStatus[]).map((s) => (
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
					Add Policy
				</Button>
			</div>

			{policies.length === 0 ? (
				<div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
					No {statusFilter} policies yet.
					{statusFilter === "active" &&
						" Policies are automatically induced from agent sessions."}
				</div>
			) : (
				<div className="space-y-2">
					{policies.map((p) => (
						<div
							key={p.id}
							className="group rounded-md border border-border p-3 hover:bg-accent/30 transition-colors"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="flex-1 min-w-0 space-y-1">
									<div className="flex items-center gap-2 flex-wrap">
										{p.category && (
											<Badge
												variant="secondary"
												className="text-[10px] px-1.5 py-0"
											>
												{p.category}
											</Badge>
										)}
										<Badge
											variant="outline"
											className="text-[10px] px-1.5 py-0"
										>
											{EXP_TYPE_LABELS[p.experienceType] ?? p.experienceType}
										</Badge>
										<span className="text-[10px] text-muted-foreground tabular-nums">
											support: {p.support}
											{p.gain !== null && ` | gain: ${p.gain.toFixed(2)}`}
										</span>
									</div>
									<p className="text-sm">
										<span className="text-muted-foreground font-medium">
											WHEN
										</span>{" "}
										{p.trigger}
									</p>
									<p className="text-sm">
										<span className="text-muted-foreground font-medium">
											THEN
										</span>{" "}
										{p.procedure}
									</p>
									{p.boundary && (
										<p className="text-sm text-destructive/80">
											<span className="font-medium">NEVER</span> {p.boundary}
										</p>
									)}
								</div>
								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
									{p.status === "candidate" && (
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7"
											title="Promote to active"
											onClick={() => promotePolicy.mutate({ id: p.id })}
										>
											<HiOutlineArrowUp className="h-3.5 w-3.5" />
										</Button>
									)}
									{p.status !== "archived" && (
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7"
											title="Archive"
											onClick={() => archivePolicy.mutate({ id: p.id })}
										>
											<HiOutlineArchiveBox className="h-3.5 w-3.5" />
										</Button>
									)}
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => openEdit(p)}
									>
										<HiOutlinePencil className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-destructive hover:text-destructive"
										onClick={() => deletePolicy.mutate({ id: p.id })}
									>
										<HiOutlineTrash className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
						</div>
					))}
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
							{dialog.mode === "create" ? "Add Policy" : "Edit Policy"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="space-y-1.5">
							<Label>Trigger</Label>
							<Textarea
								placeholder="When [condition]..."
								value={dialog.trigger}
								onChange={(e) =>
									setDialog((d) => ({ ...d, trigger: e.target.value }))
								}
								rows={2}
								className="resize-none"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Procedure</Label>
							<Textarea
								placeholder="Do [action]..."
								value={dialog.procedure}
								onChange={(e) =>
									setDialog((d) => ({ ...d, procedure: e.target.value }))
								}
								rows={2}
								className="resize-none"
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label>
									Verification{" "}
									<span className="text-muted-foreground font-normal">
										(optional)
									</span>
								</Label>
								<Textarea
									placeholder="Check [condition]..."
									value={dialog.verification}
									onChange={(e) =>
										setDialog((d) => ({
											...d,
											verification: e.target.value,
										}))
									}
									rows={1}
									className="resize-none"
								/>
							</div>
							<div className="space-y-1.5">
								<Label>
									Boundary{" "}
									<span className="text-muted-foreground font-normal">
										(optional)
									</span>
								</Label>
								<Textarea
									placeholder="Never [action]..."
									value={dialog.boundary}
									onChange={(e) =>
										setDialog((d) => ({ ...d, boundary: e.target.value }))
									}
									rows={1}
									className="resize-none"
								/>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-3">
							<div className="space-y-1.5">
								<Label>Type</Label>
								<Select
									value={dialog.experienceType}
									onValueChange={(v) =>
										setDialog((d) => ({ ...d, experienceType: v }))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(EXP_TYPE_LABELS).map(([val, label]) => (
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
								<Label>Category</Label>
								<input
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									placeholder="e.g., Testing"
									value={dialog.category}
									onChange={(e) =>
										setDialog((d) => ({ ...d, category: e.target.value }))
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
								!dialog.trigger.trim() ||
								!dialog.procedure.trim() ||
								createPolicy.isPending ||
								updatePolicy.isPending
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
