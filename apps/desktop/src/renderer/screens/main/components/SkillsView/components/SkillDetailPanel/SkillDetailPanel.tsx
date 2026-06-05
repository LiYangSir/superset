import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import {
	LuChevronDown,
	LuChevronUp,
	LuCircle,
	LuCircleCheck,
	LuFolderOpen,
	LuLoader,
	LuRefreshCw,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSkillsViewStore } from "renderer/stores/skills/store";
import { SOURCE_TYPES } from "../../constants";
import {
	getAgentIconUrl,
	hasAgentIcon,
	shortLabel,
} from "../../utils/agentIcons";


function getSourceColor(sourceType: string) {
	return SOURCE_TYPES.find((s) => s.id === sourceType)?.color ?? "#6b7280";
}

function AgentIconImg({
	agentKey,
	className,
}: {
	agentKey: string;
	className?: string;
}) {
	const src = getAgentIconUrl(agentKey);
	const [failed, setFailed] = useState(false);
	if (!src || failed) return null;
	return (
		<img
			src={src}
			alt=""
			draggable={false}
			className={className}
			onError={() => setFailed(true)}
		/>
	);
}

interface ToolInfo {
	key: string;
	displayName: string;
	installed: boolean;
	enabled: boolean;
}

function AgentToggleButton({
	toolKey,
	displayName,
	enabled,
	loading,
	onToggle,
}: {
	toolKey: string;
	displayName: string;
	enabled: boolean;
	loading: boolean;
	onToggle: (key: string, enable: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onToggle(toolKey, !enabled)}
			disabled={loading}
			className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
				enabled
					? "border-border bg-accent/40"
					: "border-border/50 bg-muted/30"
			} ${loading ? "opacity-55" : "hover:bg-accent/60"}`}
		>
			<span className="shrink-0">
				{loading ? (
					<LuLoader className="size-3.5 animate-spin text-muted-foreground" />
				) : enabled ? (
					<LuCircleCheck className="size-3.5 text-emerald-500" />
				) : (
					<LuCircle className="size-3.5 text-muted-foreground" />
				)}
			</span>
			<span className="inline-flex items-center justify-center size-5 rounded-[5px] overflow-hidden shrink-0">
				{hasAgentIcon(toolKey) ? (
					<AgentIconImg agentKey={toolKey} className="size-5 object-contain" />
				) : (
					<span className="text-[8px] font-mono font-semibold text-muted-foreground">
						{shortLabel(displayName, toolKey)}
					</span>
				)}
			</span>
			<span className="min-w-0 flex-1 truncate font-medium">
				{displayName}
			</span>
		</button>
	);
}

function AgentToggles({
	skill,
	tools,
	syncedKeys,
	pendingTool,
	syncError,
	onToggle,
}: {
	skill: { id: string; targets?: Array<{ tool: string; status: string }> };
	tools?: ToolInfo[];
	syncedKeys: Set<string>;
	pendingTool: string | null;
	syncError: string | null;
	onToggle: (toolKey: string, enable: boolean) => void;
}) {
	const [showUnavailable, setShowUnavailable] = useState(false);

	const activeTools = tools?.filter((t) => t.installed && t.enabled) ?? [];
	const inactiveTools = tools?.filter((t) => !t.installed || !t.enabled) ?? [];

	const enabledCount = activeTools.filter((t) => syncedKeys.has(t.key)).length;

	const orphanTargets = (skill.targets ?? []).filter(
		(t) => !activeTools.some((at) => at.key === t.tool),
	);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
					Agents
				</h4>
				<span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
					{enabledCount} / {activeTools.length} synced
				</span>
			</div>

			{activeTools.length > 0 && (
				<div className="grid grid-cols-2 gap-1">
					{activeTools.map((tool) => (
						<AgentToggleButton
							key={tool.key}
							toolKey={tool.key}
							displayName={tool.displayName}
							enabled={syncedKeys.has(tool.key)}
							loading={pendingTool === tool.key}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}

			{orphanTargets.length > 0 && (
				<div className="grid grid-cols-2 gap-1">
					{orphanTargets.map((target) => (
						<AgentToggleButton
							key={target.tool}
							toolKey={target.tool}
							displayName={target.tool}
							enabled={true}
							loading={pendingTool === target.tool}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}

			{syncError && (
				<p className="text-[11px] text-destructive px-1">{syncError}</p>
			)}

			{inactiveTools.length > 0 && (
				<div>
					<button
						type="button"
						onClick={() => setShowUnavailable((prev) => !prev)}
						className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
					>
						{showUnavailable ? (
							<LuChevronUp className="size-3" />
						) : (
							<LuChevronDown className="size-3" />
						)}
						<span>{inactiveTools.length} unavailable</span>
					</button>
					{showUnavailable && (
						<div className="mt-1 grid grid-cols-2 gap-1">
							{inactiveTools.map((tool) => (
								<span
									key={tool.key}
									className="flex items-center gap-1.5 rounded-md border border-border/30 px-2 py-1.5 text-[11px] text-muted-foreground opacity-50"
								>
									<span className="inline-flex items-center justify-center size-5 rounded-[5px] overflow-hidden shrink-0">
										{hasAgentIcon(tool.key) ? (
											<AgentIconImg
												agentKey={tool.key}
												className="size-5 object-contain"
											/>
										) : (
											<span className="text-[8px] font-mono font-semibold">
												{shortLabel(tool.displayName, tool.key)}
											</span>
										)}
									</span>
									<span className="truncate">{tool.displayName}</span>
								</span>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function SkillDetailPanel() {
	const selectedSkillId = useSkillsViewStore((s) => s.selectedSkillId);
	const setSelectedSkillId = useSkillsViewStore((s) => s.setSelectedSkillId);

	const skillId = selectedSkillId ?? "";
	const { data: skill } = electronTrpc.skills.get.useQuery(
		{ id: skillId },
		{ enabled: !!selectedSkillId },
	);
	const { data: document } = electronTrpc.skills.getDocument.useQuery(
		{ id: skillId },
		{ enabled: !!selectedSkillId },
	);
	const { data: tools } = electronTrpc.skills.tools.getStatus.useQuery();

	const utils = electronTrpc.useUtils();
	const deleteMutation = electronTrpc.skills.delete.useMutation({
		onSuccess: () => {
			setSelectedSkillId(null);
			utils.skills.list.invalidate();
		},
	});
	const checkUpdateMutation = electronTrpc.skills.checkUpdate.useMutation({
		onSuccess: () => {
			utils.skills.get.invalidate({ id: skillId });
			utils.skills.list.invalidate();
		},
	});
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const syncToToolMutation = electronTrpc.skills.sync.syncToTool.useMutation({
		onSuccess: () => {
			utils.skills.get.invalidate({ id: skillId });
			utils.skills.list.invalidate();
		},
	});
	const unsyncFromToolMutation =
		electronTrpc.skills.sync.unsyncFromTool.useMutation({
			onSuccess: () => {
				utils.skills.get.invalidate({ id: skillId });
				utils.skills.list.invalidate();
			},
		});

	const [pendingTool, setPendingTool] = useState<string | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	if (!skill) {
		return null;
	}

	const syncedKeys = new Set(skill.targets?.map((t) => t.tool) ?? []);

	const handleToggle = (toolKey: string, enable: boolean) => {
		setPendingTool(toolKey);
		setSyncError(null);
		const mutation = enable ? syncToToolMutation : unsyncFromToolMutation;
		mutation.mutate(
			{ skillId: skill.id, tool: toolKey },
			{
				onError: (err) => setSyncError(err.message),
				onSettled: () => setPendingTool(null),
			},
		);
	};

	return (
		<div className="w-[400px] min-w-[320px] border-l flex flex-col overflow-auto">
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
				<h3 className="text-sm font-semibold truncate">{skill.name}</h3>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-foreground/60 hover:text-foreground shrink-0"
					onClick={() => setSelectedSkillId(null)}
				>
					<LuX className="size-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-auto p-4 space-y-4">
				{skill.description && (
					<p className="text-xs text-muted-foreground leading-relaxed">
						{skill.description}
					</p>
				)}

				<div className="space-y-1.5">
					<h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
						Source
					</h4>
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className="text-[10px] h-5 px-1.5"
							style={{ borderColor: getSourceColor(skill.sourceType) }}
						>
							{skill.sourceType}
						</Badge>
						{skill.sourceRef && (
							<span className="text-xs text-muted-foreground truncate">
								{skill.sourceRef}
							</span>
						)}
					</div>
					{skill.sourceBranch && (
						<p className="text-xs text-muted-foreground">
							<span className="font-mono">{skill.sourceBranch}</span>
							{skill.sourceRevision && (
								<span className="font-mono ml-1 text-[11px]">
									@{skill.sourceRevision.slice(0, 7)}
								</span>
							)}
						</p>
					)}
				</div>

				{skill.tags && skill.tags.length > 0 && (
					<div className="space-y-1.5">
						<h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
							Tags
						</h4>
						<div className="flex flex-wrap gap-1">
							{skill.tags.map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="text-[10px] h-5 px-1.5"
								>
									{tag}
								</Badge>
							))}
						</div>
					</div>
				)}

				{skill.centralPath && (
					<div className="space-y-1.5">
						<h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
							Path
						</h4>
						<p className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded break-all">
							{skill.centralPath}
						</p>
					</div>
				)}

				<Separator />

				<AgentToggles
					skill={skill}
					tools={tools}
					syncedKeys={syncedKeys}
					pendingTool={pendingTool}
					syncError={syncError}
					onToggle={handleToggle}
				/>

				{document?.content && (
					<>
						<Separator />
						<div className="space-y-1">
							<h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
								SKILL.md
							</h4>
							<MarkdownRenderer
								content={document.content}
								className="text-[12px] leading-relaxed [&_h1]:text-sm [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:text-[12px] [&_li]:text-[12px] [&_code]:text-[11px] [&_pre]:text-[11px]"
							/>
						</div>
					</>
				)}
			</div>

			<div className="border-t border-border/50 px-4 py-2 flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-xs h-7"
					onClick={() => deleteMutation.mutate({ id: skill.id })}
					disabled={deleteMutation.isPending}
				>
					<LuTrash2 className="size-3.5" />
					Delete
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-xs h-7"
					onClick={() => checkUpdateMutation.mutate({ id: skill.id })}
					disabled={checkUpdateMutation.isPending}
				>
					<LuRefreshCw className="size-3.5" />
					Update
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-xs h-7"
					onClick={() => {
						if (skill.centralPath) {
							openInFinderMutation.mutate(skill.centralPath);
						}
					}}
				>
					<LuFolderOpen className="size-3.5" />
					Reveal
				</Button>
			</div>
		</div>
	);
}
