import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ToolCategory = "coding" | "lobster";

export interface ToolAdapter {
	key: string;
	displayName: string;
	relativeSkillsDir: string;
	relativeDetectDir: string;
	additionalScanDirs: string[];
	overrideSkillsDir: string | null;
	isCustom: boolean;
	recursiveScan: boolean;
	projectRelativeSkillsDir: string | null;
	category: ToolCategory;
}

export interface CustomToolDef {
	key: string;
	displayName: string;
	skillsDir: string;
	projectRelativeSkillsDir: string | null;
	category: ToolCategory;
}

export interface ToolInfo {
	key: string;
	displayName: string;
	installed: boolean;
	skillsDir: string;
	enabled: boolean;
	isCustom: boolean;
	hasPathOverride: boolean;
	projectRelativeSkillsDir: string;
	hasProjectPathOverride: boolean;
	category: ToolCategory;
}

export interface SkillSettingsAccessor {
	getSetting(key: string): string | null;
}

export function getHomeDir(): string {
	return os.homedir();
}

export function candidatePaths(relative: string): string[] {
	const home = getHomeDir();
	const paths = [path.join(home, relative)];

	if (relative.startsWith(".config/")) {
		const subpath = relative.slice(".config/".length);
		const platform = process.platform;
		if (platform === "darwin") {
			paths.push(path.join(home, "Library", "Application Support", subpath));
		} else if (platform === "linux") {
			paths.push(path.join(home, ".config", subpath));
		}
	}

	return paths;
}

export function selectExistingOrDefault(paths: string[]): string {
	for (const p of paths) {
		if (fs.existsSync(p)) {
			return p;
		}
	}
	return paths[0] ?? "";
}

export function getSkillsDir(adapter: ToolAdapter): string {
	if (adapter.overrideSkillsDir) {
		return adapter.overrideSkillsDir;
	}
	return selectExistingOrDefault(candidatePaths(adapter.relativeSkillsDir));
}

export function getProjectRelativeSkillsDir(adapter: ToolAdapter): string {
	return adapter.projectRelativeSkillsDir ?? adapter.relativeSkillsDir;
}

export function isToolInstalled(adapter: ToolAdapter): boolean {
	if (adapter.isCustom || adapter.overrideSkillsDir) {
		return true;
	}
	const paths = candidatePaths(adapter.relativeDetectDir);
	return paths.some((p) => fs.existsSync(p));
}

function makeAdapter(
	key: string,
	displayName: string,
	relativeSkillsDir: string,
	relativeDetectDir: string,
	category: ToolCategory,
	extras?: Partial<
		Pick<
			ToolAdapter,
			"additionalScanDirs" | "recursiveScan" | "projectRelativeSkillsDir"
		>
	>,
): ToolAdapter {
	return {
		key,
		displayName,
		relativeSkillsDir,
		relativeDetectDir,
		additionalScanDirs: extras?.additionalScanDirs ?? [],
		overrideSkillsDir: null,
		isCustom: false,
		recursiveScan: extras?.recursiveScan ?? false,
		projectRelativeSkillsDir: extras?.projectRelativeSkillsDir ?? null,
		category,
	};
}

export function getDefaultAdapters(): ToolAdapter[] {
	return [
		makeAdapter("cursor", "Cursor", ".cursor/skills", ".cursor", "coding"),
		makeAdapter(
			"claude_code",
			"Claude Code",
			".claude/skills",
			".claude",
			"coding",
		),
		makeAdapter("codex", "Codex", ".codex/skills", ".codex", "coding", {
			additionalScanDirs: [".agents/skills"],
		}),
		makeAdapter(
			"opencode",
			"OpenCode",
			".config/opencode/skills",
			".config/opencode",
			"coding",
			{
				projectRelativeSkillsDir: ".opencode/skills",
			},
		),
		makeAdapter(
			"antigravity",
			"Antigravity",
			".gemini/antigravity/skills",
			".gemini/antigravity",
			"coding",
		),
		makeAdapter(
			"amp",
			"Amp",
			".config/agents/skills",
			".config/agents",
			"coding",
		),
		makeAdapter(
			"kilo_code",
			"Kilo Code",
			".kilocode/skills",
			".kilocode",
			"coding",
		),
		makeAdapter("roo_code", "Roo Code", ".roo/skills", ".roo", "coding"),
		makeAdapter(
			"goose",
			"Goose",
			".config/goose/skills",
			".config/goose",
			"coding",
		),
		makeAdapter(
			"gemini_cli",
			"Gemini CLI",
			".gemini/skills",
			".gemini",
			"coding",
		),
		makeAdapter(
			"github_copilot",
			"GitHub Copilot",
			".copilot/skills",
			".copilot",
			"coding",
			{
				additionalScanDirs: [".agents/skills"],
			},
		),
		makeAdapter(
			"openclaw",
			"OpenClaw",
			".openclaw/skills",
			".openclaw",
			"lobster",
		),
		makeAdapter("droid", "Droid", ".factory/skills", ".factory", "coding"),
		makeAdapter(
			"windsurf",
			"Windsurf",
			".codeium/windsurf/skills",
			".codeium/windsurf",
			"coding",
		),
		makeAdapter("trae", "TRAE IDE", ".trae/skills", ".trae", "coding"),
		makeAdapter("cline", "Cline", ".agents/skills", ".cline", "coding"),
		makeAdapter(
			"deepagents",
			"Deep Agents",
			".deepagents/agent/skills",
			".deepagents",
			"coding",
		),
		makeAdapter(
			"firebender",
			"Firebender",
			".firebender/skills",
			".firebender",
			"coding",
		),
		makeAdapter(
			"kimi",
			"Kimi Code CLI",
			".config/agents/skills",
			".kimi",
			"coding",
		),
		makeAdapter(
			"replit",
			"Replit",
			".config/agents/skills",
			".replit",
			"coding",
		),
		makeAdapter("warp", "Warp", ".agents/skills", ".warp", "coding"),
		makeAdapter("augment", "Augment", ".augment/skills", ".augment", "coding"),
		makeAdapter("bob", "IBM Bob", ".bob/skills", ".bob", "coding"),
		makeAdapter(
			"codebuddy",
			"CodeBuddy",
			".codebuddy/skills",
			".codebuddy",
			"coding",
		),
		makeAdapter(
			"command_code",
			"Command Code",
			".commandcode/skills",
			".commandcode",
			"coding",
		),
		makeAdapter(
			"continue",
			"Continue",
			".continue/skills",
			".continue",
			"coding",
		),
		makeAdapter(
			"cortex",
			"Cortex Code",
			".snowflake/cortex/skills",
			".snowflake/cortex",
			"coding",
		),
		makeAdapter(
			"crush",
			"Crush",
			".config/crush/skills",
			".config/crush",
			"coding",
		),
		makeAdapter("iflow", "iFlow CLI", ".iflow/skills", ".iflow", "coding"),
		makeAdapter("junie", "Junie", ".junie/skills", ".junie", "coding"),
		makeAdapter("kiro", "Kiro CLI", ".kiro/skills", ".kiro", "coding"),
		makeAdapter("kode", "Kode", ".kode/skills", ".kode", "coding"),
		makeAdapter("mcpjam", "MCPJam", ".mcpjam/skills", ".mcpjam", "coding"),
		makeAdapter(
			"mistral_vibe",
			"Mistral Vibe",
			".vibe/skills",
			".vibe",
			"coding",
		),
		makeAdapter("mux", "Mux", ".mux/skills", ".mux", "coding"),
		makeAdapter("neovate", "Neovate", ".neovate/skills", ".neovate", "coding"),
		makeAdapter(
			"openhands",
			"OpenHands",
			".openhands/skills",
			".openhands",
			"coding",
		),
		makeAdapter("pi", "Pi", ".pi/agent/skills", ".pi/agent", "coding"),
		makeAdapter("pochi", "Pochi", ".pochi/skills", ".pochi", "coding"),
		makeAdapter("qoder", "Qoder", ".qoder/skills", ".qoder", "coding"),
		makeAdapter("qwen_code", "Qwen Code", ".qwen/skills", ".qwen", "coding"),
		makeAdapter("trae_cn", "TRAE CN", ".trae-cn/skills", ".trae-cn", "coding"),
		makeAdapter(
			"zencoder",
			"Zencoder",
			".zencoder/skills",
			".zencoder",
			"coding",
		),
		makeAdapter("adal", "AdaL", ".adal/skills", ".adal", "coding"),
		makeAdapter(
			"hermes",
			"Hermes Agent",
			".hermes/skills",
			".hermes",
			"lobster",
			{
				recursiveScan: true,
			},
		),
		makeAdapter("qclaw", "QClaw", ".qclaw/skills", ".qclaw", "lobster"),
		makeAdapter(
			"easyclaw",
			"EasyClaw",
			".easyclaw/skills",
			".easyclaw",
			"lobster",
		),
		makeAdapter(
			"autoclaw",
			"AutoClaw",
			".openclaw-autoclaw/skills",
			".openclaw-autoclaw",
			"lobster",
		),
		makeAdapter(
			"workbuddy",
			"WorkBuddy",
			".workbuddy/skills-marketplace/skills",
			".workbuddy",
			"lobster",
		),
	];
}

export function getAllAdapters(settings: SkillSettingsAccessor): ToolAdapter[] {
	const adapters = getDefaultAdapters();

	const customToolsJson = settings.getSetting("custom_tools");
	if (customToolsJson) {
		try {
			const customTools: CustomToolDef[] = JSON.parse(customToolsJson);
			for (const ct of customTools) {
				adapters.push({
					key: ct.key,
					displayName: ct.displayName,
					relativeSkillsDir: ct.skillsDir,
					relativeDetectDir: ct.skillsDir,
					additionalScanDirs: [],
					overrideSkillsDir: ct.skillsDir,
					isCustom: true,
					recursiveScan: false,
					projectRelativeSkillsDir: ct.projectRelativeSkillsDir,
					category: ct.category,
				});
			}
		} catch {
			// invalid JSON, skip custom tools
		}
	}

	for (const adapter of adapters) {
		const overrideKey = `tool_path_override_${adapter.key}`;
		const overridePath = settings.getSetting(overrideKey);
		if (overridePath) {
			adapter.overrideSkillsDir = overridePath;
		}

		const projectOverrideKey = `tool_project_path_override_${adapter.key}`;
		const projectOverridePath = settings.getSetting(projectOverrideKey);
		if (projectOverridePath) {
			adapter.projectRelativeSkillsDir = projectOverridePath;
		}
	}

	return adapters;
}

export function findAdapter(key: string): ToolAdapter | undefined {
	return getDefaultAdapters().find((a) => a.key === key);
}

export function findAdapterWithSettings(
	settings: SkillSettingsAccessor,
	key: string,
): ToolAdapter | undefined {
	return getAllAdapters(settings).find((a) => a.key === key);
}

export function getEnabledInstalledAdapters(
	settings: SkillSettingsAccessor,
): ToolAdapter[] {
	const adapters = getAllAdapters(settings);
	return adapters.filter((adapter) => {
		if (!isToolInstalled(adapter)) {
			return false;
		}
		const disabledKey = `tool_disabled_${adapter.key}`;
		const disabled = settings.getSetting(disabledKey);
		return disabled !== "true";
	});
}
