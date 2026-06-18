import { Button } from "@superset/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { HiOutlineArrowPath } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { EpisodesTab } from "./components/EpisodesTab";
import { OverviewTab } from "./components/OverviewTab";
import { PoliciesTab } from "./components/PoliciesTab";
import { SkillsTab } from "./components/SkillsTab";
import { WorldModelsTab } from "./components/WorldModelsTab";

export function MemorySettings() {
	const utils = electronTrpc.useUtils();
	const syncMemory = electronTrpc.memory.regenerateFiles.useMutation({
		onSuccess: () => {
			utils.skills.list.invalidate();
		},
	});
	return (
		<div className="p-6 max-w-6xl w-full">
			<div className="mb-6 flex items-start justify-between">
				<div>
					<h2 className="text-xl font-semibold">Memory</h2>
					<p className="text-sm text-muted-foreground mt-1">
						认知记忆系统 — 从代理会话中学习到的策略、世界模型和技能。
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => syncMemory.mutate({})}
						disabled={syncMemory.isPending}
					>
						<HiOutlineArrowPath
							className={`h-3.5 w-3.5 mr-1.5 ${syncMemory.isPending ? "animate-spin" : ""}`}
						/>
						{syncMemory.isPending ? "同步中..." : "同步 Memory / 注册 Skills"}
					</Button>
				</div>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="policies">Policies</TabsTrigger>
					<TabsTrigger value="world-models">World Models</TabsTrigger>
					<TabsTrigger value="skills">Skills</TabsTrigger>
					<TabsTrigger value="episodes">Episodes</TabsTrigger>
				</TabsList>

				<TabsContent value="overview">
					<OverviewTab />
				</TabsContent>

				<TabsContent value="policies">
					<PoliciesTab />
				</TabsContent>

				<TabsContent value="world-models">
					<WorldModelsTab />
				</TabsContent>

				<TabsContent value="skills">
					<SkillsTab />
				</TabsContent>

				<TabsContent value="episodes">
					<EpisodesTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
