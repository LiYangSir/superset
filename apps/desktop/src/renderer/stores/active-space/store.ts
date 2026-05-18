import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveSpaceState {
	activeSpaceId: string | null;
	setActiveSpaceId: (id: string) => void;
}

export const useActiveSpaceStore = create<ActiveSpaceState>()(
	persist(
		(set) => ({
			activeSpaceId: null,
			setActiveSpaceId: (id) => set({ activeSpaceId: id }),
		}),
		{ name: "active-space-store", version: 1 },
	),
);

export const useActiveSpaceId = () =>
	useActiveSpaceStore((s) => s.activeSpaceId);
export const useSetActiveSpaceId = () =>
	useActiveSpaceStore((s) => s.setActiveSpaceId);
