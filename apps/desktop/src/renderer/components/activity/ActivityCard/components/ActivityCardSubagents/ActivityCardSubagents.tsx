import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCircleAlert,
	LuLoader,
} from "react-icons/lu";
import type { SubagentInfo } from "../../../types";

interface ActivityCardSubagentsProps {
	subagents: SubagentInfo[];
}

export function ActivityCardSubagents({
	subagents,
}: ActivityCardSubagentsProps) {
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
				<span>Subagents ({subagents.length})</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="pl-4 pb-1 space-y-0.5">
					{subagents.map((sa) => (
						<div key={sa.id} className="flex items-start gap-1.5 text-[11px]">
							{sa.status === "in_progress" ? (
								<LuLoader className="size-3 shrink-0 text-amber-500 animate-spin mt-0.5" />
							) : sa.status === "completed" ? (
								<LuCheck className="size-3 shrink-0 text-green-500 mt-0.5" />
							) : (
								<LuCircleAlert className="size-3 shrink-0 text-red-500 mt-0.5" />
							)}
							<span className="text-muted-foreground leading-tight">
								{sa.description || `Subagent ${sa.id}`}
							</span>
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
