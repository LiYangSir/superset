import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useActiveSpaceHydrated,
	useActiveSpaceId,
	useSetActiveSpaceId,
} from "renderer/stores/active-space";

interface SpaceSwitcherProps {
	isCollapsed?: boolean;
}

export function SpaceSwitcher({ isCollapsed = false }: SpaceSwitcherProps) {
	const { data: spaces = [] } = electronTrpc.spaces.list.useQuery();
	const activeSpaceId = useActiveSpaceId();
	const setActiveSpaceId = useSetActiveSpaceId();
	const isHydrated = useActiveSpaceHydrated();

	const activeIndex = spaces.findIndex((s) => s.id === activeSpaceId);

	useEffect(() => {
		// Wait until persist hydration finishes — otherwise we race with
		// localStorage and overwrite the user's last selection with Default.
		if (!isHydrated) return;
		if (spaces.length === 0) return;
		if (activeIndex === -1) {
			const fallback = spaces.find((s) => s.isDefault) ?? spaces[0];
			setActiveSpaceId(fallback.id);
		}
	}, [isHydrated, spaces, activeIndex, setActiveSpaceId]);

	if (spaces.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="px-1 py-1.5 flex flex-col items-center gap-1.5">
				{spaces.map((space) => (
					<Tooltip key={space.id} delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => setActiveSpaceId(space.id)}
								className={cn(
									"rounded-full transition-all",
									space.id === activeSpaceId
										? "size-3 ring-2 ring-offset-1 ring-offset-background"
										: "size-2 opacity-60 hover:opacity-100",
								)}
								style={{
									backgroundColor: space.color,
									...(space.id === activeSpaceId && {
										boxShadow: `0 0 0 2px ${space.color}33`,
									}),
								}}
								aria-label={`Switch to ${space.name}`}
							/>
						</TooltipTrigger>
						<TooltipContent side="right">{space.name}</TooltipContent>
					</Tooltip>
				))}
			</div>
		);
	}

	return (
		<div className="px-2 py-2 flex items-center justify-center gap-2">
			{spaces.map((space) => (
				<Tooltip key={space.id} delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => setActiveSpaceId(space.id)}
							className={cn(
								"rounded-full transition-all",
								space.id === activeSpaceId
									? "size-2.5"
									: "size-1.5 opacity-50 hover:opacity-100",
							)}
							style={{ backgroundColor: space.color }}
							aria-label={`Switch to ${space.name}`}
						/>
					</TooltipTrigger>
					<TooltipContent side="top">{space.name}</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}
