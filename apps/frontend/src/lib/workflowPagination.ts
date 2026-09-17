import type { Edge, Node } from "@xyflow/react";

import type { FlowNodeData } from "./api";

export const PAGINATION_NODE_THRESHOLD = 36;
export const DEFAULT_MAX_NODES_PER_PAGE = 26;
export const LAYOUT_COLUMN_GAP = 280;
export const LAYOUT_ROW_GAP = 96;

export function topologicalLayerMap(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
): Map<string, number> {
	const ids = new Set(nodes.map((node) => node.id));
	const layer = new Map<string, number>();
	const queue: string[] = [];

	for (const node of nodes) {
		const hasIncoming = edges.some(
			(edge) => edge.target === node.id && ids.has(edge.source),
		);
		if (!hasIncoming) queue.push(node.id);
	}
	if (!queue.length) queue.push(...nodes.map((node) => node.id));

	for (const id of queue) layer.set(id, 0);
	let head = 0;
	while (head < queue.length) {
		const current = queue[head++];
		const nextLayer = (layer.get(current) || 0) + 1;
		for (const edge of edges) {
			if (edge.source !== current || !ids.has(edge.target)) continue;
			const prev = layer.get(edge.target);
			if (prev == null || nextLayer > prev) {
				layer.set(edge.target, nextLayer);
				queue.push(edge.target);
			}
		}
	}
	for (const node of nodes) {
		if (!layer.has(node.id)) layer.set(node.id, 0);
	}
	return layer;
}

/** Détecte les imports FME où beaucoup de nœuds partagent la même position. */
export function positionsOverlapRatio(nodes: Node<FlowNodeData>[]): number {
	if (nodes.length < 2) return 0;
	const keys = nodes.map((node) => {
		const x = typeof node.position?.x === "number" ? node.position.x : 0;
		const y = typeof node.position?.y === "number" ? node.position.y : 0;
		return `${Math.round(x / 8)}:${Math.round(y / 8)}`;
	});
	return 1 - new Set(keys).size / nodes.length;
}

export function splitWorkflowIntoPages(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	maxPerPage = DEFAULT_MAX_NODES_PER_PAGE,
): string[][] {
	if (!nodes.length) return [];
	const layers = topologicalLayerMap(nodes, edges);
	const byLayer = new Map<number, string[]>();
	for (const node of nodes) {
		const layer = layers.get(node.id) ?? 0;
		const list = byLayer.get(layer) || [];
		list.push(node.id);
		byLayer.set(layer, list);
	}
	for (const [, ids] of byLayer) {
		ids.sort((a, b) => a.localeCompare(b, "fr"));
	}

	const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
	const pages: string[][] = [];
	let current: string[] = [];

	for (const layer of sortedLayers) {
		const bucket = byLayer.get(layer) || [];
		if (current.length > 0 && current.length + bucket.length > maxPerPage) {
			pages.push(current);
			current = [];
		}
		current.push(...bucket);
	}
	if (current.length) pages.push(current);
	return pages.length ? pages : [nodes.map((node) => node.id)];
}

export function layoutNodesByLayer(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	colGap = LAYOUT_COLUMN_GAP,
	rowGap = LAYOUT_ROW_GAP,
): Node<FlowNodeData>[] {
	const layers = topologicalLayerMap(nodes, edges);
	const byLayer = new Map<number, Node<FlowNodeData>[]>();
	for (const node of nodes) {
		const layer = layers.get(node.id) || 0;
		const list = byLayer.get(layer) || [];
		list.push(node);
		byLayer.set(layer, list);
	}
	return nodes.map((node) => {
		const layer = layers.get(node.id) || 0;
		const peers = [...(byLayer.get(layer) || [])].sort((a, b) =>
			(a.data.label || a.id).localeCompare(b.data.label || b.id, "fr"),
		);
		const index = peers.findIndex((peer) => peer.id === node.id);
		return {
			...node,
			position: { x: 80 + layer * colGap, y: 80 + index * rowGap },
		};
	});
}
