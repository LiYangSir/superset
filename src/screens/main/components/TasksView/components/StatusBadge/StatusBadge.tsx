import { cn } from "@superset/ui/utils";
import {
	LuCircle,
	LuCircleCheck,
	LuCircleDot,
	LuCircleMinus,
	LuClock,
	LuEye,
} from "react-icons/lu";
import { TASK_STATUSES } from "../../constants";

const STATUS_ICONS: Record<string, React.ElementType> = {
	backlog: LuClock,
	todo: LuCircle,
	in_progress: LuCircleDot,
	in_review: LuEye,
	done: LuCircleCheck,
	cancelled: LuCircleMinus,
};

interface StatusBadgeProps {
	statusId: string;
	size?: number;
	showLabel?: boolean;
	className?: string;
}

export function StatusBadge({
	statusId,
	size = 14,
	showLabel = false,
	className,
}: StatusBadgeProps) {
	const status = TASK_STATUSES.find((s) => s.id === statusId);
	const Icon = STATUS_ICONS[statusId] ?? LuCircle;
	const color = status?.color ?? "#6B7280";

	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<Icon style={{ color, width: size, height: size }} />
			{showLabel && (
				<span className="text-xs" style={{ color }}>
					{status?.label ?? statusId}
				</span>
			)}
		</span>
	);
}
