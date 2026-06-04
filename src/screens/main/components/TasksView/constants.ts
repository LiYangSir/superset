export const TASK_STATUSES = [
	{ id: "backlog", label: "Backlog", color: "#6B7280" },
	{ id: "todo", label: "Todo", color: "#E2E2E9" },
	{ id: "in_progress", label: "In Progress", color: "#5E6AD2" },
	{ id: "in_review", label: "In Review", color: "#F59E0B" },
	{ id: "done", label: "Done", color: "#26B59A" },
	{ id: "cancelled", label: "Cancelled", color: "#4B4B5A" },
] as const;

export const TASK_PRIORITIES = [
	{ id: "urgent", label: "Urgent", color: "#E5534B" },
	{ id: "high", label: "High", color: "#E8704A" },
	{ id: "medium", label: "Medium", color: "#D6A96A" },
	{ id: "low", label: "Low", color: "#6B7280" },
	{ id: "none", label: "No priority", color: "#4B4B5A" },
] as const;

export const LABEL_COLORS = [
	"#E5534B",
	"#5E6AD2",
	"#26B59A",
	"#D6A96A",
	"#A78BFA",
	"#E8704A",
	"#F59E0B",
	"#06B6D4",
] as const;

export type TaskViewMode = "kanban" | "list";
