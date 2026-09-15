import { NodeToolbar, Position } from "@xyflow/react";
import { useDagStore } from "../../store/dagStore";
import { openContextMenuFromEvent } from "./NodeContextMenu";

type NodeActionBarProps = {
	nodeId: string;
	visible: boolean;
};

export function NodeActionBar({ nodeId, visible }: NodeActionBarProps) {
	const runSelectedNode = useDagStore((s) => s.runSelectedNode);
	const toggleNodeDisabled = useDagStore((s) => s.toggleNodeDisabled);
	const deleteNode = useDagStore((s) => s.deleteNode);
	const openContextMenu = useDagStore((s) => s.openContextMenu);
	const nodes = useDagStore((s) => s.nodes);
	const disabled = nodes.find((n) => n.id === nodeId)?.data.disabled;

	return (
		<NodeToolbar
			isVisible={visible}
			position={Position.Top}
			className="n8n-node-toolbar"
			offset={8}
		>
			<button
				type="button"
				title="Test step"
				onClick={(event) => {
					event.stopPropagation();
					void runSelectedNode();
				}}
			>
				▶
			</button>
			<button
				type="button"
				title={disabled ? "Activer" : "Deactivate"}
				className={disabled ? "is-off" : ""}
				onClick={(event) => {
					event.stopPropagation();
					toggleNodeDisabled(nodeId);
				}}
			>
				⏻
			</button>
			<button
				type="button"
				title="Delete"
				onClick={(event) => {
					event.stopPropagation();
					deleteNode(nodeId);
				}}
			>
				🗑
			</button>
			<button
				type="button"
				title="Menu"
				onClick={(event) =>
					openContextMenuFromEvent(event, nodeId, openContextMenu)
				}
			>
				⋯
			</button>
		</NodeToolbar>
	);
}
