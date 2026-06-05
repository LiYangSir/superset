import fs from "node:fs/promises";
import path from "node:path";

import type { SkillSyncMode } from "@superset/local-db";

export interface SyncResult {
	success: boolean;
	targetPath: string;
	mode: SkillSyncMode;
	error?: string;
}

export async function syncSkill(
	source: string,
	target: string,
	mode: SkillSyncMode,
): Promise<SyncResult> {
	try {
		await fs.mkdir(path.dirname(target), { recursive: true });
		ensureDstNotInsideSrc(source, target);
		await removeTarget(target);

		if (mode === "symlink") {
			await fs.symlink(source, target, "dir");
		} else {
			await copyDirRecursive(source, target);
		}

		return { success: true, targetPath: target, mode };
	} catch (err) {
		return {
			success: false,
			targetPath: target,
			mode,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function removeTarget(target: string): Promise<void> {
	let stat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stat = await fs.lstat(target);
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
		throw err;
	}

	if (stat.isSymbolicLink()) {
		await fs.unlink(target);
	} else if (stat.isDirectory()) {
		await fs.rm(target, { recursive: true, force: true });
	} else {
		await fs.unlink(target);
	}
}

export async function isTargetCurrent(
	source: string,
	target: string,
	mode: SkillSyncMode,
	lastSyncedHash?: string,
	currentHash?: string,
): Promise<boolean> {
	try {
		const stat = await fs.lstat(target);

		if (mode === "symlink") {
			if (!stat.isSymbolicLink()) return false;
			const resolved = await fs.realpath(target);
			const resolvedSource = await fs.realpath(source);
			return resolved === resolvedSource;
		}

		if (!lastSyncedHash || !currentHash) return false;
		return lastSyncedHash === currentHash;
	} catch {
		return false;
	}
}

export async function copyDirRecursive(
	src: string,
	dst: string,
): Promise<void> {
	await fs.mkdir(dst, { recursive: true });
	const entries = await fs.readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.name === ".git") continue;

		const srcPath = path.join(src, entry.name);
		const dstPath = path.join(dst, entry.name);

		if (entry.isDirectory()) {
			await copyDirRecursive(srcPath, dstPath);
		} else {
			await fs.copyFile(srcPath, dstPath);
		}
	}
}

export function targetDirName(centralPath: string, skillName: string): string {
	return path.basename(centralPath) || skillName;
}

export function ensureDstNotInsideSrc(src: string, dst: string): void {
	const resolvedSrc = path.resolve(src);
	const resolvedDst = path.resolve(dst);

	if (
		resolvedDst === resolvedSrc ||
		resolvedDst.startsWith(`${resolvedSrc}${path.sep}`)
	) {
		throw new Error(
			`Target "${dst}" is inside source "${src}", which would cause infinite recursion`,
		);
	}
}
