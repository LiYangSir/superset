import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	getAgentIconUrl,
	hasAgentIcon,
	shortLabel,
} from "../../utils/agentIcons";

type DotState = "synced" | "available" | "orphan";

interface Dot {
	key: string;
	displayName: string;
	state: DotState;
}

interface SyncDotsProps {
	targets: Array<{ tool: string; status: string }>;
	tools?: Array<{
		key: string;
		displayName: string;
		installed: boolean;
		enabled: boolean;
	}>;
	maxVisible?: number;
	size?: "sm" | "md";
	onToggle?: (toolKey: string, enabled: boolean) => void;
	pendingKey?: string | null;
}

function AgentIconImg({
	agentKey,
	className,
}: {
	agentKey: string;
	className?: string;
}) {
	const src = getAgentIconUrl(agentKey);
	const [failed, setFailed] = useState(false);

	if (!src || failed) return null;

	return (
		<img
			src={src}
			alt=""
			draggable={false}
			className={cn("h-full w-full object-contain", className)}
			onError={() => setFailed(true)}
		/>
	);
}

export function SyncDots({
	targets,
	tools,
	maxVisible = 8,
	size = "md",
	onToggle,
	pendingKey,
}: SyncDotsProps) {
	const syncedKeys = new Set(targets.map((t) => t.tool));

	const dots: Dot[] = [];
	const syncedOnly = !onToggle;

	if (tools) {
		const activeTools = tools.filter((t) => t.installed && t.enabled);
		for (const tool of activeTools) {
			const isSynced = syncedKeys.has(tool.key);
			if (syncedOnly && !isSynced) continue;
			dots.push({
				key: tool.key,
				displayName: tool.displayName,
				state: isSynced ? "synced" : "available",
			});
		}
		for (const target of targets) {
			if (!dots.some((d) => d.key === target.tool)) {
				dots.push({
					key: target.tool,
					displayName: target.tool,
					state: "orphan",
				});
			}
		}
	} else {
		for (const target of targets) {
			dots.push({
				key: target.tool,
				displayName: target.tool,
				state: "synced",
			});
		}
	}

	const visible = dots.slice(0, maxVisible);
	const hiddenCount = dots.length - visible.length;

	const dim =
		size === "sm"
			? "h-[14px] w-[14px] text-[7px]"
			: "h-[18px] w-[18px] text-[9px]";

	return (
		<div className="flex items-center gap-[2px]">
			{visible.map((dot) => {
				const useIcon = hasAgentIcon(dot.key);
				const isPending = pendingKey === dot.key;
				const interactive = !!onToggle && !isPending;

				const stateLabel =
					dot.state === "synced"
						? " · synced"
						: dot.state === "orphan"
							? " · agent unavailable"
							: "";
				const title = `${dot.displayName}${stateLabel}`;

				const iconStateClass: Record<DotState, string> = {
					synced: "",
					available: "opacity-40",
					orphan: "ring-1 ring-inset ring-amber-500/60",
				};
				const textStateClass: Record<DotState, string> = {
					synced: "border-transparent bg-foreground text-background",
					available: "border border-border bg-muted text-muted-foreground",
					orphan:
						"border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
				};

				const baseClass = cn(
					"inline-flex select-none items-center justify-center overflow-hidden rounded-[4px] transition-colors",
					dim,
					useIcon
						? iconStateClass[dot.state]
						: cn(
								"font-mono font-semibold tracking-tight",
								textStateClass[dot.state],
							),
					interactive && "cursor-pointer hover:ring-1 hover:ring-primary/60",
					isPending && "opacity-70",
				);

				const content = useIcon ? (
					<AgentIconImg agentKey={dot.key} />
				) : (
					shortLabel(dot.displayName, dot.key)
				);

				if (onToggle) {
					return (
						<button
							type="button"
							key={dot.key}
							title={title}
							disabled={isPending}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onToggle(dot.key, dot.state === "available");
							}}
							className={baseClass}
						>
							{content}
						</button>
					);
				}

				return (
					<span key={dot.key} title={title} className={baseClass}>
						{content}
					</span>
				);
			})}
			{hiddenCount > 0 && (
				<span
					title={`+${hiddenCount} more`}
					className={cn(
						"inline-flex select-none items-center justify-center rounded-[4px] border border-border bg-muted font-mono font-semibold text-muted-foreground",
						dim,
					)}
				>
					+{hiddenCount}
				</span>
			)}
		</div>
	);
}
