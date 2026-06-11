import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import stripAnsi from "strip-ansi";
import { getProcessEnvWithShellPath } from "../workspaces/utils/shell-env";

export const AI_CLI_AGENTS = ["claude", "codex", "qoder"] as const;

export type AiCliAgent = (typeof AI_CLI_AGENTS)[number];

export type AiCliFailureReason =
	| "cli_not_found"
	| "cli_error"
	| "empty_response"
	| "timeout";

export type AiCliResult =
	| { ok: true; text: string; agent: AiCliAgent }
	| { ok: false; reason: AiCliFailureReason; agent: AiCliAgent };

interface CliCommand {
	command: string;
	args: string[];
	stdin?: string;
	outputFile?: string;
}

interface RunProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

interface RunAiCliOptions {
	agent?: string | null;
	cwd?: string;
	timeoutMs?: number;
}

const DEFAULT_AGENT: AiCliAgent = "claude";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER_CHARS = 2 * 1024 * 1024;

export function normalizeAiCliAgent(value?: string | null): AiCliAgent {
	if (value === "codex" || value === "qoder" || value === "claude") {
		return value;
	}
	return DEFAULT_AGENT;
}

export function getConfiguredAiCliAgent(): AiCliAgent {
	const envAgent = process.env.SUPERSET_AI_CLI_AGENT;
	if (envAgent) {
		const agent = normalizeAiCliAgent(envAgent);
		console.log(`[ai-cli] agent from env SUPERSET_AI_CLI_AGENT="${envAgent}" → "${agent}"`);
		return agent;
	}

	const settingsRow = localDb.select().from(settings).get();
	const agent = normalizeAiCliAgent(settingsRow?.anthropicModel);
	console.log(`[ai-cli] agent from db anthropicModel="${settingsRow?.anthropicModel}" → "${agent}"`);
	return agent;
}

function buildCommands(agent: AiCliAgent, prompt: string): CliCommand[] {
	switch (agent) {
		case "claude":
			return [
				{
					command: "claude",
					args: [
						"--print",
						"--output-format",
						"text",
						"--no-session-persistence",
					],
					stdin: prompt,
				},
			];
		case "codex": {
			const outputFile = path.join(
				tmpdir(),
				`superset-ai-cli-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
			);
			return [
				{
					command: "codex",
					args: [
						"exec",
						"--sandbox",
						"read-only",
						"--ask-for-approval",
						"never",
						"--skip-git-repo-check",
						"--ephemeral",
						"--color",
						"never",
						"--output-last-message",
						outputFile,
						"-",
					],
					stdin: prompt,
					outputFile,
				},
			];
		}
		case "qoder":
			return ["qodercli", "qoder"].map((command) => ({
				command,
				args: [
					"--output-format",
					"text",
					"--max-turns=1",
					"--disallowed-tools=Write,Bash",
					"-p",
					prompt,
				],
			}));
	}
}

function runProcess(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env: Record<string, string>;
		stdin?: string;
		timeoutMs: number;
	},
): Promise<RunProcessResult> {
	return new Promise((resolve, reject) => {
		console.log(`[ai-cli] spawn: ${command} ${args.join(" ")}`);
		console.log(`[ai-cli]   cwd: ${options.cwd ?? "(none)"}`);
		console.log(`[ai-cli]   stdin: ${options.stdin ? `${options.stdin.length} chars` : "(none)"}`);
		console.log(`[ai-cli]   timeout: ${options.timeoutMs}ms`);
		console.log(`[ai-cli]   PATH: ${options.env.PATH?.split(":").slice(0, 5).join(":")}...`);

		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
		}, options.timeoutMs);

		child.stdout.on("data", (chunk: Buffer) => {
			if (stdout.length < MAX_BUFFER_CHARS) {
				stdout += chunk.toString("utf8");
			}
		});

		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < MAX_BUFFER_CHARS) {
				stderr += chunk.toString("utf8");
			}
		});

		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		child.on("close", (exitCode) => {
			clearTimeout(timeout);
			console.log(`[ai-cli] ${command} closed: exitCode=${exitCode} timedOut=${timedOut} stdout=${stdout.length}chars stderr=${stderr.length}chars`);
			if (stderr) {
				console.log(`[ai-cli]   stderr preview: ${stderr.slice(0, 300)}`);
			}
			if (timedOut) {
				reject(new Error("AI_CLI_TIMEOUT"));
				return;
			}
			resolve({ stdout, stderr, exitCode });
		});

		if (options.stdin) {
			child.stdin.end(options.stdin);
		} else {
			child.stdin.end();
		}
	});
}

function cleanText(text: string): string {
	return stripAnsi(text).trim();
}

export function stripMarkdownFences(text: string): string {
	return text.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "").trim();
}

async function readOutputText(command: CliCommand, stdout: string) {
	if (!command.outputFile) {
		return cleanText(stdout);
	}

	try {
		const fileText = await readFile(command.outputFile, "utf8");
		const cleaned = cleanText(fileText);
		if (cleaned) return cleaned;
	} catch {}

	return cleanText(stdout);
}

export async function runAiCli(
	prompt: string,
	options?: RunAiCliOptions,
): Promise<AiCliResult> {
	const agent = normalizeAiCliAgent(
		options?.agent ?? process.env.SUPERSET_AI_CLI_AGENT,
	);
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const env = await getProcessEnvWithShellPath();
	let lastFailure: AiCliFailureReason = "cli_error";

	const commands = buildCommands(agent, prompt);
	console.log(`[ai-cli] runAiCli: agent="${agent}" cwd="${options?.cwd}" timeoutMs=${timeoutMs} commands=${commands.length}`);
	console.log(`[ai-cli]   prompt preview: ${prompt.slice(0, 200)}...`);

	for (const command of commands) {
		try {
			const result = await runProcess(command.command, command.args, {
				cwd: options?.cwd,
				env,
				stdin: command.stdin,
				timeoutMs,
			});

			if (result.exitCode !== 0) {
				console.error(
					`[ai-cli] ${command.command} exited with code ${result.exitCode}:`,
					cleanText(result.stderr).slice(0, 500),
				);
				lastFailure = "cli_error";
				continue;
			}

			const text = await readOutputText(command, result.stdout);
			console.log(`[ai-cli] ${command.command} output: ${text.length} chars, outputFile=${command.outputFile ?? "(none)"}`);
			if (!text) {
				console.warn(`[ai-cli] ${command.command} returned empty response`);
				lastFailure = "empty_response";
				continue;
			}

			console.log(`[ai-cli] ✓ success via ${command.command}, response: ${text.slice(0, 200)}...`);
			return { ok: true, text, agent };
		} catch (error) {
			if (error instanceof Error && error.message === "AI_CLI_TIMEOUT") {
				console.error(`[ai-cli] ${command.command} timed out after ${timeoutMs}ms`);
				lastFailure = "timeout";
				break;
			}
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				console.warn(`[ai-cli] ${command.command} not found (ENOENT)`);
				lastFailure = "cli_not_found";
				continue;
			}
			console.error("[ai-cli] failed:", error);
			lastFailure = "cli_error";
		} finally {
			if (command.outputFile) {
				await rm(command.outputFile, { force: true }).catch(() => {});
			}
		}
	}

	console.error(`[ai-cli] all commands exhausted, final failure: ${lastFailure}`);
	return { ok: false, reason: lastFailure, agent };
}

export async function runAiCliWithTempCwd(
	prompt: string,
	options?: Omit<RunAiCliOptions, "cwd">,
): Promise<AiCliResult> {
	const tempDir = await mkdtemp(path.join(tmpdir(), "superset-ai-cli-"));
	console.log(`[ai-cli] runAiCliWithTempCwd: tempDir="${tempDir}" agent="${options?.agent}"`);
	try {
		const result = await runAiCli(prompt, { ...options, cwd: tempDir });
		console.log(`[ai-cli] runAiCliWithTempCwd result: ok=${result.ok}${result.ok ? "" : ` reason=${result.reason}`}`);
		return result;
	} finally {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		cleanupStaleCliProjects().catch(() => {});
	}
}

const STALE_PROJECT_PREFIX = "-private-tmp-superset-ai-cli-";

export async function cleanupStaleCliProjects(): Promise<number> {
	const projectsDir = path.join(homedir(), ".claude", "projects");
	let removed = 0;
	try {
		const entries = await readdir(projectsDir);
		const stale = entries.filter((e) => e.startsWith(STALE_PROJECT_PREFIX));
		for (const entry of stale) {
			await rm(path.join(projectsDir, entry), {
				recursive: true,
				force: true,
			}).catch(() => {});
			removed++;
		}
		if (removed > 0) {
			console.log(`[ai-cli] cleaned up ${removed} stale project directories`);
		}
	} catch {}
	return removed;
}
