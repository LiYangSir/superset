import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";
import copilotIcon from "./copilot.svg";
import copilotWhiteIcon from "./copilot-white.svg";
import cursorAgentIcon from "./cursor.svg";
import geminiIcon from "./gemini.svg";
import opencodeIcon from "./opencode.svg";
import opencodeWhiteIcon from "./opencode-white.svg";
import supersetIcon from "./superset.svg";

export interface PresetIconSet {
	light: string;
	dark: string;
	sizeClass?: string;
}

export const PRESET_ICONS: Record<string, PresetIconSet> = {
	claude: { light: claudeIcon, dark: claudeIcon, sizeClass: "size-3" },
	codex: {
		light: codexIcon,
		dark: codexWhiteIcon,
		sizeClass: "size-[18px]",
	},
	copilot: { light: copilotIcon, dark: copilotWhiteIcon },
	gemini: { light: geminiIcon, dark: geminiIcon },
	superset: { light: supersetIcon, dark: supersetIcon },
	"superset-chat": { light: supersetIcon, dark: supersetIcon },
	"cursor-agent": { light: cursorAgentIcon, dark: cursorAgentIcon },
	opencode: { light: opencodeIcon, dark: opencodeWhiteIcon },
};

export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return isDark ? iconSet.dark : iconSet.light;
}

export function getPresetIconSizeClass(
	presetName: string,
): string | undefined {
	const normalizedName = presetName.toLowerCase().trim();
	return PRESET_ICONS[normalizedName]?.sizeClass;
}

export {
	claudeIcon,
	codexIcon,
	codexWhiteIcon,
	copilotIcon,
	copilotWhiteIcon,
	cursorAgentIcon,
	geminiIcon,
	opencodeIcon,
	opencodeWhiteIcon,
	supersetIcon,
};
