import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	memories,
	memoryPolicies,
	memorySkills,
	memoryWorldModels,
	projects,
} from "@superset/local-db";
import { and, desc, eq, or } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

const SUPERSET_DIR_NAME = process.env.SUPERSET_DIR_NAME || ".superset";
const SUPERSET_MEMORY_PREFIX = "superset-";

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

export function categoryToSlug(category: string): string {
	return category
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
}

export function writeMemoryFile(filePath: string, content: string) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp`;
	fs.writeFileSync(tmpPath, content);
	fs.renameSync(tmpPath, filePath);
}

export function formatMemoriesAsMarkdown(
	title: string,
	mems: Array<{ content: string; category: string | null }>,
): string {
	const grouped = new Map<string, string[]>();
	for (const mem of mems) {
		const cat = mem.category || "General";
		if (!grouped.has(cat)) grouped.set(cat, []);
		grouped.get(cat)?.push(mem.content);
	}

	const lines = [`# ${title}`, ""];
	for (const [category, items] of grouped) {
		lines.push(`## ${category}`);
		for (const item of items) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function updateMemoryIndex(
	memoryDir: string,
	entries: Array<{ slug: string; name: string; description: string }>,
) {
	const indexPath = path.join(memoryDir, "MEMORY.md");

	let existingLines: string[] = [];
	try {
		existingLines = fs
			.readFileSync(indexPath, "utf-8")
			.split("\n")
			.filter(
				(line) => line.trim() && !line.includes(`(${SUPERSET_MEMORY_PREFIX}`),
			);
	} catch {}

	const newLines = entries.map(
		(e) =>
			`- [${e.name}](${SUPERSET_MEMORY_PREFIX}${e.slug}.md) — ${e.description}`,
	);

	const allLines = [...existingLines, ...newLines];

	if (allLines.length === 0) {
		try {
			fs.unlinkSync(indexPath);
		} catch {}
		return;
	}

	writeMemoryFile(indexPath, `${allLines.join("\n")}\n`);
}

export function syncToClaudeMemory(projectPath: string, projectId?: string) {
	const globalMems = localDb
		.select()
		.from(memories)
		.where(eq(memories.scope, "global"))
		.orderBy(desc(memories.updatedAt))
		.all();

	let projectMems: typeof globalMems = [];
	if (projectId) {
		projectMems = localDb
			.select()
			.from(memories)
			.where(
				and(eq(memories.scope, "project"), eq(memories.projectId, projectId)),
			)
			.orderBy(desc(memories.updatedAt))
			.all();
	}

	const memoryDir = getClaudeMemoryDir(projectPath);
	fs.mkdirSync(memoryDir, { recursive: true });

	try {
		for (const file of fs.readdirSync(memoryDir)) {
			if (file.startsWith(SUPERSET_MEMORY_PREFIX) && file.endsWith(".md")) {
				fs.unlinkSync(path.join(memoryDir, file));
			}
		}
	} catch {}

	const allMems = [...globalMems, ...projectMems];
	if (allMems.length === 0) {
		updateMemoryIndex(memoryDir, []);
		return;
	}

	const grouped = new Map<string, { scope: string; items: string[] }>();
	for (const mem of allMems) {
		const cat = mem.category || "General";
		if (!grouped.has(cat)) {
			grouped.set(cat, { scope: mem.scope, items: [] });
		}
		grouped.get(cat)?.items.push(mem.content);
	}

	const entries: Array<{ slug: string; name: string; description: string }> =
		[];

	for (const [category, { scope, items }] of grouped) {
		const slug = categoryToSlug(category);
		const fileName = `${SUPERSET_MEMORY_PREFIX}${slug}.md`;
		const memType = scope === "project" ? "project" : "user";

		const content = [
			"---",
			`name: ${category}`,
			`description: ${category} - synced from Superset`,
			`type: ${memType}`,
			"---",
			"",
			...items.map((item) => (item.includes("\n") ? item : `- ${item}`)),
			"",
		].join("\n");

		writeMemoryFile(path.join(memoryDir, fileName), content);
		entries.push({
			slug,
			name: category,
			description: `${category} (Superset)`,
		});
	}

	updateMemoryIndex(memoryDir, entries);
}

export function regenerateGlobalMemoryFile() {
	const globalMemories = localDb
		.select()
		.from(memories)
		.where(eq(memories.scope, "global"))
		.orderBy(desc(memories.updatedAt))
		.all();

	const filePath = path.join(getSupersetHomeDir(), "memory.md");

	if (globalMemories.length === 0) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	} else {
		writeMemoryFile(
			filePath,
			formatMemoriesAsMarkdown("Superset Memory (Global)", globalMemories),
		);
	}

	const allProjects = localDb.select().from(projects).all();
	for (const project of allProjects) {
		if (project.mainRepoPath) {
			syncToClaudeMemory(project.mainRepoPath, project.id);
		}
	}
}

export function regenerateProjectMemoryFile(projectId: string) {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) return;

	const projectMemories = localDb
		.select()
		.from(memories)
		.where(
			and(eq(memories.scope, "project"), eq(memories.projectId, projectId)),
		)
		.orderBy(desc(memories.updatedAt))
		.all();

	const filePath = path.join(project.mainRepoPath, ".superset", "memory.md");

	if (projectMemories.length === 0) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	} else {
		writeMemoryFile(
			filePath,
			formatMemoriesAsMarkdown(
				`Superset Memory (${project.name})`,
				projectMemories,
			),
		);
	}

	if (project.mainRepoPath) {
		syncToClaudeMemory(project.mainRepoPath, projectId);
	}
}

/**
 * Sync cognitive memory (L2 policies, L3 world models, skills) to Claude Code native memory.
 * Produces a single superset-memory.md file with all active higher-layer memories.
 */
export function syncCognitiveMemoryToFiles(projectId?: string) {
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

	const activeSkills = localDb
		.select()
		.from(memorySkills)
		.where(
			projectId
				? and(
						eq(memorySkills.status, "active"),
						or(
							eq(memorySkills.scope, "global"),
							eq(memorySkills.projectId, projectId),
						),
					)
				: and(
						eq(memorySkills.status, "active"),
						eq(memorySkills.scope, "global"),
					),
		)
		.orderBy(desc(memorySkills.eta))
		.all();

	if (
		activePolicies.length === 0 &&
		activeWorldModels.length === 0 &&
		activeSkills.length === 0
	) {
		return;
	}

	const sections: string[] = [
		"---",
		"name: Superset Cognitive Memory",
		"description: Multi-layer cognitive memory synced from Superset (policies, world models, skills)",
		"type: project",
		"---",
		"",
	];

	if (activeSkills.length > 0) {
		sections.push("## Crystallized Skills");
		for (const skill of activeSkills) {
			sections.push(`- **${skill.name}**: ${skill.invocationGuide}`);
		}
		sections.push("");
	}

	if (activePolicies.length > 0) {
		sections.push("## Policies");
		const byCategory = new Map<string, typeof activePolicies>();
		for (const p of activePolicies) {
			const cat = p.category || "General";
			if (!byCategory.has(cat)) byCategory.set(cat, []);
			byCategory.get(cat)?.push(p);
		}
		for (const [cat, policies] of byCategory) {
			sections.push(`### ${cat}`);
			for (const p of policies) {
				sections.push(`- WHEN ${p.trigger} THEN ${p.procedure}`);
			}
		}
		sections.push("");
	}

	const envModels = activeWorldModels.filter(
		(m) => m.modelType === "environment",
	);
	const infModels = activeWorldModels.filter(
		(m) => m.modelType === "inference",
	);
	const conModels = activeWorldModels.filter(
		(m) => m.modelType === "constraint",
	);

	if (envModels.length > 0) {
		sections.push("## Environment Knowledge");
		for (const m of envModels) sections.push(`- ${m.content}`);
		sections.push("");
	}

	if (infModels.length > 0) {
		sections.push("## Behavioral Rules");
		for (const m of infModels) sections.push(`- ${m.content}`);
		sections.push("");
	}

	if (conModels.length > 0) {
		sections.push("## Constraints");
		for (const m of conModels) sections.push(`- ${m.content}`);
		sections.push("");
	}

	const content = sections.join("\n");

	// Write to ~/.superset/cognitive-memory.md (always)
	writeMemoryFile(
		path.join(getSupersetHomeDir(), "cognitive-memory.md"),
		content,
	);

	if (projectId) {
		// Write to this project's Claude memory dir
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (project?.mainRepoPath) {
			const memoryDir = getClaudeMemoryDir(project.mainRepoPath);
			fs.mkdirSync(memoryDir, { recursive: true });
			writeMemoryFile(
				path.join(memoryDir, `${SUPERSET_MEMORY_PREFIX}cognitive.md`),
				content,
			);
		}
	} else {
		// Global-only: sync to ALL projects' Claude memory dirs
		const allProjects = localDb.select().from(projects).all();
		for (const project of allProjects) {
			if (project.mainRepoPath) {
				const memoryDir = getClaudeMemoryDir(project.mainRepoPath);
				fs.mkdirSync(memoryDir, { recursive: true });
				writeMemoryFile(
					path.join(memoryDir, `${SUPERSET_MEMORY_PREFIX}cognitive.md`),
					content,
				);
			}
		}
	}
}
