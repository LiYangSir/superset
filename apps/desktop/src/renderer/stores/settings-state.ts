import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type SettingsSection =
	| "account"
	| "organization"
	| "appearance"
	| "ringtones"
	| "keyboard"
	| "behavior"
	| "git"
	| "terminal"
	| "models"
	| "integrations"
	| "billing"
	| "devices"
	| "apikeys"
	| "permissions"
	| "spaces"
	| "tasks"
	| "memory"
	| "project";

interface SettingsState {
	activeSection: SettingsSection;
	activeProjectId: string | null;
	searchQuery: string;
	isOpen: boolean;
	preSettingsPath: string | null;

	setActiveSection: (section: SettingsSection) => void;
	setActiveProject: (projectId: string | null) => void;
	setSearchQuery: (query: string) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	setPreSettingsPath: (path: string) => void;
	consumePreSettingsPath: () => string | null;
}

export const useSettingsStore = create<SettingsState>()(
	devtools(
		(set) => ({
			activeSection: "appearance",
			activeProjectId: null,
			searchQuery: "",
			isOpen: false,
			preSettingsPath: null,

			setActiveSection: (section) => set({ activeSection: section }),

			setActiveProject: (projectId) =>
				set({
					activeProjectId: projectId,
					activeSection: "project",
				}),

			setSearchQuery: (query) => set({ searchQuery: query }),

			openSettings: (section) =>
				set({
					isOpen: true,
					activeSection: section ?? "appearance",
				}),

			closeSettings: () =>
				set({
					isOpen: false,
					searchQuery: "",
				}),

			setPreSettingsPath: (path) => set({ preSettingsPath: path }),

			consumePreSettingsPath: () => {
				const path = useSettingsStore.getState().preSettingsPath;
				set({ preSettingsPath: null });
				return path;
			},
		}),
		{ name: "SettingsStore" },
	),
);

export const useSettingsSection = () =>
	useSettingsStore((state) => state.activeSection);
export const useSetSettingsSection = () =>
	useSettingsStore((state) => state.setActiveSection);
export const useSettingsSearchQuery = () =>
	useSettingsStore((state) => state.searchQuery);
export const useSetSettingsSearchQuery = () =>
	useSettingsStore((state) => state.setSearchQuery);
export const useActiveProjectId = () =>
	useSettingsStore((state) => state.activeProjectId);
export const useCloseSettings = () =>
	useSettingsStore((state) => state.closeSettings);
export const useSetPreSettingsPath = () =>
	useSettingsStore((state) => state.setPreSettingsPath);
export const useConsumePreSettingsPath = () =>
	useSettingsStore((state) => state.consumePreSettingsPath);
