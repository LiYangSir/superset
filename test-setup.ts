/**
 * Global test setup for vitest
 *
 * This file mocks EXTERNAL dependencies only:
 * - Electron APIs (app, dialog, BrowserWindow, ipcMain)
 * - Browser globals (document, window)
 * - trpc-electron renderer requirements
 *
 * DO NOT mock internal code here - tests should use real implementations
 * or mock at the individual test level when necessary.
 */
import { vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.SKIP_ENV_VALIDATION = "1";

const testTmpDir = join(tmpdir(), "superset-test");

// =============================================================================
// Browser Global Mocks (required for renderer code that touches DOM)
// =============================================================================

const mockStyleMap = new Map<string, string>();
const mockClassList = new Set<string>();

const mockHead = {
	appendChild: vi.fn(() => {}),
	removeChild: vi.fn(() => {}),
};

// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
(globalThis as any).document = {
	documentElement: {
		style: {
			setProperty: (key: string, value: string) => mockStyleMap.set(key, value),
			getPropertyValue: (key: string) => mockStyleMap.get(key) || "",
		},
		classList: {
			add: (className: string) => mockClassList.add(className),
			remove: (className: string) => mockClassList.delete(className),
			toggle: (className: string) => {
				mockClassList.has(className)
					? mockClassList.delete(className)
					: mockClassList.add(className);
			},
			contains: (className: string) => mockClassList.has(className),
		},
	},
	head: mockHead,
	getElementsByTagName: vi.fn((tag: string) => {
		if (tag === "head") return [mockHead];
		return [];
	}),
	createElement: vi.fn((_tag: string) => ({
		setAttribute: vi.fn(() => {}),
		appendChild: vi.fn(() => {}),
		textContent: "",
		type: "",
	})),
	createTextNode: vi.fn((text: string) => ({
		textContent: text,
	})),
};

// =============================================================================
// Electron Preload Mocks (exposed via contextBridge in real app)
// =============================================================================

// trpc-electron expects this global for renderer-side communication
// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
(globalThis as any).electronTRPC = {
	sendMessage: () => {},
	onMessage: (_callback: (msg: unknown) => void) => {},
};

// =============================================================================
// Electron Module Mock (the actual electron package)
// =============================================================================

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => testTmpDir),
		getName: vi.fn(() => "test-app"),
		getVersion: vi.fn(() => "1.0.0"),
		getAppPath: vi.fn(() => testTmpDir),
		isPackaged: false,
	},
	dialog: {
		showOpenDialog: vi.fn(() =>
			Promise.resolve({ canceled: false, filePaths: [] }),
		),
		showSaveDialog: vi.fn(() =>
			Promise.resolve({ canceled: false, filePath: "" }),
		),
		showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
	},
	BrowserWindow: vi.fn(() => ({
		webContents: { send: vi.fn() },
		loadURL: vi.fn(),
		on: vi.fn(),
	})),
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
	},
	shell: {
		openExternal: vi.fn(() => Promise.resolve()),
		openPath: vi.fn(() => Promise.resolve("")),
	},
	clipboard: {
		writeText: vi.fn(),
		readText: vi.fn(() => ""),
	},
	screen: {
		getPrimaryDisplay: vi.fn(() => ({
			workAreaSize: { width: 1920, height: 1080 },
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
		getAllDisplays: vi.fn(() => [
			{
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
				workAreaSize: { width: 1920, height: 1080 },
			},
		]),
	},
	Notification: vi.fn(() => ({
		show: vi.fn(),
		on: vi.fn(),
	})),
	Menu: {
		buildFromTemplate: vi.fn(() => ({})),
		setApplicationMenu: vi.fn(),
	},
}));

// =============================================================================
// Analytics Mock (has Electron/API dependencies)
// =============================================================================

vi.mock("main/lib/analytics", () => ({
	track: vi.fn(() => {}),
	clearUserCache: vi.fn(() => {}),
	shutdown: vi.fn(() => Promise.resolve()),
}));

// =============================================================================
// @superset/local-db Schema Mock (drizzle-orm/sqlite-core not available in tests)
// =============================================================================

const mockTable = (name: string) => ({ id: `${name}_id` });

const localDbMock = () => ({
	projects: mockTable("projects"),
	workspaces: mockTable("workspaces"),
	worktrees: mockTable("worktrees"),
	settings: mockTable("settings"),
	users: mockTable("users"),
	organizations: mockTable("organizations"),
	organizationMembers: mockTable("organization_members"),
	tasks: mockTable("tasks"),
	workspaceSections: mockTable("workspace_sections"),
	EXTERNAL_APPS: [],
	EXECUTION_MODES: ["sequential", "parallel"],
	BRANCH_PREFIX_MODES: ["none", "github", "author", "custom"],
	TERMINAL_LINK_BEHAVIORS: ["external-editor", "file-viewer"],
	FILE_OPEN_MODES: ["split-pane", "new-tab"],
});

// Mock both the package name and the resolved source path to handle
// workspace package resolution in different versions.
vi.mock("@superset/local-db", localDbMock);
vi.mock("@superset/local-db/schema", localDbMock);

// =============================================================================
// Local DB Mock (better-sqlite3 not supported in tests)
// =============================================================================

vi.mock("main/lib/local-db", () => ({
	localDb: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: vi.fn(() => null),
					all: vi.fn(() => []),
				})),
				get: vi.fn(() => null),
				all: vi.fn(() => []),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => ({
					get: vi.fn(() => ({ id: "test-id" })),
				})),
				onConflictDoUpdate: vi.fn(() => ({
					run: vi.fn(),
				})),
				run: vi.fn(),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: vi.fn(),
					returning: vi.fn(() => ({
						get: vi.fn(() => ({ id: "test-id" })),
					})),
				})),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				run: vi.fn(),
			})),
		})),
	},
}));
