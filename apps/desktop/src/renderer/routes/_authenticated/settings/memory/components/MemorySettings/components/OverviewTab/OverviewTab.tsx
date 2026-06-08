import { Badge } from "@superset/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import {
	HiOutlineBolt,
	HiOutlineBookOpen,
	HiOutlineCpuChip,
	HiOutlineGlobeAlt,
	HiOutlineSparkles,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function OverviewTab() {
	const { data: policiesData } = electronTrpc.memory.policies.list.useQuery({
		status: "active",
	});
	const policies = policiesData?.items ?? [];

	const { data: candidatePoliciesData } =
		electronTrpc.memory.policies.list.useQuery({ status: "candidate" });
	const candidatePolicies = candidatePoliciesData?.items ?? [];

	const { data: worldModelsData } =
		electronTrpc.memory.worldModels.list.useQuery({ status: "active" });
	const worldModels = worldModelsData?.items ?? [];

	const { data: skillsData } =
		electronTrpc.memory.cognitiveSkills.list.useQuery({ status: "active" });
	const skills = skillsData?.items ?? [];

	const { data: candidateSkillsData } =
		electronTrpc.memory.cognitiveSkills.list.useQuery({ status: "candidate" });
	const candidateSkills = candidateSkillsData?.items ?? [];

	const { data: episodesData } = electronTrpc.memory.episodes.list.useQuery({
		limit: 5,
	});
	const episodes = episodesData?.items ?? [];

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				<StatCard
					icon={<HiOutlineBolt className="h-4 w-4" />}
					label="Active Policies"
					value={policies.length}
					sub={
						candidatePolicies.length > 0
							? `+${candidatePolicies.length} candidates`
							: undefined
					}
				/>
				<StatCard
					icon={<HiOutlineGlobeAlt className="h-4 w-4" />}
					label="World Models"
					value={worldModels.length}
				/>
				<StatCard
					icon={<HiOutlineSparkles className="h-4 w-4" />}
					label="Active Skills"
					value={skills.length}
					sub={
						candidateSkills.length > 0
							? `+${candidateSkills.length} candidates`
							: undefined
					}
				/>
				<StatCard
					icon={<HiOutlineBookOpen className="h-4 w-4" />}
					label="Episodes"
					value={episodes.length}
					sub={
						episodes.length > 0
							? `latest: ${formatDate(episodes[0].createdAt)}`
							: undefined
					}
				/>
			</div>

			{episodes.length > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm font-medium">
							Recent Episodes
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{episodes.map((ep) => (
							<div
								key={ep.id}
								className="flex items-center justify-between rounded-md border border-border px-3 py-2"
							>
								<div className="flex-1 min-w-0">
									<p className="text-sm truncate">{ep.title}</p>
									<p className="text-xs text-muted-foreground">
										{ep.traceCount} traces &middot; {formatDate(ep.createdAt)}
									</p>
								</div>
								<div className="flex items-center gap-2 ml-3 shrink-0">
									{ep.rHuman !== null && (
										<Badge
											variant={
												ep.rHuman >= 0.7
													? "default"
													: ep.rHuman >= 0.4
														? "secondary"
														: "destructive"
											}
											className="text-[10px] tabular-nums"
										>
											R={ep.rHuman.toFixed(2)}
										</Badge>
									)}
									<Badge
										variant={ep.status === "finalized" ? "default" : "outline"}
										className="text-[10px]"
									>
										{ep.status}
									</Badge>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{policies.length > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<HiOutlineCpuChip className="h-4 w-4" />
							Top Policies
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1.5">
						{policies.slice(0, 5).map((p) => (
							<div
								key={p.id}
								className="text-sm rounded-md border border-border px-3 py-2"
							>
								<span className="text-muted-foreground">WHEN</span> {p.trigger}{" "}
								<span className="text-muted-foreground">THEN</span>{" "}
								{p.procedure}
								<span className="text-xs text-muted-foreground ml-2">
									(support: {p.support})
								</span>
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function StatCard({
	icon,
	label,
	value,
	sub,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	sub?: string;
}) {
	return (
		<Card>
			<CardContent className="pt-4 pb-3">
				<div className="flex items-center gap-2 text-muted-foreground mb-1">
					{icon}
					<span className="text-xs">{label}</span>
				</div>
				<p className="text-2xl font-semibold tabular-nums">{value}</p>
				{sub && (
					<p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
				)}
			</CardContent>
		</Card>
	);
}
