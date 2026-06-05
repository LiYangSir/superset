import type {
	InstallTab,
	SkillsTab,
	SkillsViewMode,
} from "renderer/screens/main/components/SkillsView/constants";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface SkillsViewState {
	activeTab: SkillsTab;
	viewMode: SkillsViewMode;
	selectedSkillId: string | null;
	search: string;
	filterSourceType: string | null;
	filterTags: string[];
	viewedPresetId: string | null;
	installTab: InstallTab;
	showNewPresetDialog: boolean;
	multiSelectMode: boolean;
	selectedSkillIds: string[];

	setActiveTab: (tab: SkillsTab) => void;
	setViewMode: (mode: SkillsViewMode) => void;
	setSelectedSkillId: (id: string | null) => void;
	setSearch: (search: string) => void;
	setFilterSourceType: (type: string | null) => void;
	setFilterTags: (tags: string[]) => void;
	setViewedPresetId: (id: string | null) => void;
	setInstallTab: (tab: InstallTab) => void;
	setShowNewPresetDialog: (show: boolean) => void;
	setMultiSelectMode: (mode: boolean) => void;
	setSelectedSkillIds: (ids: string[]) => void;
	toggleSkillSelection: (id: string) => void;
	clearFilters: () => void;
}

export const useSkillsViewStore = create<SkillsViewState>()(
	devtools(
		persist(
			(set) => ({
				activeTab: "my-skills",
				viewMode: "grid",
				selectedSkillId: null,
				search: "",
				filterSourceType: null,
				filterTags: [],
				viewedPresetId: null,
				installTab: "market",
				showNewPresetDialog: false,
				multiSelectMode: false,
				selectedSkillIds: [],

				setActiveTab: (tab) => set({ activeTab: tab }),
				setViewMode: (mode) => set({ viewMode: mode }),
				setSelectedSkillId: (id) => set({ selectedSkillId: id }),
				setSearch: (search) => set({ search }),
				setFilterSourceType: (type) => set({ filterSourceType: type }),
				setFilterTags: (tags) => set({ filterTags: tags }),
				setViewedPresetId: (id) => set({ viewedPresetId: id }),
				setInstallTab: (tab) => set({ installTab: tab }),
				setShowNewPresetDialog: (show) => set({ showNewPresetDialog: show }),
				setMultiSelectMode: (mode) =>
					set({ multiSelectMode: mode, selectedSkillIds: [] }),
				setSelectedSkillIds: (ids) => set({ selectedSkillIds: ids }),
				toggleSkillSelection: (id) =>
					set((state) => ({
						selectedSkillIds: state.selectedSkillIds.includes(id)
							? state.selectedSkillIds.filter((sid) => sid !== id)
							: [...state.selectedSkillIds, id],
					})),
				clearFilters: () =>
					set({
						search: "",
						filterSourceType: null,
						filterTags: [],
					}),
			}),
			{
				name: "skills-view-state",
				partialize: (state) => ({
					activeTab: state.activeTab,
					viewMode: state.viewMode,
					viewedPresetId: state.viewedPresetId,
					installTab: state.installTab,
				}),
			},
		),
		{ name: "skills-view" },
	),
);
