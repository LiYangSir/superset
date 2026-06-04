import { createFileRoute } from "@tanstack/react-router";
import { TasksSettings } from "./components/TasksSettings";

export const Route = createFileRoute("/_authenticated/settings/tasks/")({
	component: TasksSettingsPage,
});

function TasksSettingsPage() {
	return <TasksSettings />;
}
