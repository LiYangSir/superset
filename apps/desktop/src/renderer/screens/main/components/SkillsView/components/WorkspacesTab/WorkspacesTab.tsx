import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { useState } from "react";
import {
	LuArrowDownToLine,
	LuArrowUpFromLine,
	LuBot,
	LuChevronDown,
	LuChevronRight,
	LuCircle,
	LuFolderOpen,
	LuLoader,
	LuUnlink,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

function AgentToolCard({
	tool,
	skills,
}: {
	tool: {
		key: string;
		displayName: string;
		installed: boolean;
		enabled: boolean;
	};
	skills: { id: string; name: string; targets?: { tool: string }[] }[];
}) {
	const [open, setOpen] = useState(false);

	const syncedSkills = skills.filter((s) =>
		s.targets?.some((t) => t.tool === tool.key),
	);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors"
				>
					<LuBot className="size-4 text-muted-foreground shrink-0" />
					<span className="text-sm font-medium truncate flex-1 text-left">
						{tool.displayName}
					</span>
					<LuCircle
						className={`size-2 shrink-0 fill-current ${
							tool.installed && tool.enabled
								? "text-green-500"
								: "text-muted-foreground/40"
						}`}
					/>
					<Badge
						variant="secondary"
						className="text-[10px] h-4 px-1.5 shrink-0"
					>
						{syncedSkills.length}
					</Badge>
					{open ? (
						<LuChevronDown className="size-3.5 text-muted-foreground shrink-0" />
					) : (
						<LuChevronRight className="size-3.5 text-muted-foreground shrink-0" />
					)}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{syncedSkills.length > 0 ? (
					<div className="ml-6 space-y-0.5 pb-1">
						{syncedSkills.map((skill) => (
							<div
								key={skill.id}
								className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-accent/40 transition-colors"
							>
								<span className="text-xs truncate">{skill.name}</span>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 shrink-0"
									title="Unsync"
								>
									<LuUnlink className="size-3" />
								</Button>
							</div>
						))}
					</div>
				) : (
					<div className="ml-6 pb-1">
						<p className="text-xs text-muted-foreground px-3">
							No skills synced
						</p>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

function AgentSection() {
	const { data: tools, isLoading: isLoadingTools } =
		electronTrpc.skills.tools.getStatus.useQuery();
	const { data: skills } = electronTrpc.skills.list.useQuery();

	if (isLoadingTools) {
		return (
			<div className="flex items-center justify-center py-4">
				<LuLoader className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!tools || tools.length === 0) {
		return (
			<div className="text-center py-4 text-xs text-muted-foreground">
				No agent tools detected
			</div>
		);
	}

	return (
		<div className="space-y-0.5">
			{tools.map((tool) => (
				<AgentToolCard key={tool.key} tool={tool} skills={skills ?? []} />
			))}
		</div>
	);
}

function ProjectsSection() {
	const { data: projects = [], isLoading } =
		electronTrpc.projects.getRecents.useQuery();

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-4">
				<LuLoader className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (projects.length === 0) {
		return (
			<div className="text-center py-4 text-xs text-muted-foreground">
				No projects found
			</div>
		);
	}

	return (
		<div className="space-y-0.5">
			{projects.map((project) => (
				<div
					key={project.id}
					className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-accent/40 transition-colors"
				>
					<LuFolderOpen className="size-4 text-muted-foreground shrink-0" />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium truncate">{project.name}</p>
						<p className="text-xs text-muted-foreground truncate">
							{project.mainRepoPath}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						title="Import from project"
					>
						<LuArrowDownToLine className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						title="Push to project"
					>
						<LuArrowUpFromLine className="size-3.5" />
					</Button>
				</div>
			))}
		</div>
	);
}

export function WorkspacesTab() {
	return (
		<div className="p-4 space-y-5">
			<section>
				<p className="text-xs font-medium text-muted-foreground mb-2">Agents</p>
				<AgentSection />
			</section>

			<section>
				<p className="text-xs font-medium text-muted-foreground mb-2">
					Projects
				</p>
				<ProjectsSection />
			</section>
		</div>
	);
}
