export interface TaskInfo {
	id: string;
	subject: string;
	status: "pending" | "in_progress" | "completed";
	description?: string;
}

export interface SubagentInfo {
	id: string;
	description?: string;
	status: "in_progress" | "completed" | "failed";
	startedAt: number;
	endedAt?: number;
}

export interface ActivityMetadata {
	subagents?: SubagentInfo[];
	tasks?: TaskInfo[];
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
