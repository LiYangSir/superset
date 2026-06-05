import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { skillSettings } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { publicProcedure } from "../../..";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";

function getCentralRepoPath(): string {
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
	return path.join(os.homedir(), ".skills-manager", "skills");
}

export function createGitBackupProcedures() {
	return {
		status: publicProcedure.query(async () => {
			const repoPath = getCentralRepoPath();

			try {
				await fs.access(repoPath);
			} catch {
				return {
					exists: false,
					isGitRepo: false,
					branch: null,
					hasChanges: false,
				};
			}

			try {
				const git = await getSimpleGitWithShellPath(repoPath);
				const isRepo = await git.checkIsRepo();

				if (!isRepo) {
					return {
						exists: true,
						isGitRepo: false,
						branch: null,
						hasChanges: false,
					};
				}

				const status = await git.status();
				return {
					exists: true,
					isGitRepo: true,
					branch: status.current,
					hasChanges:
						status.modified.length > 0 ||
						status.not_added.length > 0 ||
						status.deleted.length > 0,
				};
			} catch {
				return {
					exists: true,
					isGitRepo: false,
					branch: null,
					hasChanges: false,
				};
			}
		}),

		init: publicProcedure.mutation(async () => {
			const repoPath = getCentralRepoPath();

			try {
				await fs.mkdir(repoPath, { recursive: true });
				const git = await getSimpleGitWithShellPath(repoPath);
				await git.init();
				return { success: true as const };
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						err instanceof Error
							? err.message
							: "Failed to initialize git repo",
				});
			}
		}),

		commit: publicProcedure.mutation(async () => {
			const repoPath = getCentralRepoPath();

			try {
				const git = await getSimpleGitWithShellPath(repoPath);
				const isRepo = await git.checkIsRepo();

				if (!isRepo) {
					throw new Error("Not a git repository");
				}

				await git.add(".");
				const status = await git.status();

				if (
					status.staged.length === 0 &&
					status.modified.length === 0 &&
					status.not_added.length === 0
				) {
					return {
						success: true as const,
						committed: false,
						message: "Nothing to commit",
					};
				}

				const timestamp = new Date().toISOString();
				const result = await git.commit(`Skills backup ${timestamp}`);

				return {
					success: true as const,
					committed: true,
					hash: result.commit,
					message: `Skills backup ${timestamp}`,
				};
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: err instanceof Error ? err.message : "Failed to commit",
				});
			}
		}),

		listVersions: publicProcedure.query(async () => {
			const repoPath = getCentralRepoPath();

			try {
				const git = await getSimpleGitWithShellPath(repoPath);
				const isRepo = await git.checkIsRepo();

				if (!isRepo) {
					return [];
				}

				const tags = await git.tags();
				return tags.all.map((tag) => ({ name: tag }));
			} catch {
				return [];
			}
		}),
	};
}
