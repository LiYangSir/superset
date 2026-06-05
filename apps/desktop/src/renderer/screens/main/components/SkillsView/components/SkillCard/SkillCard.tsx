import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { SOURCE_TYPES, UPDATE_STATUSES } from "../../constants";
import { SyncDots } from "../SyncDots/SyncDots";

type ToolInfo = {
	key: string;
	displayName: string;
	installed: boolean;
	enabled: boolean;
};

interface SkillCardProps {
	skill: {
		id: string;
		name: string;
		description: string | null;
		sourceType: string;
		updateStatus: string;
		enabled: boolean;
		tags: string[] | null;
		targets: Array<{ tool: string; status: string }>;
	};
	tools?: ToolInfo[];
	viewMode: "grid" | "list";
	isSelected: boolean;
	onClick: () => void;
}

function getSourceColor(sourceType: string) {
	return SOURCE_TYPES.find((s) => s.id === sourceType)?.color ?? "#6b7280";
}

function getUpdateInfo(updateStatus: string) {
	return (
		UPDATE_STATUSES.find((u) => u.id === updateStatus) ?? UPDATE_STATUSES[2]
	);
}

export function SkillCard({
	skill,
	tools,
	viewMode,
	isSelected,
	onClick,
}: SkillCardProps) {
	const updateInfo = getUpdateInfo(skill.updateStatus);
	const hasSyncedTargets = skill.targets.length > 0;

	if (viewMode === "list") {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"flex items-center gap-2 px-3 py-2 border-b transition-colors cursor-pointer hover:bg-accent/40 text-left w-full",
					isSelected && "bg-accent",
					!skill.enabled && "opacity-50",
				)}
			>
				<span className="text-[13px] font-medium min-w-[100px] truncate">
					{skill.name}
				</span>
				<span className="text-[11px] text-muted-foreground flex-1 truncate">
					{skill.description}
				</span>
				<SyncDots
					targets={skill.targets}
					tools={tools}
					maxVisible={4}
					size="sm"
				/>
				<Badge
					variant="outline"
					className="text-[9px] shrink-0 h-4 px-1.5"
					style={{ borderColor: getSourceColor(skill.sourceType) }}
				>
					{skill.sourceType}
				</Badge>
				{skill.updateStatus === "update_available" && (
					<span
						className="size-1.5 rounded-full shrink-0"
						style={{ backgroundColor: updateInfo.color }}
					/>
				)}
			</button>
		);
	}

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => e.key === "Enter" && onClick()}
			className={cn(
				"group p-3 rounded-lg border border-border bg-card/80 cursor-pointer transition-all hover:bg-accent/40 hover:border-border/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
				isSelected && "ring-1 ring-primary bg-accent/60",
				!skill.enabled && "opacity-50",
			)}
		>
			<div className="flex items-center gap-1.5 mb-1">
				<span className="text-[13px] font-medium truncate flex-1 leading-snug">
					{skill.name}
				</span>
				{skill.updateStatus === "update_available" && (
					<span
						className="size-1.5 rounded-full shrink-0"
						style={{ backgroundColor: updateInfo.color }}
					/>
				)}
				<Badge
					variant="outline"
					className="text-[9px] shrink-0 h-4 px-1.5"
					style={{ borderColor: getSourceColor(skill.sourceType) }}
				>
					{skill.sourceType}
				</Badge>
			</div>

			<p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
				{skill.description ?? "No description"}
			</p>

			{hasSyncedTargets && (
				<div className="flex items-center mt-2">
					<SyncDots targets={skill.targets} tools={tools} size="sm" />
				</div>
			)}
		</div>
	);
}
