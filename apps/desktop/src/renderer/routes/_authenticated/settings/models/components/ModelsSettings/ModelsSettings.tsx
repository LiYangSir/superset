import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

const CLI_AGENT_OPTIONS = [
	{ value: "claude", label: "Claude" },
	{ value: "codex", label: "Codex" },
	{ value: "qoder", label: "Qoder" },
];

interface ModelsSettingsProps {
	visibleItems: SettingItemId[] | null;
}

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const showAiCli = isItemVisible(
		SETTING_ITEM_ID.MODELS_ANTHROPIC,
		visibleItems,
	);

	const { data: savedAgent } = electronTrpc.settings.getAiCliAgent.useQuery();
	const [savedFeedback, setSavedFeedback] = useState(false);

	const utils = electronTrpc.useUtils();

	const setAgentMutation = electronTrpc.settings.setAiCliAgent.useMutation({
		onSuccess: () => {
			utils.settings.getAiCliAgent.invalidate();
			setSavedFeedback(true);
			setTimeout(() => setSavedFeedback(false), 2000);
		},
	});

	const handleAgentChange = useCallback(
		(value: string) => {
			if (value === "claude" || value === "codex" || value === "qoder") {
				setAgentMutation.mutate({ agent: value });
			}
		},
		[setAgentMutation],
	);

	return (
		<div className="p-6 space-y-8 max-w-2xl">
			<div>
				<h1 className="text-lg font-semibold">Models</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Configure the local CLI agent used for memory auto-summarization,
					workspace naming, and weekly reports.
				</p>
			</div>

			{showAiCli && (
				<div className="space-y-5">
					<h2 className="text-sm font-medium">AI CLI</h2>

					<div className="space-y-2">
						<Label htmlFor="ai-cli-agent" className="text-sm">
							Agent
						</Label>
						<Select
							value={savedAgent ?? "claude"}
							onValueChange={handleAgentChange}
							disabled={setAgentMutation.isPending}
						>
							<SelectTrigger id="ai-cli-agent" className="w-64">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CLI_AGENT_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{savedFeedback && (
							<p className="text-xs text-green-600 flex items-center gap-1">
								<LuCheck className="h-3 w-3" /> Saved
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							Requires the selected CLI to be installed and authenticated in
							your shell. Qoder is resolved as qodercli first, then qoder.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
