import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";
import { OPENCODE_CONFIG_DIR, OPENCODE_PLUGIN_DIR } from "./paths";

export const OPENCODE_PLUGIN_FILE = "superset-notify.js";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v8";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;

const OPENCODE_PLUGIN_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"opencode-plugin.template.js",
);
const CODEX_WRAPPER_EXEC_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"codex-wrapper-exec.template.sh",
);

export function getOpenCodePluginPath(): string {
	return path.join(OPENCODE_PLUGIN_DIR, OPENCODE_PLUGIN_FILE);
}

/** @see https://opencode.ai/docs/plugins */
export function getOpenCodeGlobalPluginPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "opencode", "plugin", OPENCODE_PLUGIN_FILE);
}

// ---------------------------------------------------------------------------
// Claude ~/.claude/settings.json direct merge
// ---------------------------------------------------------------------------

interface ClaudeHookConfig {
	type: "command";
	command: string;
	timeout?: number;
	[key: string]: unknown;
}

interface ClaudeHookDefinition {
	matcher?: string;
	hooks?: ClaudeHookConfig[];
	[key: string]: unknown;
}

interface ClaudeSettingsJson {
	hooks?: Record<string, ClaudeHookDefinition[]>;
	[key: string]: unknown;
}

const CLAUDE_DYNAMIC_NOTIFY_RELATIVE_PATH = `hooks/${NOTIFY_SCRIPT_NAME}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns the shell command written into Claude's global hook config.
 * The notify path is resolved at runtime from SUPERSET_HOME_DIR so one
 * shared ~/.claude/settings.json works for both dev and prod installs.
 */
export function getClaudeManagedHookCommand(): string {
	return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${CLAUDE_DYNAMIC_NOTIFY_RELATIVE_PATH}" ] && SUPERSET_AGENT_ID=claude "$SUPERSET_HOME_DIR/${CLAUDE_DYNAMIC_NOTIFY_RELATIVE_PATH}" || true`;
}

function isManagedClaudeHookCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return (
		command?.includes(notifyScriptPath) ||
		command?.includes(
			`$SUPERSET_HOME_DIR/${CLAUDE_DYNAMIC_NOTIFY_RELATIVE_PATH}`,
		) ||
		isSupersetManagedHookCommand(command, NOTIFY_SCRIPT_NAME)
	);
}

function readExistingClaudeSettings(
	globalPath: string,
): ClaudeSettingsJson | null {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				"[agent-setup] Expected ~/.claude/settings.json to contain a JSON object; skipping Claude hook merge",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			"[agent-setup] Could not parse existing ~/.claude/settings.json; skipping Claude hook merge:",
			error,
		);
		return null;
	}
}

function removeManagedHooksFromDefinition(
	definition: ClaudeHookDefinition,
	isManagedCommand: (command: string | undefined) => boolean,
): ClaudeHookDefinition | null {
	if (!Array.isArray(definition.hooks)) {
		return definition;
	}

	const filteredHooks = definition.hooks.filter(
		(hook) => !isManagedCommand(hook.command),
	);

	if (filteredHooks.length === definition.hooks.length) {
		return definition;
	}

	if (filteredHooks.length === 0) {
		return null;
	}

	return {
		...definition,
		hooks: filteredHooks,
	};
}

export function getClaudeGlobalSettingsJsonPath(): string {
	return path.join(os.homedir(), ".claude", "settings.json");
}

/**
 * Reads existing ~/.claude/settings.json, merges Superset hook definitions
 * (identified by notify script path), and preserves user-defined hooks
 * and all non-hook settings.
 */
export function getClaudeGlobalSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	const globalPath = getClaudeGlobalSettingsJsonPath();
	const existing = readExistingClaudeSettings(globalPath);
	if (!existing) return null;
	const managedHookCommand = getClaudeManagedHookCommand();

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const managedEvents: Array<{
		eventName: string;
		definition: ClaudeHookDefinition;
	}> = [
		{
			eventName: "SessionStart",
			definition: { hooks: [{ type: "command", command: managedHookCommand }] },
		},
		{
			eventName: "SessionEnd",
			definition: { hooks: [{ type: "command", command: managedHookCommand }] },
		},
		{
			eventName: "UserPromptSubmit",
			definition: { hooks: [{ type: "command", command: managedHookCommand }] },
		},
		{
			eventName: "Stop",
			definition: { hooks: [{ type: "command", command: managedHookCommand }] },
		},
		{
			eventName: "PostToolUse",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "PostToolUseFailure",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "PermissionRequest",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
	];

	for (const { eventName, definition } of managedEvents) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.flatMap((def: ClaudeHookDefinition) => {
				const cleaned = removeManagedHooksFromDefinition(def, (command) =>
					isManagedClaudeHookCommand(command, notifyScriptPath),
				);
				return cleaned ? [cleaned] : [];
			});
			filtered.push(definition);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [definition];
		}
	}

	return JSON.stringify(existing, null, 2);
}

/**
 * Writes Superset hook definitions directly into ~/.claude/settings.json.
 * This ensures hooks work regardless of whether the binary wrapper is in PATH.
 */
export function createClaudeSettingsJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getClaudeGlobalSettingsJsonPath();
	const content = getClaudeGlobalSettingsJsonContent(notifyScriptPath);
	if (content === null) return;

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Claude settings.json`,
	);
}

export function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(OPENCODE_PLUGIN_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

/**
 * Pass-through wrapper for Claude. Hooks live in ~/.claude/settings.json
 * (createClaudeSettingsJson); the wrapper exists only to forward SUPERSET_*
 * env vars into the agent process tree.
 */
export function createClaudeWrapper(): void {
	const script = buildWrapperScript("claude", `exec "$REAL_BIN" "$@"`, {
		agentId: "claude",
	});
	createWrapper("claude", script);
}

export function createCodexWrapper(): void {
	const notifyPath = getNotifyScriptPath();
	const script = buildWrapperScript(
		"codex",
		buildCodexWrapperExecLine(notifyPath),
		{ agentId: "codex" },
	);
	createWrapper("codex", script);
}

export function buildCodexWrapperExecLine(notifyPath: string): string {
	const template = fs.readFileSync(CODEX_WRAPPER_EXEC_TEMPLATE_PATH, "utf-8");
	return template.replaceAll("{{NOTIFY_PATH}}", notifyPath);
}

export function createOpenCodePlugin(): void {
	const pluginPath = getOpenCodePluginPath();
	const notifyPath = getNotifyScriptPath();
	const content = getOpenCodePluginContent(notifyPath);
	const changed = writeFileIfChanged(pluginPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} OpenCode plugin`,
	);
}

export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		if (!fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		if (content.includes(OPENCODE_PLUGIN_SIGNATURE)) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

export function createOpenCodeWrapper(): void {
	const script = buildWrapperScript(
		"opencode",
		`export OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR}"\nexec "$REAL_BIN" "$@"`,
		{ agentId: "opencode" },
	);
	createWrapper("opencode", script);
}
