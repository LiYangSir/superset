import {
	AGENT_PRESET_COMMANDS,
	buildAgentPromptCommand,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_LABELS,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowUpIcon,
	ExternalLinkIcon,
	PaperclipIcon,
	PlusIcon,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe, GoIssueOpened } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderGit, LuFolderOpen, LuGitPullRequest } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import {
	useCreateWorkspace,
	useHandleOpenedWorktree,
	useOpenExternalWorktree,
} from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import {
	resolveBranchPrefix,
	sanitizeBranchNameWithMaxLength,
} from "shared/utils/branch";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import type { OpenableWorktreeAction } from "./utils/resolveOpenableWorktrees";
import { resolveOpenableWorktrees } from "./utils/resolveOpenableWorktrees";

type WorkspaceCreateAgent = StartableAgentType | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";
const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

interface ProjectOption {
	id: string;
	name: string;
	color: string;
	iconUrl: string | null;
	hideImage: boolean | null;
}

interface BranchOption {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
}

interface PromptGroupProps {
	projectId: string | null;
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void | Promise<void>;
	onNewProject: () => void;
}

function ProjectPickerPill({
	selectedProject,
	recentProjects,
	onSelectProject,
	onImportRepo,
	onNewProject,
}: {
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void | Promise<void>;
	onNewProject: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[140px]`}
				>
					{selectedProject && (
						<ProjectThumbnail
							projectName={selectedProject.name}
							projectColor={selectedProject.color}
							iconUrl={selectedProject.iconUrl}
							hideImage={selectedProject.hideImage ?? false}
							className="!size-3"
						/>
					)}
					<span className="truncate">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3 shrink-0 text-muted-foreground" />
				</PromptInputButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList>
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup>
							{recentProjects.map((project) => (
								<CommandItem
									key={project.id}
									value={project.name}
									onSelect={() => {
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<ProjectThumbnail
										projectName={project.name}
										projectColor={project.color}
										iconUrl={project.iconUrl}
										hideImage={project.hideImage ?? false}
									/>
									{project.name}
									{project.id === selectedProject?.id && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
						<CommandSeparator alwaysRender />
						<CommandGroup forceMount>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									void onImportRepo();
								}}
							>
								<LuFolderOpen className="size-4" />
								Open project
							</CommandItem>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onNewProject();
								}}
							>
								<LuFolderGit className="size-4" />
								New project
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function IconPillButton({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<PromptInputButton className={`${PILL_BUTTON_CLASS} w-[22px]`}>
					{children}
				</PromptInputButton>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

function BaseBranchPickerInline({
	effectiveBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	branchSearch,
	onBranchSearchChange,
	onSelectBaseBranch,
	worktreeBranches,
	openableWorktrees,
	activeWorkspacesByBranch,
	modKey,
	onOpenWorktree,
	onOpenActiveWorkspace,
}: {
	effectiveBaseBranch: string | null;
	defaultBranch?: string;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: BranchOption[];
	branchSearch: string;
	onBranchSearchChange: (value: string) => void;
	onSelectBaseBranch: (branchName: string) => void;
	worktreeBranches: Set<string>;
	openableWorktrees: Map<string, OpenableWorktreeAction>;
	activeWorkspacesByBranch: Map<string, string>;
	modKey: string;
	onOpenWorktree: (action: OpenableWorktreeAction) => void;
	onOpenActiveWorkspace: (workspaceId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [filterMode, setFilterMode] = useState<"all" | "worktrees">("all");

	const displayBranches = useMemo(() => {
		if (filterMode === "all") return branches;
		return branches.filter((b) => worktreeBranches.has(b.name));
	}, [branches, filterMode, worktreeBranches]);

	if (isBranchesError) {
		return (
			<span className="text-xs text-destructive">Failed to load branches</span>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) {
					onBranchSearchChange("");
					setFilterMode("all");
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={isBranchesLoading}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0 max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isBranchesLoading ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 mx-2 mt-2">
						{(["all", "worktrees"] as const).map((value) => {
							const count =
								value === "all"
									? branches.length
									: branches.filter((b) => worktreeBranches.has(b.name))
											.length;
							return (
								<button
									key={value}
									type="button"
									onClick={() => setFilterMode(value)}
									className={cn(
										"flex-1 rounded px-2 py-1 text-xs text-center transition-colors",
										filterMode === value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{value === "all" ? "All" : "Worktrees"}
									<span className="ml-1 text-foreground/40">{count}</span>
								</button>
							);
						})}
					</div>
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={onBranchSearchChange}
					/>
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{displayBranches.map((branch) => {
							const openAction = openableWorktrees.get(branch.name);
							const activeWorkspaceId = activeWorkspacesByBranch.get(
								branch.name,
							);
							const isWorktree = worktreeBranches.has(branch.name);
							const hasExistingWorkspace = !!(activeWorkspaceId || openAction);

							let icon: React.ReactNode;
							if (activeWorkspaceId) {
								icon = (
									<GoArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (openAction) {
								icon = (
									<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (branch.isLocal) {
								icon = (
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else {
								icon = (
									<GoGlobe className="size-3.5 shrink-0 text-muted-foreground" />
								);
							}

							return (
								<CommandItem
									key={branch.name}
									value={branch.name}
									onSelect={() => {
										if (activeWorkspaceId) {
											onOpenActiveWorkspace(activeWorkspaceId);
										} else if (openAction) {
											onOpenWorktree(openAction);
										} else {
											onSelectBaseBranch(branch.name);
										}
										setOpen(false);
									}}
									className="group h-11 flex items-center justify-between gap-3 px-3"
								>
									<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
										{icon}
										<span className="truncate font-mono text-xs">
											{branch.name}
										</span>
										<span className="flex items-center gap-1.5 shrink-0">
											{branch.name === defaultBranch && (
												<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													default
												</span>
											)}
											{isWorktree ? (
												<span className="text-[10px] text-blue-500/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
													git-worktree
												</span>
											) : (
												<span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
													branch
												</span>
											)}
										</span>
									</span>

									<span className="flex items-center gap-2 shrink-0">
										{branch.lastCommitDate > 0 && (
											<span className="text-[11px] text-muted-foreground/70 group-data-[selected=true]:hidden">
												{formatRelativeTime(branch.lastCommitDate)}
											</span>
										)}

										{!hasExistingWorkspace &&
											effectiveBaseBranch === branch.name && (
												<HiCheck className="size-4 text-primary group-data-[selected=true]:hidden" />
											)}

										<span className="hidden group-data-[selected=true]:flex items-center gap-1.5">
											{hasExistingWorkspace && (
												<Button
													size="sm"
													variant="ghost"
													className="h-7 px-2.5 text-xs font-medium hover:bg-accent/10 hover:text-accent-foreground"
													onClick={(e) => {
														e.stopPropagation();
														if (activeWorkspaceId) {
															onOpenActiveWorkspace(activeWorkspaceId);
														} else if (openAction) {
															onOpenWorktree(openAction);
														}
														setOpen(false);
													}}
												>
													<GoArrowUpRight className="size-3.5 mr-1" />
													Open
													<span className="ml-1 text-[10px] opacity-60">
														↵
													</span>
												</Button>
											)}
											<Button
												size="sm"
												className="h-7 px-2.5 text-xs font-medium"
												onClick={(e) => {
													e.stopPropagation();
													onSelectBaseBranch(branch.name);
													setOpen(false);
												}}
											>
												{hasExistingWorkspace ? (
													<>
														<PlusIcon className="size-3.5 mr-1" />
														Create
														<span className="ml-1 text-[10px] opacity-70">
															{modKey}↵
														</span>
													</>
												) : (
													<>
														Create
														<span className="ml-1 text-[10px] opacity-70">
															↵
														</span>
													</>
												)}
											</Button>
										</span>
									</span>
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export function PromptGroup({
	projectId,
	selectedProject,
	recentProjects,
	onSelectProject,
	onImportRepo,
	onNewProject,
}: PromptGroupProps) {
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const isDark = useIsDarkTheme();
	const navigate = useNavigate();
	const { draft, runAsyncAction, updateDraft, closeAndResetDraft } =
		useNewWorkspaceModalDraft();
	const {
		baseBranch,
		branchName,
		branchNameEdited,
		branchSearch,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
	} = draft;
	const runSetupScriptRef = useRef(runSetupScript);
	runSetupScriptRef.current = runSetupScript;
	const createWorkspace = useCreateWorkspace({
		resolveInitialCommands: (commands) =>
			runSetupScriptRef.current ? commands : null,
	});
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored &&
				(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as WorkspaceCreateAgent)
				: "none";
		},
	);
	const trimmedPrompt = prompt.trim();
	const trimmedWorkspaceName = workspaceName.trim();

	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const {
		data: localBranchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const branchData = remoteBranchData ?? localBranchData;

	const { data: externalWorktrees = [] } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);
	const { data: trackedWorktrees = [] } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);
	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const worktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) set.add(wt.branch);
		for (const wt of trackedWorktrees) set.add(wt.branch);
		return set;
	}, [externalWorktrees, trackedWorktrees]);

	const activeWorkspacesByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const ws of allWorkspaces) {
			if (ws.projectId === projectId) {
				map.set(ws.branch, ws.id);
			}
		}
		return map;
	}, [allWorkspaces, projectId]);

	const openableWorktrees = useMemo(
		() => resolveOpenableWorktrees(trackedWorktrees, externalWorktrees),
		[trackedWorktrees, externalWorktrees],
	);

	const handleOpenedWorktree = useHandleOpenedWorktree();
	const openTrackedWorktreeMutation =
		electronTrpc.workspaces.openWorktree.useMutation({
			onSuccess: async (data) => {
				await handleOpenedWorktree(data);
			},
		});
	const openExternalWorktreeMutation = useOpenExternalWorktree();

	const handleOpenWorktree = useCallback(
		(action: OpenableWorktreeAction) => {
			if (!projectId) return;
			if (action.type === "tracked") {
				void runAsyncAction(
					openTrackedWorktreeMutation.mutateAsync({
						worktreeId: action.worktreeId,
					}),
					{
						loading: "Opening worktree...",
						success: "Worktree opened",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Failed to open worktree",
					},
				);
			} else {
				void runAsyncAction(
					openExternalWorktreeMutation.mutateAsync({
						projectId,
						worktreePath: action.worktreePath,
						branch: action.branch,
					}),
					{
						loading: "Importing worktree...",
						success: "Worktree imported",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Failed to import worktree",
					},
				);
			}
		},
		[
			openExternalWorktreeMutation,
			openTrackedWorktreeMutation,
			projectId,
			runAsyncAction,
		],
	);

	const handleOpenActiveWorkspace = useCallback(
		(workspaceId: string) => {
			closeAndResetDraft();
			navigateToWorkspace(workspaceId, navigate);
		},
		[closeAndResetDraft, navigate],
	);

	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const resolvedPrefix = useMemo(() => {
		const projectOverrides = project?.branchPrefixMode != null;
		return resolveBranchPrefix({
			mode: projectOverrides
				? project?.branchPrefixMode
				: (globalBranchPrefix?.mode ?? "none"),
			customPrefix: projectOverrides
				? project?.branchPrefixCustom
				: globalBranchPrefix?.customPrefix,
			authorPrefix: gitAuthor?.prefix,
			githubUsername: gitInfo?.githubUsername,
		});
	}, [project, globalBranchPrefix, gitAuthor, gitInfo]);

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((branch) =>
			branch.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const branchSlug = branchNameEdited
		? sanitizeBranchNameWithMaxLength(branchName, undefined, {
				preserveFirstSegmentCase: true,
			})
		: sanitizeBranchNameWithMaxLength(trimmedPrompt);

	const applyPrefix = !branchNameEdited;

	const branchPreview =
		branchSlug && applyPrefix && resolvedPrefix
			? sanitizeBranchNameWithMaxLength(`${resolvedPrefix}/${branchSlug}`)
			: branchSlug;

	const previousProjectIdRef = useRef(projectId);

	useEffect(() => {
		if (previousProjectIdRef.current === projectId) {
			return;
		}
		previousProjectIdRef.current = projectId;
		updateDraft({
			baseBranch: null,
			branchSearch: "",
		});
	}, [projectId, updateDraft]);

	const handleAgentChange = (value: WorkspaceCreateAgent) => {
		setSelectedAgent(value);
		window.localStorage.setItem(AGENT_STORAGE_KEY, value);
	};

	const buildLaunchRequest = (
		trimmedPrompt: string,
	): AgentLaunchRequest | null => {
		if (selectedAgent === "none") return null;

		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId: "pending-workspace",
				agentType: "superset-chat",
				source: "new-workspace",
				chat: {
					initialPrompt: trimmedPrompt || undefined,
				},
			};
		}

		const command = trimmedPrompt
			? buildAgentPromptCommand({
					prompt: trimmedPrompt,
					randomId: window.crypto.randomUUID(),
					agent: selectedAgent,
				})
			: (AGENT_PRESET_COMMANDS[selectedAgent][0] ?? null);

		if (!command) return null;

		return {
			kind: "terminal",
			workspaceId: "pending-workspace",
			agentType: selectedAgent,
			source: "new-workspace",
			terminal: {
				command,
				name: "Agent",
			},
		};
	};

	const handleCreate = () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		const launchRequest = buildLaunchRequest(trimmedPrompt);
		void runAsyncAction(
			createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					name:
						workspaceNameEdited && trimmedWorkspaceName
							? trimmedWorkspaceName
							: undefined,
					prompt: trimmedPrompt || undefined,
					branchName: branchSlug || undefined,
					baseBranch: baseBranch || undefined,
					applyPrefix,
				},
				launchRequest ? { agentLaunchRequest: launchRequest } : undefined,
			),
			{
				loading: "Creating workspace...",
				success: "Workspace created",
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			handleCreate();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	});

	const handleBranchNameChange = (value: string) => {
		updateDraft({
			branchName: value.replace(/\s+/g, "-"),
			branchNameEdited: true,
		});
	};

	const handleBranchNameBlur = () => {
		if (!branchName.trim()) {
			updateDraft({
				branchName: "",
				branchNameEdited: false,
			});
			return;
		}
		updateDraft({
			branchName: sanitizeBranchNameWithMaxLength(
				branchName.trim(),
				undefined,
				{
					preserveFirstSegmentCase: true,
				},
			),
		});
	};

	const handleBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({
			baseBranch: selectedBaseBranch,
			branchSearch: "",
		});
	};

	return (
		<div className="p-3 space-y-2">
			<div className="flex items-center">
				<Input
					className="border-none bg-transparent dark:bg-transparent shadow-none text-base font-medium px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40 min-w-0 flex-1"
					placeholder="Workspace name (optional)"
					value={workspaceName}
					onChange={(event) =>
						updateDraft({
							workspaceName: event.target.value,
							workspaceNameEdited: true,
						})
					}
					onBlur={() => {
						if (!workspaceName.trim()) {
							updateDraft({
								workspaceName: "",
								workspaceNameEdited: false,
							});
						}
					}}
				/>
				<div className="shrink min-w-0 ml-auto max-w-[50%]">
					<Input
						className={cn(
							"border-none bg-transparent dark:bg-transparent shadow-none text-xs font-mono text-muted-foreground/60 px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/30 focus:text-muted-foreground text-right placeholder:text-right overflow-hidden text-ellipsis",
						)}
						placeholder="branch name"
						value={branchNameEdited ? branchName : branchPreview}
						onChange={(event) => handleBranchNameChange(event.target.value)}
						onBlur={handleBranchNameBlur}
					/>
				</div>
			</div>

			<PromptInput
				onSubmit={(message, event) => {
					event.preventDefault();
					if (message.text !== prompt) {
						updateDraft({ prompt: message.text });
					}
					handleCreate();
				}}
				className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
			>
				<PromptInputTextarea
					autoFocus
					placeholder="What do you want to do?"
					className="min-h-10"
					value={prompt}
					onChange={(event) => updateDraft({ prompt: event.target.value })}
				/>
				<PromptInputFooter>
					<PromptInputTools className="gap-1.5">
						<Select
							value={selectedAgent}
							onValueChange={(value: WorkspaceCreateAgent) =>
								handleAgentChange(value)
							}
						>
							<SelectTrigger
								className={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							>
								<SelectValue placeholder="No agent" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No agent</SelectItem>
								{(STARTABLE_AGENT_TYPES as readonly StartableAgentType[]).map(
									(agent) => {
										const icon = getPresetIcon(agent, isDark);
										return (
											<SelectItem key={agent} value={agent}>
												<span className="flex items-center gap-2">
													{icon && (
														<img
															src={icon}
															alt=""
															className="size-5 object-contain"
														/>
													)}
													{agent === "superset-chat"
														? "Superset"
														: STARTABLE_AGENT_LABELS[agent]}
												</span>
											</SelectItem>
										);
									},
								)}
							</SelectContent>
						</Select>
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<IconPillButton label="Add attachment">
							<PaperclipIcon className="size-3.5" />
						</IconPillButton>
						<IconPillButton label="Link GitHub issue">
							<GoIssueOpened className="size-3.5" />
						</IconPillButton>
						<IconPillButton label="Link pull request">
							<LuGitPullRequest className="size-3.5" />
						</IconPillButton>
						<PromptInputSubmit
							className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
							disabled={createWorkspace.isPending}
							onClick={(event) => {
								event.preventDefault();
								handleCreate();
							}}
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>

			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<ProjectPickerPill
						selectedProject={selectedProject}
						recentProjects={recentProjects}
						onSelectProject={onSelectProject}
						onImportRepo={onImportRepo}
						onNewProject={onNewProject}
					/>
					<BaseBranchPickerInline
						effectiveBaseBranch={effectiveBaseBranch}
						defaultBranch={branchData?.defaultBranch}
						isBranchesLoading={isBranchesLoading}
						isBranchesError={isBranchesError}
						branches={filteredBranches}
						branchSearch={branchSearch}
						onBranchSearchChange={(value) =>
							updateDraft({ branchSearch: value })
						}
						onSelectBaseBranch={handleBaseBranchSelect}
						worktreeBranches={worktreeBranches}
						openableWorktrees={openableWorktrees}
						activeWorkspacesByBranch={activeWorkspacesByBranch}
						modKey={modKey}
						onOpenWorktree={handleOpenWorktree}
						onOpenActiveWorkspace={handleOpenActiveWorkspace}
					/>
				</div>
				<span className="text-[11px] text-muted-foreground/50">
					{modKey}↵ to create
				</span>
			</div>
		</div>
	);
}
