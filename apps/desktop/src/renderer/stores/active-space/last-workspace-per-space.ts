const STORAGE_KEY = "lastWorkspacePerSpace";

function readMap(): Record<string, string> {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function writeMap(map: Record<string, string>) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		return;
	}
}

export function setLastWorkspaceForSpace(
	spaceId: string,
	workspaceId: string,
) {
	const map = readMap();
	map[spaceId] = workspaceId;
	writeMap(map);
}

export function getLastWorkspaceForSpace(spaceId: string): string | null {
	return readMap()[spaceId] ?? null;
}
