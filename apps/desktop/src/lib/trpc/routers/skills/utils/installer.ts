import fs from "node:fs/promises";
import path from "node:path";
import { hashDirectory } from "./content-hash";

export interface InstallResult {
	name: string;
	description: string | null;
	centralPath: string;
	contentHash: string;
}

const SKILL_MD_CANDIDATES = [
	"SKILL.md",
	"skill.md",
	"CLAUDE.md",
	"claude.md",
	"README.md",
	"readme.md",
];

const SKIP_ENTRIES = new Set([".git", ".DS_Store"]);

export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/^-+|-+$/g, "");
}

export async function parseSkillMetadata(
	skillDir: string,
): Promise<{ name: string | null; description: string | null }> {
	for (const candidate of SKILL_MD_CANDIDATES) {
		const filePath = path.join(skillDir, candidate);
		try {
			const content = await fs.readFile(filePath, "utf-8");
			return extractMetadata(content);
		} catch {}
	}
	return { name: null, description: null };
}

function extractMetadata(content: string): {
	name: string | null;
	description: string | null;
} {
	let name: string | null = null;
	let description: string | null = null;

	const lines = content.split("\n");
	let pastHeading = false;

	for (const line of lines) {
		const trimmed = line.trim();

		if (!name) {
			const headingMatch = trimmed.match(/^#\s+(.+)$/);
			if (headingMatch) {
				name = headingMatch[1].trim();
				pastHeading = true;
				continue;
			}
		}

		if (pastHeading && !description) {
			if (trimmed === "") continue;
			if (trimmed.startsWith("#")) break;
			description = trimmed;
			break;
		}
	}

	return { name, description };
}

export async function resolveSkillName(
	source: string,
	name: string | null,
): Promise<string> {
	if (name) return sanitizeName(name);

	const metadata = await parseSkillMetadata(source);
	if (metadata.name) return sanitizeName(metadata.name);

	return sanitizeName(path.basename(source));
}

export async function uniqueSkillDest(
	parent: string,
	sanitizedName: string,
): Promise<string> {
	return path.join(parent, sanitizedName);
}

async function copySkillDir(
	source: string,
	destination: string,
): Promise<void> {
	await fs.mkdir(destination, { recursive: true });

	const entries = await fs.readdir(source, { withFileTypes: true });

	for (const entry of entries) {
		if (SKIP_ENTRIES.has(entry.name)) continue;

		const srcPath = path.join(source, entry.name);
		const destPath = path.join(destination, entry.name);

		if (entry.isSymbolicLink()) continue;

		if (entry.isDirectory()) {
			await copySkillDir(srcPath, destPath);
		} else if (entry.isFile()) {
			await fs.copyFile(srcPath, destPath);
		}
	}
}

export async function installSkillDirToDestination(
	source: string,
	name: string,
	destination: string,
): Promise<InstallResult> {
	const metadata = await parseSkillMetadata(source);

	const resolvedSource = await fs.realpath(source);
	const resolvedDest = path.resolve(destination);

	if (resolvedDest.startsWith(resolvedSource + path.sep)) {
		throw new Error("Destination cannot be inside the source directory");
	}

	try {
		await fs.rm(destination, { recursive: true, force: true });
	} catch {
		// destination may not exist
	}

	await copySkillDir(source, destination);

	const contentHash = await hashDirectory(destination);

	return {
		name,
		description: metadata.description,
		centralPath: destination,
		contentHash,
	};
}

export async function installFromLocal(
	source: string,
	name: string | null,
	centralRepo: string,
): Promise<InstallResult> {
	const resolvedName = await resolveSkillName(source, name);
	const destination = await uniqueSkillDest(centralRepo, resolvedName);

	return installSkillDirToDestination(source, resolvedName, destination);
}

export async function installFromGitDir(
	source: string,
	name: string | null,
	centralRepo: string,
): Promise<InstallResult> {
	return installFromLocal(source, name, centralRepo);
}
