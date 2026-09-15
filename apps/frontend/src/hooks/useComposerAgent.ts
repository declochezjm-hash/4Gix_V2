import type { Edge, Node } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";

import type { FlowNodeData } from "../lib/api";
import { N8N_EDGE_TYPE } from "../lib/canvasEdges";

const API_BASE = import.meta.env.VITE_API_URL || "";

export type ComposerMessageType =
	| "thought"
	| "tool_call"
	| "code_diff"
	| "mapping_choices"
	| "done"
	| "error";

export type ComposerMappingChoice = {
	id: string;
	label: string;
	description: string;
	node_type?: string;
};

export interface ComposerMessage {
	type: ComposerMessageType;
	content?: string;
	tool?: string;
	summary?: string;
	choices?: ComposerMappingChoice[];
	result?: {
		node?: Node<FlowNodeData>;
		edge?: Edge;
		code?: string;
		diff?: string;
		inspect?: Record<string, unknown>;
	};
}

type ComposerGraph = {
	nodes: Node<FlowNodeData>[];
	edges: Edge[];
};

type RawComposerSsePayload = {
	type?: string;
	content?: string;
	name?: string;
	summary?: string;
	result?: Record<string, unknown>;
	code?: string;
	diff?: string;
	detail?: string;
};

const GHOST_EDGE_STYLE = {
	stroke: "#a855f7",
	strokeWidth: 2.5,
	strokeDasharray: "5,5",
} as const;

function composerAgentUrl(): string {
	const path = "/api/v1/agent/composer";
	return API_BASE ? `${API_BASE.replace(/\/$/, "")}${path}` : path;
}

function isGhostNode(node: Node<FlowNodeData>): boolean {
	return Boolean(node.data?.isGhost);
}

function isGhostEdge(edge: Edge): boolean {
	return Boolean((edge.data as { isGhost?: boolean } | undefined)?.isGhost);
}

export function graphForComposerAgent(graph: ComposerGraph): ComposerGraph {
	return {
		nodes: graph.nodes.filter((node) => !isGhostNode(node)),
		edges: graph.edges.filter((edge) => !isGhostEdge(edge)),
	};
}

function parseSseBlocks(
	buffer: string,
	onPayload: (payload: RawComposerSsePayload) => void,
): string {
	const blocks = buffer.split("\n\n");
	const remainder = blocks.pop() ?? "";
	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) continue;
		let dataLine = "";
		for (const line of trimmed.split("\n")) {
			if (line.startsWith("data:")) {
				dataLine = line.slice(5).trimStart();
			}
		}
		if (!dataLine) continue;
		try {
			onPayload(JSON.parse(dataLine) as RawComposerSsePayload);
		} catch {
			onPayload({ type: "error", content: "Événement SSE invalide." });
		}
	}
	return remainder;
}

function asFlowNodeData(raw: Record<string, unknown>): FlowNodeData {
	const category = raw.category as FlowNodeData["category"];
	return {
		label: String(raw.label ?? "Nœud"),
		nodeType: String(raw.nodeType ?? raw.node_type ?? "transformer"),
		category:
			category === "Reader" ||
			category === "Transformer" ||
			category === "Writer"
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

function ghostNodeFromBackend(
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
	return {
		id: String(result.id ?? `ghost-${crypto.randomUUID()}`),
		type: String(result.type ?? "etl"),
		position: {
			x: Number(position.x ?? 0),
			y: Number(position.y ?? 0),
		},
		data: asFlowNodeData(dataRaw),
	};
}

function ghostEdgeFromBackend(result: Record<string, unknown>): Edge {
	return {
		id: String(result.id ?? `ghost-edge-${crypto.randomUUID()}`),
		source: String(result.source),
		target: String(result.target),
		sourceHandle: String(
			result.sourceHandle ?? result.source_handle ?? "output",
		),
		targetHandle: String(
			result.targetHandle ?? result.target_handle ?? "input",
		),
		type: N8N_EDGE_TYPE,
		animated: true,
		data: { isGhost: true, pathStyle: "default" as const },
		style: { ...GHOST_EDGE_STYLE },
	};
}

function normalizeComposerEvent(
	raw: RawComposerSsePayload,
): ComposerMessage | null {
	const type = raw.type as ComposerMessageType | undefined;
	if (!type) return null;
	if (type === "thought") return { type, content: raw.content };
	if (type === "error") {
		return {
			type: "error",
			content: raw.content ?? raw.detail ?? "Erreur Composer.",
		};
	}
	if (type === "code_diff") {
		return {
			type,
			content: raw.content,
			result: { code: raw.code, diff: raw.diff },
		};
	}
	if (type === "mapping_choices") {
		const choices = Array.isArray(raw.choices)
			? (raw.choices as ComposerMappingChoice[])
			: [];
		return { type: "mapping_choices", content: raw.content, choices };
	}
	if (type === "done") return { type: "done" };
	if (type === "tool_call") {
		const resultObj =
			raw.result && typeof raw.result === "object"
				? (raw.result as Record<string, unknown>)
				: null;
		const message: ComposerMessage = {
			type: "tool_call",
			tool: raw.name,
			summary: raw.summary,
			result: {},
		};
		if (resultObj) {
			if (resultObj.id && (resultObj.type === "etl" || resultObj.data)) {
				message.result = {
					...message.result,
					node: ghostNodeFromBackend(resultObj),
				};
			} else if (resultObj.source && resultObj.target) {
				message.result = {
					...message.result,
					edge: ghostEdgeFromBackend(resultObj),
				};
			} else if (raw.name === "inspect_input_schema") {
				message.result = { ...message.result, inspect: resultObj };
			}
		}
		return message;
	}
	return null;
}

export type ComposerSendOptions = {
	selectedNodeId?: string;
	nodeId?: string;
	sourceNodeId?: string | null;
	contextMentions?: string[];
	mappingChoiceId?: string;
	promptOverride?: string;
};

export function useComposerAgent() {
	const [isThinking, setIsThinking] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [thoughts, setThoughts] = useState<string[]>([]);
	const [messages, setMessages] = useState<ComposerMessage[]>([]);
	const [proposedNodes, setProposedNodes] = useState<Node<FlowNodeData>[]>([]);
	const [proposedEdges, setProposedEdges] = useState<Edge[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [mappingChoices, setMappingChoices] = useState<ComposerMappingChoice[]>(
		[],
	);
	const lastPromptRef = useRef<string>("");
	const abortRef = useRef<AbortController | null>(null);

	const setComposerBusy = useCallback((busy: boolean) => {
		setIsThinking(busy);
		setIsLoading(busy);
		setIsGenerating(busy);
	}, []);

	const discardProposals = useCallback(() => {
		setProposedNodes([]);
		setProposedEdges([]);
	}, []);

	const pushProactiveAssistant = useCallback((content: string) => {
		const text = content.trim();
		if (!text) return;
		setMessages((prev) => [...prev, { type: "thought", content: text }]);
		setThoughts((prev) => [...prev, text]);
	}, []);

	const sendPrompt = useCallback(
		async (
			prompt: string,
			currentGraph: ComposerGraph,
			options: ComposerSendOptions = {},
		) => {
			const trimmed = prompt.trim();
			if (!trimmed) return;

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			setComposerBusy(true);
			setThoughts(["Chargement / Analyse…"]);
			setMessages([]);
			setProposedNodes([]);
			setProposedEdges([]);
			setError(null);
			setMappingChoices([]);
			lastPromptRef.current = trimmed;

			const payload = graphForComposerAgent(currentGraph);
			const nodeId = options.nodeId ?? options.selectedNodeId ?? null;
			const selectedNodeId = options.selectedNodeId ?? options.nodeId ?? null;

			try {
				const response = await fetch(composerAgentUrl(), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						prompt: options.promptOverride?.trim() || trimmed,
						node_id: nodeId,
						source_node_id: options.sourceNodeId ?? null,
						selected_node_id: selectedNodeId,
						current_graph: payload,
						context_mentions: options.contextMentions ?? [],
						mapping_choice_id: options.mappingChoiceId ?? null,
					}),
					signal: controller.signal,
				});
				if (!response.ok) {
					const detail = await response.text();
					throw new Error(detail || `HTTP ${response.status}`);
				}
				if (!response.body) throw new Error("Flux SSE indisponible.");

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					buffer = parseSseBlocks(buffer, (raw) => {
						const event = normalizeComposerEvent(raw);
						if (!event) return;
						setMessages((prev) => [...prev, event]);
						if (event.type === "thought" && event.content) {
							setThoughts((prev) => [...prev, event.content as string]);
						} else if (event.type === "tool_call" && event.result) {
							const { node: proposedNode, edge: proposedEdge } = event.result;
							if (proposedNode) {
								setProposedNodes((prev) =>
									prev.some((n) => n.id === proposedNode.id)
										? prev
										: [...prev, proposedNode],
								);
							}
							if (proposedEdge) {
								setProposedEdges((prev) =>
									prev.some((e) => e.id === proposedEdge.id)
										? prev
										: [...prev, proposedEdge],
								);
							}
						} else if (event.type === "mapping_choices" && event.choices?.length) {
							setMappingChoices(event.choices);
						} else if (event.type === "error") {
							setError(event.content ?? "Erreur Composer.");
						} else if (event.type === "done") {
							/* fin gérée dans finally */
						}
					});
				}
			} catch (err) {
				if (!controller.signal.aborted) {
					setError(
						err instanceof Error ? err.message : "Échec de l’agent Composer.",
					);
				}
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
				setComposerBusy(false);
			}
		},
		[setComposerBusy],
	);

	const applyMappingChoice = useCallback(
		async (
			choiceId: string,
			currentGraph: ComposerGraph,
			options: ComposerSendOptions = {},
		) => {
			const prompt = lastPromptRef.current.trim() || "fait un mappage";
			await sendPrompt(prompt, currentGraph, {
				...options,
				mappingChoiceId: choiceId,
				promptOverride: prompt,
			});
		},
		[sendPrompt],
	);

	return {
		sendPrompt,
		applyMappingChoice,
		pushProactiveAssistant,
		discardProposals,
		isThinking,
		isLoading,
		isGenerating,
		setComposerBusy,
		thoughts,
		messages,
		proposedNodes,
		proposedEdges,
		setProposedNodes,
		setProposedEdges,
		mappingChoices,
		error,
	};
}
