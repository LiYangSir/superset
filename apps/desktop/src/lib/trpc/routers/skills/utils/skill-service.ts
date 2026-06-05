import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SelectSkill } from "@superset/local-db";
import { skillAuditLog, skillSettings, skillTargets } from "@superset/local-db";
import { and, eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { removeTarget, syncSkill, targetDirName } from "./sync-engine";
import {
	getEnabledInstalledAdapters,
	getSkillsDir,
	type SkillSettingsAccessor,
} from "./tool-adapters";

const DEFAULT_CENTRAL_REPO = path.join(
	os.homedir(),
	".skills-manager",
	"skills",
);

export async function getCentralRepoPath(): Promise<string> {
	const row = await localDb
		.select()
		.from(skillSettings)
		.where(eq(skillSettings.key, "central_repo_path"))
		.get();
	return row?.value ?? DEFAULT_CENTRAL_REPO;
}

export async function ensureCentralRepo(): Promise<string> {
	const repoPath = await getCentralRepoPath();
	await fs.mkdir(repoPath, { recursive: true });
	return repoPath;
}

export function createSettingsAccessor(): SkillSettingsAccessor {
	return {
		getSetting(key: string): string | null {
			const row = localDb
				.select()
				.from(skillSettings)
				.where(eq(skillSettings.key, key))
				.get();
			return row?.value ?? null;
		},
	};
}

export async function getSettingValue(key: string): Promise<string | null> {
	const row = await localDb
		.select()
		.from(skillSettings)
		.where(eq(skillSettings.key, key))
		.get();
	return row?.value ?? null;
}

export async function setSettingValue(
	key: string,
	value: string | null,
): Promise<void> {
	if (value === null) {
		await localDb.delete(skillSettings).where(eq(skillSettings.key, key));
	} else {
		await localDb
			.insert(skillSettings)
			.values({ key, value })
			.onConflictDoUpdate({ target: skillSettings.key, set: { value } });
	}
}

export async function syncSkillToAllEnabledTools(
	skill: SelectSkill,
): Promise<void> {
	const settings = createSettingsAccessor();
	const adapters = getEnabledInstalledAdapters(settings);

	for (const adapter of adapters) {
		const skillsDir = getSkillsDir(adapter);
		const dirName = targetDirName(skill.centralPath, skill.name);
		const target = path.join(skillsDir, dirName);

		const result = await syncSkill(skill.centralPath, target, "symlink");
		if (result.success) {
			await localDb
				.insert(skillTargets)
				.values({
					skillId: skill.id,
					tool: adapter.key,
					targetPath: target,
					mode: "symlink",
					status: "synced",
					syncedAt: Date.now(),
					sourceHash: skill.contentHash,
				})
				.onConflictDoNothing();
		}
	}
}

export async function unsyncSkillFromAllTools(skillId: string): Promise<void> {
	const targets = await localDb
		.select()
		.from(skillTargets)
		.where(eq(skillTargets.skillId, skillId))
		.all();

	for (const target of targets) {
		await removeTarget(target.targetPath);
		await localDb
			.delete(skillTargets)
			.where(
				and(
					eq(skillTargets.skillId, skillId),
					eq(skillTargets.tool, target.tool),
				),
			);
	}
}

export async function logAudit(entry: {
	action: string;
	skillId?: string;
	skillName?: string;
	tool?: string;
	detail?: string;
	success?: boolean;
}): Promise<void> {
	try {
		await localDb.insert(skillAuditLog).values({
			action: entry.action,
			skillId: entry.skillId ?? null,
			skillName: entry.skillName ?? null,
			tool: entry.tool ?? null,
			detail: entry.detail ?? null,
			success: entry.success ?? true,
		});
	} catch {
		// best-effort
	}
}
