import { createFileRoute } from "@tanstack/react-router";
import { SpacesSettings } from "./components/SpacesSettings";

export const Route = createFileRoute("/_authenticated/settings/spaces/")({
	component: SpacesSettingsPage,
});

function SpacesSettingsPage() {
	return <SpacesSettings />;
}
