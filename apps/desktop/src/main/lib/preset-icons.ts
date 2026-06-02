import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";

export const PRESET_ICONS_DIR = join(SUPERSET_HOME_DIR, "preset-icons");

const MAX_ICON_SIZE = 512 * 1024;

export function ensurePresetIconsDir(): void {
	if (!existsSync(PRESET_ICONS_DIR)) {
		mkdirSync(PRESET_ICONS_DIR, { recursive: true });
	}
}

export function getPresetIconPath(presetId: string): string | null {
	if (!existsSync(PRESET_ICONS_DIR)) return null;

	const files = readdirSync(PRESET_ICONS_DIR);
	const match = files.find((f) => {
		const name = f.substring(0, f.lastIndexOf("."));
		return name === presetId;
	});

	return match ? join(PRESET_ICONS_DIR, match) : null;
}

export function getPresetIconProtocolUrl(presetId: string): string {
	return `superset-icon://presets/${presetId}`;
}

export async function savePresetIconFromDataUrl({
	presetId,
	dataUrl,
}: {
	presetId: string;
	dataUrl: string;
}): Promise<string> {
	ensurePresetIconsDir();
	deletePresetIcon(presetId);

	const match = dataUrl.match(/^data:image\/svg\+xml;base64,(.+)$/);
	if (!match) {
		throw new Error("Invalid data URL format. Only SVG is supported.");
	}

	const buffer = Buffer.from(match[1], "base64");

	if (buffer.length > MAX_ICON_SIZE) {
		throw new Error(
			`Icon file too large (${Math.round(buffer.length / 1024)}KB). Maximum is ${MAX_ICON_SIZE / 1024}KB.`,
		);
	}

	const destPath = join(PRESET_ICONS_DIR, `${presetId}.svg`);
	await writeFile(destPath, buffer);

	return getPresetIconProtocolUrl(presetId);
}

export function deletePresetIcon(presetId: string): void {
	const existing = getPresetIconPath(presetId);
	if (existing) {
		unlinkSync(existing);
	}
}
