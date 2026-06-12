import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("getNotifyScriptContent", () => {
	it("prefers Mastra resourceId over internal session_id", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('RESOURCE_ID=$(echo "$INPUT"');
		expect(script).toContain(
			"SESSION_ID=" + "\u0024{RESOURCE_ID:-$HOOK_SESSION_ID}",
		);
		expect(script).toContain('--data-urlencode "resourceId=$RESOURCE_ID"');
		expect(script).toContain(
			'--data-urlencode "hookSessionId=$HOOK_SESSION_ID"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE userMessage=$USER_MESSAGE sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID",
		);
	});

	it("captures tool input for any tool and forwards toolPhase", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('--data-urlencode "toolPhase=$TOOL_PHASE"');
		expect(script).toContain("PreToolUse|preToolUse");
		expect(script).toContain("PostToolUse|postToolUse|AfterTool");
		expect(script).toContain("jq -c '.tool_input // .toolInput // empty'");
	});
});
