import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/",
)({
	component: ProjectSettingsPage,
});

function ProjectSettingsPage() {
	const { projectId } = Route.useParams();

	return (
		<Navigate
			to="/settings/project/$projectId/general"
			params={{ projectId }}
			replace
		/>
	);
}
