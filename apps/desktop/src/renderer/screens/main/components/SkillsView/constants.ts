export type SkillsTab = "dashboard" | "my-skills" | "install" | "workspaces";
export type SkillsViewMode = "grid" | "list";
export type InstallTab = "market" | "local" | "git";

export const SKILLS_TABS = [
	{ id: "dashboard", label: "Dashboard" },
	{ id: "my-skills", label: "My Skills" },
	{ id: "install", label: "Install" },
	{ id: "workspaces", label: "Workspaces" },
] as const;

export const SOURCE_TYPES = [
	{ id: "local", label: "Local", color: "#6b7280" },
	{ id: "import", label: "Import", color: "#8b5cf6" },
	{ id: "git", label: "Git", color: "#f97316" },
	{ id: "skillssh", label: "skills.sh", color: "#3b82f6" },
	{ id: "memory", label: "Memory", color: "#10b981" },
] as const;

export const UPDATE_STATUSES = [
	{ id: "up_to_date", label: "Up to date", color: "#22c55e" },
	{ id: "update_available", label: "Update available", color: "#f59e0b" },
	{ id: "unknown", label: "Unknown", color: "#6b7280" },
	{ id: "checking", label: "Checking...", color: "#3b82f6" },
	{ id: "updating", label: "Updating...", color: "#3b82f6" },
	{ id: "error", label: "Error", color: "#ef4444" },
	{ id: "local_only", label: "Local only", color: "#6b7280" },
	{ id: "source_missing", label: "Source missing", color: "#ef4444" },
] as const;

export const INSTALL_TABS = [
	{ id: "market", label: "Market" },
	{ id: "local", label: "Local" },
	{ id: "git", label: "Git" },
] as const;
