import { router } from "..";
import { createBrowserRouter } from "./browser/browser";
import { createBrowserHistoryRouter } from "./browser-history";
import { createChangesRouter } from "./changes";
import { createConfigRouter } from "./config";
import { createExternalRouter } from "./external";
import { createFilesystemRouter } from "./filesystem";
import { createHotkeysRouter } from "./hotkeys";
import { createMemoryRouter } from "./memory";
import { createMenuRouter } from "./menu";
import { createNotificationsRouter } from "./notifications";
import { createPermissionsRouter } from "./permissions";
import { createPortsRouter } from "./ports";
import { createProjectsRouter } from "./projects";
import { createResourceMetricsRouter } from "./resource-metrics";
import { createRingtoneRouter } from "./ringtone";
import { createSettingsRouter } from "./settings";
import { createSpacesRouter } from "./spaces";
import { createTabAiRouter } from "./tab-ai";
import { createTasksRouter } from "./tasks";
import { createTerminalRouter } from "./terminal";
import { createUiStateRouter } from "./ui-state";
import { createWindowRouter } from "./window";
import { createWorkspacesRouter } from "./workspaces";

export const createAppRouter = () => {
	return router({
		browser: createBrowserRouter(),
		browserHistory: createBrowserHistoryRouter(),
		window: createWindowRouter(),
		projects: createProjectsRouter(),
		workspaces: createWorkspacesRouter(),
		terminal: createTerminalRouter(),
		changes: createChangesRouter(),
		filesystem: createFilesystemRouter(),
		notifications: createNotificationsRouter(),
		permissions: createPermissionsRouter(),
		ports: createPortsRouter(),
		resourceMetrics: createResourceMetricsRouter(),
		menu: createMenuRouter(),
		hotkeys: createHotkeysRouter(),
		external: createExternalRouter(),
		settings: createSettingsRouter(),
		spaces: createSpacesRouter(),
		tasks: createTasksRouter(),
		memory: createMemoryRouter(),
		config: createConfigRouter(),
		tabAi: createTabAiRouter(),
		uiState: createUiStateRouter(),
		ringtone: createRingtoneRouter(),
	});
};

export type AppRouter = ReturnType<typeof createAppRouter>;
