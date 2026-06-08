import type { SelectAgentActivity } from "@superset/local-db";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";

interface ActivityCardDetailsProps {
	activity: SelectAgentActivity;
	formatDuration: (ms: number) => string;
	formatRelativeTime: (ts: number) => string;
}

export function ActivityCardDetails({
	activity,
	formatDuration,
	formatRelativeTime,
}: ActivityCardDetailsProps) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 w-full">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span>Details</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="pl-4 pb-1 space-y-1">
					{activity.userMessage && (
						<p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
							{activity.userMessage}
						</p>
					)}
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
						{activity.modelName && <span>Model: {activity.modelName}</span>}
						{activity.presetName && <span>Preset: {activity.presetName}</span>}
						<span>Started: {formatRelativeTime(activity.startedAt)}</span>
						{activity.durationMs != null && (
							<span>Duration: {formatDuration(activity.durationMs)}</span>
						)}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
