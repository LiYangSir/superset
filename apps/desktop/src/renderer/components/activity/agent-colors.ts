const AGENT_BRAND_COLORS: Record<string, string> = {
	"claude-code": "#d97742",
	claude: "#d97742",
	codex: "#4aa3df",
	"gemini-cli": "#42e86b",
	gemini: "#42e86b",
	opencode: "#ffb547",
	qoder: "#ff6b9f",
	"qwen-code": "#c084fc",
	factory: "#6e9fff",
	codebuddy: "#fca5a5",
	cursor: "#7a5cff",
	"kimi-cli": "#fde047",
};

export function getAgentColor(
	presetName: string | null | undefined,
): string | undefined {
	if (!presetName) return undefined;
	const key = presetName.toLowerCase().replace(/\s+/g, "-");
	return AGENT_BRAND_COLORS[key];
}
