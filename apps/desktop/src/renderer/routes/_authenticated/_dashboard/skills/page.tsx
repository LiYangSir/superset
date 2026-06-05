import { createFileRoute } from "@tanstack/react-router";
import { SkillsView } from "renderer/screens/main/components/SkillsView/SkillsView";

export const Route = createFileRoute("/_authenticated/_dashboard/skills/")({
	component: SkillsPage,
});

function SkillsPage() {
	return <SkillsView />;
}
