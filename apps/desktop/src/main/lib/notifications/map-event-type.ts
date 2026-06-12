export type MappedEventType =
	| "Start"
	| "Stop"
	| "PermissionRequest"
	| "SessionEnd"
	| "UserPrompt"
	| "ToolUse"
	| "ToolStart";

export function mapEventType(
	eventType: string | undefined,
): MappedEventType | null {
	if (!eventType) {
		return null;
	}
	if (eventType === "UserPromptSubmit" || eventType === "userPromptSubmitted") {
		return "UserPrompt";
	}
	if (
		eventType === "Start" ||
		eventType === "SessionStart" ||
		eventType === "BeforeAgent" ||
		eventType === "sessionStart"
	) {
		return "Start";
	}
	if (
		eventType === "PostToolUse" ||
		eventType === "PostToolUseFailure" ||
		eventType === "AfterTool" ||
		eventType === "postToolUse"
	) {
		return "ToolUse";
	}
	if (eventType === "PreToolUse" || eventType === "preToolUse") {
		return "ToolStart";
	}
	if (eventType === "PermissionRequest" || eventType === "Notification") {
		return "PermissionRequest";
	}
	if (eventType === "SessionEnd" || eventType === "sessionEnd") {
		return "SessionEnd";
	}
	if (
		eventType === "Stop" ||
		eventType === "agent-turn-complete" ||
		eventType === "AfterAgent"
	) {
		return "Stop";
	}
	return null;
}
