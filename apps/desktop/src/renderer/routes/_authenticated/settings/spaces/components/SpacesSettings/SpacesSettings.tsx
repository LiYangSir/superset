import type { SelectSpace } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { LuCheck, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PROJECT_COLORS } from "shared/constants/project-colors";

const SPACE_PALETTE = PROJECT_COLORS.filter((c) => c.value.startsWith("#"));

function pickRandomColor(): string {
	return (
		SPACE_PALETTE[Math.floor(Math.random() * SPACE_PALETTE.length)]?.value ??
		"#3b82f6"
	);
}

export function SpacesSettings() {
	const utils = electronTrpc.useUtils();
	const { data: spaces = [] } = electronTrpc.spaces.list.useQuery();
	const { data: counts = {} } = electronTrpc.spaces.getProjectCounts.useQuery();

	const invalidateAll = () =>
		Promise.all([
			utils.spaces.list.invalidate(),
			utils.spaces.getProjectCounts.invalidate(),
			utils.workspaces.getAllGrouped.invalidate(),
		]);

	const createSpace = electronTrpc.spaces.create.useMutation({
		onSuccess: () => invalidateAll(),
		onError: (err) =>
			toast.error("Failed to create space", { description: err.message }),
	});
	const deleteSpace = electronTrpc.spaces.delete.useMutation({
		onSuccess: () => invalidateAll(),
		onError: (err) =>
			toast.error("Cannot delete space", { description: err.message }),
	});

	const [draftName, setDraftName] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const handleCreate = () => {
		const name = draftName.trim();
		if (!name) return;
		createSpace.mutate(
			{ name, color: pickRandomColor() },
			{
				onSettled: () => {
					setDraftName("");
					setIsCreating(false);
				},
			},
		);
	};

	return (
		<div className="max-w-2xl px-6 py-8 space-y-6">
			<div>
				<h1 className="text-lg font-semibold">Spaces</h1>
				<p className="text-sm text-muted-foreground">
					Spaces are top-level groupings shown in the sidebar. Each project
					belongs to exactly one space.
				</p>
			</div>

			<div className="space-y-2">
				{spaces.map((space) => (
					<SpaceRow
						key={space.id}
						space={space}
						projectCount={counts[space.id] ?? 0}
						onDelete={() => deleteSpace.mutate({ id: space.id })}
					/>
				))}
			</div>

			{isCreating ? (
				<div className="flex items-center gap-2">
					<Input
						autoFocus
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate();
							if (e.key === "Escape") {
								setDraftName("");
								setIsCreating(false);
							}
						}}
						placeholder="Space name"
						className="max-w-xs"
					/>
					<Button onClick={handleCreate} disabled={!draftName.trim()}>
						Create
					</Button>
					<Button
						variant="ghost"
						onClick={() => {
							setDraftName("");
							setIsCreating(false);
						}}
					>
						Cancel
					</Button>
				</div>
			) : (
				<Button variant="outline" onClick={() => setIsCreating(true)}>
					<LuPlus className="size-4 mr-1.5" />
					New Space
				</Button>
			)}
		</div>
	);
}

interface SpaceRowProps {
	space: SelectSpace;
	projectCount: number;
	onDelete: () => void;
}

function SpaceRow({ space, projectCount, onDelete }: SpaceRowProps) {
	const utils = electronTrpc.useUtils();
	const updateSpace = electronTrpc.spaces.update.useMutation({
		onSuccess: () => utils.spaces.list.invalidate(),
		onError: (err) =>
			toast.error("Failed to update space", { description: err.message }),
	});

	const [isEditing, setIsEditing] = useState(false);
	const [draftName, setDraftName] = useState(space.name);

	useEffect(() => {
		setDraftName(space.name);
	}, [space.name]);

	const commitRename = () => {
		const next = draftName.trim();
		if (next && next !== space.name) {
			updateSpace.mutate({ id: space.id, patch: { name: next } });
		}
		setIsEditing(false);
	};

	const setColor = (color: string) =>
		updateSpace.mutate({ id: space.id, patch: { color } });

	const canDelete = !space.isDefault && projectCount === 0;

	const deleteTooltip = space.isDefault
		? "The Default space cannot be deleted."
		: projectCount > 0
			? `Move ${projectCount} project${projectCount === 1 ? "" : "s"} out first.`
			: "Delete space";

	return (
		<div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/50 bg-muted/20">
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="size-5 rounded-full border border-border/50 hover:scale-110 transition-transform"
						style={{ backgroundColor: space.color }}
						aria-label="Change color"
					/>
				</PopoverTrigger>
				<PopoverContent className="w-44 p-2" align="start">
					<div className="grid grid-cols-4 gap-2">
						{SPACE_PALETTE.map((c) => (
							<button
								key={c.value}
								type="button"
								onClick={() => setColor(c.value)}
								className="size-7 rounded-full border border-border/50 hover:scale-110 transition-transform flex items-center justify-center"
								style={{ backgroundColor: c.value }}
								aria-label={c.name}
							>
								{space.color === c.value && (
									<LuCheck className="size-3.5 text-white" />
								)}
							</button>
						))}
					</div>
				</PopoverContent>
			</Popover>

			<div className="flex-1 min-w-0">
				{isEditing ? (
					<Input
						autoFocus
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onBlur={commitRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitRename();
							if (e.key === "Escape") {
								setDraftName(space.name);
								setIsEditing(false);
							}
						}}
						className="h-8 max-w-xs"
					/>
				) : (
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="flex items-center gap-2 text-sm hover:bg-accent/40 rounded px-2 py-1 -ml-2"
					>
						<span className="font-medium">{space.name}</span>
						{space.isDefault && (
							<span className="text-xs text-muted-foreground">(Default)</span>
						)}
						<LuPencil className="size-3 text-muted-foreground" />
					</button>
				)}
			</div>

			<span className="text-xs text-muted-foreground tabular-nums">
				{projectCount} project{projectCount === 1 ? "" : "s"}
			</span>

			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<span className={cn(!canDelete && "cursor-not-allowed")}>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-40"
							disabled={!canDelete}
							onClick={onDelete}
						>
							<LuTrash2 className="size-4" />
						</Button>
					</span>
				</TooltipTrigger>
				<TooltipContent>{deleteTooltip}</TooltipContent>
			</Tooltip>
		</div>
	);
}
