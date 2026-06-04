import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapOpenWorktree } from "./bootstrap-open-worktree";

describe("bootstrapOpenWorktree", () => {
	const originalConsoleError = console.error;

	beforeEach(() => {
		console.error = vi.fn(() => undefined);
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	it("returns create_or_attach_failed when createOrAttach fails", async () => {
		const writeToTerminal = vi.fn(async () => ({}));

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: vi.fn(() => {}),
			createOrAttach: async () => {
				throw new Error("attach failed");
			},
			writeToTerminal,
		});

		expect(error).toBe("create_or_attach_failed");
		expect(writeToTerminal).not.toHaveBeenCalled();
	});

	it("returns write_initial_commands_failed when write fails", async () => {
		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: vi.fn(() => {}),
			createOrAttach: async () => ({}),
			writeToTerminal: async () => {
				throw new Error("write failed");
			},
		});

		expect(error).toBe("write_initial_commands_failed");
	});

	it("returns null when setup command writes successfully", async () => {
		const writeToTerminal = vi.fn(async () => ({}));

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: vi.fn(() => {}),
			createOrAttach: async () => ({}),
			writeToTerminal,
		});

		expect(error).toBeNull();
		expect(writeToTerminal).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "echo setup\n",
			throwOnError: true,
		});
	});

	it("returns null when there are no initial commands", async () => {
		const writeToTerminal = vi.fn(async () => ({}));

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: null,
			},
			addTab: () => ({ tabId: "tab-1", paneId: "pane-1" }),
			setTabAutoTitle: vi.fn(() => {}),
			createOrAttach: async () => ({}),
			writeToTerminal,
		});

		expect(error).toBeNull();
		expect(writeToTerminal).not.toHaveBeenCalled();
	});
});
