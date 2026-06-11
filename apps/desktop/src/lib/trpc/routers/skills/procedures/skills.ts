import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	skillPresetSkills,
	skillPresets,
	skillSettings,
	skills,
	skillTargets,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { publicProcedure } from "../../..";
import { hashDirectory } from "../utils/content-hash";
import {
	cleanupTemp,
	cloneRepo,
	getHeadRevision,
	parseGitSource,
	previewGitInstall as previewGitInstallUtil,
	resolveRemoteRevision,
	resolveSkillDir,
} from "../utils/git-fetcher";
import {
	installFromGitDir,
	installFromLocal,
	parseSkillMetadata,
	sanitizeName,
} from "../utils/installer";
import { removeTarget } from "../utils/sync-engine";
import {
	getAllAdapters,
	getSkillsDir,
	isToolInstalled,
	type SkillSettingsAccessor,
} from "../utils/tool-adapters";

let tablesCreated = false;
function ensureSkillTablesExist() {
	if (tablesCreated) return;
	try {
		localDb.run(sql`CREATE TABLE IF NOT EXISTS skills (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			source_type TEXT NOT NULL,
			source_ref TEXT,
			source_ref_resolved TEXT,
			source_subpath TEXT,
			source_branch TEXT,
			source_revision TEXT,
			remote_revision TEXT,
			update_status TEXT NOT NULL DEFAULT 'unknown',
			last_checked_at INTEGER,
			last_check_error TEXT,
			central_path TEXT NOT NULL UNIQUE,
			content_hash TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			tags TEXT DEFAULT '[]',
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skills_source_type_idx ON skills(source_type)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skills_central_path_idx ON skills(central_path)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skills_update_status_idx ON skills(update_status)`,
		);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_targets (
			id TEXT PRIMARY KEY,
			skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
			tool TEXT NOT NULL,
			target_path TEXT NOT NULL,
			mode TEXT NOT NULL DEFAULT 'symlink',
			status TEXT NOT NULL DEFAULT 'pending',
			synced_at INTEGER,
			source_hash TEXT,
			last_error TEXT
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_targets_skill_id_idx ON skill_targets(skill_id)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_targets_tool_idx ON skill_targets(tool)`,
		);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_presets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			icon TEXT,
			sort_order INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_preset_skills (
			preset_id TEXT NOT NULL REFERENCES skill_presets(id) ON DELETE CASCADE,
			skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
			sort_order INTEGER NOT NULL DEFAULT 0
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_preset_skills_preset_id_idx ON skill_preset_skills(preset_id)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_preset_skills_skill_id_idx ON skill_preset_skills(skill_id)`,
		);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_preset_tool_toggles (
			preset_id TEXT NOT NULL REFERENCES skill_presets(id) ON DELETE CASCADE,
			skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
			tool TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_preset_tool_toggles_preset_id_idx ON skill_preset_tool_toggles(preset_id)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_preset_tool_toggles_skill_id_idx ON skill_preset_tool_toggles(skill_id)`,
		);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_settings (
			key TEXT PRIMARY KEY,
			value TEXT
		)`);

		localDb.run(sql`CREATE TABLE IF NOT EXISTS skill_audit_log (
			id TEXT PRIMARY KEY,
			action TEXT NOT NULL,
			skill_id TEXT,
			skill_name TEXT,
			tool TEXT,
			detail TEXT,
			success INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		)`);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_audit_log_action_idx ON skill_audit_log(action)`,
		);
		localDb.run(
			sql`CREATE INDEX IF NOT EXISTS skill_audit_log_created_at_idx ON skill_audit_log(created_at)`,
		);

		tablesCreated = true;
	} catch {
		// ignore errors
	}
}

const SKILL_MD_CANDIDATES = [
	"SKILL.md",
	"skill.md",
	"CLAUDE.md",
	"claude.md",
	"README.md",
	"readme.md",
];

function getCentralRepoPath(): string {
	ensureSkillTablesExist();
	try {
		const row = localDb
			.select()
			.from(skillSettings)
			.where(eq(skillSettings.key, "central_repo_path"))
			.get();
		if (row?.value) return row.value;
	} catch {
		// fall through
	}
	return path.join(os.homedir(), ".superset", "skills");
}

function findExistingSkillByName(name: string) {
	return localDb.select().from(skills).where(eq(skills.name, name)).get();
}

function getSkillByIdOrThrow(id: string) {
	const skill = localDb.select().from(skills).where(eq(skills.id, id)).get();
	if (!skill) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Skill ${id} not found after write`,
		});
	}
	return skill;
}

export function createSkillsProcedures() {
	return {
		list: publicProcedure.query(() => {
			ensureSkillTablesExist();
			const allSkills = localDb.select().from(skills).all();
			const allTargets = localDb.select().from(skillTargets).all();

			const targetsBySkillId = new Map<string, (typeof allTargets)[number][]>();
			for (const target of allTargets) {
				const existing = targetsBySkillId.get(target.skillId) ?? [];
				existing.push(target);
				targetsBySkillId.set(target.skillId, existing);
			}

			return allSkills.map((skill) => ({
				...skill,
				targets: targetsBySkillId.get(skill.id) ?? [],
			}));
		}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				ensureSkillTablesExist();
				const skill = localDb
					.select()
					.from(skills)
					.where(eq(skills.id, input.id))
					.get();

				if (!skill) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Skill ${input.id} not found`,
					});
				}

				const targets = localDb
					.select()
					.from(skillTargets)
					.where(eq(skillTargets.skillId, input.id))
					.all();

				let presets: { presetId: string; name: string }[] = [];
				try {
					presets = localDb
						.select({
							presetId: skillPresetSkills.presetId,
							name: skillPresets.name,
						})
						.from(skillPresetSkills)
						.innerJoin(
							skillPresets,
							eq(skillPresetSkills.presetId, skillPresets.id),
						)
						.where(eq(skillPresetSkills.skillId, input.id))
						.all();
				} catch {
					// table may not exist
				}

				return {
					...skill,
					targets,
					presets,
					tags: (skill.tags as string[]) ?? [],
				};
			}),

		getDocument: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				ensureSkillTablesExist();
				const skill = localDb
					.select()
					.from(skills)
					.where(eq(skills.id, input.id))
					.get();

				if (!skill) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Skill ${input.id} not found`,
					});
				}

				for (const filename of SKILL_MD_CANDIDATES) {
					const filePath = path.join(skill.centralPath, filename);
					try {
						const content = await fs.readFile(filePath, "utf-8");
						return { content, filename };
					} catch {}
				}

				return null;
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const skill = localDb
					.select()
					.from(skills)
					.where(eq(skills.id, input.id))
					.get();

				const targets = localDb
					.select()
					.from(skillTargets)
					.where(eq(skillTargets.skillId, input.id))
					.all();

				for (const target of targets) {
					try {
						await removeTarget(target.targetPath);
					} catch {
						// best effort
					}
				}

				if (skill?.centralPath) {
					try {
						await fs.rm(skill.centralPath, { recursive: true, force: true });
					} catch {
						// best effort
					}
				}

				localDb.delete(skills).where(eq(skills.id, input.id)).run();
				return { success: true as const };
			}),

		batchDelete: publicProcedure
			.input(z.object({ ids: z.array(z.string()) }))
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const skillsToDelete = localDb
					.select()
					.from(skills)
					.where(inArray(skills.id, input.ids))
					.all();

				for (const skill of skillsToDelete) {
					const targets = localDb
						.select()
						.from(skillTargets)
						.where(eq(skillTargets.skillId, skill.id))
						.all();

					for (const target of targets) {
						try {
							await removeTarget(target.targetPath);
						} catch {
							// best effort
						}
					}

					if (skill.centralPath) {
						try {
							await fs.rm(skill.centralPath, { recursive: true, force: true });
						} catch {
							// best effort
						}
					}
				}

				localDb.delete(skills).where(inArray(skills.id, input.ids)).run();
				return { success: true as const };
			}),

		installLocal: publicProcedure
			.input(
				z.object({
					path: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const centralRepo = getCentralRepoPath();
				await fs.mkdir(centralRepo, { recursive: true });

				try {
					const result = await installFromLocal(
						input.path,
						input.name ?? null,
						centralRepo,
					);

					const existing = findExistingSkillByName(result.name);
					const now = Date.now();

					if (existing) {
						localDb
							.update(skills)
							.set({
								description: result.description,
								sourceRef: input.path,
								centralPath: result.centralPath,
								contentHash: result.contentHash,
								updatedAt: now,
							})
							.where(eq(skills.id, existing.id))
							.run();
						return getSkillByIdOrThrow(existing.id);
					}

					const id = uuidv4();
					localDb
						.insert(skills)
						.values({
							id,
							name: result.name,
							description: result.description,
							sourceType: "local",
							sourceRef: input.path,
							centralPath: result.centralPath,
							contentHash: result.contentHash,
							updateStatus: "local_only",
							createdAt: now,
							updatedAt: now,
						})
						.run();

					return getSkillByIdOrThrow(id);
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error ? err.message : "Failed to install skill",
					});
				}
			}),

		installGit: publicProcedure
			.input(
				z.object({
					url: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const centralRepo = getCentralRepoPath();
				await fs.mkdir(centralRepo, { recursive: true });

				const source = parseGitSource(input.url);
				const tempDir = await fs.mkdtemp(
					path.join(os.tmpdir(), "skills-install-"),
				);

				try {
					await cloneRepo(source.cloneUrl, tempDir, {
						branch: source.branch ?? undefined,
					});

					const skillDir = resolveSkillDir(tempDir, source);
					const revision = await getHeadRevision(tempDir);

					const result = await installFromGitDir(
						skillDir,
						input.name ?? null,
						centralRepo,
					);

					const existing = findExistingSkillByName(result.name);
					const now = Date.now();

					if (existing) {
						localDb
							.update(skills)
							.set({
								description: result.description,
								sourceType: "git",
								sourceRef: input.url,
								sourceRefResolved: source.cloneUrl,
								sourceSubpath: source.subpath,
								sourceBranch: source.branch,
								sourceRevision: revision,
								centralPath: result.centralPath,
								contentHash: result.contentHash,
								updateStatus: "up_to_date",
								updatedAt: now,
							})
							.where(eq(skills.id, existing.id))
							.run();
						return getSkillByIdOrThrow(existing.id);
					}

					const id = uuidv4();
					localDb
						.insert(skills)
						.values({
							id,
							name: result.name,
							description: result.description,
							sourceType: "git",
							sourceRef: input.url,
							sourceRefResolved: source.cloneUrl,
							sourceSubpath: source.subpath,
							sourceBranch: source.branch,
							sourceRevision: revision,
							centralPath: result.centralPath,
							contentHash: result.contentHash,
							updateStatus: "up_to_date",
							createdAt: now,
							updatedAt: now,
						})
						.run();

					return getSkillByIdOrThrow(id);
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error ? err.message : "Failed to install from git",
					});
				} finally {
					await cleanupTemp(tempDir);
				}
			}),

		installFromMarketplace: publicProcedure
			.input(
				z.object({
					skillId: z.string(),
					source: z.string(),
					name: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const centralRepo = getCentralRepoPath();
				await fs.mkdir(centralRepo, { recursive: true });

				const gitUrl = input.source.includes("://")
					? input.source
					: `https://github.com/${input.source}`;

				const gitSource = parseGitSource(gitUrl);
				const tempDir = await fs.mkdtemp(
					path.join(os.tmpdir(), "skills-marketplace-"),
				);

				try {
					await cloneRepo(gitSource.cloneUrl, tempDir, {
						branch: gitSource.branch ?? undefined,
					});

					const skillDir = resolveSkillDir(tempDir, gitSource);
					const revision = await getHeadRevision(tempDir);

					const result = await installFromGitDir(
						skillDir,
						input.name,
						centralRepo,
					);

					const existing = findExistingSkillByName(result.name);
					const now = Date.now();

					if (existing) {
						localDb
							.update(skills)
							.set({
								description: result.description,
								sourceType: "skillssh",
								sourceRef: gitUrl,
								sourceRefResolved: gitSource.cloneUrl,
								sourceSubpath: gitSource.subpath,
								sourceBranch: gitSource.branch,
								sourceRevision: revision,
								centralPath: result.centralPath,
								contentHash: result.contentHash,
								updateStatus: "up_to_date",
								updatedAt: now,
							})
							.where(eq(skills.id, existing.id))
							.run();
						return getSkillByIdOrThrow(existing.id);
					}

					const id = uuidv4();
					localDb
						.insert(skills)
						.values({
							id,
							name: result.name,
							description: result.description,
							sourceType: "skillssh",
							sourceRef: gitUrl,
							sourceRefResolved: gitSource.cloneUrl,
							sourceSubpath: gitSource.subpath,
							sourceBranch: gitSource.branch,
							sourceRevision: revision,
							centralPath: result.centralPath,
							contentHash: result.contentHash,
							updateStatus: "up_to_date",
							createdAt: now,
							updatedAt: now,
						})
						.run();

					return getSkillByIdOrThrow(id);
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error
								? err.message
								: "Failed to install from marketplace",
					});
				} finally {
					await cleanupTemp(tempDir);
				}
			}),

		previewGitInstall: publicProcedure
			.input(z.object({ url: z.string() }))
			.mutation(async ({ input }) => {
				try {
					return await previewGitInstallUtil(input.url);
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error
								? err.message
								: "Failed to preview git install",
					});
				}
			}),

		confirmGitInstall: publicProcedure
			.input(
				z.object({
					tempDir: z.string(),
					selections: z.array(
						z.object({
							name: z.string(),
							relativePath: z.string(),
						}),
					),
				}),
			)
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const centralRepo = getCentralRepoPath();
				await fs.mkdir(centralRepo, { recursive: true });

				const installed: Array<{
					id: string;
					name: string;
					centralPath: string;
				}> = [];

				try {
					for (const selection of input.selections) {
						const skillDir = path.join(input.tempDir, selection.relativePath);
						const result = await installFromGitDir(
							skillDir,
							selection.name,
							centralRepo,
						);

						const existing = findExistingSkillByName(result.name);
						const now = Date.now();

						if (existing) {
							localDb
								.update(skills)
								.set({
									description: result.description,
									sourceType: "git",
									sourceRef: input.tempDir,
									centralPath: result.centralPath,
									contentHash: result.contentHash,
									updatedAt: now,
								})
								.where(eq(skills.id, existing.id))
								.run();

							installed.push({
								id: existing.id,
								name: result.name,
								centralPath: result.centralPath,
							});
							continue;
						}

						const id = uuidv4();
						localDb
							.insert(skills)
							.values({
								id,
								name: result.name,
								description: result.description,
								sourceType: "git",
								sourceRef: input.tempDir,
								centralPath: result.centralPath,
								contentHash: result.contentHash,
								updateStatus: "unknown",
								createdAt: now,
								updatedAt: now,
							})
							.run();

						installed.push({
							id,
							name: result.name,
							centralPath: result.centralPath,
						});
					}

					return installed;
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error
								? err.message
								: "Failed to confirm git install",
					});
				} finally {
					await cleanupTemp(input.tempDir);
				}
			}),

		checkUpdate: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const skill = localDb
					.select()
					.from(skills)
					.where(eq(skills.id, input.id))
					.get();

				if (!skill) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Skill ${input.id} not found`,
					});
				}

				if (skill.sourceType === "local" || skill.sourceType === "import") {
					localDb
						.update(skills)
						.set({
							updateStatus: "local_only",
							lastCheckedAt: Date.now(),
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, input.id))
						.run();
					return { updateStatus: "local_only" as const };
				}

				if (!skill.sourceRefResolved) {
					localDb
						.update(skills)
						.set({
							updateStatus: "source_missing",
							lastCheckedAt: Date.now(),
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, input.id))
						.run();
					return { updateStatus: "source_missing" as const };
				}

				try {
					const remoteRev = await resolveRemoteRevision(
						skill.sourceRefResolved,
						skill.sourceBranch ?? undefined,
					);

					const hasUpdate =
						remoteRev !== null && remoteRev !== skill.sourceRevision;
					const updateStatus = hasUpdate ? "update_available" : "up_to_date";

					localDb
						.update(skills)
						.set({
							remoteRevision: remoteRev,
							updateStatus,
							lastCheckedAt: Date.now(),
							lastCheckError: null,
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, input.id))
						.run();

					return { updateStatus };
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					localDb
						.update(skills)
						.set({
							updateStatus: "error",
							lastCheckedAt: Date.now(),
							lastCheckError: errorMsg,
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, input.id))
						.run();
					return { updateStatus: "error" as const, error: errorMsg };
				}
			}),

		checkAllUpdates: publicProcedure.mutation(async () => {
			ensureSkillTablesExist();
			const allSkills = localDb
				.select()
				.from(skills)
				.where(
					sql`source_type IN ('git', 'skillssh') AND source_ref_resolved IS NOT NULL`,
				)
				.all();

			const results: Array<{
				id: string;
				name: string;
				updateStatus: string;
			}> = [];

			for (const skill of allSkills) {
				try {
					if (!skill.sourceRefResolved) continue;
					const remoteRev = await resolveRemoteRevision(
						skill.sourceRefResolved,
						skill.sourceBranch ?? undefined,
					);

					const hasUpdate =
						remoteRev !== null && remoteRev !== skill.sourceRevision;
					const updateStatus = hasUpdate ? "update_available" : "up_to_date";

					localDb
						.update(skills)
						.set({
							remoteRevision: remoteRev,
							updateStatus,
							lastCheckedAt: Date.now(),
							lastCheckError: null,
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, skill.id))
						.run();

					results.push({
						id: skill.id,
						name: skill.name,
						updateStatus,
					});
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					localDb
						.update(skills)
						.set({
							updateStatus: "error",
							lastCheckedAt: Date.now(),
							lastCheckError: errorMsg,
							updatedAt: Date.now(),
						})
						.where(eq(skills.id, skill.id))
						.run();

					results.push({
						id: skill.id,
						name: skill.name,
						updateStatus: "error",
					});
				}
			}

			return results;
		}),

		batchImportFolder: publicProcedure
			.input(z.object({ path: z.string() }))
			.mutation(async ({ input }) => {
				ensureSkillTablesExist();
				const centralRepo = getCentralRepoPath();
				await fs.mkdir(centralRepo, { recursive: true });

				const entries = await fs.readdir(input.path, {
					withFileTypes: true,
				});
				const imported: Array<{
					id: string;
					name: string;
					centralPath: string;
				}> = [];

				for (const entry of entries) {
					if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

					const skillDir = path.join(input.path, entry.name);

					try {
						const result = await installFromLocal(skillDir, null, centralRepo);

						const existing = findExistingSkillByName(result.name);
						const now = Date.now();

						if (existing) {
							localDb
								.update(skills)
								.set({
									description: result.description,
									sourceRef: skillDir,
									centralPath: result.centralPath,
									contentHash: result.contentHash,
									updatedAt: now,
								})
								.where(eq(skills.id, existing.id))
								.run();

							imported.push({
								id: existing.id,
								name: result.name,
								centralPath: result.centralPath,
							});
							continue;
						}

						const id = uuidv4();
						localDb
							.insert(skills)
							.values({
								id,
								name: result.name,
								description: result.description,
								sourceType: "import",
								sourceRef: skillDir,
								centralPath: result.centralPath,
								contentHash: result.contentHash,
								updateStatus: "local_only",
								createdAt: now,
								updatedAt: now,
							})
							.run();

						imported.push({
							id,
							name: result.name,
							centralPath: result.centralPath,
						});
					} catch {
						// skip failed imports
					}
				}

				return imported;
			}),

		scanInstalledSkills: publicProcedure.mutation(async () => {
			ensureSkillTablesExist();
			const centralRepo = getCentralRepoPath();
			await fs.mkdir(centralRepo, { recursive: true });
			const resolvedCentralRepo = await fs.realpath(centralRepo);

			// ── Phase 1: sync central repo ──────────────────────────
			// Make DB match what's actually on disk in the central repo.
			const existingSkills = localDb.select().from(skills).all();
			const centralPathToSkill = new Map(
				existingSkills.map((s) => [s.centralPath, s]),
			);

			let centralEntries: import("node:fs").Dirent[];
			try {
				centralEntries = await fs.readdir(centralRepo, {
					withFileTypes: true,
				});
			} catch {
				centralEntries = [];
			}

			const dirsOnDisk = new Set<string>();

			for (const entry of centralEntries) {
				if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

				const dirPath = path.join(centralRepo, entry.name);
				dirsOnDisk.add(dirPath);

				const tracked = centralPathToSkill.get(dirPath);
				if (tracked) {
					const currentHash = await hashDirectory(dirPath);
					if (currentHash !== tracked.contentHash) {
						const metadata = await parseSkillMetadata(dirPath);
						localDb
							.update(skills)
							.set({
								contentHash: currentHash,
								description: metadata.description ?? tracked.description,
								updatedAt: Date.now(),
							})
							.where(eq(skills.id, tracked.id))
							.run();
					}
				} else {
					const metadata = await parseSkillMetadata(dirPath);
					const name = metadata.name
						? sanitizeName(metadata.name)
						: sanitizeName(entry.name);
					const contentHash = await hashDirectory(dirPath);

					const existingByName = findExistingSkillByName(name);
					const now = Date.now();

					if (existingByName) {
						localDb
							.update(skills)
							.set({
								description: metadata.description,
								centralPath: dirPath,
								contentHash,
								updatedAt: now,
							})
							.where(eq(skills.id, existingByName.id))
							.run();
					} else {
						localDb
							.insert(skills)
							.values({
								id: uuidv4(),
								name,
								description: metadata.description,
								sourceType: "local",
								centralPath: dirPath,
								contentHash,
								updateStatus: "local_only",
								createdAt: now,
								updatedAt: now,
							})
							.run();
					}
				}
			}

			// Remove DB records whose central path no longer exists on disk
			for (const skill of existingSkills) {
				if (
					skill.centralPath?.startsWith(centralRepo) &&
					!dirsOnDisk.has(skill.centralPath)
				) {
					localDb
						.delete(skillTargets)
						.where(eq(skillTargets.skillId, skill.id))
						.run();
					localDb.delete(skills).where(eq(skills.id, skill.id)).run();
				}
			}

			// ── Phase 2: scan tool adapter directories ──────────────
			// Only pick up skills that are NOT symlinks into the central repo.
			const settingsAccessor: SkillSettingsAccessor = {
				getSetting(key: string) {
					try {
						const row = localDb
							.select()
							.from(skillSettings)
							.where(eq(skillSettings.key, key))
							.get();
						return row?.value ?? null;
					} catch {
						return null;
					}
				},
			};

			const adapters = getAllAdapters(settingsAccessor);
			const installedAdapters = adapters.filter((a) => isToolInstalled(a));

			const existingSourceRefs = new Set(
				localDb
					.select({ sourceRef: skills.sourceRef })
					.from(skills)
					.all()
					.map((s) => s.sourceRef)
					.filter(Boolean),
			);
			const existingTargetPaths = new Set(
				localDb
					.select({ targetPath: skillTargets.targetPath })
					.from(skillTargets)
					.all()
					.map((t) => t.targetPath),
			);

			const scannedDirs = new Set<string>();
			const imported: Array<{
				id: string;
				name: string;
				centralPath: string;
				fromTool: string;
			}> = [];

			for (const adapter of installedAdapters) {
				const skillsDir = getSkillsDir(adapter);
				if (!skillsDir || scannedDirs.has(skillsDir)) continue;
				scannedDirs.add(skillsDir);

				let entries: import("node:fs").Dirent[];
				try {
					entries = await fs.readdir(skillsDir, { withFileTypes: true });
				} catch {
					continue;
				}

				for (const entry of entries) {
					if (entry.name.startsWith(".")) continue;
					if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

					const skillDir = path.join(skillsDir, entry.name);

					if (entry.isSymbolicLink()) {
						try {
							const realPath = await fs.realpath(skillDir);
							if (realPath.startsWith(resolvedCentralRepo + path.sep)) continue;
						} catch {
							continue;
						}
					}

					try {
						const stat = await fs.stat(skillDir);
						if (!stat.isDirectory()) continue;
					} catch {
						continue;
					}

					if (existingTargetPaths.has(skillDir)) continue;
					if (existingSourceRefs.has(skillDir)) continue;

					try {
						const result = await installFromLocal(skillDir, null, centralRepo);

						const existing = findExistingSkillByName(result.name);
						const now = Date.now();
						let skillId: string;

						if (existing) {
							skillId = existing.id;
							localDb
								.update(skills)
								.set({
									description: result.description,
									sourceRef: skillDir,
									centralPath: result.centralPath,
									contentHash: result.contentHash,
									updatedAt: now,
								})
								.where(eq(skills.id, existing.id))
								.run();
						} else {
							skillId = uuidv4();
							localDb
								.insert(skills)
								.values({
									id: skillId,
									name: result.name,
									description: result.description,
									sourceType: "local",
									sourceRef: skillDir,
									centralPath: result.centralPath,
									contentHash: result.contentHash,
									updateStatus: "local_only",
									createdAt: now,
									updatedAt: now,
								})
								.run();
						}

						localDb
							.insert(skillTargets)
							.values({
								id: uuidv4(),
								skillId,
								tool: adapter.key,
								targetPath: skillDir,
								mode: "symlink",
								status: "synced",
								syncedAt: now,
								sourceHash: result.contentHash,
							})
							.run();

						existingSourceRefs.add(skillDir);
						existingTargetPaths.add(skillDir);

						imported.push({
							id: skillId,
							name: result.name,
							centralPath: result.centralPath,
							fromTool: adapter.displayName,
						});
					} catch {
						// skip failed imports
					}
				}
			}

			return { imported, scannedDirs: scannedDirs.size };
		}),

		getTags: publicProcedure.query(() => {
			ensureSkillTablesExist();
			const allSkills = localDb
				.select({ tags: skills.tags })
				.from(skills)
				.all();
			const tagSet = new Set<string>();

			for (const skill of allSkills) {
				const skillTags = (skill.tags as string[]) ?? [];
				for (const tag of skillTags) {
					tagSet.add(tag);
				}
			}

			return Array.from(tagSet).sort();
		}),

		setTags: publicProcedure
			.input(
				z.object({
					id: z.string(),
					tags: z.array(z.string()),
				}),
			)
			.mutation(({ input }) => {
				ensureSkillTablesExist();
				localDb
					.update(skills)
					.set({ tags: input.tags, updatedAt: Date.now() })
					.where(eq(skills.id, input.id))
					.run();
				return { success: true as const };
			}),
	};
}
