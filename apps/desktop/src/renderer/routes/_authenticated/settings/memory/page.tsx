import { createFileRoute } from "@tanstack/react-router";
import { MemorySettings } from "./components/MemorySettings";

export const Route = createFileRoute("/_authenticated/settings/memory/")({
	component: MemorySettingsPage,
});

function MemorySettingsPage() {
	return <MemorySettings />;
}
