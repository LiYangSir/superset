import type { SelectAgentActivity } from "@superset/local-db";
import { useMemo } from "react";
import { ActivityCard } from "../ActivityCard";

interface ActivityGroup {
	key: string;
	tabName: string;
	latest: SelectAgentActivity;
}

interface ActivityListProps {
	activities: SelectAgentActivity[];
	onArchive?: (id: string) => void;
}

export function ActivityList({ activities, onArchive }: ActivityListProps) {
	const groups = useMemo(() => {
		const map = new Map<string, ActivityGroup>();

		for (const a of activities) {
			const key = a.paneId || a.tabId || a.id;
			const existing = map.get(key);
			if (existing) {
				if (a.startedAt > existing.latest.startedAt) {
					existing.latest = a;
					existing.tabName = a.tabName || a.presetName || "Agent";
				}
			} else {
				map.set(key, {
					key,
					tabName: a.tabName || a.presetName || "Agent",
					latest: a,
				});
			}
		}

		return [...map.values()].sort((a, b) => {
			const aActive = a.latest.status === "in_progress" ? 1 : 0;
			const bActive = b.latest.status === "in_progress" ? 1 : 0;
			if (aActive !== bActive) return bActive - aActive;
			return b.latest.startedAt - a.latest.startedAt;
		});
	}, [activities]);

	if (activities.length === 0) {
		return (
			<div className="px-3 py-8 text-center text-xs text-muted-foreground">
				No agent activity yet
			</div>
		);
	}

	return (
		<div className="max-h-[60vh] overflow-y-auto">
			{groups.map((g) => (
				<ActivityCard
					key={g.latest.id}
					activity={g.latest}
					onArchive={onArchive}
				/>
			))}
		</div>
	);
}
