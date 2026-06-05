import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import {
	LuArchive,
	LuCheck,
	LuDownload,
	LuFlame,
	LuFolderInput,
	LuFolderSearch,
	LuGitBranch,
	LuLoader,
	LuSearch,
	LuStar,
	LuTrendingUp,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSkillsViewStore } from "renderer/stores/skills/store";
import type { InstallTab as InstallTabType } from "../../constants";

type LeaderboardSort = "hot" | "trending" | "all_time";

interface MarketplaceSkill {
	id: string;
	skillId: string;
	name: string;
	source: string;
	installs: number;
}

function MarketSection() {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<LeaderboardSort>("hot");

	const { data: leaderboard, isLoading: isLoadingLeaderboard } =
		electronTrpc.skills.marketplace.fetchLeaderboard.useQuery({ sort });
	const { data: searchResults, isLoading: isSearching } =
		electronTrpc.skills.marketplace.search.useQuery(
			{ query },
			{ enabled: !!query },
		);
	const { data: installedSkills } = electronTrpc.skills.list.useQuery();
	const installMutation =
		electronTrpc.skills.installFromMarketplace.useMutation();

	const installedRefs = new Set(
		installedSkills
			?.filter((s) => s.sourceType === "skillssh")
			.map((s) => s.sourceRef) ?? [],
	);

	const skills = (query ? searchResults : leaderboard) as
		| MarketplaceSkill[]
		| undefined;

	const sortButtons: {
		id: LeaderboardSort;
		label: string;
		icon: React.ComponentType<{ className?: string }>;
	}[] = [
		{ id: "hot", label: "Hot", icon: LuFlame },
		{ id: "trending", label: "Trending", icon: LuTrendingUp },
		{ id: "all_time", label: "All Time", icon: LuStar },
	];

	return (
		<div className="space-y-3">
			<div className="relative">
				<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
				<Input
					placeholder="Search marketplace..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="pl-8 h-8 text-xs bg-background/50"
				/>
			</div>

			{!query && (
				<div className="flex gap-1.5">
					{sortButtons.map(({ id, label, icon: Icon }) => (
						<Button
							key={id}
							variant={sort === id ? "secondary" : "ghost"}
							size="sm"
							className="gap-1.5 text-xs h-7"
							onClick={() => setSort(id)}
						>
							<Icon className="size-3.5" />
							{label}
						</Button>
					))}
				</div>
			)}

			{(isLoadingLeaderboard || isSearching) && (
				<div className="flex items-center justify-center py-6">
					<LuLoader className="size-4 animate-spin text-muted-foreground" />
				</div>
			)}

			{skills && skills.length > 0 && (
				<div className="space-y-0.5">
					{skills.map((skill) => {
						const isInstalled = installedRefs.has(skill.source);
						return (
							<div
								key={skill.id}
								className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium truncate">{skill.name}</p>
									<p className="text-xs text-muted-foreground truncate">
										{skill.source}
									</p>
								</div>
								{skill.installs > 0 && (
									<span className="text-xs text-muted-foreground tabular-nums shrink-0">
										{skill.installs.toLocaleString()}
									</span>
								)}
								<Button
									size="sm"
									variant={isInstalled ? "ghost" : "outline"}
									className="h-7 px-3 text-xs gap-1.5 shrink-0"
									disabled={isInstalled || installMutation.isPending}
									onClick={() =>
										installMutation.mutate({
											skillId: skill.id,
											source: skill.source,
											name: skill.name,
										})
									}
								>
									{isInstalled ? (
										<>
											<LuCheck className="size-3.5" />
											Installed
										</>
									) : (
										<>
											<LuDownload className="size-3.5" />
											Install
										</>
									)}
								</Button>
							</div>
						);
					})}
				</div>
			)}

			{skills && skills.length === 0 && (
				<div className="text-center py-8 text-sm text-muted-foreground">
					{query ? "No skills found" : "No skills available"}
				</div>
			)}
		</div>
	);
}

function LocalSection() {
	const [folderPath, setFolderPath] = useState("");
	const [archivePath, setArchivePath] = useState("");
	const [batchPath, setBatchPath] = useState("");

	const installLocal = electronTrpc.skills.installLocal.useMutation();
	const batchImport = electronTrpc.skills.batchImportFolder.useMutation();
	const scanInstalled = electronTrpc.skills.scanInstalledSkills.useMutation();
	const utils = electronTrpc.useUtils();

	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-border/50 p-4 space-y-2">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium">Auto Detect</p>
						<p className="text-xs text-muted-foreground">
							Scan all agent directories for existing skills
						</p>
					</div>
					<Button
						size="sm"
						variant="outline"
						className="h-8 gap-1.5 text-xs shrink-0"
						disabled={scanInstalled.isPending}
						onClick={() =>
							scanInstalled.mutate(undefined, {
								onSuccess: () => utils.skills.list.invalidate(),
							})
						}
					>
						{scanInstalled.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuFolderSearch className="size-3.5" />
						)}
						Scan Installed
					</Button>
				</div>
				{scanInstalled.isSuccess && (
					<p className="text-xs text-muted-foreground">
						Found {scanInstalled.data.imported.length} new skill
						{scanInstalled.data.imported.length !== 1 ? "s" : ""} across{" "}
						{scanInstalled.data.scannedDirs} agent director
						{scanInstalled.data.scannedDirs !== 1 ? "ies" : "y"}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium flex items-center gap-2">
					<LuFolderInput className="size-3.5" />
					Import Folder
				</p>
				<div className="flex gap-2">
					<Input
						placeholder="Path to skill folder..."
						value={folderPath}
						onChange={(e) => setFolderPath(e.target.value)}
						className="h-8 text-xs flex-1 bg-background/50"
					/>
					<Button
						size="sm"
						className="h-8 gap-1.5 text-xs shrink-0"
						disabled={!folderPath || installLocal.isPending}
						onClick={() => installLocal.mutate({ path: folderPath })}
					>
						{installLocal.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuFolderInput className="size-3.5" />
						)}
						Import
					</Button>
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium flex items-center gap-2">
					<LuArchive className="size-3.5" />
					Import Archive
				</p>
				<div className="flex gap-2">
					<Input
						placeholder="Path to .zip or .skill file..."
						value={archivePath}
						onChange={(e) => setArchivePath(e.target.value)}
						className="h-8 text-xs flex-1 bg-background/50"
					/>
					<Button
						size="sm"
						className="h-8 gap-1.5 text-xs shrink-0"
						disabled={!archivePath || installLocal.isPending}
						onClick={() => installLocal.mutate({ path: archivePath })}
					>
						{installLocal.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuArchive className="size-3.5" />
						)}
						Import
					</Button>
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium flex items-center gap-2">
					<LuFolderSearch className="size-3.5" />
					Batch Import
				</p>
				<div className="flex gap-2">
					<Input
						placeholder="Folder to scan for skills..."
						value={batchPath}
						onChange={(e) => setBatchPath(e.target.value)}
						className="h-8 text-xs flex-1 bg-background/50"
					/>
					<Button
						size="sm"
						className="h-8 gap-1.5 text-xs shrink-0"
						disabled={!batchPath || batchImport.isPending}
						onClick={() => batchImport.mutate({ path: batchPath })}
					>
						{batchImport.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuFolderSearch className="size-3.5" />
						)}
						Scan
					</Button>
				</div>
			</div>
		</div>
	);
}

function GitSection() {
	const [url, setUrl] = useState("");
	const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

	const previewMutation = electronTrpc.skills.previewGitInstall.useMutation();
	const confirmMutation = electronTrpc.skills.confirmGitInstall.useMutation({
		onSuccess: () => {
			setUrl("");
			setSelectedSkills([]);
			previewMutation.reset();
		},
	});

	const previewSkills = previewMutation.data?.skills ?? [];

	const toggleSkill = (id: string) => {
		setSelectedSkills((prev) =>
			prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
		);
	};

	const handleCancel = () => {
		setUrl("");
		setSelectedSkills([]);
		previewMutation.reset();
	};

	return (
		<div className="space-y-3">
			<p className="text-sm font-medium flex items-center gap-2">
				<LuGitBranch className="size-3.5" />
				Install from Git
			</p>
			<div className="flex gap-2">
				<Input
					placeholder="https://github.com/user/repo.git"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					className="h-8 text-xs flex-1 bg-background/50"
					disabled={previewMutation.isSuccess}
				/>
				{!previewMutation.isSuccess && (
					<Button
						size="sm"
						className="h-8 gap-1.5 text-xs shrink-0"
						disabled={!url || previewMutation.isPending}
						onClick={() => previewMutation.mutate({ url })}
					>
						{previewMutation.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							<LuSearch className="size-3.5" />
						)}
						Preview
					</Button>
				)}
			</div>

			{previewMutation.isSuccess && previewSkills.length > 0 && (
				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">
						{previewSkills.length} skill
						{previewSkills.length !== 1 ? "s" : ""} found
					</p>
					<div className="space-y-0.5 max-h-48 overflow-y-auto">
						{previewSkills.map((skill) => (
							<button
								type="button"
								key={skill.relativePath}
								className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-accent/40 cursor-pointer text-sm w-full text-left"
								onClick={() => toggleSkill(skill.relativePath)}
							>
								<Checkbox
									checked={selectedSkills.includes(skill.relativePath)}
									onCheckedChange={() => toggleSkill(skill.relativePath)}
								/>
								<span className="truncate">{skill.name}</span>
							</button>
						))}
					</div>
					<div className="flex gap-2">
						<Button
							size="sm"
							className="h-7 gap-1.5 text-xs flex-1"
							disabled={
								selectedSkills.length === 0 || confirmMutation.isPending
							}
							onClick={() =>
								confirmMutation.mutate({
									tempDir: previewMutation.data?.tempDir,
									selections: previewSkills
										.filter((s) => selectedSkills.includes(s.relativePath))
										.map((s) => ({
											name: s.name,
											relativePath: s.relativePath,
										})),
								})
							}
						>
							{confirmMutation.isPending ? (
								<LuLoader className="size-3.5 animate-spin" />
							) : (
								<LuDownload className="size-3.5" />
							)}
							Install ({selectedSkills.length})
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="h-7 gap-1.5 text-xs"
							onClick={handleCancel}
						>
							<LuX className="size-3.5" />
							Cancel
						</Button>
					</div>
				</div>
			)}

			{previewMutation.isSuccess && previewSkills.length === 0 && (
				<div className="text-center py-8 text-sm text-muted-foreground">
					No skills found in this repository
				</div>
			)}

			{previewMutation.isError && (
				<p className="text-sm text-destructive">
					{previewMutation.error.message}
				</p>
			)}
		</div>
	);
}

export function InstallTab() {
	const { installTab, setInstallTab } = useSkillsViewStore();

	const tabs: { id: InstallTabType; label: string }[] = [
		{ id: "market", label: "Market" },
		{ id: "local", label: "Local" },
		{ id: "git", label: "Git" },
	];

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
				<div className="flex items-center gap-0.5 bg-background/50 rounded-md p-0.5">
					{tabs.map(({ id, label }) => (
						<button
							key={id}
							type="button"
							onClick={() => setInstallTab(id)}
							className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
								installTab === id
									? "bg-accent text-foreground"
									: "text-foreground/60 hover:text-foreground"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="flex-1 overflow-auto p-4">
				{installTab === "market" && <MarketSection />}
				{installTab === "local" && <LocalSection />}
				{installTab === "git" && <GitSection />}
			</div>
		</div>
	);
}
