import { MiniMap, useReactFlow } from "@xyflow/react";

import type { EdgePathStyle } from "../../lib/canvasEdges";
import { useDagStore } from "../../store/dagStore";

type CanvasViewControlsProps = {
	locked: boolean;
	onToggleLock: () => void;
};

export function CanvasViewControls({ locked, onToggleLock }: CanvasViewControlsProps) {
	const { zoomIn, zoomOut, fitView } = useReactFlow();
	const edgePathStyle = useDagStore((s) => s.edgePathStyle);
	const setEdgePathStyle = useDagStore((s) => s.setEdgePathStyle);

	const cycleEdgeStyle = () => {
		const order: EdgePathStyle[] = ["default", "smoothstep", "step"];
		const index = Math.max(0, order.indexOf(edgePathStyle));
		const next = order[(index + 1) % order.length];
		setEdgePathStyle(next);
	};

	const edgeStyleLabel: Record<EdgePathStyle, string> = {
		default: "Courbes (Bézier) — clic pour coudes arrondis",
		smoothstep: "Coudes arrondis — clic pour angles droits",
		step: "Angles droits — clic pour courbes",
	};

	return (
		<div className="canvas-view-controls">
			<div className="canvas-view-controls__tools">
				<button type="button" title="Zoom in" onClick={() => zoomIn()}>
					+
				</button>
				<button type="button" title="Zoom out" onClick={() => zoomOut()}>
					−
				</button>
				<button
					type="button"
					title="Fit view"
					onClick={() =>
						fitView({
							padding: 0.14,
							minZoom: 0.02,
							maxZoom: 1.2,
							duration: 280,
						})
					}
				>
					⤢
				</button>
				<button
					type="button"
					title={locked ? "Unlock canvas" : "Lock canvas"}
					className={locked ? "is-active" : ""}
					onClick={onToggleLock}
				>
					{locked ? "🔒" : "🔓"}
				</button>
				<button
					type="button"
					title={edgeStyleLabel[edgePathStyle]}
					className="is-active"
					onClick={cycleEdgeStyle}
				>
					{edgePathStyle === "step" ? "⊿" : edgePathStyle === "smoothstep" ? "⌐" : "⌒"}
				</button>
			</div>
			<MiniMap
				pannable
				zoomable
				className="canvas-minimap"
				maskColor="rgba(20, 20, 22, 0.72)"
				nodeColor={() => "#5b5e66"}
			/>
		</div>
	);
}
