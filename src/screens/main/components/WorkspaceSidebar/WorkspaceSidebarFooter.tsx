import { SpaceSwitcher } from "./SpaceSwitcher";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
	return <SpaceSwitcher isCollapsed={isCollapsed} />;
}
