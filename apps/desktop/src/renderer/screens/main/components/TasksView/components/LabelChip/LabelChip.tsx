import { cn } from "@superset/ui/utils";
import { LuX } from "react-icons/lu";

interface LabelChipProps {
	name: string;
	color: string;
	onRemove?: () => void;
	className?: string;
}

export function LabelChip({
	name,
	color,
	onRemove,
	className,
}: LabelChipProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium shrink-0",
				className,
			)}
			style={{
				backgroundColor: `${color}1A`,
				border: `1px solid ${color}30`,
				color,
			}}
		>
			{name}
			{onRemove && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="hover:opacity-70 transition-opacity"
				>
					<LuX className="size-2.5" />
				</button>
			)}
		</span>
	);
}
