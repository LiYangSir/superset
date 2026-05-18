import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveSpaceId } from "renderer/stores/active-space";

interface ActiveSpaceLabelProps {
	isCollapsed?: boolean;
}

export function ActiveSpaceLabel({
	isCollapsed = false,
}: ActiveSpaceLabelProps) {
	const activeSpaceId = useActiveSpaceId();
	const { data: spaces = [] } = electronTrpc.spaces.list.useQuery();
	const activeSpace = spaces.find((s) => s.id === activeSpaceId);

	if (!activeSpace) return null;

	if (isCollapsed) {
		return (
			<div className="flex justify-center py-1.5">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<div
							className="size-1.5 rounded-full"
							style={{ backgroundColor: activeSpace.color }}
						/>
					</TooltipTrigger>
					<TooltipContent side="right">{activeSpace.name}</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2 px-3 pt-2 pb-1">
			<span
				className="size-1.5 rounded-full shrink-0"
				style={{ backgroundColor: activeSpace.color }}
			/>
			<span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70 truncate">
				{activeSpace.name}
			</span>
		</div>
	);
}
