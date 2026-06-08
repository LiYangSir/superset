import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface ClaudeMessage {
	role?: string;
	type?: string;
	message?: {
		role?: string;
		content?:
			| string
			| Array<{
					type: string;
					text?: string;
					name?: string;
					input?: unknown;
					content?: string | Array<{ type: string; text?: string }>;
					thinking?: string;
			  }>;
	};
	content?:
		| string
		| Array<{
				type: string;
				text?: string;
				name?: string;
				input?: unknown;
				content?: string | Array<{ type: string; text?: string }>;
				thinking?: string;
		  }>;
}

export interface ParsedToolCall {
	tool: string;
	input: string;
	output: string;
}

export interface ParsedTurn {
	turnIndex: number;
	userText: string | null;
	agentText: string | null;
	toolCalls: ParsedToolCall[];
	agentThinking: string | null;
	errorSignatures: string[];
	tags: string[];
}

function extractTextContent(
	content: string | Array<{ type: string; text?: string }> | undefined,
): string {
	if (!content) return "";
	if (typeof content === "string") return content;
	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text!)
		.join("\n");
}

export function readLatestClaudeSession(projectPath?: string): string | null {
	const claudeDir = path.join(os.homedir(), ".claude");

	if (!fs.existsSync(claudeDir)) return null;

	const projectsDir = path.join(claudeDir, "projects");
	if (!fs.existsSync(projectsDir)) return null;

	let targetDir: string | null = null;

	if (projectPath) {
		const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
		const normalizedProjectPath = projectPath.replace(/\//g, "-");
		let bestMatch: string | null = null;
		let bestMatchLength = 0;

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const decoded = entry.name.replace(/-/g, "/");
			if (
				decoded === projectPath ||
				entry.name === normalizedProjectPath ||
				entry.name === `-${normalizedProjectPath.slice(1)}`
			) {
				bestMatch = path.join(projectsDir, entry.name);
				break;
			}
			if (projectPath.startsWith(decoded) && decoded.length > bestMatchLength) {
				bestMatchLength = decoded.length;
				bestMatch = path.join(projectsDir, entry.name);
			}
		}

		targetDir = bestMatch;
	}

	if (!targetDir) {
		const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
		let latestDir: string | null = null;
		let latestMtime = 0;

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dirPath = path.join(projectsDir, entry.name);
			try {
				const stat = fs.statSync(dirPath);
				if (stat.mtimeMs > latestMtime) {
					latestMtime = stat.mtimeMs;
					latestDir = dirPath;
				}
			} catch {}
		}

		targetDir = latestDir;
	}

	if (!targetDir) return null;

	const jsonlFiles = fs
		.readdirSync(targetDir)
		.filter((f) => f.endsWith(".jsonl"))
		.map((f) => ({
			name: f,
			path: path.join(targetDir!, f),
			mtime: fs.statSync(path.join(targetDir!, f)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	if (jsonlFiles.length === 0) return null;

	const latestFile = jsonlFiles[0]!;
	const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
	if (latestFile.mtime < thirtyMinutesAgo) return null;

	try {
		const content = fs.readFileSync(latestFile.path, "utf-8");
		const lines = content.trim().split("\n");

		const messages: string[] = [];
		let totalLength = 0;
		const maxLength = 8000;

		for (const line of lines) {
			if (totalLength >= maxLength) break;

			try {
				const parsed = JSON.parse(line) as ClaudeMessage;
				const role =
					parsed.role || parsed.message?.role || parsed.type || "unknown";
				const text =
					extractTextContent(parsed.content) ||
					extractTextContent(parsed.message?.content);

				if (text && text.length > 0) {
					const truncated =
						text.length > 500 ? `${text.substring(0, 500)}...` : text;
					messages.push(`[${role}]: ${truncated}`);
					totalLength += truncated.length;
				}
			} catch {}
		}

		if (messages.length === 0) return null;

		return messages.join("\n\n");
	} catch {
		return null;
	}
}

function findProjectDir(projectPath?: string): string | null {
	const claudeDir = path.join(os.homedir(), ".claude");
	if (!fs.existsSync(claudeDir)) return null;

	const projectsDir = path.join(claudeDir, "projects");
	if (!fs.existsSync(projectsDir)) return null;

	if (projectPath) {
		const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
		const normalizedProjectPath = projectPath.replace(/\//g, "-");

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const decoded = entry.name.replace(/-/g, "/");
			if (
				decoded === projectPath ||
				entry.name === normalizedProjectPath ||
				entry.name === `-${normalizedProjectPath.slice(1)}`
			) {
				return path.join(projectsDir, entry.name);
			}
		}
	}

	return null;
}

function findLatestJsonl(targetDir: string, maxAgeMs?: number): string | null {
	const jsonlFiles = fs
		.readdirSync(targetDir)
		.filter((f) => f.endsWith(".jsonl"))
		.map((f) => ({
			path: path.join(targetDir, f),
			mtime: fs.statSync(path.join(targetDir, f)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	if (jsonlFiles.length === 0) return null;

	const latest = jsonlFiles[0]!;
	if (maxAgeMs && latest.mtime < Date.now() - maxAgeMs) return null;

	return latest.path;
}

export function readFullClaudeSession(
	projectPath?: string,
): ClaudeMessage[] | null {
	const targetDir = findProjectDir(projectPath);
	if (!targetDir) return null;

	const filePath = findLatestJsonl(targetDir);
	if (!filePath) return null;

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const lines = content.trim().split("\n");
		const messages: ClaudeMessage[] = [];

		for (const line of lines) {
			try {
				messages.push(JSON.parse(line) as ClaudeMessage);
			} catch {}
		}

		return messages.length > 0 ? messages : null;
	} catch {
		return null;
	}
}

function extractErrorSignatures(text: string): string[] {
	const patterns = [
		/(?:Error|Exception|FAILED|error\[E\d+\]):\s*(.{10,160})/gi,
		/(?:command not found|permission denied|no such file|ENOENT).*$/gim,
		/(?:TypeError|ReferenceError|SyntaxError):\s*(.{10,160})/gi,
	];

	const signatures: string[] = [];
	for (const pattern of patterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			const sig = (match[1] || match[0]).trim().slice(0, 160);
			if (sig && !signatures.includes(sig)) {
				signatures.push(sig);
			}
			if (signatures.length >= 4) return signatures;
		}
	}
	return signatures;
}

function extractTags(toolCalls: ParsedToolCall[]): string[] {
	const tags = new Set<string>();
	for (const call of toolCalls) {
		tags.add(call.tool);
	}
	return [...tags];
}

export function parseTranscriptToTraces(
	messages: ClaudeMessage[],
): ParsedTurn[] {
	const turns: ParsedTurn[] = [];
	let currentTurn: Partial<ParsedTurn> & {
		toolCalls: ParsedToolCall[];
		errorSignatures: string[];
	} = {
		toolCalls: [],
		errorSignatures: [],
	};
	let turnIndex = 0;

	function flushTurn() {
		if (
			currentTurn.userText ||
			currentTurn.agentText ||
			currentTurn.toolCalls.length > 0
		) {
			turns.push({
				turnIndex,
				userText: currentTurn.userText ?? null,
				agentText: currentTurn.agentText ?? null,
				toolCalls: currentTurn.toolCalls,
				agentThinking: currentTurn.agentThinking ?? null,
				errorSignatures: currentTurn.errorSignatures,
				tags: extractTags(currentTurn.toolCalls),
			});
			turnIndex++;
		}
		currentTurn = {
			toolCalls: [],
			errorSignatures: [],
		};
	}

	for (const msg of messages) {
		const role = msg.role || msg.message?.role || msg.type || "unknown";
		const contentArr = (msg.content || msg.message?.content) as
			| string
			| Array<{
					type: string;
					text?: string;
					name?: string;
					input?: unknown;
					content?: string | Array<{ type: string; text?: string }>;
					thinking?: string;
			  }>
			| undefined;

		if (role === "human" || role === "user") {
			flushTurn();
			currentTurn.userText = extractTextContent(contentArr);
		} else if (role === "assistant") {
			if (typeof contentArr === "string") {
				currentTurn.agentText = contentArr;
			} else if (Array.isArray(contentArr)) {
				const textParts: string[] = [];
				for (const block of contentArr) {
					if (block.type === "text" && block.text) {
						textParts.push(block.text);
					} else if (block.type === "thinking" && block.thinking) {
						currentTurn.agentThinking = block.thinking;
					} else if (block.type === "tool_use" && block.name) {
						currentTurn.toolCalls.push({
							tool: block.name,
							input:
								typeof block.input === "string"
									? block.input
									: JSON.stringify(block.input ?? "").slice(0, 500),
							output: "",
						});
					}
				}
				if (textParts.length > 0) {
					currentTurn.agentText = textParts.join("\n");
				}
			}
		} else if (role === "tool" || msg.type === "tool_result") {
			const resultText = extractTextContent(contentArr);
			if (resultText && currentTurn.toolCalls.length > 0) {
				const lastTool =
					currentTurn.toolCalls[currentTurn.toolCalls.length - 1]!;
				lastTool.output = resultText.slice(0, 1000);

				const errors = extractErrorSignatures(resultText);
				currentTurn.errorSignatures.push(...errors);
			}
		}
	}

	flushTurn();

	return turns;
}
