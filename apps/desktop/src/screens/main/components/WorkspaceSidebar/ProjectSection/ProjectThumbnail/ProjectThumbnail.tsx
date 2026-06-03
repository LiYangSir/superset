import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface ProjectThumbnailProps {
	projectName: string;
	projectColor: string;
	hideImage?: boolean;
	iconUrl?: string | null;
	className?: string;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isCustomColor(color: string): boolean {
	return color !== PROJECT_COLOR_DEFAULT && color.startsWith("#");
}

export function ProjectThumbnail({
	projectName,
	projectColor,
	hideImage,
	iconUrl,
	className,
}: ProjectThumbnailProps) {
	const [iconError, setIconError] = useState(false);

	const firstLetter = projectName.charAt(0).toUpperCase();
	const hasCustomColor = isCustomColor(projectColor);

	const borderClasses = cn(
		"border-[1.5px]",
		hasCustomColor ? undefined : "border-border",
	);
	const borderStyle = hasCustomColor
		? { borderColor: hexToRgba(projectColor, 0.6) }
		: undefined;

	if (iconUrl && !iconError && !hideImage) {
		return (
			<div
				className={cn(
					"relative size-6 rounded overflow-hidden flex-shrink-0 bg-muted",
					borderClasses,
					className,
				)}
				style={borderStyle}
			>
				<img
					src={iconUrl}
					alt={`${projectName} icon`}
					className="size-full object-cover"
					onError={() => setIconError(true)}
				/>
			</div>
		);
	}

	const fallbackStyle = hasCustomColor
		? {
				borderColor: hexToRgba(projectColor, 0.6),
				backgroundColor: hexToRgba(projectColor, 0.15),
				color: projectColor,
			}
		: borderStyle;

	return (
		<div
			className={cn(
				"size-6 rounded flex items-center justify-center flex-shrink-0",
				"text-xs font-medium",
				hasCustomColor ? undefined : "bg-muted text-muted-foreground",
				borderClasses,
				className,
			)}
			style={fallbackStyle}
		>
			{firstLetter}
		</div>
	);
}
