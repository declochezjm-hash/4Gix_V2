import type { Connection, Edge, Node } from "@xyflow/react";

import type { FlowNodeData, NodeSnapshot } from "./api";
import {
	buildCanvasEdge,
	type EdgePathStyle,
	N8N_EDGE_TYPE,
	normalizeCanvasEdges,
} from "./canvasEdges";

export function computeComposerRemoveIds(
	anchorNodeId: string,
	replaceDownstream: boolean,
	_nodes: Node<FlowNodeData>[],
	edges: Edge[],
): string[] {
	const remove = new Set<string>([anchorNodeId]);
	if (!replaceDownstream) return [...remove];
	const queue = [anchorNodeId];
	while (queue.length) {
		const id = queue.shift();
		if (!id) continue;
		for (const edge of edges) {
			if (edge.source === id && !remove.has(edge.target)) {
				remove.add(edge.target);
				queue.push(edge.target);
			}
		}
	}
	return [...remove];
}

export function materializeComposerNode(node: Node<FlowNodeData>): Node<FlowNodeData> {
	const { isGhost: _ghost, ...data } = node.data;
	return {
		...node,
		draggable: true,
		selectable: true,
		data: { ...data, isGhost: undefined },
	};
}

export function materializeComposerEdge(edge: Edge, pathStyle: EdgePathStyle): Edge {
	const connection: Connection = {
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle ?? "output",
		targetHandle: edge.targetHandle ?? "input",
	};
	return normalizeCanvasEdges(
		[
			{
				...buildCanvasEdge(connection, pathStyle),
				id: edge.id,
			},
		],
		pathStyle,
	)[0];
}

export function applyComposerGraphReplacement(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	pathStyle: EdgePathStyle,
	anchorNodeId: string,
	removeNodeIds: string[],
	proposedNodes: Node<FlowNodeData>[],
	proposedEdges: Edge[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
	const remove = new Set(removeNodeIds);
	const nextNodes = proposedNodes.map((node) => materializeComposerNode(node));
	const nextEdges = proposedEdges.map((edge) =>
		materializeComposerEdge(edge, pathStyle),
	);
	const proposedIds = new Set(nextNodes.map((node) => node.id));

	const externalIn = edges.filter(
		(edge) => remove.has(edge.target) && !remove.has(edge.source),
	);
	const externalOut = edges.filter(
		(edge) => remove.has(edge.source) && !remove.has(edge.target),
	);

	const keptNodes = nodes.filter((node) => !remove.has(node.id));
	const keptEdges = edges.filter(
		(edge) => !remove.has(edge.source) && !remove.has(edge.target),
	);

	let allEdges = normalizeCanvasEdges([...keptEdges, ...nextEdges], pathStyle);

	const heads = nextNodes.filter(
		(node) =>
			!nextEdges.some(
				(edge) => edge.target === node.id && proposedIds.has(edge.source),
			),
	);
	const tails = nextNodes.filter(
		(node) =>
			!nextEdges.some(
				(edge) => edge.source === node.id && proposedIds.has(edge.target),
			),
	);

	const anchorIn =
		externalIn.find((edge) => edge.target === anchorNodeId) ?? externalIn[0];
	const anchorOut =
		externalOut.find((edge) => edge.source === anchorNodeId) ?? externalOut[0];

	if (anchorIn && heads.length) {
		const head = heads[0];
		allEdges = normalizeCanvasEdges(
			[
				...allEdges,
				buildCanvasEdge(
					{
						source: anchorIn.source,
						target: head.id,
						sourceHandle: anchorIn.sourceHandle ?? "output",
						targetHandle:
							anchorIn.targetHandle ?? head.data.inputHandles?.[0] ?? "input",
					},
					pathStyle,
				),
			],
			pathStyle,
		);
	}

	if (anchorOut && tails.length) {
		const tail = tails[0];
		allEdges = normalizeCanvasEdges(
			[
				...allEdges,
				buildCanvasEdge(
					{
						source: tail.id,
						target: anchorOut.target,
						sourceHandle:
							tail.data.outputHandles?.[0] ?? anchorOut.sourceHandle ?? "output",
						targetHandle: anchorOut.targetHandle ?? "input",
					},
					pathStyle,
				),
			],
			pathStyle,
		);
	}

	return { nodes: [...keptNodes, ...nextNodes], edges: allEdges };
}

const GHOST_EDGE_STYLE = {
	stroke: "#a855f7",
	strokeWidth: 2.5,
	strokeDasharray: "5,5",
} as const;

function resolvedNodeType(node?: Node<FlowNodeData>): string {
	if (!node?.data) return "";
	return String(node.data.nodeType || node.data.requestedNodeType || "").toLowerCase();
}

function isReaderNodeType(nodeType: string): boolean {
	return nodeType.endsWith("_reader") || nodeType === "file_reader";
}

export function enrichNodesWithSnapshots(
	nodes: Node<FlowNodeData>[],
	snapshots: Record<string, NodeSnapshot>,
): Node<FlowNodeData>[] {
	return nodes.map((node) => {
		const snap = snapshots[node.id];
		const fromData =
			node.data.outputSnapshot ??
			(node.data as { output_snapshot?: unknown }).output_snapshot;
		if (!snap && !fromData) return node;
		return {
			...node,
			data: {
				...node.data,
				...(snap
					? {
							outputSnapshot: snap.output_snapshot ?? snap.preview,
							inputSnapshot: snap.input_snapshot,
						}
					: {}),
				...(fromData && !snap ? { outputSnapshot: fromData } : {}),
			},
		};
	});
}

export function graphForAgentRequest(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	snapshots: Record<string, NodeSnapshot>,
) {
	const enriched = enrichNodesWithSnapshots(nodes, snapshots);
	return {
		nodes: enriched
			.filter((node) => !node.data.isGhost)
			.map((node) => ({
				id: node.id,
				type: node.type || "etl",
				position: node.position,
				data: node.data,
			})),
		edges: edges
			.filter((edge) => !(edge.data as { isGhost?: boolean })?.isGhost)
			.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				sourceHandle: edge.sourceHandle,
				targetHandle: edge.targetHandle,
			})),
		snapshots,
	};
}

/** Graphe API incluant les propositions déjà posées (chaîne fantômes). */
export function graphForStepArchitectRequest(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	snapshots: Record<string, NodeSnapshot>,
	pendingNodes: Node<FlowNodeData>[] = [],
	pendingEdges: Edge[] = [],
) {
	const base = graphForAgentRequest(nodes, edges, snapshots);
	const extraNodes = pendingNodes.map((node) => ({
		id: node.id,
		type: node.type || "etl",
		position: node.position,
		data: { ...node.data, isGhost: undefined },
	}));
	const extraEdges = pendingEdges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle,
		targetHandle: edge.targetHandle,
	}));
	return {
		...base,
		nodes: [...base.nodes, ...extraNodes],
		edges: [...base.edges, ...extraEdges],
	};
}

function asFlowNodeData(raw: Record<string, unknown>): FlowNodeData {
	const category = raw.category as FlowNodeData["category"];
	return {
		label: String(raw.label ?? "Nœud"),
		nodeType: String(raw.nodeType ?? raw.node_type ?? "transformer"),
		category:
			category === "Reader" || category === "Transformer" || category === "Writer"
				? category
				: "Transformer",
		isSpatial: Boolean(raw.isSpatial ?? raw.is_spatial),
		params: (raw.params as Record<string, unknown>) ?? {},
		schema: raw.schema as FlowNodeData["schema"],
		status: "idle",
		inputHandles: (raw.inputHandles as string[]) ?? ["input"],
		outputHandles: (raw.outputHandles as string[]) ?? ["output"],
		paletteGroup: String(raw.paletteGroup ?? raw.palette_group ?? ""),
		notes: String(raw.notes ?? ""),
		disabled: Boolean(raw.disabled),
		isGhost: true,
	};
}

export const ARCHITECT_STEP_OFFSET_X = 300;
export const ARCHITECT_BRANCH_OFFSET_Y = 150;

export function isAutoArchitectNode(node?: Node<FlowNodeData>): boolean {
	return resolvedNodeType(node) === "auto_architect_agent";
}

/**
 * Ancre visuelle : Auto-Architect Agent (jamais le reader CSV amont).
 * Si `layoutAnchorNodeId` est un reader, on bascule sur l'agent s'il existe.
 */
export function resolveArchitectLayoutAnchorId(
	nodes: Node<FlowNodeData>[],
	layoutAnchorNodeId: string,
): string {
	const requested = nodes.find((node) => node.id === layoutAnchorNodeId);
	if (requested && isAutoArchitectNode(requested)) {
		return requested.id;
	}
	if (requested && !isReaderNodeType(resolvedNodeType(requested))) {
		return requested.id;
	}
	const architect = nodes.find((node) => isAutoArchitectNode(node));
	if (architect) return architect.id;
	return layoutAnchorNodeId;
}

/** Nœuds en aval du reader (filtres / writers), hors cibles à conserver (ex. agent). */
export function collectArchitectBranchNodeIds(
	edges: Edge[],
	sourceId: string,
	keepTargetIds: ReadonlySet<string>,
): Set<string> {
	const remove = new Set<string>();
	const queue: string[] = [];
	for (const edge of edges) {
		if (edge.source === sourceId && !keepTargetIds.has(edge.target)) {
			queue.push(edge.target);
		}
	}
	while (queue.length > 0) {
		const id = queue.shift();
		if (!id || remove.has(id) || keepTargetIds.has(id)) continue;
		remove.add(id);
		for (const edge of edges) {
			if (edge.source === id && !remove.has(edge.target)) {
				queue.push(edge.target);
			}
		}
	}
	return remove;
}

export function architectEdgeExists(
	edges: Edge[],
	sourceId: string,
	targetId: string,
): boolean {
	return edges.some((edge) => edge.source === sourceId && edge.target === targetId);
}

export function createArchitectGhostEdge(
	sourceId: string,
	targetId: string,
	existingEdges: Edge[],
): Edge | null {
	if (architectEdgeExists(existingEdges, sourceId, targetId)) {
		return null;
	}
	return {
		id: `ghost-e-${sourceId}-${targetId}`,
		source: sourceId,
		target: targetId,
		sourceHandle: "output",
		targetHandle: "input",
		type: N8N_EDGE_TYPE,
		animated: true,
		data: { isGhost: true, pathStyle: "default" as const },
		style: { ...GHOST_EDGE_STYLE },
	};
}

export function layoutArchitectNodePosition(
	nodes: Node<FlowNodeData>[],
	layoutAnchorNodeId: string,
	branchIndex = 0,
): { x: number; y: number } {
	const anchorId = resolveArchitectLayoutAnchorId(nodes, layoutAnchorNodeId);
	const anchor = nodes.find((node) => node.id === anchorId);
	const lastX = anchor?.position.x ?? 100;
	const lastY = anchor?.position.y ?? 100;
	return {
		x: lastX + ARCHITECT_STEP_OFFSET_X,
		y: lastY + ARCHITECT_BRANCH_OFFSET_Y * Math.max(0, branchIndex),
	};
}

/** Position visuelle depuis l'ancre ; arête métier depuis le parent de données. */
export function applyArchitectSequentialLayout(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	layoutAnchorNodeId: string,
	proposedNode: Node<FlowNodeData>,
	extraEdges: Edge[] = [],
	options?: {
		dataParentId?: string | null;
		branchIndex?: number;
	},
): { node: Node<FlowNodeData>; edge: Edge | null } {
	const canvasNodes = nodes;
	const allEdges = [...edges, ...extraEdges];
	const visualAnchorId = resolveArchitectLayoutAnchorId(
		canvasNodes,
		layoutAnchorNodeId,
	);
	const branchIndex = options?.branchIndex ?? 0;
	const position = layoutArchitectNodePosition(
		canvasNodes,
		visualAnchorId,
		branchIndex,
	);
	const node: Node<FlowNodeData> = {
		...proposedNode,
		position,
	};
	const requestedParent = options?.dataParentId?.trim() || visualAnchorId;
	const parentNode = canvasNodes.find((item) => item.id === requestedParent);
	const dataParentId =
		parentNode && isAutoArchitectNode(parentNode)
			? resolveUpstreamDataSourceId(canvasNodes, allEdges, requestedParent) ||
				requestedParent
			: requestedParent;
	const edge = createArchitectGhostEdge(dataParentId, node.id, allEdges);
	return { node, edge };
}

export function ghostNodeFromArchitectPayload(
	result: Record<string, unknown>,
): Node<FlowNodeData> {
	const dataRaw =
		typeof result.data === "object" && result.data
			? (result.data as Record<string, unknown>)
			: {};
	const position =
		typeof result.position === "object" && result.position
			? (result.position as { x?: number; y?: number })
			: { x: 0, y: 0 };
	const nodeType = String(dataRaw.nodeType ?? dataRaw.node_type ?? "etl");
	return {
		id: String(result.id ?? `ghost-${crypto.randomUUID()}`),
		type: nodeType === "direct_agent_processor" ? nodeType : "etl",
		position: {
			x: Number(position.x ?? 0),
			y: Number(position.y ?? 0),
		},
		data: asFlowNodeData(dataRaw),
	};
}

export function ghostEdgeFromArchitectPayload(result: Record<string, unknown>): Edge {
	return {
		id: String(result.id ?? `ghost-edge-${crypto.randomUUID()}`),
		source: String(result.source),
		target: String(result.target),
		sourceHandle: String(result.sourceHandle ?? result.source_handle ?? "output"),
		targetHandle: String(result.targetHandle ?? result.target_handle ?? "input"),
		type: N8N_EDGE_TYPE,
		animated: true,
		data: { isGhost: true, pathStyle: "default" as const },
		style: { ...GHOST_EDGE_STYLE },
	};
}

export function appendMaterializedProposals(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	pathStyle: EdgePathStyle,
	proposedNodes: Node<FlowNodeData>[],
	proposedEdges: Edge[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
	const materialized = proposedNodes.map((node) => materializeComposerNode(node));
	const byId = new Map(nodes.map((node) => [node.id, node]));
	for (const node of materialized) {
		byId.set(node.id, node);
	}
	const mergedNodes = [...byId.values()];
	const knownIds = new Set(mergedNodes.map((node) => node.id));
	const seenLinks = new Set(edges.map((edge) => `${edge.source}\0${edge.target}`));
	const nextEdges = proposedEdges
		.filter((edge) => knownIds.has(edge.source) && knownIds.has(edge.target))
		.filter((edge) => {
			const key = `${edge.source}\0${edge.target}`;
			if (seenLinks.has(key)) return false;
			seenLinks.add(key);
			return true;
		})
		.map((edge) =>
			materializeComposerEdge(
				{
					...edge,
					sourceHandle: edge.sourceHandle ?? "output",
					targetHandle: edge.targetHandle ?? "input",
				},
				pathStyle,
			),
		);
	return {
		nodes: mergedNodes,
		edges: normalizeCanvasEdges([...edges, ...nextEdges], pathStyle),
	};
}

export function resolveUpstreamDataSourceId(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	targetNodeId: string,
): string | null {
	let current: string | null = targetNodeId;
	const seen = new Set<string>();
	while (current && !seen.has(current)) {
		seen.add(current);
		const node = nodes.find((item) => item.id === current);
		if (isReaderNodeType(resolvedNodeType(node))) {
			return current;
		}
		const incoming = edges.find((edge) => edge.target === current);
		current = incoming?.source ?? null;
	}
	const directIn = edges.find((edge) => edge.target === targetNodeId);
	if (directIn?.source) {
		const walked = resolveUpstreamDataSourceId(nodes, edges, directIn.source);
		if (walked) return walked;
		return directIn.source;
	}
	return resolveArchitectSourceNodeId(nodes, edges, null);
}

export function resolveArchitectSourceNodeId(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	selectedNodeId: string | null,
): string | null {
	if (selectedNodeId) {
		const selected = nodes.find((node) => node.id === selectedNodeId);
		if (selected) {
			if (isReaderNodeType(resolvedNodeType(selected))) {
				return selected.id;
			}
			const incoming = edges.find((edge) => edge.target === selectedNodeId);
			if (incoming) {
				return incoming.source;
			}
			return selectedNodeId;
		}
	}
	const reader = nodes.find((node) => isReaderNodeType(resolvedNodeType(node)));
	return reader?.id ?? selectedNodeId;
}

export function extractContextMentions(prompt: string): string[] {
	const mentions = new Set<string>();
	for (const match of prompt.matchAll(/@([\w.-]+)/g)) {
		mentions.add(`@${match[1]}`);
	}
	return [...mentions];
}

export function toolCallBadgeLabel(summary?: string, tool?: string): string {
	const text = (summary || tool || "").toLowerCase();
	if (text.includes("attribute_filter") || text.includes("filter")) {
		return "+ Created Filter Node";
	}
	if (text.includes("gpkg") || text.includes("writer")) {
		return "+ Created Writer Node";
	}
	if (text.includes("python") || text.includes("code")) {
		return "+ Updated Code Node";
	}
	if (text.includes("connect")) return "⟷ Connected Ports";
	if (text.includes("inspect")) return "◎ Inspected Schema";
	if (summary) return summary;
	return tool || "Tool";
}
