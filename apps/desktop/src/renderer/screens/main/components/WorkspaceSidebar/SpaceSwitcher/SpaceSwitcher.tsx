import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LuWandSparkles } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getLastWorkspaceForSpace,
	useActiveSpaceHydrated,
	useActiveSpaceId,
	useSetActiveSpaceId,
} from "renderer/stores/active-space";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "../constants";

interface SpaceSwitcherProps {
	isCollapsed?: boolean;
}

type SpaceItem = {
	id: string;
	name: string;
	color: string;
	isDefault: boolean;
};

const MAGIC_FIREWORK_PARTICLES = [
	{ x: 0, y: -13, delay: "0ms", color: "#f59e0b" },
	{ x: 11, y: -7, delay: "70ms", color: "#22c55e" },
	{ x: 11, y: 7, delay: "140ms", color: "#38bdf8" },
	{ x: 0, y: 13, delay: "210ms", color: "#a78bfa" },
	{ x: -11, y: 7, delay: "280ms", color: "#fb7185" },
	{ x: -11, y: -7, delay: "350ms", color: "#facc15" },
];

function MagicSwitcherButton({
	isMagicPage,
	showBurst,
	onClick,
	tooltipSide,
}: {
	isMagicPage: boolean;
	showBurst: boolean;
	onClick: () => void;
	tooltipSide: "right" | "top";
}) {
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onClick}
					className={cn(
						"relative isolate flex items-center justify-center overflow-visible rounded-full transition-all",
						isMagicPage
							? "size-5 bg-accent text-foreground"
							: "size-4 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
					)}
					aria-label="Open magic page"
				>
					{showBurst &&
						MAGIC_FIREWORK_PARTICLES.map((particle) => (
							<span
								key={`${particle.x}-${particle.y}`}
								aria-hidden="true"
								className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-1 rounded-full opacity-85 animate-ping motion-reduce:hidden"
								style={{
									backgroundColor: particle.color,
									transform: `translate(-50%, -50%) translate(${particle.x}px, ${particle.y}px)`,
									animationDelay: particle.delay,
								}}
							/>
						))}
					<LuWandSparkles
						className="relative z-10 size-3"
						strokeWidth={STROKE_WIDTH}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side={tooltipSide}>神奇页面</TooltipContent>
		</Tooltip>
	);
}

export function SpaceSwitcher({ isCollapsed = false }: SpaceSwitcherProps) {
	const { data: spacesData = [] } = electronTrpc.spaces.list.useQuery();
	const spaces = spacesData as SpaceItem[];
	const activeSpaceId = useActiveSpaceId();
	const setActiveSpaceId = useSetActiveSpaceId();
	const isHydrated = useActiveSpaceHydrated();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();

	const activeIndex = spaces.findIndex((s) => s.id === activeSpaceId);
	const isMagicPage = !!matchRoute({ to: "/magic", fuzzy: true });
	const wasMagicPageRef = useRef(false);
	const [showMagicBurst, setShowMagicBurst] = useState(false);

	const handleMagicClick = () => {
		navigate({ to: "/magic" });
	};

	const handleSpaceClick = (spaceId: string) => {
		setActiveSpaceId(spaceId);
		if (isMagicPage) {
			const lastWorkspaceId = getLastWorkspaceForSpace(spaceId);
			if (lastWorkspaceId) {
				navigateToWorkspace(lastWorkspaceId, navigate);
			} else {
				navigate({ to: "/workspace" });
			}
		}
	};

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

	useEffect(() => {
		if (isMagicPage && !wasMagicPageRef.current) {
			setShowMagicBurst(true);
			const timeoutId = window.setTimeout(() => {
				setShowMagicBurst(false);
			}, 900);
			wasMagicPageRef.current = true;
			return () => window.clearTimeout(timeoutId);
		}
		wasMagicPageRef.current = isMagicPage;
	}, [isMagicPage]);

	if (spaces.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="px-1 py-1.5 flex flex-col items-center gap-1.5">
				<MagicSwitcherButton
					isMagicPage={isMagicPage}
					showBurst={showMagicBurst}
					onClick={handleMagicClick}
					tooltipSide="right"
				/>
				{spaces.map((space) => (
					<Tooltip key={space.id} delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => handleSpaceClick(space.id)}
								className={cn(
									"rounded-full transition-all",
									!isMagicPage && space.id === activeSpaceId
										? "size-3 ring-2 ring-offset-1 ring-offset-background"
										: "size-2 opacity-60 hover:opacity-100",
								)}
								style={{
									backgroundColor: space.color,
									...(!isMagicPage &&
										space.id === activeSpaceId && {
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
			<MagicSwitcherButton
				isMagicPage={isMagicPage}
				showBurst={showMagicBurst}
				onClick={handleMagicClick}
				tooltipSide="top"
			/>
			{spaces.map((space) => (
				<Tooltip key={space.id} delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => handleSpaceClick(space.id)}
							className={cn(
								"rounded-full transition-all",
								!isMagicPage && space.id === activeSpaceId
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
