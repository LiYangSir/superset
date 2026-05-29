import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface ClaudeMessage {
	role?: string;
	type?: string;
	message?: {
		role?: string;
		content?: string | Array<{ type: string; text?: string }>;
	};
	content?: string | Array<{ type: string; text?: string }>;
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
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const decoded = entry.name.replace(/-/g, "/");
			if (
				projectPath.includes(decoded) ||
				decoded.includes(projectPath.replace(/\//g, "-"))
			) {
				targetDir = path.join(projectsDir, entry.name);
				break;
			}
		}
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
	const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
	if (latestFile.mtime < fiveMinutesAgo) return null;

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
