import { Button } from "@superset/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import {
	LuDownload,
	LuFolderOpen,
	LuLayoutDashboard,
	LuLibrary,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSkillsViewStore } from "renderer/stores/skills/store";
import { DashboardTab } from "./components/DashboardTab/DashboardTab";
import { InstallTab } from "./components/InstallTab/InstallTab";
import { MySkillsTab } from "./components/MySkillsTab/MySkillsTab";
import { WorkspacesTab } from "./components/WorkspacesTab/WorkspacesTab";
import type { SkillsTab } from "./constants";

const TAB_ITEMS: { id: SkillsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
	{ id: "dashboard", label: "Dashboard", icon: LuLayoutDashboard },
	{ id: "my-skills", label: "My Skills", icon: LuLibrary },
	{ id: "install", label: "Install", icon: LuDownload },
	{ id: "workspaces", label: "Workspaces", icon: LuFolderOpen },
];

export function SkillsView() {
	const navigate = useNavigate();
	const { activeTab, setActiveTab } = useSkillsViewStore();
	const { data: skills } = electronTrpc.skills.list.useQuery();

	const skillCount = skills?.length ?? 0;

	return (
		<div className="flex-1 flex flex-col bg-card overflow-hidden">
			<Tabs
				value={activeTab}
				onValueChange={(v) => setActiveTab(v as SkillsTab)}
				className="flex flex-col flex-1 overflow-hidden"
			>
				<div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
					<span className="text-xs font-medium text-foreground/70">
						Skills
						<span className="text-foreground/40 ml-2">{skillCount}</span>
					</span>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate({ to: "/workspace" })}
						className="size-7 text-foreground/60 hover:text-foreground shrink-0"
					>
						<LuX className="size-4" />
					</Button>
				</div>

				<div className="flex items-center gap-1 px-4 py-2 border-b border-border/50">
					<TabsList className="justify-start h-auto bg-transparent p-0 gap-1">
						{TAB_ITEMS.map(({ id, label, icon: Icon }) => (
							<TabsTrigger
								key={id}
								value={id}
								className="gap-1.5 px-3 py-1.5 text-xs data-[state=active]:bg-accent data-[state=active]:shadow-none rounded-md"
							>
								<Icon className="size-3.5" />
								{label}
							</TabsTrigger>
						))}
					</TabsList>
				</div>

				<div className="flex-1 overflow-hidden">
					<TabsContent value="dashboard" className="h-full m-0 overflow-auto">
						<DashboardTab />
					</TabsContent>
					<TabsContent value="my-skills" className="h-full m-0 overflow-auto">
						<MySkillsTab />
					</TabsContent>
					<TabsContent value="install" className="h-full m-0 overflow-auto">
						<InstallTab />
					</TabsContent>
					<TabsContent value="workspaces" className="h-full m-0 overflow-auto">
						<WorkspacesTab />
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}
