import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	memoryPolicies,
	memorySkills,
	memoryWorldModels,
	projects,
	skills,
	skillTargets,
} from "@superset/local-db";
import { and, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

const SUPERSET_DIR_NAME = process.env.SUPERSET_DIR_NAME || ".superset";
const SUPERSET_MEMORY_BLOCK_START = "<!-- superset-memory:start -->";
const SUPERSET_MEMORY_BLOCK_END = "<!-- superset-memory:end -->";
const SUPERSET_SKILL_PREFIX = "memory-";

export function getSupersetHomeDir(): string {
	return (
		process.env.SUPERSET_HOME_DIR || path.join(os.homedir(), SUPERSET_DIR_NAME)
	);
}

export function encodeProjectPath(projectPath: string): string {
	return projectPath.replace(/\//g, "-");
}

export function getClaudeMemoryDir(projectPath: string): string {
	const encoded = encodeProjectPath(projectPath);
	return path.join(os.homedir(), ".claude", "projects", encoded, "memory");
}

function slugify(value: string, fallback: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || fallback;
}

export function writeMemoryFile(filePath: string, content: string) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	fs.writeFileSync(tmpPath, content);
	fs.renameSync(tmpPath, filePath);
}

function removeFileIfExists(filePath: string) {
	try {
		fs.unlinkSync(filePath);
	} catch {}
}

function removeGeneratedClaudeFiles(memoryDir: string) {
	try {
		for (const file of fs.readdirSync(memoryDir)) {
			if (file.startsWith("superset-") && file.endsWith(".md")) {
				fs.unlinkSync(path.join(memoryDir, file));
			}
		}
	} catch {}
}

function replaceSupersetBlock(existing: string, block: string | null): string {
	const start = existing.indexOf(SUPERSET_MEMORY_BLOCK_START);
	const end = existing.indexOf(SUPERSET_MEMORY_BLOCK_END);
	const before =
		start >= 0 && end > start ? existing.slice(0, start).trimEnd() : existing;
	const after =
		start >= 0 && end > start
			? existing.slice(end + SUPERSET_MEMORY_BLOCK_END.length).trimStart()
			: "";

	const parts = [before.trim(), block?.trim(), after.trim()].filter(Boolean);
	return parts.length > 0 ? `${parts.join("\n\n")}\n` : "";
}

function formatCognitiveMemory(
	activePolicies: Array<typeof memoryPolicies.$inferSelect>,
	activeWorldModels: Array<typeof memoryWorldModels.$inferSelect>,
): string | null {
	if (activePolicies.length === 0 && activeWorldModels.length === 0) {
		return null;
	}

	const sections: string[] = [
		SUPERSET_MEMORY_BLOCK_START,
		"# Superset Memory",
		"",
		"These notes are generated from Superset cognitive memory.",
		"",
	];

	if (activePolicies.length > 0) {
		sections.push("## Policies");
		const byCategory = new Map<string, typeof activePolicies>();
		for (const policy of activePolicies) {
			const category = policy.category || "General";
			if (!byCategory.has(category)) byCategory.set(category, []);
			byCategory.get(category)?.push(policy);
		}

		for (const [category, policies] of byCategory) {
			sections.push(`### ${category}`);
			for (const policy of policies) {
				sections.push(`- ${policy.trigger} -> ${policy.procedure}`);
			}
			sections.push("");
		}
	}

	const modelGroups: Array<{
		type: "environment" | "inference" | "constraint";
		title: string;
	}> = [
		{ type: "environment", title: "Environment Knowledge" },
		{ type: "inference", title: "Behavioral Rules" },
		{ type: "constraint", title: "Constraints" },
	];

	for (const group of modelGroups) {
		const models = activeWorldModels.filter((m) => m.modelType === group.type);
		if (models.length === 0) continue;
		sections.push(`## ${group.title}`);
		for (const model of models) {
			sections.push(`- ${model.content}`);
		}
		sections.push("");
	}

	sections.push(SUPERSET_MEMORY_BLOCK_END);
	return sections.join("\n");
}

function syncProjectMemory(projectPath: string, projectId?: string): string {
	const activePolicies = localDb
		.select()
		.from(memoryPolicies)
		.where(
			projectId
				? and(
						eq(memoryPolicies.status, "active"),
						or(
							eq(memoryPolicies.scope, "global"),
							eq(memoryPolicies.projectId, projectId),
						),
					)
				: and(
						eq(memoryPolicies.status, "active"),
						eq(memoryPolicies.scope, "global"),
					),
		)
		.orderBy(desc(memoryPolicies.support))
		.all();

	const activeWorldModels = localDb
		.select()
		.from(memoryWorldModels)
		.where(
			projectId
				? and(
						eq(memoryWorldModels.status, "active"),
						or(
							eq(memoryWorldModels.scope, "global"),
							eq(memoryWorldModels.projectId, projectId),
						),
					)
				: and(
						eq(memoryWorldModels.status, "active"),
						eq(memoryWorldModels.scope, "global"),
					),
		)
		.orderBy(desc(memoryWorldModels.confidence))
		.all();

	const memoryDir = getClaudeMemoryDir(projectPath);
	fs.mkdirSync(memoryDir, { recursive: true });
	removeGeneratedClaudeFiles(memoryDir);

	const indexPath = path.join(memoryDir, "MEMORY.md");
	let existing = "";
	try {
		existing = fs.readFileSync(indexPath, "utf-8");
	} catch {}

	const block = formatCognitiveMemory(activePolicies, activeWorldModels);
	const next = replaceSupersetBlock(existing, block);

	if (next.trim()) {
		writeMemoryFile(indexPath, next);
	} else {
		removeFileIfExists(indexPath);
	}

	removeFileIfExists(path.join(projectPath, ".superset", "memory.md"));

	return indexPath;
}

function formatSkillMarkdown(skill: typeof memorySkills.$inferSelect): string {
	const lines = [
		"---",
		`name: ${skill.name}`,
		`description: ${skill.invocationGuide}`,
		"---",
		"",
		`# ${skill.name}`,
		"",
		skill.invocationGuide,
		"",
	];

	if (skill.procedureJson && skill.procedureJson.length > 0) {
		lines.push("## Procedure");
		for (const step of skill.procedureJson) {
			lines.push(`${step.step}. ${step.action}`);
			if (step.detail) {
				lines.push(`   ${step.detail}`);
			}
		}
		lines.push("");
	}

	if (skill.evidenceAnchors && skill.evidenceAnchors.length > 0) {
		lines.push("## Evidence");
		for (const evidence of skill.evidenceAnchors) {
			lines.push(`- ${evidence}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function registerActiveMemorySkills(): number {
	const activeSkills = localDb
		.select()
		.from(memorySkills)
		.where(eq(memorySkills.status, "active"))
		.orderBy(desc(memorySkills.eta))
		.all();

	const skillsRoot = path.join(getSupersetHomeDir(), "skills");
	const activeSourceRefs = new Set(activeSkills.map((skill) => skill.id));
	const existingMemorySkills = localDb
		.select()
		.from(skills)
		.where(eq(skills.sourceType, "memory"))
		.all();

	for (const existing of existingMemorySkills) {
		if (existing.sourceRef && activeSourceRefs.has(existing.sourceRef)) {
			continue;
		}

		localDb
			.delete(skillTargets)
			.where(eq(skillTargets.skillId, existing.id))
			.run();
		localDb.delete(skills).where(eq(skills.id, existing.id)).run();
		if (existing.centralPath.startsWith(skillsRoot)) {
			try {
				fs.rmSync(existing.centralPath, { recursive: true, force: true });
			} catch {}
		}
	}

	for (const skill of activeSkills) {
		const dirName = `${SUPERSET_SKILL_PREFIX}${slugify(
			skill.name,
			skill.id.slice(0, 8),
		)}-${skill.id.slice(0, 8)}`;
		const centralPath = path.join(skillsRoot, dirName);
		writeMemoryFile(
			path.join(centralPath, "SKILL.md"),
			formatSkillMarkdown(skill),
		);

		const existing = localDb
			.select()
			.from(skills)
			.where(
				and(eq(skills.sourceType, "memory"), eq(skills.sourceRef, skill.id)),
			)
			.get();

		if (
			existing &&
			existing.centralPath !== centralPath &&
			existing.centralPath.startsWith(skillsRoot)
		) {
			try {
				fs.rmSync(existing.centralPath, { recursive: true, force: true });
			} catch {}
		}

		const values = {
			name: skill.name,
			description: skill.invocationGuide,
			sourceType: "memory" as const,
			sourceRef: skill.id,
			sourceRefResolved: null,
			sourceSubpath: null,
			sourceBranch: null,
			sourceRevision: null,
			remoteRevision: null,
			updateStatus: "local_only" as const,
			centralPath,
			contentHash: String(skill.updatedAt),
			enabled: true,
			tags: ["memory"],
			updatedAt: Date.now(),
		};

		if (existing) {
			localDb
				.update(skills)
				.set(values)
				.where(eq(skills.id, existing.id))
				.run();
		} else {
			localDb
				.insert(skills)
				.values({
					...values,
					createdAt: Date.now(),
				})
				.run();
		}
	}

	return activeSkills.length;
}

function getProjectsToSync(projectId?: string) {
	if (projectId) {
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		return project ? [project] : [];
	}

	return localDb.select().from(projects).all();
}

export function syncCognitiveMemoryToFiles(projectId?: string) {
	const syncedMemoryFiles: string[] = [];
	for (const project of getProjectsToSync(projectId)) {
		if (!project.mainRepoPath) continue;
		syncedMemoryFiles.push(syncProjectMemory(project.mainRepoPath, project.id));
	}

	removeFileIfExists(path.join(getSupersetHomeDir(), "memory.md"));
	removeFileIfExists(path.join(getSupersetHomeDir(), "cognitive-memory.md"));

	return {
		success: true,
		memoryFiles: syncedMemoryFiles,
		skillsRegistered: registerActiveMemorySkills(),
	};
}
