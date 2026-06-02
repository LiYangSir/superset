/**
 * Get the native filesystem path for a dropped File.
 * Works in both Electron (via preload webUtils) and Tauri (via WebKit File.path).
 */
export function getPathForFile(file: File): string {
	if (window.webUtils?.getPathForFile) {
		return window.webUtils.getPathForFile(file);
	}

	const filePath = (file as File & { path?: string }).path;
	if (filePath) {
		return filePath;
	}

	throw new Error("Cannot resolve native file path in this runtime");
}
