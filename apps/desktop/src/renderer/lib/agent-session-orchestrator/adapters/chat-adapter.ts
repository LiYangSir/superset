import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import type { ChatMastraLaunchConfig } from "shared/tabs-types";
import type { AgentSessionLaunchContext, LaunchResultPayload } from "../types";

type ChatLaunchRequest = Extract<AgentLaunchRequest, { kind: "chat" }>;

function buildLaunchConfig(
	request: ChatLaunchRequest,
): ChatMastraLaunchConfig | null {
	const { initialPrompt, model, retryCount, autoExecute } = request.chat;
	const launchConfig: ChatMastraLaunchConfig = {};

	if (initialPrompt) {
		if (autoExecute === false) {
			launchConfig.draftInput = initialPrompt;
		} else {
			launchConfig.initialPrompt = initialPrompt;
		}
	}

	if (model) {
		launchConfig.metadata = { model };
	}

	if (retryCount !== undefined) {
		launchConfig.retryCount = retryCount;
	}

	return Object.keys(launchConfig).length > 0 ? launchConfig : null;
}

export async function launchChatAdapter(
	request: ChatLaunchRequest,
	context: AgentSessionLaunchContext,
): Promise<LaunchResultPayload> {
	const tabs = context.tabs;
	if (!tabs) {
		throw new Error("Missing tabs adapter");
	}

	const { workspaceId } = request;
	const launchConfig = buildLaunchConfig(request);
	const targetPaneId = request.chat.paneId;

	if (targetPaneId) {
		const targetPane = tabs.getPane(targetPaneId);
		if (!targetPane) {
			throw new Error(`Pane not found: ${targetPaneId}`);
		}

		const tab = tabs.getTab(targetPane.tabId);
		if (!tab || tab.workspaceId !== workspaceId) {
			throw new Error(`Tab not found for pane: ${targetPaneId}`);
		}

		const paneId = tabs.addChatPane(tab.id, { launchConfig });
		if (!paneId) {
			throw new Error("Failed to add chat pane");
		}

		if (request.chat.sessionId) {
			tabs.switchChatSession(paneId, request.chat.sessionId);
		}

		return {
			tabId: tab.id,
			paneId,
			sessionId: request.chat.sessionId ?? null,
		};
	}

	const { tabId, paneId } = tabs.addChatTab(workspaceId, { launchConfig });

	if (request.chat.sessionId) {
		tabs.switchChatSession(paneId, request.chat.sessionId);
	}

	return {
		tabId,
		paneId,
		sessionId: request.chat.sessionId ?? null,
	};
}
