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
			if (
				projectPath.startsWith(decoded) &&
				decoded.length > bestMatchLength
			) {
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
