import { type MouseEvent, useEffect, useRef } from "react";
import { useDagStore } from "../../store/dagStore";

const ITEMS = [
	{ id: "open", label: "Open...", shortcut: "Entrée" },
	{ id: "test", label: "Test step", shortcut: "" },
	{ id: "rename", label: "Rename", shortcut: "F2" },
	{ id: "deactivate", label: "Deactivate", shortcut: "D" },
	{ id: "copy", label: "Copy", shortcut: "Ctrl+C" },
	{ id: "duplicate", label: "Duplicate", shortcut: "Ctrl+D" },
	{ id: "tidy", label: "Tidy up workflow", shortcut: "Shift+Alt+T" },
	{ id: "delete", label: "Delete", shortcut: "Del", danger: true },
] as const;

export function NodeContextMenu() {
	const menu = useDagStore((s) => s.contextMenu);
	const closeContextMenu = useDagStore((s) => s.closeContextMenu);
	const openInspector = useDagStore((s) => s.openInspector);
	const runSelectedNode = useDagStore((s) => s.runSelectedNode);
	const renameSelectedNode = useDagStore((s) => s.renameSelectedNode);
	const toggleNodeDisabled = useDagStore((s) => s.toggleNodeDisabled);
	const copyNode = useDagStore((s) => s.copyNode);
	const duplicateNode = useDagStore((s) => s.duplicateNode);
	const tidyUpWorkflow = useDagStore((s) => s.tidyUpWorkflow);
	const deleteNode = useDagStore((s) => s.deleteNode);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!menu) return;
		const onPointer = (event: globalThis.MouseEvent) => {
			if (ref.current?.contains(event.target as Node)) return;
			closeContextMenu();
		};
		window.addEventListener("mousedown", onPointer);
		return () => window.removeEventListener("mousedown", onPointer);
	}, [menu, closeContextMenu]);

	if (!menu) return null;

	const run = (id: (typeof ITEMS)[number]["id"]) => {
		const nodeId = menu.nodeId;
		closeContextMenu();
		if (id === "open") openInspector(nodeId);
		if (id === "test") {
			useDagStore.getState().selectNode(nodeId);
			void runSelectedNode();
		}
		if (id === "rename") renameSelectedNode(nodeId);
		if (id === "deactivate") toggleNodeDisabled(nodeId);
		if (id === "copy") copyNode(nodeId);
		if (id === "duplicate") duplicateNode(nodeId);
		if (id === "tidy") tidyUpWorkflow();
		if (id === "delete") deleteNode(nodeId);
	};

	return (
		<div
			ref={ref}
			className="n8n-context-menu"
			style={{ left: menu.x, top: menu.y }}
			role="menu"
		>
			{ITEMS.map((item) => (
				<button
					key={item.id}
					type="button"
					className={"danger" in item && item.danger ? "is-danger" : ""}
					onClick={() => run(item.id)}
				>
					<span>{item.label}</span>
					{item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
				</button>
			))}
		</div>
	);
}

export function openContextMenuFromEvent(
	event: MouseEvent,
	nodeId: string,
	open: (payload: { nodeId: string; x: number; y: number }) => void,
) {
	event.preventDefault();
	event.stopPropagation();
	open({
		nodeId,
		x: event.clientX,
		y: event.clientY,
	});
}
