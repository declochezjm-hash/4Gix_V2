import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	getSmoothStepPath,
} from "@xyflow/react";
import { type MouseEvent, useCallback, useMemo, useState } from "react";

import type { EdgePathStyle } from "../../lib/canvasEdges";
import { useDagStore } from "../../store/dagStore";

function resolvePathStyle(data: EdgeProps["data"]): EdgePathStyle {
	const fromData = (data as { pathStyle?: EdgePathStyle } | undefined)?.pathStyle;
	if (fromData === "step" || fromData === "smoothstep" || fromData === "default") {
		return fromData;
	}
	return "default";
}

export function N8nEdge({
	id,
	source,
	target,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	sourceHandleId,
	targetHandleId,
	style,
	markerEnd,
	selected,
	data,
}: EdgeProps) {
	const openNodePanelForEdgeInsert = useDagStore((s) => s.openNodePanelForEdgeInsert);
	const canvasLocked = useDagStore((s) => s.canvasLocked);
	const globalPathStyle = useDagStore((s) => s.edgePathStyle);
	const [hovered, setHovered] = useState(false);

	const pathStyle = resolvePathStyle(data) || globalPathStyle;

	const [edgePath, labelX, labelY] = useMemo(() => {
		if (pathStyle === "step" || pathStyle === "smoothstep") {
			return getSmoothStepPath({
				sourceX,
				sourceY,
				targetX,
				targetY,
				sourcePosition,
				targetPosition,
				borderRadius: pathStyle === "step" ? 0 : 12,
			});
		}
		return getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition,
		});
	}, [pathStyle, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

	const active = Boolean((data as { active?: boolean })?.active) || selected;
	const stroke = active ? "#F97316" : "#52525B";
	const strokeWidth = 2.5;

	const showInsert = (hovered || selected) && !canvasLocked;

	const onInsert = useCallback(
		(event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			openNodePanelForEdgeInsert({
				edgeId: id,
				source,
				target,
				sourceHandle: sourceHandleId || "output",
				targetHandle: targetHandleId || "input",
			});
		},
		[id, openNodePanelForEdgeInsert, source, sourceHandleId, target, targetHandleId],
	);

	return (
		<g
			className="n8n-edge"
			aria-label="Liaison de workflow"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				style={{
					...style,
					stroke,
					strokeWidth,
					transition: "stroke 0.15s ease",
				}}
			/>
			<path
				d={edgePath}
				fill="none"
				stroke="transparent"
				strokeWidth={28}
				className="n8n-edge__hit"
				pointerEvents="stroke"
			/>
			<EdgeLabelRenderer>
				{showInsert ? (
					<div
						className="n8n-edge-insert-wrap nodrag nopan"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						}}
						onMouseEnter={() => setHovered(true)}
						onMouseLeave={() => setHovered(false)}
					>
						<button
							type="button"
							className="n8n-edge-insert"
							title="Insérer un nœud sur cette liaison"
							onPointerDown={(event) => event.stopPropagation()}
							onMouseDown={(event) => event.stopPropagation()}
							onClick={onInsert}
						>
							+
						</button>
					</div>
				) : null}
			</EdgeLabelRenderer>
		</g>
	);
}
