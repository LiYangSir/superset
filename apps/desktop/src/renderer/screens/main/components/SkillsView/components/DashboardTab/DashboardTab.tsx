import { Button } from "@superset/ui/button";
import { LuDownload, LuSearch, LuWand, LuZap } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSkillsViewStore } from "renderer/stores/skills/store";

export function DashboardTab() {
	const { data: skills } = electronTrpc.skills.list.useQuery();
	const { data: tools } = electronTrpc.skills.tools.getStatus.useQuery();
	const setActiveTab = useSkillsViewStore((s) => s.setActiveTab);

	const totalSkills = skills?.length ?? 0;
	const syncedTargets =
		skills?.reduce((acc, s) => acc + (s.targets?.length ?? 0), 0) ?? 0;
	const connectedAgents =
		tools?.filter((t) => t.installed && t.enabled).length ?? 0;

	return (
		<div className="p-4 space-y-5">
			<div className="flex items-center gap-6">
				{[
					{ label: "Skills", value: totalSkills },
					{ label: "Synced", value: syncedTargets },
					{ label: "Agents", value: connectedAgents },
				].map((stat) => (
					<div key={stat.label} className="flex items-baseline gap-1.5">
						<span className="text-xl font-semibold">{stat.value}</span>
						<span className="text-xs text-muted-foreground">
							{stat.label}
						</span>
					</div>
				))}
				<div className="flex-1" />
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5 text-xs"
					onClick={() => setActiveTab("install")}
				>
					<LuDownload className="size-3.5" />
					Install
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5 text-xs"
					onClick={() => setActiveTab("my-skills")}
				>
					<LuSearch className="size-3.5" />
					Browse
				</Button>
			</div>

			{totalSkills > 0 && (
				<div>
					<p className="text-xs font-medium text-muted-foreground mb-2">
						Recent
					</p>
					<div className="space-y-0.5">
						{skills
							?.sort((a, b) => b.updatedAt - a.updatedAt)
							.slice(0, 5)
							.map((skill) => (
								<div
									key={skill.id}
									className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors"
								>
									<div className="flex items-center gap-2">
										<LuWand className="size-3.5 text-muted-foreground" />
										<span className="text-sm">{skill.name}</span>
									</div>
									<span className="text-xs text-muted-foreground">
										{skill.sourceType}
									</span>
								</div>
							))}
					</div>
				</div>
			)}

			{totalSkills === 0 && (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<LuZap className="size-10 text-muted-foreground/40 mb-3" />
					<p className="text-sm text-muted-foreground mb-4">
						No skills installed yet
					</p>
					<Button
						size="sm"
						className="gap-1.5 text-xs"
						onClick={() => setActiveTab("install")}
					>
						<LuDownload className="size-3.5" />
						Install Your First Skill
					</Button>
				</div>
			)}
		</div>
	);
}
