import type { Connection, Edge } from "@xyflow/react";

/** `default` = courbes Bézier (n8n) ; `step` = angles droits ; `smoothstep` = coudes arrondis */
export type EdgePathStyle = "default" | "step" | "smoothstep";

export const N8N_EDGE_TYPE = "n8nEdge";

export function normalizeCanvasEdges(edges: Edge[], pathStyle: EdgePathStyle): Edge[] {
	return edges.map((edge) => ({
		...edge,
		type: N8N_EDGE_TYPE,
		data: { ...(edge.data || {}), pathStyle },
		interactionWidth: edge.interactionWidth ?? 28,
		style: {
			stroke: "#52525B",
			strokeWidth: 2.5,
			...edge.style,
		},
	}));
}

export function buildCanvasEdge(
	connection: Connection,
	pathStyle: EdgePathStyle,
): Edge {
	const sourceHandle = connection.sourceHandle ?? "output";
	const targetHandle = connection.targetHandle ?? "input";
	return {
		id: `edge-${connection.source}-${sourceHandle}-${connection.target}-${targetHandle}`,
		source: connection.source,
		target: connection.target,
		sourceHandle,
		targetHandle,
		type: N8N_EDGE_TYPE,
		data: { pathStyle },
		interactionWidth: 28,
		style: { stroke: "#52525B", strokeWidth: 2.5 },
	};
}

export function stripEdgesFromSourceHandle(
	edges: Edge[],
	connection: Connection,
): Edge[] {
	return edges.filter(
		(edge) =>
			!(
				edge.source === connection.source &&
				(edge.sourceHandle || "output") === (connection.sourceHandle || "output")
			),
	);
}
