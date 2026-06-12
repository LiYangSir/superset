import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";

export type ActivityBarsMode = "idle" | "running" | "waiting";

interface ActivityBarsProps {
	mode: ActivityBarsMode;
	size?: number;
	tint?: string;
	className?: string;
}

const BOX = 24;
const BAR_WIDTH = 2.5;
const CENTER = 12;
const RADIUS = BAR_WIDTH / 2;

interface Column {
	x: number;
	idleH: number;
	waveCycle: [number, number, number];
	waveDelay: number;
	waitH: number;
}

const COLUMNS: Column[] = [
	{ x: 5.25, idleH: 3, waveCycle: [4, 12, 4], waveDelay: 0.0, waitH: 10 },
	{ x: 10.75, idleH: 5, waveCycle: [6, 14, 6], waveDelay: 0.15, waitH: 0 },
	{ x: 16.25, idleH: 3, waveCycle: [4, 10, 4], waveDelay: 0.3, waitH: 10 },
];

function computeBar(
	col: Column,
	mode: ActivityBarsMode,
	t: number,
): { height: number; opacity: number } {
	switch (mode) {
		case "idle": {
			const isMiddle = col.x === COLUMNS[1].x;
			const breath = isMiddle
				? 0.7 + 0.3 * Math.abs(Math.sin((t * 2 * Math.PI) / 2.8))
				: 1.0;
			return { height: col.idleH, opacity: breath };
		}
		case "running": {
			const period = 0.9;
			let raw = ((t - col.waveDelay) % period) / period;
			if (raw < 0) raw += 1;
			const cycle = col.waveCycle;
			const h =
				raw < 0.5
					? cycle[0] + (cycle[1] - cycle[0]) * (raw / 0.5)
					: cycle[1] + (cycle[2] - cycle[1]) * ((raw - 0.5) / 0.5);
			return { height: h, opacity: 1.0 };
		}
		case "waiting": {
			if (col.waitH === 0) return { height: 0, opacity: 0 };
			const isLeading = col.x < CENTER;
			const period = 1.8;
			const offset = isLeading ? 0 : period / 2;
			const progress = ((t + offset) % period) / period;
			const wave = 0.5 - 0.5 * Math.cos(progress * 2 * Math.PI);
			const opacity = 0.55 + 0.45 * wave;
			return { height: col.waitH, opacity };
		}
	}
}

export function ActivityBars({
	mode,
	size = 16,
	tint,
	className,
}: ActivityBarsProps) {
	const barsRef = useRef<(HTMLDivElement | null)[]>([null, null, null]);
	const rafRef = useRef<number>(0);
	const startRef = useRef<number>(0);
	const modeRef = useRef(mode);
	modeRef.current = mode;

	const resolvedTint =
		tint ??
		(mode === "waiting"
			? "rgb(139 92 246)"
			: mode === "running"
				? "rgb(245 158 11)"
				: "rgb(156 163 175)");

	useEffect(() => {
		startRef.current = performance.now() / 1000;

		const tick = () => {
			const t = performance.now() / 1000 - startRef.current;
			const currentMode = modeRef.current;
			for (let i = 0; i < 3; i++) {
				const el = barsRef.current[i];
				if (!el) continue;
				const { height, opacity } = computeBar(COLUMNS[i], currentMode, t);
				const scale = size / BOX;
				const hPx = height * scale;
				el.style.height = `${hPx}px`;
				el.style.opacity = `${opacity}`;
			}
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [size]);

	const scale = size / BOX;

	return (
		<div
			className={cn("relative shrink-0", className)}
			style={{ width: size, height: size }}
		>
			{COLUMNS.map((col, i) => (
				<div
					key={col.x}
					ref={(el) => {
						barsRef.current[i] = el;
					}}
					className="absolute rounded-full"
					style={{
						left: col.x * scale,
						width: BAR_WIDTH * scale,
						top: "50%",
						transform: "translateY(-50%)",
						borderRadius: RADIUS * scale,
						backgroundColor: resolvedTint,
					}}
				/>
			))}
		</div>
	);
}
