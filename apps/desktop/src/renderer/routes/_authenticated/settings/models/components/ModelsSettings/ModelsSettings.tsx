import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback, useEffect, useState } from "react";
import { LuCheck, LuEye, LuEyeOff } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type SettingItemId,
	SETTING_ITEM_ID,
	isItemVisible,
} from "../../../utils/settings-search";

const MODEL_OPTIONS = [
	{ value: "claude-opus-4-6", label: "Claude Opus 4.6" },
	{ value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
	{ value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
	{ value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
	{ value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
	{ value: "deepseek-chat", label: "DeepSeek Chat (deprecated)" },
];

interface ModelsSettingsProps {
	visibleItems: SettingItemId[] | null;
}

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const showAnthropic = isItemVisible(
		SETTING_ITEM_ID.MODELS_ANTHROPIC,
		visibleItems,
	);

	const { data: savedApiKey } =
		electronTrpc.settings.getAnthropicApiKey.useQuery();
	const { data: savedBaseUrl } =
		electronTrpc.settings.getAnthropicBaseUrl.useQuery();
	const { data: savedModel } =
		electronTrpc.settings.getAnthropicModel.useQuery();

	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

	useEffect(() => {
		if (savedApiKey !== undefined) setApiKey(savedApiKey ?? "");
	}, [savedApiKey]);

	useEffect(() => {
		if (savedBaseUrl !== undefined) setBaseUrl(savedBaseUrl ?? "");
	}, [savedBaseUrl]);

	const utils = electronTrpc.useUtils();

	const showSaved = useCallback((field: string) => {
		setSavedFeedback(field);
		setTimeout(() => setSavedFeedback(null), 2000);
	}, []);

	const setApiKeyMutation =
		electronTrpc.settings.setAnthropicApiKey.useMutation({
			onSuccess: () => {
				utils.settings.getAnthropicApiKey.invalidate();
				showSaved("apiKey");
			},
		});

	const setBaseUrlMutation =
		electronTrpc.settings.setAnthropicBaseUrl.useMutation({
			onSuccess: () => {
				utils.settings.getAnthropicBaseUrl.invalidate();
				showSaved("baseUrl");
			},
		});

	const setModelMutation =
		electronTrpc.settings.setAnthropicModel.useMutation({
			onSuccess: () => {
				utils.settings.getAnthropicModel.invalidate();
				showSaved("model");
			},
		});

	const handleSaveApiKey = useCallback(() => {
		setApiKeyMutation.mutate({ key: apiKey });
	}, [apiKey, setApiKeyMutation]);

	const handleSaveBaseUrl = useCallback(() => {
		setBaseUrlMutation.mutate({ url: baseUrl });
	}, [baseUrl, setBaseUrlMutation]);

	const handleModelChange = useCallback(
		(value: string) => {
			setModelMutation.mutate({ model: value });
		},
		[setModelMutation],
	);

	const apiKeyDirty = apiKey !== (savedApiKey ?? "");
	const baseUrlDirty = baseUrl !== (savedBaseUrl ?? "");

	return (
		<div className="p-6 space-y-8 max-w-2xl">
			<div>
				<h1 className="text-lg font-semibold">Models</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Configure API credentials for AI model providers. Used for memory
					auto-summarization and workspace naming.
				</p>
			</div>

			{showAnthropic && (
				<div className="space-y-5">
					<h2 className="text-sm font-medium">Anthropic</h2>

					<div className="space-y-2">
						<Label htmlFor="anthropic-api-key" className="text-sm">
							API Key
						</Label>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Input
									id="anthropic-api-key"
									type={showKey ? "text" : "password"}
									value={apiKey}
									onChange={(e) => setApiKey(e.target.value)}
									placeholder="sk-ant-..."
									className="pr-10"
								/>
								<button
									type="button"
									onClick={() => setShowKey(!showKey)}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								>
									{showKey ? (
										<LuEyeOff className="h-4 w-4" />
									) : (
										<LuEye className="h-4 w-4" />
									)}
								</button>
							</div>
							<Button
								size="sm"
								onClick={handleSaveApiKey}
								disabled={!apiKeyDirty || setApiKeyMutation.isPending}
							>
								{savedFeedback === "apiKey" ? (
									<LuCheck className="h-4 w-4" />
								) : (
									"Save"
								)}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Falls back to ANTHROPIC_API_KEY environment variable if not set.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="anthropic-base-url" className="text-sm">
							Base URL
						</Label>
						<div className="flex gap-2">
							<Input
								id="anthropic-base-url"
								type="text"
								value={baseUrl}
								onChange={(e) => setBaseUrl(e.target.value)}
								placeholder="https://api.anthropic.com"
								className="flex-1"
							/>
							<Button
								size="sm"
								onClick={handleSaveBaseUrl}
								disabled={!baseUrlDirty || setBaseUrlMutation.isPending}
							>
								{savedFeedback === "baseUrl" ? (
									<LuCheck className="h-4 w-4" />
								) : (
									"Save"
								)}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Custom API endpoint. For DeepSeek use:
							https://api.deepseek.com/anthropic
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="anthropic-model" className="text-sm">
							Model
						</Label>
						<Select
							value={savedModel ?? "claude-opus-4-6"}
							onValueChange={handleModelChange}
							disabled={setModelMutation.isPending}
						>
							<SelectTrigger id="anthropic-model" className="w-64">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MODEL_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{savedFeedback === "model" && (
							<p className="text-xs text-green-600 flex items-center gap-1">
								<LuCheck className="h-3 w-3" /> Saved
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							Model used for memory auto-summarization.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
