import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db/schema/zod";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "lib/trpc-react";
import {
	buildTerminalCommand,
	writeCommandsInPane,
} from "lib/terminal/launch-command";
import {
	getPresetLaunchPlan,
	type PresetMode,
	type PresetOpenTarget,
} from "./preset-launch";
import { useTabsStore } from "./store";
import type { AddTabOptions, SplitPaneOptions } from "./types";
import { resolveActiveTabIdForWorkspace } from "./utils";

interface OpenPresetOptions {
	target?: PresetOpenTarget;
	modeOverride?: PresetMode;
}

interface PreparedPreset {
	mode: PresetMode;
	commands: string[];
	initialCwd?: string;
	name?: string;
	iconUrl?: string;
}

function preparePreset(preset: TerminalPreset): PreparedPreset {
	return {
		mode: normalizeExecutionMode(preset.executionMode),
		commands: preset.commands,
		initialCwd: preset.cwd || undefined,
		name: preset.name || undefined,
		iconUrl: preset.iconUrl || undefined,
	};
}

export function useTabsWithPresets() {
	const { data: newTabPresets = [] } =
		electronTrpc.settings.getNewTabPresets.useQuery();

	const storeAddTab = useTabsStore((s) => s.addTab);
	const storeAddTabWithMultiplePanes = useTabsStore(
		(s) => s.addTabWithMultiplePanes,
	);
	const storeAddPane = useTabsStore((s) => s.addPane);
	const storeAddPanesToTab = useTabsStore((s) => s.addPanesToTab);
	const storeSplitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const storeSplitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const storeSplitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const renameTab = useTabsStore((s) => s.renameTab);
	const setTabPreset = useTabsStore((s) => s.setTabPreset);
	const writeToTerminal = electronTrpc.terminal.write.useMutation();

	const firstPreset = newTabPresets[0] ?? null;
	const firstPresetCommand = useMemo(
		() => (firstPreset ? buildTerminalCommand(firstPreset.commands) : null),
		[firstPreset],
	);

	const firstPresetOptions: AddTabOptions | undefined = useMemo(() => {
		if (!firstPreset) return undefined;
		return {
			initialCwd: firstPreset.cwd || undefined,
			initialCommand: firstPresetCommand ?? undefined,
		};
	}, [firstPreset, firstPresetCommand]);

	const applyPresetToTab = useCallback(
		(tabId: string, preset: PreparedPreset) => {
			if (preset.name) {
				renameTab(tabId, preset.name);
				setTabPreset(tabId, preset.name, preset.iconUrl);
			}
		},
		[renameTab, setTabPreset],
	);

	const resolveActiveWorkspaceTabId = useCallback((workspaceId: string) => {
		const state = useTabsStore.getState();
		return resolveActiveTabIdForWorkspace({
			workspaceId,
			tabs: state.tabs,
			activeTabIds: state.activeTabIds,
			tabHistoryStacks: state.tabHistoryStacks,
		});
	}, []);

	const executePresetInNewTab = useCallback(
		(workspaceId: string, preset: PreparedPreset) => {
			const hasMultipleCommands = preset.commands.length > 1;

			if (preset.mode === "new-tab" && hasMultipleCommands) {
				let firstResult: { tabId: string; paneId: string } | null = null;

				for (const command of preset.commands) {
					const result = storeAddTab(workspaceId, {
						initialCwd: preset.initialCwd,
						initialCommand: command,
					});
					if (!firstResult) {
						firstResult = result;
					}
					applyPresetToTab(result.tabId, preset);
				}

				if (firstResult) {
					return firstResult;
				}

				const fallback = storeAddTab(workspaceId, {
					initialCwd: preset.initialCwd,
				});
				applyPresetToTab(fallback.tabId, preset);
				return fallback;
			}

			if (hasMultipleCommands) {
				const multiPane = storeAddTabWithMultiplePanes(workspaceId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				applyPresetToTab(multiPane.tabId, preset);
				return { tabId: multiPane.tabId, paneId: multiPane.paneIds[0] };
			}

			const command = buildTerminalCommand(preset.commands);
			const result = storeAddTab(workspaceId, {
				initialCwd: preset.initialCwd,
				initialCommand: command ?? undefined,
			});
			applyPresetToTab(result.tabId, preset);
			return result;
		},
		[storeAddTab, storeAddTabWithMultiplePanes, applyPresetToTab],
	);

	const executePreset = useCallback(
		(workspaceId: string, preset: PreparedPreset, target: PresetOpenTarget) => {
			const activeTabId =
				target === "active-tab" && preset.mode === "split-pane"
					? resolveActiveWorkspaceTabId(workspaceId)
					: null;

			const plan = getPresetLaunchPlan({
				mode: preset.mode,
				target,
				commandCount: preset.commands.length,
				hasActiveTab: !!activeTabId,
			});

			if (plan === "active-tab-multi-pane" && activeTabId) {
				const paneIds = storeAddPanesToTab(activeTabId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				if (paneIds.length > 0) {
					return { tabId: activeTabId, paneId: paneIds[0] };
				}
				return executePresetInNewTab(workspaceId, preset);
			}

			if (plan === "active-tab-single" && activeTabId) {
				const command = buildTerminalCommand(preset.commands);
				const paneId = storeAddPane(activeTabId, {
					initialCwd: preset.initialCwd,
					initialCommand: command ?? undefined,
				});
				if (paneId) {
					return { tabId: activeTabId, paneId };
				}
				return executePresetInNewTab(workspaceId, preset);
			}

			return executePresetInNewTab(workspaceId, preset);
		},
		[
			resolveActiveWorkspaceTabId,
			storeAddPanesToTab,
			storeAddPane,
			executePresetInNewTab,
		],
	);

	const openPresetInCurrentTerminal = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			const activeTabId = resolveActiveWorkspaceTabId(workspaceId);
			if (!activeTabId) return false;

			const state = useTabsStore.getState();
			const paneId = state.focusedPaneIds[activeTabId];
			if (!paneId) return false;

			const pane = state.panes[paneId];
			if (!pane || pane.type !== "terminal") return false;

			void writeCommandsInPane({
				paneId,
				commands: preset.commands,
				write: (input) => writeToTerminal.mutateAsync(input),
			}).catch((error) => {
				console.error(
					"[useTabsWithPresets] Failed to send preset commands to current terminal:",
					{
						workspaceId,
						tabId: activeTabId,
						paneId,
						error: error instanceof Error ? error.message : String(error),
					},
				);
			});

			return true;
		},
		[resolveActiveWorkspaceTabId, writeToTerminal],
	);

	const openPreset = useCallback(
		(
			workspaceId: string,
			preset: TerminalPreset,
			options?: OpenPresetOptions,
		) => {
			const prepared = preparePreset(preset);
			const target = options?.target ?? "new-tab";
			const mode = options?.modeOverride ?? prepared.mode;
			return executePreset(workspaceId, { ...prepared, mode }, target);
		},
		[executePreset],
	);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (newTabPresets.length === 0) {
				return storeAddTab(workspaceId);
			}

			const firstResult = openPreset(workspaceId, newTabPresets[0], {
				target: "new-tab",
			});
			for (let i = 1; i < newTabPresets.length; i++) {
				openPreset(workspaceId, newTabPresets[i], { target: "new-tab" });
			}

			return { tabId: firstResult.tabId, paneId: firstResult.paneId };
		},
		[storeAddTab, newTabPresets, openPreset],
	);

	const addPane = useCallback(
		(tabId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddPane(tabId, options);
			}
			return storeAddPane(tabId, firstPresetOptions);
		},
		[storeAddPane, firstPresetOptions],
	);

	const splitPaneVertical = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneVertical(tabId, sourcePaneId, path, options);
			}
			storeSplitPaneVertical(tabId, sourcePaneId, path, firstPresetOptions);
		},
		[storeSplitPaneVertical, firstPresetOptions],
	);

	const splitPaneHorizontal = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneHorizontal(tabId, sourcePaneId, path, options);
			}
			storeSplitPaneHorizontal(tabId, sourcePaneId, path, firstPresetOptions);
		},
		[storeSplitPaneHorizontal, firstPresetOptions],
	);

	const splitPaneAuto = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			dimensions: { width: number; height: number },
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneAuto(
					tabId,
					sourcePaneId,
					dimensions,
					path,
					options,
				);
			}
			storeSplitPaneAuto(
				tabId,
				sourcePaneId,
				dimensions,
				path,
				firstPresetOptions,
			);
		},
		[storeSplitPaneAuto, firstPresetOptions],
	);

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		openPreset,
		openPresetInCurrentTerminal,
	};
}
