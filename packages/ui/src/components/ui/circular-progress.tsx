import * as React from "react";
import { cn } from "../../lib/utils";

interface CircularProgressProps extends React.SVGProps<SVGSVGElement> {
	value: number;
	size?: number;
	strokeWidth?: number;
}

const CircularProgress = React.forwardRef<SVGSVGElement, CircularProgressProps>(
	({ value, size = 20, strokeWidth = 2.5, className, ...props }, ref) => {
		const radius = (size - strokeWidth) / 2;
		const circumference = 2 * Math.PI * radius;
		const clamped = Math.max(0, Math.min(100, value));
		const offset = circumference - (clamped / 100) * circumference;

		return (
			<svg
				ref={ref}
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				className={cn("shrink-0", className)}
				{...props}
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					className="opacity-15"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					className="transition-[stroke-dashoffset] duration-300"
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
				/>
			</svg>
		);
	},
);
CircularProgress.displayName = "CircularProgress";

export { CircularProgress };
