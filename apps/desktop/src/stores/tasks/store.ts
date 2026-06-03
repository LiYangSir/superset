import type { TaskViewMode } from "renderer/screens/main/components/TasksView/constants";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface TasksViewState {
	viewMode: TaskViewMode;
	selectedTaskId: string | null;
	search: string;
	filterPriority: string | null;
	filterStatus: string | null;
	showNewTaskDialog: boolean;

	setViewMode: (mode: TaskViewMode) => void;
	setSelectedTaskId: (id: string | null) => void;
	setSearch: (search: string) => void;
	setFilterPriority: (priority: string | null) => void;
	setFilterStatus: (status: string | null) => void;
	setShowNewTaskDialog: (show: boolean) => void;
	clearFilters: () => void;
}

export const useTasksViewStore = create<TasksViewState>()(
	devtools(
		persist(
			(set) => ({
				viewMode: "kanban",
				selectedTaskId: null,
				search: "",
				filterPriority: null,
				filterStatus: null,
				showNewTaskDialog: false,

				setViewMode: (mode) => set({ viewMode: mode }),
				setSelectedTaskId: (id) => set({ selectedTaskId: id }),
				setSearch: (search) => set({ search }),
				setFilterPriority: (priority) => set({ filterPriority: priority }),
				setFilterStatus: (status) => set({ filterStatus: status }),
				setShowNewTaskDialog: (show) => set({ showNewTaskDialog: show }),
				clearFilters: () =>
					set({ search: "", filterPriority: null, filterStatus: null }),
			}),
			{
				name: "tasks-view-state",
				partialize: (state) => ({ viewMode: state.viewMode }),
			},
		),
		{ name: "tasks-view" },
	),
);
