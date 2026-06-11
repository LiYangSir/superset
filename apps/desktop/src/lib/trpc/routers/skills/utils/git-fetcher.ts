import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	execGitWithShellPath,
	getSimpleGitWithShellPath,
} from "../../workspaces/utils/git-client";
import { parseSkillMetadata } from "./installer";

export interface GitSkillSource {
	cloneUrl: string;
	branch: string | null;
	subpath: string | null;
	locatorSkillId: string | null;
}

export interface GitPreviewResult {
	tempDir: string;
	skills: GitSkillPreview[];
}

export interface GitSkillPreview {
	name: string;
	relativePath: string;
	description: string | null;
	hasSkillMd: boolean;
}

const SKILL_MD_NAMES = ["SKILL.md", "skill.md"];

export function parseGitSource(url: string): GitSkillSource {
	let cloneUrl = url;
	let branch: string | null = null;
	let subpath: string | null = null;
	const locatorSkillId: string | null = null;

	if (!url.includes("://") && !url.startsWith("git@")) {
		const parts = url.split("/");
		if (parts.length === 2 && !parts[0].includes(".")) {
			cloneUrl = `https://github.com/${url}`;
		}
	}

	const hashIndex = cloneUrl.indexOf("#");
	if (hashIndex !== -1) {
		branch = cloneUrl.slice(hashIndex + 1);
		cloneUrl = cloneUrl.slice(0, hashIndex);
	}

	try {
		const parsed = new URL(cloneUrl);
		const pathSegments = parsed.pathname
			.replace(/\.git$/, "")
			.split("/")
			.filter(Boolean);

		if (pathSegments.length > 2) {
			const owner = pathSegments[0];
			const repo = pathSegments[1];
			subpath = pathSegments.slice(2).join("/");
			parsed.pathname = `/${owner}/${repo}.git`;
			cloneUrl = parsed.toString();
		}
	} catch {
		// not a parseable URL (e.g. git@ SSH), leave as-is
	}

	return { cloneUrl, branch, subpath, locatorSkillId };
}

export async function cloneRepo(
	url: string,
	dest: string,
	options?: { branch?: string; depth?: number },
): Promise<void> {
	const git = await getSimpleGitWithShellPath();
	const cloneOptions: string[] = [];

	const depth = options?.depth ?? 1;
	cloneOptions.push("--depth", String(depth));

	if (options?.branch) {
		cloneOptions.push("--branch", options.branch);
	}

	await git.clone(url, dest, cloneOptions);
}

export async function resolveRemoteRevision(
	url: string,
	branch?: string,
): Promise<string | null> {
	try {
		const args = ["ls-remote", url];
		if (branch) {
			args.push(branch);
		} else {
			args.push("HEAD");
		}

		const { stdout } = await execGitWithShellPath(args);
		const lines = stdout.trim().split("\n");

		for (const line of lines) {
			const [hash] = line.split("\t");
			if (hash) return hash.trim();
		}

		return null;
	} catch {
		return null;
	}
}

async function hasSkillMd(dir: string): Promise<boolean> {
	for (const name of SKILL_MD_NAMES) {
		try {
			await fs.access(path.join(dir, name));
			return true;
		} catch {}
	}
	return false;
}

export async function collectGitSkillDirs(
	repoDir: string,
): Promise<GitSkillPreview[]> {
	if (await hasSkillMd(repoDir)) {
		const metadata = await parseSkillMetadata(repoDir);
		return [
			{
				name: metadata.name ?? path.basename(repoDir),
				relativePath: ".",
				description: metadata.description,
				hasSkillMd: true,
			},
		];
	}

	const skills: GitSkillPreview[] = [];

	const topEntries = await fs.readdir(repoDir, { withFileTypes: true });
	for (const entry of topEntries) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

		const entryPath = path.join(repoDir, entry.name);

		if (await hasSkillMd(entryPath)) {
			const metadata = await parseSkillMetadata(entryPath);
			skills.push({
				name: metadata.name ?? entry.name,
				relativePath: entry.name,
				description: metadata.description,
				hasSkillMd: true,
			});
			continue;
		}

		const subEntries = await fs.readdir(entryPath, { withFileTypes: true });
		for (const subEntry of subEntries) {
			if (!subEntry.isDirectory() || subEntry.name.startsWith(".")) continue;

			const subPath = path.join(entryPath, subEntry.name);
			if (await hasSkillMd(subPath)) {
				const metadata = await parseSkillMetadata(subPath);
				skills.push({
					name: metadata.name ?? subEntry.name,
					relativePath: path.join(entry.name, subEntry.name),
					description: metadata.description,
					hasSkillMd: true,
				});
			}
		}
	}

	return skills;
}

export async function previewGitInstall(
	url: string,
): Promise<GitPreviewResult> {
	const source = parseGitSource(url);
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-preview-"));

	try {
		await cloneRepo(source.cloneUrl, tempDir, {
			branch: source.branch ?? undefined,
		});

		const skills = await collectGitSkillDirs(tempDir);
		return { tempDir, skills };
	} catch (err) {
		await cleanupTemp(tempDir);
		throw err;
	}
}

export function resolveSkillDir(
	repoDir: string,
	source: GitSkillSource,
): string {
	if (source.subpath) {
		return path.join(repoDir, source.subpath);
	}
	if (source.locatorSkillId) {
		return path.join(repoDir, source.locatorSkillId);
	}
	return repoDir;
}

export async function getHeadRevision(repoDir: string): Promise<string> {
	const git = await getSimpleGitWithShellPath(repoDir);
	const log = await git.log({ maxCount: 1 });
	const revision = log.latest?.hash;
	if (!revision) {
		throw new Error(`Unable to resolve HEAD revision for ${repoDir}`);
	}
	return revision;
}

export async function cleanupTemp(tempDir: string): Promise<void> {
	const systemTemp = os.tmpdir();
	const resolved = await fs.realpath(tempDir);

	if (!resolved.startsWith(systemTemp)) {
		throw new Error(
			`Refusing to remove directory outside system temp: ${resolved}`,
		);
	}

	await fs.rm(resolved, { recursive: true, force: true });
}
