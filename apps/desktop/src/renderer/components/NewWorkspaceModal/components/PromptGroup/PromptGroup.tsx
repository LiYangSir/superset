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
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch, GoIssueOpened } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderGit, LuFolderOpen, LuGitPullRequest } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import {
	resolveBranchPrefix,
	sanitizeBranchNameWithMaxLength,
} from "shared/utils/branch";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";

type WorkspaceCreateAgent = StartableAgentType | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";
const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

interface ProjectOption {
	id: string;
	name: string;
	color: string;
	githubOwner: string | null;
	iconUrl: string | null;
	hideImage: boolean | null;
}

interface BranchOption {
	name: string;
	lastCommitDate: number;
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
							projectId={selectedProject.id}
							projectName={selectedProject.name}
							projectColor={selectedProject.color}
							githubOwner={selectedProject.githubOwner}
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
										projectId={project.id}
										projectName={project.name}
										projectColor={project.color}
										githubOwner={project.githubOwner}
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
}: {
	effectiveBaseBranch: string | null;
	defaultBranch?: string;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: BranchOption[];
	branchSearch: string;
	onBranchSearchChange: (value: string) => void;
	onSelectBaseBranch: (branchName: string) => void;
}) {
	const [open, setOpen] = useState(false);

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
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={onBranchSearchChange}
					/>
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{branches.map((branch) => (
							<CommandItem
								key={branch.name}
								value={branch.name}
								onSelect={() => {
									onSelectBaseBranch(branch.name);
									setOpen(false);
								}}
								className="group h-11 flex items-center justify-between gap-3 px-3"
							>
								<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate font-mono text-xs">
										{branch.name}
									</span>
									{branch.name === defaultBranch && (
										<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
											default
										</span>
									)}
								</span>
								<span className="flex items-center gap-2 shrink-0">
									{branch.lastCommitDate > 0 && (
										<span className="text-[11px] text-muted-foreground/70">
											{formatRelativeTime(branch.lastCommitDate)}
										</span>
									)}
									{effectiveBaseBranch === branch.name && (
										<HiCheck className="size-4 text-primary" />
									)}
								</span>
							</CommandItem>
						))}
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
	const { draft, runAsyncAction, updateDraft } = useNewWorkspaceModalDraft();
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
					/>
				</div>
				<span className="text-[11px] text-muted-foreground/50">
					{modKey}↵ to create
				</span>
			</div>
		</div>
	);
}
