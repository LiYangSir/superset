import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { useState } from "react";
import {
	HiOutlineChevronDown,
	HiOutlineChevronRight,
	HiOutlineTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function EpisodesTab() {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const utils = electronTrpc.useUtils();

	const { data: episodesData } = electronTrpc.memory.episodes.list.useQuery({
		limit: 50,
	});
	const episodes = episodesData?.items ?? [];

	const deleteEpisode = electronTrpc.memory.episodes.delete.useMutation({
		onSuccess: () => utils.memory.episodes.list.invalidate(),
	});

	if (episodes.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
				No episodes yet. Episodes are created automatically when agent sessions
				end.
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{episodes.map((ep) => (
				<EpisodeItem
					key={ep.id}
					episode={ep}
					expanded={expandedId === ep.id}
					onToggle={() =>
						setExpandedId((prev) => (prev === ep.id ? null : ep.id))
					}
					onDelete={() => deleteEpisode.mutate({ id: ep.id })}
				/>
			))}
		</div>
	);
}

function EpisodeItem({
	episode,
	expanded,
	onToggle,
	onDelete,
}: {
	episode: {
		id: string;
		title: string;
		status: string;
		rHuman: number | null;
		rGoalAchievement: number | null;
		rProcessQuality: number | null;
		rUserSatisfaction: number | null;
		traceCount: number;
		createdAt: number;
	};
	expanded: boolean;
	onToggle: () => void;
	onDelete: () => void;
}) {
	return (
		<Collapsible open={expanded} onOpenChange={onToggle}>
			<div className="rounded-md border border-border hover:bg-accent/30 transition-colors">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-3 w-full px-3 py-2.5 text-left"
					>
						{expanded ? (
							<HiOutlineChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						) : (
							<HiOutlineChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						)}
						<div className="flex-1 min-w-0">
							<p className="text-sm truncate">{episode.title}</p>
							<p className="text-xs text-muted-foreground">
								{episode.traceCount} traces &middot;{" "}
								{formatDate(episode.createdAt)}
							</p>
						</div>
						<div className="flex items-center gap-2 shrink-0">
							{episode.rHuman !== null && (
								<div className="flex items-center gap-1.5">
									<ScoreBadge label="R" value={episode.rHuman} />
									{episode.rGoalAchievement !== null && (
										<ScoreBadge label="G" value={episode.rGoalAchievement} />
									)}
									{episode.rProcessQuality !== null && (
										<ScoreBadge label="P" value={episode.rProcessQuality} />
									)}
									{episode.rUserSatisfaction !== null && (
										<ScoreBadge label="S" value={episode.rUserSatisfaction} />
									)}
								</div>
							)}
							<Badge
								variant={episode.status === "finalized" ? "default" : "outline"}
								className="text-[10px]"
							>
								{episode.status}
							</Badge>
						</div>
					</button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<EpisodeTraces episodeId={episode.id} onDeleteEpisode={onDelete} />
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
	const variant =
		value >= 0.7 ? "default" : value >= 0.4 ? "secondary" : "destructive";
	return (
		<Badge variant={variant} className="text-[10px] px-1 py-0 tabular-nums">
			{label}={value.toFixed(2)}
		</Badge>
	);
}

function EpisodeTraces({
	episodeId,
	onDeleteEpisode,
}: {
	episodeId: string;
	onDeleteEpisode: () => void;
}) {
	const { data: episodeDetail } = electronTrpc.memory.episodes.get.useQuery(
		{ id: episodeId },
		{ enabled: true },
	);

	const traces = episodeDetail?.traces ?? [];

	return (
		<div className="border-t border-border px-3 py-3 space-y-2">
			{traces.length === 0 ? (
				<p className="text-xs text-muted-foreground">No traces.</p>
			) : (
				<div className="space-y-1.5 max-h-80 overflow-y-auto">
					{traces.map((trace) => (
						<div
							key={trace.id}
							className="rounded border border-border/50 px-2.5 py-1.5 text-xs space-y-0.5"
						>
							<div className="flex items-center gap-2 text-muted-foreground">
								<span>Step {trace.turnIndex + 1}</span>
								{trace.value !== null && (
									<span className="tabular-nums">
										V={trace.value.toFixed(3)}
									</span>
								)}
								{trace.alpha !== null && (
									<span className="tabular-nums">
										&alpha;={trace.alpha.toFixed(2)}
									</span>
								)}
								{trace.tags &&
									(trace.tags as string[]).map((tag) => (
										<Badge
											key={tag}
											variant="outline"
											className="text-[9px] px-1 py-0"
										>
											{tag}
										</Badge>
									))}
							</div>
							{trace.userText && (
								<p className="text-foreground/70">
									<span className="text-muted-foreground">User:</span>{" "}
									{trace.userText.slice(0, 200)}
									{trace.userText.length > 200 && "..."}
								</p>
							)}
							{trace.agentText && (
								<p className="text-foreground/70">
									<span className="text-muted-foreground">Agent:</span>{" "}
									{trace.agentText.slice(0, 200)}
									{trace.agentText.length > 200 && "..."}
								</p>
							)}
							{trace.errorSignatures &&
								(trace.errorSignatures as string[]).length > 0 && (
									<p className="text-destructive/70">
										Errors: {(trace.errorSignatures as string[]).join("; ")}
									</p>
								)}
						</div>
					))}
				</div>
			)}
			<div className="flex justify-end pt-1">
				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs text-destructive hover:text-destructive"
					onClick={onDeleteEpisode}
				>
					<HiOutlineTrash className="h-3 w-3 mr-1" />
					Delete Episode
				</Button>
			</div>
		</div>
	);
}
