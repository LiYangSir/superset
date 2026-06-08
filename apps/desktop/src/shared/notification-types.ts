/**
 * Shared notification types used by both main and renderer processes.
 * Kept in shared/ to avoid cross-boundary imports.
 */

export interface NotificationIds {
	paneId?: string;
	tabId?: string;
	workspaceId?: string;
}

export interface AgentLifecycleEvent extends NotificationIds {
	eventType:
		| "Start"
		| "Stop"
		| "PermissionRequest"
		| "SessionEnd"
		| "UserPrompt"
		| "ToolUse";
	userMessage?: string;
	toolName?: string;
	toolInput?: string;
}
