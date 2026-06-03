import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const ACTIVE_SPACE_STORE_KEY = "active-space-store";
const LAST_ACTIVE_SPACE_ID_KEY = "lastActiveSpaceId";

const readPersistedStoreActiveSpaceId = () => {
	try {
		const raw = window.localStorage.getItem(ACTIVE_SPACE_STORE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { state?: { activeSpaceId?: unknown } };
		return typeof parsed.state?.activeSpaceId === "string"
			? parsed.state.activeSpaceId
			: null;
	} catch {
		return null;
	}
};

const readLastActiveSpaceId = () => {
	try {
		return window.localStorage.getItem(LAST_ACTIVE_SPACE_ID_KEY);
	} catch {
		return null;
	}
};

const writeLastActiveSpaceId = (id: string) => {
	try {
		window.localStorage.setItem(LAST_ACTIVE_SPACE_ID_KEY, id);
	} catch {
		return;
	}
};

interface ActiveSpaceState {
	activeSpaceId: string | null;
	setActiveSpaceId: (id: string) => void;
}

export const useActiveSpaceStore = create<ActiveSpaceState>()(
	persist(
		(set) => ({
			activeSpaceId:
				readLastActiveSpaceId() ?? readPersistedStoreActiveSpaceId(),
			setActiveSpaceId: (id) => {
				writeLastActiveSpaceId(id);
				set({ activeSpaceId: id });
			},
		}),
		{
			name: ACTIVE_SPACE_STORE_KEY,
			version: 1,
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({ activeSpaceId: state.activeSpaceId }),
			merge: (persistedState, currentState) => {
				const persistedActiveSpaceId =
					typeof persistedState === "object" &&
					persistedState !== null &&
					"activeSpaceId" in persistedState
						? (persistedState as Partial<ActiveSpaceState>).activeSpaceId
						: null;

				return {
					...currentState,
					...(persistedState as Partial<ActiveSpaceState>),
					activeSpaceId:
						persistedActiveSpaceId ??
						currentState.activeSpaceId ??
						readLastActiveSpaceId(),
				};
			},
			onRehydrateStorage: () => (state) => {
				if (state?.activeSpaceId) writeLastActiveSpaceId(state.activeSpaceId);
			},
		},
	),
);

export const useActiveSpaceId = () =>
	useActiveSpaceStore((s) => s.activeSpaceId);
export const useSetActiveSpaceId = () =>
	useActiveSpaceStore((s) => s.setActiveSpaceId);
export const hasPersistedActiveSpaceId = () =>
	Boolean(readLastActiveSpaceId() ?? readPersistedStoreActiveSpaceId());

/**
 * `true` once zustand has finished merging the persisted value from
 * localStorage. Components that decide a fallback (e.g. "no active space →
 * pick Default") MUST gate on this; otherwise they race with hydration and
 * overwrite the user's last selection.
 */
export function useActiveSpaceHydrated(): boolean {
	const [hydrated, setHydrated] = useState(() =>
		useActiveSpaceStore.persist.hasHydrated(),
	);
	useEffect(() => {
		const unsubFinish = useActiveSpaceStore.persist.onFinishHydration(() => {
			setHydrated(true);
		});
		// Cover the case where hydration finished before this effect ran.
		if (useActiveSpaceStore.persist.hasHydrated()) setHydrated(true);
		return () => {
			unsubFinish();
		};
	}, []);
	return hydrated;
}
