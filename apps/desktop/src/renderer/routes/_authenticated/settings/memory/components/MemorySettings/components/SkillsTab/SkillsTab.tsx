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
import { Progress } from "@superset/ui/progress";
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

interface SkillDialogState {
	open: boolean;
	mode: "create" | "edit";
	editId?: string;
	name: string;
	invocationGuide: string;
	scope: "global" | "project";
}

const INITIAL_DIALOG: SkillDialogState = {
	open: false,
	mode: "create",
	name: "",
	invocationGuide: "",
	scope: "global",
};

export function SkillsTab() {
	const [statusFilter, setStatusFilter] = useState<
		"active" | "candidate" | "archived"
	>("active");
	const [dialog, setDialog] = useState<SkillDialogState>(INITIAL_DIALOG);

	const utils = electronTrpc.useUtils();

	const { data: skillsData } =
		electronTrpc.memory.cognitiveSkills.list.useQuery({
			status: statusFilter,
		});
	const skills = skillsData?.items ?? [];

	const createSkill = electronTrpc.memory.cognitiveSkills.create.useMutation({
		onSuccess: () => {
			utils.memory.cognitiveSkills.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const updateSkill = electronTrpc.memory.cognitiveSkills.update.useMutation({
		onSuccess: () => {
			utils.memory.cognitiveSkills.list.invalidate();
			setDialog(INITIAL_DIALOG);
		},
	});

	const promoteSkill = electronTrpc.memory.cognitiveSkills.promote.useMutation({
		onSuccess: () => utils.memory.cognitiveSkills.list.invalidate(),
	});

	const archiveSkill = electronTrpc.memory.cognitiveSkills.archive.useMutation({
		onSuccess: () => utils.memory.cognitiveSkills.list.invalidate(),
	});

	const deleteSkill = electronTrpc.memory.cognitiveSkills.delete.useMutation({
		onSuccess: () => utils.memory.cognitiveSkills.list.invalidate(),
	});

	const openEdit = useCallback((s: (typeof skills)[0]) => {
		setDialog({
			open: true,
			mode: "edit",
			editId: s.id,
			name: s.name,
			invocationGuide: s.invocationGuide,
			scope: s.scope,
		});
	}, []);

	const handleSave = useCallback(() => {
		if (!dialog.name.trim() || !dialog.invocationGuide.trim()) return;

		const values = {
			name: dialog.name.trim(),
			invocationGuide: dialog.invocationGuide.trim(),
			scope: dialog.scope,
		};

		if (dialog.mode === "create") {
			createSkill.mutate(values);
		} else if (dialog.editId) {
			updateSkill.mutate({ id: dialog.editId, ...values });
		}
	}, [dialog, createSkill, updateSkill]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{(["active", "candidate", "archived"] as const).map((s) => (
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
					Add Skill
				</Button>
			</div>

			{skills.length === 0 ? (
				<div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
					No {statusFilter} skills yet. Skills crystallize automatically from
					well-validated policies.
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					{skills.map((s) => (
						<div
							key={s.id}
							className="group rounded-md border border-border p-4 hover:bg-accent/30 transition-colors"
						>
							<div className="flex items-start justify-between mb-2">
								<div className="flex items-center gap-2">
									<h4 className="text-sm font-medium">{s.name}</h4>
									<Badge variant="outline" className="text-[10px] px-1.5 py-0">
										{s.scope}
									</Badge>
								</div>
								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									{s.status === "candidate" && (
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											title="Promote to active"
											onClick={() => promoteSkill.mutate({ id: s.id })}
										>
											<HiOutlineArrowUp className="h-3 w-3" />
										</Button>
									)}
									{s.status !== "archived" && (
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											title="Archive"
											onClick={() => archiveSkill.mutate({ id: s.id })}
										>
											<HiOutlineArchiveBox className="h-3 w-3" />
										</Button>
									)}
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6"
										onClick={() => openEdit(s)}
									>
										<HiOutlinePencil className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 text-destructive hover:text-destructive"
										onClick={() => deleteSkill.mutate({ id: s.id })}
									>
										<HiOutlineTrash className="h-3 w-3" />
									</Button>
								</div>
							</div>

							<p className="text-xs text-muted-foreground mb-3">
								{s.invocationGuide}
							</p>

							{s.procedureJson && (
								<div className="mb-3 space-y-1">
									{(
										s.procedureJson as Array<{
											step: number;
											action: string;
											detail: string;
										}>
									).map((step) => (
										<div key={step.step} className="flex gap-2 text-xs">
											<span className="text-muted-foreground shrink-0">
												{step.step}.
											</span>
											<span>
												<span className="font-medium">{step.action}</span> —{" "}
												{step.detail}
											</span>
										</div>
									))}
								</div>
							)}

							<div className="flex items-center gap-3 text-[10px] text-muted-foreground">
								<div className="flex items-center gap-1.5 flex-1">
									<span>eta: {(s.eta * 100).toFixed(0)}%</span>
									<Progress value={s.eta * 100} className="h-1 flex-1" />
								</div>
								<span>
									{s.trialsPassed}/{s.trialsAttempted} trials
								</span>
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
							{dialog.mode === "create" ? "Add Skill" : "Edit Skill"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="space-y-1.5">
							<Label>Name</Label>
							<input
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder="e.g., Debug React Rendering"
								value={dialog.name}
								onChange={(e) =>
									setDialog((d) => ({ ...d, name: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Invocation Guide</Label>
							<Textarea
								placeholder="When to use this skill..."
								value={dialog.invocationGuide}
								onChange={(e) =>
									setDialog((d) => ({
										...d,
										invocationGuide: e.target.value,
									}))
								}
								rows={3}
								className="resize-none"
							/>
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
								<SelectTrigger className="w-[140px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="global">Global</SelectItem>
									<SelectItem value="project">Project</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(INITIAL_DIALOG)}>
							Cancel
						</Button>
						<Button
							onClick={handleSave}
							disabled={
								!dialog.name.trim() ||
								!dialog.invocationGuide.trim() ||
								createSkill.isPending ||
								updateSkill.isPending
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
