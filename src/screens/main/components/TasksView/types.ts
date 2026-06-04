import type { SelectTask, SelectTaskSubtask } from "@superset/local-db";

export type TaskWithDetails = SelectTask & {
	subtasks: SelectTaskSubtask[];
	comments: Array<{
		id: string;
		taskId: string;
		author: string;
		text: string;
		createdAt: number;
	}>;
};
