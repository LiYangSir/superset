import type { ExternalApp } from "@superset/local-db";
import antigravityIcon from "assets/app-icons/antigravity.svg";
import appcodeIcon from "assets/app-icons/appcode.svg";
import clionIcon from "assets/app-icons/clion.svg";
import cursorIcon from "assets/app-icons/cursor.svg";
import datagripIcon from "assets/app-icons/datagrip.svg";
import finderIcon from "assets/app-icons/finder.png";
import fleetIcon from "assets/app-icons/fleet.svg";
import ghosttyIcon from "assets/app-icons/ghostty.svg";
import golandIcon from "assets/app-icons/goland.svg";
import intellijIcon from "assets/app-icons/intellij.svg";
import itermIcon from "assets/app-icons/iterm.png";
import phpstormIcon from "assets/app-icons/phpstorm.svg";
import pycharmIcon from "assets/app-icons/pycharm.svg";
import riderIcon from "assets/app-icons/rider.svg";
import rubymineIcon from "assets/app-icons/rubymine.svg";
import rustroverIcon from "assets/app-icons/rustrover.svg";
import sublimeIcon from "assets/app-icons/sublime.svg";
import terminalIcon from "assets/app-icons/terminal.png";
import vscodeIcon from "assets/app-icons/vscode.svg";
import vscodeInsidersIcon from "assets/app-icons/vscode-insiders.svg";
import warpIcon from "assets/app-icons/warp.png";
import webstormIcon from "assets/app-icons/webstorm.svg";
import windsurfIcon from "assets/app-icons/windsurf.svg";
import windsurfWhiteIcon from "assets/app-icons/windsurf-white.svg";
import xcodeIcon from "assets/app-icons/xcode.svg";
import zedIcon from "assets/app-icons/zed.png";

export interface OpenInExternalAppOption {
	id: ExternalApp;
	label: string;
	lightIcon: string;
	darkIcon: string;
	displayLabel?: string;
}

export const FINDER_OPTIONS: OpenInExternalAppOption[] = [
	{
		id: "finder",
		label: "Finder",
		lightIcon: finderIcon,
		darkIcon: finderIcon,
	},
];

export const IDE_OPTIONS: OpenInExternalAppOption[] = [
	{
		id: "cursor",
		label: "Cursor",
		lightIcon: cursorIcon,
		darkIcon: cursorIcon,
	},
	{
		id: "antigravity",
		label: "Antigravity",
		lightIcon: antigravityIcon,
		darkIcon: antigravityIcon,
	},
	{
		id: "windsurf",
		label: "Windsurf",
		lightIcon: windsurfIcon,
		darkIcon: windsurfWhiteIcon,
	},
	{ id: "zed", label: "Zed", lightIcon: zedIcon, darkIcon: zedIcon },
	{
		id: "sublime",
		label: "Sublime Text",
		lightIcon: sublimeIcon,
		darkIcon: sublimeIcon,
	},
	{ id: "xcode", label: "Xcode", lightIcon: xcodeIcon, darkIcon: xcodeIcon },
];

export const TERMINAL_OPTIONS: OpenInExternalAppOption[] = [
	{ id: "iterm", label: "iTerm", lightIcon: itermIcon, darkIcon: itermIcon },
	{ id: "warp", label: "Warp", lightIcon: warpIcon, darkIcon: warpIcon },
	{
		id: "terminal",
		label: "Terminal",
		lightIcon: terminalIcon,
		darkIcon: terminalIcon,
	},
	{
		id: "ghostty",
		label: "Ghostty",
		lightIcon: ghosttyIcon,
		darkIcon: ghosttyIcon,
	},
];

export const APP_OPTIONS: OpenInExternalAppOption[] = [
	...FINDER_OPTIONS,
	...IDE_OPTIONS,
	...TERMINAL_OPTIONS,
];

export const VSCODE_OPTIONS: OpenInExternalAppOption[] = [
	{
		id: "vscode",
		label: "Standard",
		lightIcon: vscodeIcon,
		darkIcon: vscodeIcon,
		displayLabel: "VS Code",
	},
	{
		id: "vscode-insiders",
		label: "Insiders",
		lightIcon: vscodeInsidersIcon,
		darkIcon: vscodeInsidersIcon,
		displayLabel: "VS Code Insiders",
	},
];

export const JETBRAINS_OPTIONS: OpenInExternalAppOption[] = [
	{
		id: "intellij",
		label: "IntelliJ IDEA",
		lightIcon: intellijIcon,
		darkIcon: intellijIcon,
	},
	{
		id: "webstorm",
		label: "WebStorm",
		lightIcon: webstormIcon,
		darkIcon: webstormIcon,
	},
	{
		id: "pycharm",
		label: "PyCharm",
		lightIcon: pycharmIcon,
		darkIcon: pycharmIcon,
	},
	{
		id: "phpstorm",
		label: "PhpStorm",
		lightIcon: phpstormIcon,
		darkIcon: phpstormIcon,
	},
	{
		id: "rubymine",
		label: "RubyMine",
		lightIcon: rubymineIcon,
		darkIcon: rubymineIcon,
	},
	{
		id: "goland",
		label: "GoLand",
		lightIcon: golandIcon,
		darkIcon: golandIcon,
	},
	{ id: "clion", label: "CLion", lightIcon: clionIcon, darkIcon: clionIcon },
	{ id: "rider", label: "Rider", lightIcon: riderIcon, darkIcon: riderIcon },
	{
		id: "datagrip",
		label: "DataGrip",
		lightIcon: datagripIcon,
		darkIcon: datagripIcon,
	},
	{
		id: "appcode",
		label: "AppCode",
		lightIcon: appcodeIcon,
		darkIcon: appcodeIcon,
	},
	{ id: "fleet", label: "Fleet", lightIcon: fleetIcon, darkIcon: fleetIcon },
	{
		id: "rustrover",
		label: "RustRover",
		lightIcon: rustroverIcon,
		darkIcon: rustroverIcon,
	},
];

const ALL_APP_OPTIONS: OpenInExternalAppOption[] = [
	...APP_OPTIONS,
	...VSCODE_OPTIONS,
	...JETBRAINS_OPTIONS,
];

export const getAppOption = (
	id: ExternalApp,
): OpenInExternalAppOption | undefined =>
	ALL_APP_OPTIONS.find((app) => app.id === id);
