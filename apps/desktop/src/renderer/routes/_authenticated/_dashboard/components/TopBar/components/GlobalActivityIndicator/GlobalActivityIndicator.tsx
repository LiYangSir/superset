import type { SelectAgentActivity } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useMemo, useState } from "react";
import {
	LuArchive,
	LuCheck,
	LuClipboardCopy,
	LuFileText,
	LuLoader,
} from "react-icons/lu";
import {
	ActivityBars,
	type ActivityBarsMode,
} from "renderer/components/activity/ActivityBars";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectActivityGroup } from "./components/ProjectActivityGroup";

interface GroupedProject {
	projectId: string | null;
	projectName: string;
	projectColor: string | null;
	activities: SelectAgentActivity[];
	activeCount: number;
}

export function GlobalActivityIndicator() {
	const [open, setOpen] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [projectFilter, setProjectFilter] = useState<string>("all");

	const utils = electronTrpc.useUtils();

	const { data: rawGlobal } = electronTrpc.agentActivities.listGlobal.useQuery(
		{ includeArchived: showArchived, limit: 200 },
		{ refetchInterval: 60_000 },
	);

	electronTrpc.agentActivities.subscribeUpdates.useSubscription(undefined, {
		onData: () => {
			utils.agentActivities.listGlobal.invalidate();
		},
	});

	const archive = electronTrpc.agentActivities.archive.useMutation();
	const archiveBatch = electronTrpc.agentActivities.archiveBatch.useMutation();

	const invalidate = () => {
		utils.agentActivities.listGlobal.invalidate();
		utils.agentActivities.list.invalidate();
	};

	const handleArchive = (id: string) => {
		archive.mutate({ id }, { onSuccess: invalidate });
	};

	const handleArchiveAll = () => {
		archiveBatch.mutate({}, { onSuccess: invalidate });
	};

	const { data: allGroups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const projectWeeklyReportMap = useMemo(() => {
		const map = new Map<string, boolean>();
		for (const g of allGroups) {
			map.set(g.project.id, g.project.weeklyReportEnabled !== false);
		}
		return map;
	}, [allGroups]);

	const [reportOpen, setReportOpen] = useState(false);
	const [reportResult, setReportResult] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const generateReport =
		electronTrpc.agentActivities.generateWeeklyReport.useMutation();
	const setProjectWeeklyReport =
		electronTrpc.agentActivities.setProjectWeeklyReport.useMutation({
			onSuccess: () => utils.workspaces.getAllGrouped.invalidate(),
		});

	const handleGenerateReport = useCallback(() => {
		setReportResult(null);
		setCopied(false);
		generateReport.mutate(
			{},
			{
				onSuccess: (data) => {
					if (data.report) {
						setReportResult(data.report);
					}
				},
			},
		);
	}, [generateReport]);

	const handleCopyReport = useCallback(() => {
		if (!reportResult) return;
		navigator.clipboard.writeText(reportResult);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [reportResult]);

	const { groups, projectOptions, activeTotal, waitingTotal, spotlightText } =
		useMemo(() => {
			if (!rawGlobal)
				return {
					groups: [],
					projectOptions: [],
					activeTotal: 0,
					waitingTotal: 0,
					spotlightText: null as string | null,
				};

			const filtered = rawGlobal.filter((row) => {
				if (statusFilter !== "all" && row.activity.status !== statusFilter)
					return false;
				if (
					projectFilter !== "all" &&
					(row.activity.projectId ?? "none") !== projectFilter
				)
					return false;
				return true;
			});

			const projectMap = new Map<string, GroupedProject>();
			let activeCount = 0;
			let waitingCount = 0;
			let spotlight: string | null = null;

			for (const row of filtered) {
				const key = row.activity.projectId ?? "none";
				let group = projectMap.get(key);
				if (!group) {
					group = {
						projectId: row.activity.projectId,
						projectName: row.projectName ?? "No Project",
						projectColor: row.projectColor ?? null,
						activities: [],
						activeCount: 0,
					};
					projectMap.set(key, group);
				}
				group.activities.push(row.activity);
				if (row.activity.status === "in_progress") {
					group.activeCount++;
					activeCount++;
					if (!spotlight) {
						spotlight =
							row.activity.summary ||
							row.activity.userMessage ||
							row.activity.title ||
							null;
					}
				}
				if (row.activity.status === "waiting_for_input") {
					group.activeCount++;
					waitingCount++;
					spotlight =
						row.activity.userMessage || row.activity.title || "Needs attention";
				}
			}

			const uniqueProjects = new Map<string, string>();
			for (const row of rawGlobal) {
				const pid = row.activity.projectId ?? "none";
				if (!uniqueProjects.has(pid)) {
					uniqueProjects.set(pid, row.projectName ?? "No Project");
				}
			}

			return {
				groups: [...projectMap.values()].sort((a, b) => {
					if (a.activeCount !== b.activeCount)
						return b.activeCount - a.activeCount;
					return (
						(b.activities[0]?.startedAt ?? 0) -
						(a.activities[0]?.startedAt ?? 0)
					);
				}),
				projectOptions: [...uniqueProjects.entries()].map(([id, name]) => ({
					id,
					name,
				})),
				activeTotal: activeCount,
				waitingTotal: waitingCount,
				spotlightText: spotlight,
			};
		}, [rawGlobal, statusFilter, projectFilter]);

	const totalCount = rawGlobal?.length ?? 0;

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={cn(
									"no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring relative",
									open && "bg-secondary border-border",
									waitingTotal > 0 && "border-violet-500/40",
									waitingTotal === 0 &&
										activeTotal > 0 &&
										"border-amber-500/30",
								)}
							>
								<ActivityBars
									mode={
										(waitingTotal > 0
											? "waiting"
											: activeTotal > 0
												? "running"
												: "idle") as ActivityBarsMode
									}
									size={14}
								/>
								{totalCount > 0 && (
									<span className="text-[10px] text-muted-foreground tabular-nums">
										{totalCount}
									</span>
								)}
							</button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent
						side="bottom"
						showArrow={false}
						className="max-w-[250px]"
					>
						<div className="text-xs">
							{waitingTotal > 0
								? `${waitingTotal} agent${waitingTotal > 1 ? "s" : ""} need attention`
								: activeTotal > 0
									? `${activeTotal} agent${activeTotal > 1 ? "s" : ""} running`
									: "Agent Activity"}
						</div>
						{spotlightText && (
							<div className="text-[10px] text-muted-foreground truncate mt-0.5">
								{spotlightText}
							</div>
						)}
					</TooltipContent>
				</Tooltip>

				<PopoverContent
					align="end"
					className="w-[36rem] p-0 max-h-[70vh] flex flex-col"
				>
					<div className="p-3 border-b border-border shrink-0">
						<div className="flex items-center justify-between mb-2">
							<h4 className="text-xs font-semibold text-muted-foreground tracking-wide">
								Activity
							</h4>
							<div className="flex items-center gap-2">
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-[10px] gap-1"
									onClick={() => {
										setReportResult(null);
										setCopied(false);
										setReportOpen(true);
									}}
								>
									<LuFileText className="size-3" />
									Weekly Report
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-[10px] gap-1"
									onClick={handleArchiveAll}
									disabled={archiveBatch.isPending}
								>
									<LuCheck className="size-3" />
									Clear completed
								</Button>
							</div>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{projectOptions.length > 1 && (
								<Select value={projectFilter} onValueChange={setProjectFilter}>
									<SelectTrigger className="h-6 w-auto min-w-[100px] text-[11px]">
										<SelectValue placeholder="All projects" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All projects</SelectItem>
										{projectOptions.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
							<Select value={statusFilter} onValueChange={setStatusFilter}>
								<SelectTrigger className="h-6 w-auto min-w-[80px] text-[11px]">
									<SelectValue placeholder="All status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All status</SelectItem>
									<SelectItem value="in_progress">Running</SelectItem>
									<SelectItem value="completed">Completed</SelectItem>
									<SelectItem value="failed">Failed</SelectItem>
								</SelectContent>
							</Select>
							<div className="flex items-center gap-1.5 ml-auto">
								<Switch
									id="show-archived"
									checked={showArchived}
									onCheckedChange={setShowArchived}
									className="scale-75"
								/>
								<label
									htmlFor="show-archived"
									className="text-[10px] text-muted-foreground cursor-pointer"
								>
									Archived
								</label>
							</div>
						</div>
					</div>

					<div className="overflow-y-auto flex-1">
						{groups.length === 0 ? (
							<div className="px-3 py-8 text-center text-xs text-muted-foreground">
								No agent activity
							</div>
						) : (
							groups.map((g) => (
								<ProjectActivityGroup
									key={g.projectId ?? "none"}
									projectName={g.projectName}
									projectColor={g.projectColor}
									activities={g.activities}
									activeCount={g.activeCount}
									onArchive={handleArchive}
								/>
							))
						)}
					</div>
				</PopoverContent>
			</Popover>

			<Dialog open={reportOpen} onOpenChange={setReportOpen}>
				<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Weekly Report</DialogTitle>
					</DialogHeader>

					{!reportResult ? (
						<div className="space-y-4 py-2">
							<p className="text-sm text-muted-foreground">
								Select projects to include in the report:
							</p>
							<div className="space-y-1 max-h-[200px] overflow-y-auto">
								{projectOptions.map((p) => (
									<div
										key={p.id}
										className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50"
									>
										<span className="text-sm">{p.name}</span>
										<Switch
											checked={projectWeeklyReportMap.get(p.id) ?? true}
											onCheckedChange={(checked) =>
												setProjectWeeklyReport.mutate({
													projectId: p.id,
													enabled: checked,
												})
											}
											className="scale-75"
										/>
									</div>
								))}
							</div>
							<DialogFooter>
								<Button
									onClick={handleGenerateReport}
									disabled={generateReport.isPending}
									className="gap-2"
								>
									{generateReport.isPending && (
										<LuLoader className="size-4 animate-spin" />
									)}
									Generate
								</Button>
							</DialogFooter>
						</div>
					) : (
						<div className="flex flex-col gap-3 min-h-0 flex-1">
							<div className="overflow-y-auto flex-1 rounded border border-border bg-muted/20 p-4">
								<pre className="text-sm whitespace-pre-wrap break-words font-sans">
									{reportResult}
								</pre>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setReportResult(null)}>
									Back
								</Button>
								<Button onClick={handleCopyReport} className="gap-2">
									<LuClipboardCopy className="size-4" />
									{copied ? "Copied!" : "Copy"}
								</Button>
							</DialogFooter>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
