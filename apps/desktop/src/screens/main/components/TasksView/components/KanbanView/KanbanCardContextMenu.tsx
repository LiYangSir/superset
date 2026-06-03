import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { LuArchive, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface KanbanCardContextMenuProps {
	taskId: string;
	children: React.ReactNode;
}

export function KanbanCardContextMenu({
	taskId,
	children,
}: KanbanCardContextMenuProps) {
	const utils = electronTrpc.useUtils();

	const archiveTask = electronTrpc.tasks.archive.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
			utils.tasks.listArchived.invalidate();
		},
	});

	const deleteTask = electronTrpc.tasks.delete.useMutation({
		onSuccess: () => {
			utils.tasks.list.invalidate();
		},
	});

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={() => archiveTask.mutate({ id: taskId })}>
					<LuArchive className="size-3.5 mr-2" />
					Archive
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={() => deleteTask.mutate({ id: taskId })}
					className="text-red-400 focus:text-red-400"
				>
					<LuTrash2 className="size-3.5 mr-2" />
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
