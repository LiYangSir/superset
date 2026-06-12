import { describe, expect, it } from "bun:test";
import { mapEventType } from "./map-event-type";

describe("notifications/server", () => {
	describe("mapEventType", () => {
		it("should map 'Start' to 'Start'", () => {
			expect(mapEventType("Start")).toBe("Start");
		});

		it("should map 'UserPromptSubmit' to 'UserPrompt'", () => {
			expect(mapEventType("UserPromptSubmit")).toBe("UserPrompt");
		});

		it("should map 'Stop' to 'Stop'", () => {
			expect(mapEventType("Stop")).toBe("Stop");
		});

		it("should map 'agent-turn-complete' to 'Stop'", () => {
			expect(mapEventType("agent-turn-complete")).toBe("Stop");
		});

		it("should map 'PostToolUse' to 'ToolUse'", () => {
			expect(mapEventType("PostToolUse")).toBe("ToolUse");
		});

		it("should map 'PostToolUseFailure' to 'ToolUse'", () => {
			expect(mapEventType("PostToolUseFailure")).toBe("ToolUse");
		});

		it("should map 'PreToolUse' to 'ToolStart'", () => {
			expect(mapEventType("PreToolUse")).toBe("ToolStart");
		});

		it("should map 'preToolUse' to 'ToolStart'", () => {
			expect(mapEventType("preToolUse")).toBe("ToolStart");
		});

		it("should map Gemini 'BeforeAgent' to 'Start'", () => {
			expect(mapEventType("BeforeAgent")).toBe("Start");
		});

		it("should map Gemini 'AfterAgent' to 'Stop'", () => {
			expect(mapEventType("AfterAgent")).toBe("Stop");
		});

		it("should map Gemini 'AfterTool' to 'ToolUse'", () => {
			expect(mapEventType("AfterTool")).toBe("ToolUse");
		});

		it("should map 'PermissionRequest' to 'PermissionRequest'", () => {
			expect(mapEventType("PermissionRequest")).toBe("PermissionRequest");
		});

		it("should map Factory Droid 'Notification' to 'PermissionRequest'", () => {
			expect(mapEventType("Notification")).toBe("PermissionRequest");
		});

		it("should return null for unknown event types (forward compatibility)", () => {
			expect(mapEventType("UnknownEvent")).toBeNull();
			expect(mapEventType("FutureEvent")).toBeNull();
			expect(mapEventType("SomeNewHook")).toBeNull();
		});

		it("should return null for undefined eventType (not default to Stop)", () => {
			expect(mapEventType(undefined)).toBeNull();
		});

		it("should return null for empty string eventType", () => {
			expect(mapEventType("")).toBeNull();
		});
	});
});
