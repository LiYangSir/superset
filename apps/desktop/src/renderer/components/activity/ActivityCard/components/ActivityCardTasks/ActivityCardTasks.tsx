import { CircularProgress } from "@superset/ui/circular-progress";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck, LuChevronRight, LuCircle, LuLoader } from "react-icons/lu";
import type { TaskInfo } from "../../../types";

interface ActivityCardTasksProps {
	tasks: TaskInfo[];
}

export function ActivityCardTasks({ tasks }: ActivityCardTasksProps) {
	const [open, setOpen] = useState(false);
	const completed = tasks.filter((t) => t.status === "completed").length;
	const total = tasks.length;
	const progress = total > 0 ? (completed / total) * 100 : 0;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 w-full">
				<LuChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span>
					Tasks ({completed}/{total})
				</span>
				<CircularProgress
					value={progress}
					size={14}
					strokeWidth={2}
					className={cn(
						"ml-0.5",
						completed === total ? "text-green-500" : "text-amber-500",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="pl-4 pb-1 space-y-0.5">
					{tasks.map((task) => (
						<div key={task.id} className="flex items-start gap-1.5 text-[11px]">
							{task.status === "completed" ? (
								<LuCheck className="size-3 shrink-0 text-green-500 mt-0.5" />
							) : task.status === "in_progress" ? (
								<LuLoader className="size-3 shrink-0 text-amber-500 animate-spin mt-0.5" />
							) : (
								<LuCircle className="size-3 shrink-0 text-muted-foreground/50 mt-0.5" />
							)}
							<span
								className={cn(
									"leading-tight",
									task.status === "completed"
										? "text-muted-foreground line-through"
										: "text-foreground",
								)}
							>
								{task.subject}
							</span>
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
