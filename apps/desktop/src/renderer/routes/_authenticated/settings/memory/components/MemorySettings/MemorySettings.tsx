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
	const syncMemory = electronTrpc.memory.regenerateFiles.useMutation();

	return (
		<div className="p-6 max-w-6xl w-full">
			<div className="mb-6 flex items-start justify-between">
				<div>
					<h2 className="text-xl font-semibold">Memory</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Cognitive memory system — policies, world models, and skills learned
						from agent sessions.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => syncMemory.mutate({})}
					disabled={syncMemory.isPending}
				>
					<HiOutlineArrowPath
						className={`h-3.5 w-3.5 mr-1.5 ${syncMemory.isPending ? "animate-spin" : ""}`}
					/>
					{syncMemory.isPending ? "Syncing..." : "Sync to Agents"}
				</Button>
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
