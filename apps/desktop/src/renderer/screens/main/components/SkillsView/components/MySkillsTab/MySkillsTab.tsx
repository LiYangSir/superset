import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useMemo } from "react";
import {
	LuFilter,
	LuGrid3X3,
	LuList,
	LuRefreshCw,
	LuSearch,
	LuTag,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSkillsViewStore } from "renderer/stores/skills/store";
import type { SkillsViewMode } from "../../constants";
import { SOURCE_TYPES } from "../../constants";
import { SkillCard } from "../SkillCard/SkillCard";
import { SkillDetailPanel } from "../SkillDetailPanel/SkillDetailPanel";

export function MySkillsTab() {
	const { data: skills } = electronTrpc.skills.list.useQuery();
	const { data: tools } = electronTrpc.skills.tools.getStatus.useQuery();

	const {
		viewMode,
		setViewMode,
		selectedSkillId,
		setSelectedSkillId,
		search,
		setSearch,
		filterSourceType,
		setFilterSourceType,
		filterTags,
		setFilterTags,
	} = useSkillsViewStore();

	const checkUpdatesMutation =
		electronTrpc.skills.checkAllUpdates.useMutation();

	const allTags = useMemo(() => {
		if (!skills) return [];
		const tagSet = new Set<string>();
		for (const skill of skills) {
			if (skill.tags) {
				for (const tag of skill.tags) {
					tagSet.add(tag);
				}
			}
		}
		return Array.from(tagSet).sort();
	}, [skills]);

	const filtered = useMemo(() => {
		if (!skills) return [];

		let result = [...skills];

		if (search) {
			const q = search.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description?.toLowerCase().includes(q),
			);
		}

		if (filterSourceType) {
			result = result.filter((s) => s.sourceType === filterSourceType);
		}

		if (filterTags.length > 0) {
			result = result.filter((s) =>
				filterTags.some((tag) => s.tags?.includes(tag)),
			);
		}

		result.sort((a, b) => {
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return result;
	}, [skills, search, filterSourceType, filterTags]);

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
				<div className="flex items-center gap-0.5 bg-background/50 rounded-md p-0.5">
					<button
						type="button"
						onClick={() => setViewMode("grid")}
						className={`p-1.5 rounded-md transition-colors ${
							viewMode === "grid"
								? "bg-accent text-foreground"
								: "text-foreground/60 hover:text-foreground"
						}`}
					>
						<LuGrid3X3 className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setViewMode("list")}
						className={`p-1.5 rounded-md transition-colors ${
							viewMode === "list"
								? "bg-accent text-foreground"
								: "text-foreground/60 hover:text-foreground"
						}`}
					>
						<LuList className="size-3.5" />
					</button>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={`h-7 gap-1 text-xs ${filterSourceType ? "bg-accent/50" : ""}`}
						>
							<LuFilter className="size-3" />
							{filterSourceType ?? "Source"}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuCheckboxItem
							checked={!filterSourceType}
							onCheckedChange={() => setFilterSourceType(null)}
						>
							All Sources
						</DropdownMenuCheckboxItem>
						<DropdownMenuSeparator />
						{SOURCE_TYPES.map((src) => (
							<DropdownMenuCheckboxItem
								key={src.id}
								checked={filterSourceType === src.id}
								onCheckedChange={() =>
									setFilterSourceType(
										filterSourceType === src.id ? null : src.id,
									)
								}
							>
								{src.label}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{allTags.length > 0 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className={`h-7 gap-1 text-xs ${filterTags.length > 0 ? "bg-accent/50" : ""}`}
							>
								<LuTag className="size-3" />
								Tags
								{filterTags.length > 0 && (
									<span className="ml-0.5 text-[9px] bg-primary text-primary-foreground rounded-full size-3.5 flex items-center justify-center">
										{filterTags.length}
									</span>
								)}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuLabel className="text-xs">
								Filter by Tag
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{allTags.map((tag) => (
								<DropdownMenuCheckboxItem
									key={tag}
									checked={filterTags.includes(tag)}
									onCheckedChange={(checked) => {
										if (checked) {
											setFilterTags([...filterTags, tag]);
										} else {
											setFilterTags(filterTags.filter((t) => t !== tag));
										}
									}}
								>
									{tag}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				<div className="relative flex-1 max-w-xs ml-auto">
					<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search skills..."
						className="pl-8 h-7 text-xs bg-background/50"
					/>
				</div>

				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 text-xs"
					onClick={() => checkUpdatesMutation.mutate()}
					disabled={checkUpdatesMutation.isPending}
				>
					<LuRefreshCw
						className={`size-3.5 ${checkUpdatesMutation.isPending ? "animate-spin" : ""}`}
					/>
					Check Updates
				</Button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 overflow-auto p-4">
					{filtered.length === 0 ? (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
							{skills?.length === 0
								? "No skills installed"
								: "No skills match the current filters"}
						</div>
					) : viewMode === "grid" ? (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
							{filtered.map((skill) => (
								<SkillCard
									key={skill.id}
									skill={skill}
									tools={tools}
									viewMode="grid"
									isSelected={selectedSkillId === skill.id}
									onClick={() =>
										setSelectedSkillId(
											selectedSkillId === skill.id ? null : skill.id,
										)
									}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-col">
							{filtered.map((skill) => (
								<SkillCard
									key={skill.id}
									skill={skill}
									tools={tools}
									viewMode="list"
									isSelected={selectedSkillId === skill.id}
									onClick={() =>
										setSelectedSkillId(
											selectedSkillId === skill.id ? null : skill.id,
										)
									}
								/>
							))}
						</div>
					)}
				</div>
				{selectedSkillId && <SkillDetailPanel />}
			</div>
		</div>
	);
}
