export interface TaskInfo {
	id: string;
	subject: string;
	status: "pending" | "in_progress" | "completed";
	description?: string;
}

export interface SubagentInfo {
	id: string;
	description?: string;
	subagentType?: string;
	status: "in_progress" | "completed" | "failed";
	startedAt: number;
	endedAt?: number;
}

export interface ActivityMetadata {
	subagents?: SubagentInfo[];
	tasks?: TaskInfo[];
	activeTaskId?: string;
	toolCount?: number;
	lastTool?: string;
	lastFailure?: {
		toolName: string;
		summary: string;
		at: number;
	};
}

export function parseMetadata(
	raw: string | null | undefined,
): ActivityMetadata {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as ActivityMetadata;
	} catch {
		return {};
	}
}

export function getActiveTask(meta: ActivityMetadata): TaskInfo | undefined {
	if (!meta.tasks?.length) return undefined;
	if (meta.activeTaskId) {
		const direct = meta.tasks.find((t) => t.id === meta.activeTaskId);
		if (direct) return direct;
	}
	return meta.tasks.find((t) => t.status === "in_progress");
}

export function countTaskProgress(meta: ActivityMetadata): {
	total: number;
	completed: number;
	inProgress: number;
} {
	const total = meta.tasks?.length ?? 0;
	let completed = 0;
	let inProgress = 0;
	for (const t of meta.tasks ?? []) {
		if (t.status === "completed") completed++;
		else if (t.status === "in_progress") inProgress++;
	}
	return { total, completed, inProgress };
}

export function countSubagentProgress(meta: ActivityMetadata): {
	total: number;
	running: number;
	done: number;
	failed: number;
} {
	const list = meta.subagents ?? [];
	let running = 0;
	let done = 0;
	let failed = 0;
	for (const sa of list) {
		if (sa.status === "in_progress") running++;
		else if (sa.status === "completed") done++;
		else if (sa.status === "failed") failed++;
	}
	return { total: list.length, running, done, failed };
}
