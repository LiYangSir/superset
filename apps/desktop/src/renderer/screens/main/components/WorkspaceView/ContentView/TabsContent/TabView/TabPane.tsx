import type { SelectAgentActivity } from "@superset/local-db";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuCheck, LuChevronRight, LuCircle, LuCircleAlert, LuLoader } from "react-icons/lu";
import type { MosaicBranch } from "react-mosaic-component";
import {
	formatDuration,
	formatRelativeTime,
} from "renderer/components/activity/ActivityCard/ActivityCard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	registerPaneRef,
	unregisterPaneRef,
} from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import type { PaneStatus } from "shared/tabs-types";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { BasePaneWindow, PaneToolbarActions } from "./components";
import type { SplitOrientation } from "./hooks";

interface TabPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
}

export function TabPane({
	paneId,
	path,
	tabId,
	workspaceId,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: TabPaneProps) {
	const paneName = useTabsStore((s) => s.panes[paneId]?.name);
	const paneDescription = useTabsStore((s) => s.panes[paneId]?.description);
	const paneStatus = useTabsStore((s) => s.panes[paneId]?.status);
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);

	const terminalContainerRef = useRef<HTMLDivElement>(null);
	const getClearCallback = useTerminalCallbacksStore((s) => s.getClearCallback);
	const getScrollToBottomCallback = useTerminalCallbacksStore(
		(s) => s.getScrollToBottomCallback,
	);
	const getGetSelectionCallback = useTerminalCallbacksStore(
		(s) => s.getGetSelectionCallback,
	);
	const getPasteCallback = useTerminalCallbacksStore((s) => s.getPasteCallback);

	useEffect(() => {
		const container = terminalContainerRef.current;
		if (container) {
			registerPaneRef(paneId, container);
		}
		return () => {
			unregisterPaneRef(paneId);
		};
	}, [paneId]);

	const handleClearTerminal = () => {
		getClearCallback(paneId)?.();
	};

	const handleScrollToBottom = () => {
		getScrollToBottomCallback(paneId)?.();
	};

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<PaneToolbarWithActivity
					paneId={paneId}
					tabId={tabId}
					workspaceId={workspaceId}
					label={paneDescription || paneName || "Terminal"}
					paneStatus={paneStatus}
					handlers={handlers}
				/>
			)}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
				onSplitWithNewChat={() =>
					splitPaneVertical(tabId, paneId, path, { paneType: "chat-mastra" })
				}
				onSplitWithNewBrowser={() =>
					splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
				}
				onClosePane={() => removePane(paneId)}
				onClearTerminal={handleClearTerminal}
				onScrollToBottom={handleScrollToBottom}
				getSelection={() => getGetSelectionCallback(paneId)?.() ?? ""}
				onPaste={(text) => getPasteCallback(paneId)?.(text)}
				onMarkAsUnread={() => setPaneStatus(paneId, "review")}
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
				closeLabel="Close Terminal"
			>
				<div ref={terminalContainerRef} className="w-full h-full">
					<Terminal paneId={paneId} tabId={tabId} workspaceId={workspaceId} />
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}

function PaneToolbarWithActivity({
	paneId,
	tabId,
	workspaceId,
	label,
	paneStatus,
	handlers,
}: {
	paneId: string;
	tabId: string;
	workspaceId: string;
	label: string;
	paneStatus?: PaneStatus;
	handlers: { splitOrientation: SplitOrientation; onSplitPane: (e: React.MouseEvent) => void; onClosePane: (e: React.MouseEvent) => void };
}) {
	const { data: rawActivities } = electronTrpc.agentActivities.list.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId,
			refetchInterval: (query) => {
				const data = query.state.data as SelectAgentActivity[] | undefined;
				const hasActive = data?.some((a) => a.status === "in_progress");
				return hasActive ? 3000 : 30000;
			},
		},
	);

	const activities = useMemo(() => {
		const all = rawActivities as SelectAgentActivity[] | undefined;
		if (!all || all.length === 0) return [];
		return all.filter((a) => a.paneId === paneId || a.tabId === tabId);
	}, [rawActivities, paneId, tabId]);

	const toolbar = (
		<div className="flex h-full w-full items-center justify-between px-3">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate text-sm text-muted-foreground">
					{label}
				</span>
				{paneStatus && paneStatus !== "idle" && (
					<StatusIndicator status={paneStatus} />
				)}
			</div>
			<PaneToolbarActions
				splitOrientation={handlers.splitOrientation}
				onSplitPane={handlers.onSplitPane}
				onClosePane={handlers.onClosePane}
				closeHotkeyId="CLOSE_TERMINAL"
			/>
		</div>
	);

	if (activities.length === 0) return toolbar;

	return (
		<HoverCard openDelay={200} closeDelay={300}>
			<HoverCardTrigger asChild>{toolbar}</HoverCardTrigger>
			<HoverCardContent
				side="bottom"
				align="start"
				sideOffset={0}
				className="w-[var(--radix-hover-card-trigger-width)] max-h-[50vh] overflow-y-auto p-0"
			>
				<div className="px-3 py-1.5 border-b border-border/50">
					<span className="text-[10px] font-medium text-muted-foreground tracking-wide">
						Activity ({activities.length})
					</span>
				</div>
				{activities.map((a) => (
					<ActivityHistoryItem key={a.id} activity={a} />
				))}
			</HoverCardContent>
		</HoverCard>
	);
}

function ActivityHistoryItem({ activity }: { activity: SelectAgentActivity }) {
	const [open, setOpen] = useState(false);
	const summary =
		activity.summary || activity.userMessage || activity.title || "Completed";
	const tag = activity.presetName || "claude-code";

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors border-b border-border/50 last:border-b-0">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				{activity.status === "in_progress" ? (
					<LuLoader className="size-3 shrink-0 text-amber-500 animate-spin" />
				) : activity.status === "completed" ? (
					<LuCheck className="size-3 shrink-0 text-green-500" />
				) : activity.status === "failed" ? (
					<LuCircleAlert className="size-3 shrink-0 text-red-500" />
				) : (
					<LuCircle className="size-3 shrink-0 text-muted-foreground" />
				)}
				<span className="text-xs truncate flex-1">{summary}</span>
				<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
					{tag}
				</span>
				<span className="text-[10px] text-muted-foreground/60 shrink-0">
					{formatRelativeTime(activity.startedAt)}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="px-3 pb-2 pl-8 space-y-1.5">
					{activity.userMessage && (
						<p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
							{activity.userMessage}
						</p>
					)}
					{activity.summary && activity.userMessage && (
						<p className="text-[11px] text-foreground/80">
							{activity.summary}
						</p>
					)}
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
						{activity.modelName && <span>Model: {activity.modelName}</span>}
						{activity.durationMs != null && (
							<span>Duration: {formatDuration(activity.durationMs)}</span>
						)}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
