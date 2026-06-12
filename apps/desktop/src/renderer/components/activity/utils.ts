import type { SelectAgentActivity } from "@superset/local-db";
import { type ActivityMetadata, getActiveTask } from "./types";

export function formatDuration(ms: number): string {
	if (ms < 1000) return "<1s";
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}m ${remainingSeconds}s`
			: `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Single source of truth for activity headline text. Order:
 *   1. The currently in-progress todo subject (richest signal while running).
 *   2. AI-generated summary (only present after completion).
 *   3. The user's original message.
 *   4. The activity title.
 *   5. A neutral fallback.
 */
export function getActivityDisplayText(
	activity: SelectAgentActivity,
	metadata: ActivityMetadata,
): string {
	if (activity.status === "in_progress") {
		const active = getActiveTask(metadata);
		if (active) return active.subject;
	}
	return (
		activity.summary ||
		activity.userMessage ||
		activity.title ||
		(activity.status === "in_progress" ? "Working..." : "Completed")
	);
}
