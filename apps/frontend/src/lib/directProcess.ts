import type { Edge, Node } from "@xyflow/react";

import type { FlowNodeData, NodeSnapshot } from "./api";

export type DirectChatTurn = {
	prompt: string;
	executedAt: string;
	ok: boolean;
	featureCountAfter?: number;
	error?: string;
};

export function parseChatHistory(raw: unknown): DirectChatTurn[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(item): item is DirectChatTurn =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as DirectChatTurn).prompt === "string",
	);
}

export function graphForDirectProcess(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	snapshots: Record<string, NodeSnapshot>,
) {
	return {
		nodes: nodes.map((node) => ({
			id: node.id,
			type: node.type || "etl",
			position: node.position,
			data: node.data,
		})),
		edges: edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.sourceHandle,
			targetHandle: edge.targetHandle,
		})),
		snapshots,
	};
}
