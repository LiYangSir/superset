import { createFileRoute } from "@tanstack/react-router";
import { ConfigFilePreview } from "renderer/components/ConfigFilePreview";
import { OpenInButton } from "renderer/components/OpenInButton";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/general/",
)({
	component: ProjectGeneralSettingsPage,
});

function ProjectGeneralSettingsPage() {
	const { projectId } = Route.useParams();
	const {
		data: project,
		isLoading,
		error,
	} = electronTrpc.projects.get.useQuery({ id: projectId });

	if (isLoading) {
		return (
			<div className="p-6 text-sm text-muted-foreground">
				Loading project settings...
			</div>
		);
	}

	if (error || !project) {
		return (
			<div className="p-6 text-sm text-muted-foreground">Project not found</div>
		);
	}

	return (
		<div className="max-w-3xl p-6 space-y-8">
			<section className="space-y-3">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-xl font-semibold truncate">{project.name}</h1>
						<p className="mt-1 text-sm font-mono text-muted-foreground truncate">
							{project.mainRepoPath}
						</p>
					</div>
					<OpenInButton
						path={project.mainRepoPath}
						label="Project"
						projectId={project.id}
					/>
				</div>
			</section>

			<section>
				<h2 className="text-base font-medium mb-3">Setup scripts</h2>
				<ConfigFilePreview projectId={project.id} projectName={project.name} />
			</section>
		</div>
	);
}
