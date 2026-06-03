import type { ITerminalOptions } from "@xterm/xterm";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Fallback timeout for first render (in case xterm doesn't emit onRender)
export const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// Nerd Fonts first for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
// Multi-word family names MUST be quoted so that the CSS `font` shorthand
// (used by Canvas measureText) parses them as a single family name.
// Without quotes, "JetBrains Mono" becomes two families: "JetBrains" and "Mono",
// causing WebKit's Canvas to fall back to a proportional serif font.
export const DEFAULT_TERMINAL_FONT_FAMILY = [
	'"MesloLGM Nerd Font"',
	'"MesloLGM NF"',
	'"MesloLGS NF"',
	'"MesloLGS Nerd Font"',
	'"Hack Nerd Font"',
	'"FiraCode Nerd Font"',
	'"JetBrainsMono Nerd Font"',
	'"CaskaydiaCove Nerd Font"',
	"Menlo",
	"Monaco",
	'"Courier New"',
	'"SF Mono"',
	'"SF Pro"',
	"monospace",
].join(", ");

export const DEFAULT_TERMINAL_FONT_SIZE = 14;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: 2000,
	// Allow Option+key to type special characters on international keyboards (e.g., Option+2 = @)
	macOptionIsMeta: false,
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	screenReaderMode: false,
	// xterm's fit addon permanently reserves scrollbar width from usable columns.
	// Hide the built-in scrollbar so terminal content can use the full pane width.
	scrollbar: {
		showScrollbar: false,
	},
};

export const RESIZE_DEBOUNCE_MS = 150;

const CSS_GENERIC_FAMILIES = new Set([
	"monospace",
	"serif",
	"sans-serif",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-monospace",
	"ui-serif",
	"ui-sans-serif",
	"ui-rounded",
]);

/**
 * Ensure multi-word font family names are quoted for CSS `font` shorthand
 * compatibility. Without quotes, `ctx.font = "14px JetBrains Mono"` is parsed
 * as two families ("JetBrains", "Mono") per the CSS spec — WebKit follows this
 * strictly, causing Canvas measureText to use a wrong fallback font.
 */
export function quoteFontFamily(fontFamily: string): string {
	return fontFamily
		.split(",")
		.map((f) => {
			let trimmed = f.trim();
			if (!trimmed) return trimmed;
			// Normalize single quotes to double quotes — WebKit Canvas ctx.font
			// doesn't reliably parse single-quoted family names.
			if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
				trimmed = trimmed.slice(1, -1);
				if (!trimmed.includes(" ")) return trimmed;
				return `"${trimmed}"`;
			}
			if (trimmed.startsWith('"')) return trimmed;
			if (CSS_GENERIC_FAMILIES.has(trimmed)) return trimmed;
			if (!trimmed.includes(" ")) return trimmed;
			return `"${trimmed}"`;
		})
		.join(", ");
}
