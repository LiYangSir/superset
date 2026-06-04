import { describe, expect, it, vi } from "vitest";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { AgentLaunchTabsAdapter } from "./types";

vi.mock("lib/posthog", () => ({
	posthog: {
		capture: vi.fn(() => {}),
	},
	initPostHog: vi.fn(() => {}),
}));

const { launchAgentSession, selectAgentLaunchAdapter } = await import(
	"./agent-session-orchestrator"
);

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function createContext({
	tabs,
	write,
}: {
	tabs: AgentLaunchTabsAdapter;
	write?: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
}) {
	return {
		source: "command-watcher" as const,
		tabs,
		createOrAttach: vi.fn(async () => ({})),
		write: write ?? vi.fn(async () => ({})),
		captureEvent: vi.fn(() => {}),
	};
}

describe("selectAgentLaunchAdapter", () => {
	it("picks terminal adapter for terminal requests", () => {
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			terminal: { command: "echo hello" },
		};

		expect(selectAgentLaunchAdapter(request)).toBe("terminal");
	});

	it("picks chat adapter for chat requests", () => {
		const request: AgentLaunchRequest = {
			kind: "chat",
			workspaceId: "ws-1",
			chat: {},
		};

		expect(selectAgentLaunchAdapter(request)).toBe("chat");
	});
});

describe("launchAgentSession", () => {
	it("deduplicates concurrent launches with the same idempotency key", async () => {
		const gate = createDeferred();
		const addTerminalTab = vi.fn(() => ({ tabId: "tab-1", paneId: "pane-1" }));
		const tabs: AgentLaunchTabsAdapter = {
			getPane: vi.fn(() => undefined),
			getTab: vi.fn(() => undefined),
			addTerminalTab,
			addTerminalPane: vi.fn(() => "pane-2"),
			removePane: vi.fn(() => {}),
			setTabAutoTitle: vi.fn(() => {}),
			addChatTab: vi.fn(() => ({ tabId: "chat-tab", paneId: "chat-pane" })),
			addChatPane: vi.fn(() => "chat-pane-2"),
			switchChatSession: vi.fn(() => {}),
			setChatLaunchConfig: vi.fn(() => {}),
		};

		const context = createContext({
			tabs,
			write: async () => {
				await gate.promise;
			},
		});
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			idempotencyKey: "idem-concurrent",
			terminal: { command: "echo hello" },
		};

		const first = launchAgentSession(request, context);
		const second = launchAgentSession(request, context);

		gate.resolve();
		const [firstResult, secondResult] = await Promise.all([first, second]);

		expect(addTerminalTab).toHaveBeenCalledTimes(1);
		expect(firstResult.status).toBe("running");
		expect(secondResult.status).toBe("running");
		expect(firstResult.tabId).toBe("tab-1");
		expect(secondResult.tabId).toBe("tab-1");
	});

	it("rolls back pane when terminal launch fails", async () => {
		const removePane = vi.fn(() => {});
		const tabs: AgentLaunchTabsAdapter = {
			getPane: vi.fn(() => undefined),
			getTab: vi.fn(() => undefined),
			addTerminalTab: vi.fn(() => ({ tabId: "tab-2", paneId: "pane-2" })),
			addTerminalPane: vi.fn(() => "pane-3"),
			removePane,
			setTabAutoTitle: vi.fn(() => {}),
			addChatTab: vi.fn(() => ({ tabId: "chat-tab", paneId: "chat-pane" })),
			addChatPane: vi.fn(() => "chat-pane-2"),
			switchChatSession: vi.fn(() => {}),
			setChatLaunchConfig: vi.fn(() => {}),
		};

		const context = createContext({
			tabs,
			write: async () => {
				throw new Error("terminal write failed");
			},
		});

		const result = await launchAgentSession(
			{
				kind: "terminal",
				workspaceId: "ws-1",
				terminal: { command: "echo fail" },
			},
			context,
		);

		expect(removePane).toHaveBeenCalledWith("pane-2");
		expect(result.status).toBe("failed");
		expect(result.error).toContain("terminal write failed");
	});
});
