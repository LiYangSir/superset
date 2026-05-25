import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveSpaceId } from "renderer/stores/active-space";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { PromptGroup } from "../PromptGroup";

interface NewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	onImportRepo: () => Promise<void>;
	onNewProject: () => void;
}

export function NewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
	onImportRepo,
	onNewProject,
}: NewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useNewWorkspaceModalDraft();
	const activeSpaceId = useActiveSpaceId();
	const { data: recentProjects = [], isFetched: areRecentProjectsFetched } =
		electronTrpc.projects.getRecents.useQuery();
	const utils = electronTrpc.useUtils();
	const appliedPreSelectionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		void utils.projects.getBranches.invalidate();
		void utils.projects.getBranchesLocal.invalidate();
	}, [isOpen, utils]);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || !areRecentProjectsFetched) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			const hasPreSelectedProject = recentProjects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			const spaceProjects = activeSpaceId
				? recentProjects.filter((p) => p.spaceId === activeSpaceId)
				: [];
			const fallbackProjectId =
				(spaceProjects[0]?.id ?? recentProjects[0]?.id) ?? null;
			if (fallbackProjectId !== draft.selectedProjectId) {
				updateDraft({ selectedProjectId: fallbackProjectId });
			}
		}
	}, [
		draft.selectedProjectId,
		areRecentProjectsFetched,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		activeSpaceId,
		updateDraft,
	]);

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={draft.selectedProjectId}
				selectedProject={selectedProject}
				recentProjects={recentProjects.filter((project) => Boolean(project.id))}
				onSelectProject={(selectedProjectId) =>
					updateDraft({ selectedProjectId })
				}
				onImportRepo={onImportRepo}
				onNewProject={onNewProject}
			/>
		</div>
	);
}
