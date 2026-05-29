import { cn } from "@superset/ui/utils";
import {
	LuMinus,
	LuSignalHigh,
	LuSignalLow,
	LuSignalMedium,
	LuTriangleAlert,
} from "react-icons/lu";
import { TASK_PRIORITIES } from "../../constants";

const PRIORITY_ICONS: Record<string, React.ElementType> = {
	urgent: LuTriangleAlert,
	high: LuSignalHigh,
	medium: LuSignalMedium,
	low: LuSignalLow,
	none: LuMinus,
};

interface PriorityBadgeProps {
	priorityId: string;
	size?: number;
	showLabel?: boolean;
	className?: string;
}

export function PriorityBadge({
	priorityId,
	size = 14,
	showLabel = false,
	className,
}: PriorityBadgeProps) {
	const priority = TASK_PRIORITIES.find((p) => p.id === priorityId);
	const Icon = PRIORITY_ICONS[priorityId] ?? LuMinus;
	const color = priority?.color ?? "#4B4B5A";

	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<Icon style={{ color, width: size, height: size }} />
			{showLabel && (
				<span className="text-xs" style={{ color }}>
					{priority?.label ?? priorityId}
				</span>
			)}
		</span>
	);
}
