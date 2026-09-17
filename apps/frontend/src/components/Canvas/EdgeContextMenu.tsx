import { useEffect, useRef } from "react";
import { useDagStore } from "../../store/dagStore";

type EdgeContextMenuProps = {
	edgeId: string;
	x: number;
	y: number;
	onClose: () => void;
};

export function EdgeContextMenu({ edgeId, x, y, onClose }: EdgeContextMenuProps) {
	const removeEdge = useDagStore((s) => s.removeEdge);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const onPointer = (event: globalThis.MouseEvent) => {
			if (ref.current?.contains(event.target as Node)) return;
			onClose();
		};
		window.addEventListener("mousedown", onPointer);
		return () => window.removeEventListener("mousedown", onPointer);
	}, [onClose]);

	return (
		<div ref={ref} className="n8n-context-menu" style={{ left: x, top: y }} role="menu">
			<button
				type="button"
				className="is-danger"
				onClick={() => {
					removeEdge(edgeId);
					onClose();
				}}
			>
				<span>Supprimer la liaison</span>
				<kbd>Suppr</kbd>
			</button>
		</div>
	);
}
