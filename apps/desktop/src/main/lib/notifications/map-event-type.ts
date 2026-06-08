export function mapEventType(
	eventType: string | undefined,
):
	| "Start"
	| "Stop"
	| "PermissionRequest"
	| "SessionEnd"
	| "UserPrompt"
	| "ToolUse"
	| null {
	if (!eventType) {
		return null;
	}
	if (eventType === "UserPromptSubmit" || eventType === "userPromptSubmitted") {
		return "UserPrompt";
	}
	if (
		eventType === "Start" ||
		eventType === "SessionStart" ||
		eventType === "PostToolUse" ||
		eventType === "PostToolUseFailure" ||
		eventType === "BeforeAgent" ||
		eventType === "AfterTool" ||
		eventType === "sessionStart" ||
		eventType === "postToolUse"
	) {
		return "Start";
	}
	if (
		eventType === "PermissionRequest" ||
		eventType === "Notification" ||
		eventType === "preToolUse"
	) {
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
