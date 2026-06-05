import adalIcon from "renderer/assets/agent-icons/adal.png";
import ampIcon from "renderer/assets/agent-icons/amp.svg";
import antigravityIcon from "renderer/assets/agent-icons/antigravity.png";
import augmentIcon from "renderer/assets/agent-icons/augment.svg";
import bobIcon from "renderer/assets/agent-icons/bob.png";
import claudeCodeIcon from "renderer/assets/agent-icons/claude_code.svg";
import clineIcon from "renderer/assets/agent-icons/cline.png";
import codebuddyIcon from "renderer/assets/agent-icons/codebuddy.svg";
import codexIcon from "renderer/assets/agent-icons/codex.svg";
import commandCodeIcon from "renderer/assets/agent-icons/command_code.svg";
import continueIcon from "renderer/assets/agent-icons/continue.png";
import cortexIcon from "renderer/assets/agent-icons/cortex.png";
import crushIcon from "renderer/assets/agent-icons/crush.png";
import cursorIcon from "renderer/assets/agent-icons/cursor.png";
import deepagentsIcon from "renderer/assets/agent-icons/deepagents.png";
import droidIcon from "renderer/assets/agent-icons/droid.svg";
import firebenderIcon from "renderer/assets/agent-icons/firebender.svg";
import geminiCliIcon from "renderer/assets/agent-icons/gemini_cli.svg";
import githubCopilotIcon from "renderer/assets/agent-icons/github_copilot.png";
import gooseIcon from "renderer/assets/agent-icons/goose.png";
import hermesIcon from "renderer/assets/agent-icons/hermes.png";
import iflowIcon from "renderer/assets/agent-icons/iflow.png";
import junieIcon from "renderer/assets/agent-icons/junie.png";
import kiloCodeIcon from "renderer/assets/agent-icons/kilo_code.svg";
import kimiIcon from "renderer/assets/agent-icons/kimi.svg";
import kiroIcon from "renderer/assets/agent-icons/kiro.svg";
import kodeIcon from "renderer/assets/agent-icons/kode.png";
import mcpjamIcon from "renderer/assets/agent-icons/mcpjam.png";
import mistralVibeIcon from "renderer/assets/agent-icons/mistral_vibe.svg";
import muxIcon from "renderer/assets/agent-icons/mux.png";
import neovateIcon from "renderer/assets/agent-icons/neovate.png";
import openclawIcon from "renderer/assets/agent-icons/openclaw.svg";
import opencodeIcon from "renderer/assets/agent-icons/opencode.png";
import openhandsIcon from "renderer/assets/agent-icons/openhands.png";
import piIcon from "renderer/assets/agent-icons/pi.svg";
import pochiIcon from "renderer/assets/agent-icons/pochi.png";
import qoderIcon from "renderer/assets/agent-icons/qoder.svg";
import qwenCodeIcon from "renderer/assets/agent-icons/qwen_code.png";
import replitIcon from "renderer/assets/agent-icons/replit.png";
import rooCodeIcon from "renderer/assets/agent-icons/roo_code.svg";
import traeIcon from "renderer/assets/agent-icons/trae.svg";
import traeCnIcon from "renderer/assets/agent-icons/trae_cn.svg";
import warpIcon from "renderer/assets/agent-icons/warp.svg";
import windsurfIcon from "renderer/assets/agent-icons/windsurf.svg";
import zencoderIcon from "renderer/assets/agent-icons/zencoder.png";

const AGENT_ICONS: Record<string, string> = {
	adal: adalIcon,
	amp: ampIcon,
	antigravity: antigravityIcon,
	augment: augmentIcon,
	bob: bobIcon,
	claude_code: claudeCodeIcon,
	cline: clineIcon,
	codebuddy: codebuddyIcon,
	codex: codexIcon,
	command_code: commandCodeIcon,
	continue: continueIcon,
	cortex: cortexIcon,
	crush: crushIcon,
	cursor: cursorIcon,
	deepagents: deepagentsIcon,
	droid: droidIcon,
	firebender: firebenderIcon,
	gemini_cli: geminiCliIcon,
	github_copilot: githubCopilotIcon,
	goose: gooseIcon,
	hermes: hermesIcon,
	iflow: iflowIcon,
	junie: junieIcon,
	kilo_code: kiloCodeIcon,
	kimi: kimiIcon,
	kiro: kiroIcon,
	kode: kodeIcon,
	mcpjam: mcpjamIcon,
	mistral_vibe: mistralVibeIcon,
	mux: muxIcon,
	neovate: neovateIcon,
	openclaw: openclawIcon,
	opencode: opencodeIcon,
	openhands: openhandsIcon,
	pi: piIcon,
	pochi: pochiIcon,
	qoder: qoderIcon,
	qwen_code: qwenCodeIcon,
	replit: replitIcon,
	roo_code: rooCodeIcon,
	trae: traeIcon,
	trae_cn: traeCnIcon,
	warp: warpIcon,
	windsurf: windsurfIcon,
	zencoder: zencoderIcon,
};

export function getAgentIconUrl(agentKey: string): string | null {
	return AGENT_ICONS[agentKey] ?? null;
}

export function hasAgentIcon(agentKey: string): boolean {
	return agentKey in AGENT_ICONS;
}

export function shortLabel(displayName: string, key: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[1][0]).toUpperCase();
	}
	const word = words[0] || key;
	return word.slice(0, 2).toUpperCase();
}
