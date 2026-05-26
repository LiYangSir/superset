import type { SelectTask } from "@superset/local-db";

interface TaskFilters {
	search: string;
	filterPriority: string | null;
	filterStatus: string | null;
}

export function filterTasks(
	tasks: SelectTask[],
	filters: TaskFilters,
): SelectTask[] {
	let result = tasks;

	if (filters.search) {
		const q = filters.search.toLowerCase();
		result = result.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				t.slug.toLowerCase().includes(q),
		);
	}

	if (filters.filterPriority) {
		result = result.filter((t) => t.priority === filters.filterPriority);
	}

	if (filters.filterStatus) {
		result = result.filter((t) => t.status === filters.filterStatus);
	}

	return result;
}
