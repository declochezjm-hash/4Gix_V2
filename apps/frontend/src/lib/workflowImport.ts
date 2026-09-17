import type { Edge, Node } from "@xyflow/react";

import type { CatalogNode, FlowNodeData, NodeCategory } from "./api";

export type WorkflowJsonDocument = {
	name?: string;
	nodes: unknown[];
	edges: unknown[];
	warnings?: string[];
};

function schemaDefaults(entry: CatalogNode): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	const properties = entry.schema.properties || {};
	for (const [key, prop] of Object.entries(properties)) {
		if (prop.default !== undefined) {
			params[key] = prop.default;
		}
	}
	return params;
}

function reactFlowTypeForNode(nodeType: string): string {
	return nodeType === "direct_agent_processor" ? "direct_agent_processor" : "etl";
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

const NODE_TYPE_ALIASES: Record<string, string> = {
	shapefile_writer: "file_writer",
	geojson_writer: "file_writer",
	vector_writer: "file_writer",
	gpkg_writer: "file_writer",
	csv_writer: "file_writer",
	/** Nom classe / exports legacy */
	filter_transformer: "attribute_filter",
	filter: "attribute_filter",
	attribute_mapper_transformer: "attribute_mapper",
	mapper_transformer: "attribute_mapper",
	reprojector: "reproject",
	bufferer: "buffer",
};

function resolveRawNodeType(raw: Record<string, unknown>): string {
	const data = asRecord(raw.data);
	const fromData = data.nodeType ?? data.node_type;
	if (fromData != null && String(fromData).trim()) {
		return String(fromData).trim();
	}
	const rootType = raw.type != null ? String(raw.type) : "";
	if (
		rootType &&
		rootType !== "etl" &&
		rootType !== "default" &&
		rootType !== "input" &&
		rootType !== "output"
	) {
		return rootType;
	}
	if (raw.node_type != null && String(raw.node_type).trim()) {
		return String(raw.node_type).trim();
	}
	return "unknown_node";
}

/** `Filter_Transformer`, `FilterTransformer` → `filter_transformer` */
export function normalizeNodeTypeKey(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	return trimmed
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.replace(/[-\s]+/g, "_")
		.toLowerCase();
}

function canonicalNodeType(rawType: string): string {
	const key = normalizeNodeTypeKey(rawType);
	if (!key) return "unknown_node";
	return NODE_TYPE_ALIASES[key] || key;
}

/** Alias catalogue pour types legacy (export JSON, noms de classes). */
export function canonicalImportedNodeType(rawType: string): string {
	return canonicalNodeType(rawType);
}

export function resolveImportedNodeType(raw: Record<string, unknown>): string {
	return canonicalNodeType(
		normalizeNodeTypeKey(resolveRawNodeType(raw)) || "unknown_node",
	);
}

/** Garantit un nœud React Flow affichable (type `etl` + `data.nodeType` canonique). */
export function coerceCanvasNode(
	node: Node<FlowNodeData>,
	index = 0,
): Node<FlowNodeData> {
	const rawData = (node.data ?? {}) as FlowNodeData;
	const flowKey = normalizeNodeTypeKey(String(node.type || ""));
	const fromFlowType =
		flowKey &&
		flowKey !== "etl" &&
		flowKey !== "default" &&
		flowKey !== "input" &&
		flowKey !== "output"
			? canonicalImportedNodeType(flowKey)
			: "";
	const nodeType = canonicalImportedNodeType(
		String(rawData.nodeType || fromFlowType || "unknown_node"),
	);
	const rfType =
		nodeType === "direct_agent_processor" ? "direct_agent_processor" : "etl";
	const position =
		typeof node.position?.x === "number" && typeof node.position?.y === "number"
			? node.position
			: { x: 80 + index * 48, y: 80 + index * 28 };
	return {
		...node,
		id: String(node.id),
		type: rfType,
		position,
		data: {
			...rawData,
			nodeType,
			label: rawData.label || nodeType || node.id,
			category: rawData.category || "Transformer",
			params: rawData.params ?? {},
			status: rawData.status || "idle",
			inputHandles: rawData.inputHandles?.length ? rawData.inputHandles : ["input"],
			outputHandles: rawData.outputHandles?.length ? rawData.outputHandles : ["output"],
		},
	};
}

function normalizePosition(
	position: unknown,
	fallbackIndex: number,
): { x: number; y: number } {
	const pos = asRecord(position);
	const x = typeof pos.x === "number" ? pos.x : 80 + fallbackIndex * 48;
	const y = typeof pos.y === "number" ? pos.y : 80 + fallbackIndex * 28;
	return { x, y };
}

export function parseWorkflowJsonDocument(raw: unknown): WorkflowJsonDocument {
	const doc = asRecord(raw);
	const definition = asRecord(doc.definition);
	const nodes = (
		Array.isArray(definition.nodes) && definition.nodes.length
			? definition.nodes
			: Array.isArray(doc.nodes)
				? doc.nodes
				: []
	) as unknown[];
	const edges = (
		Array.isArray(definition.edges)
			? definition.edges
			: Array.isArray(doc.edges)
				? doc.edges
				: []
	) as unknown[];
	const name =
		typeof doc.name === "string"
			? doc.name
			: typeof definition.name === "string"
				? definition.name
				: undefined;
	return { name, nodes, edges };
}

export function isWorkflowJsonPayload(parsed: unknown): boolean {
	return parseWorkflowJsonDocument(parsed).nodes.length > 0;
}

export function sanitizeReactFlowGraph(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[]; warnings: string[] } {
	const warnings: string[] = [];
	const safeNodes: Node<FlowNodeData>[] = nodes
		.filter((node) => Boolean(node?.id))
		.map((node, index) => {
			const position =
				node.position &&
				typeof node.position.x === "number" &&
				typeof node.position.y === "number"
					? node.position
					: { x: 80 + index * 48, y: 80 + index * 28 };
			const rawData = (node.data || {}) as FlowNodeData;
			const nodeType = canonicalNodeType(
				resolveRawNodeType({
					...asRecord(node),
					data: rawData,
					type: node.type,
				}),
			);
			return {
				...node,
				id: String(node.id),
				type: reactFlowTypeForNode(nodeType),
				position,
				data: {
					...rawData,
					label: rawData.label || nodeType,
					nodeType,
					category: rawData.category || "Transformer",
					isSpatial: Boolean(rawData.isSpatial),
					params:
						rawData.params && typeof rawData.params === "object" ? rawData.params : {},
					status: rawData.status || "idle",
					inputHandles: rawData.inputHandles?.length ? rawData.inputHandles : ["input"],
					outputHandles: rawData.outputHandles?.length
						? rawData.outputHandles
						: ["output"],
					paletteGroup: rawData.paletteGroup || "",
					notes: rawData.notes || "",
					disabled: Boolean(rawData.disabled),
				},
			};
		});

	const nodeIds = new Set(safeNodes.map((node) => node.id));
	const safeEdges: Edge[] = [];
	for (const edge of edges) {
		if (!edge?.source || !edge?.target) continue;
		if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
			warnings.push(
				`Liaison ignorée (nœud manquant) : ${edge.source} → ${edge.target}`,
			);
			continue;
		}
		safeEdges.push({
			...edge,
			id: String(
				edge.id || `e-${edge.source}-${edge.target}-${edge.sourceHandle || "output"}`,
			),
			source: String(edge.source),
			target: String(edge.target),
			sourceHandle: edge.sourceHandle || "output",
			targetHandle: edge.targetHandle || "input",
		});
	}

	return { nodes: safeNodes, edges: safeEdges, warnings };
}

export function normalizeImportedWorkflowDefinition(
	rawNodes: unknown[],
	rawEdges: unknown[],
	catalog: CatalogNode[],
): {
	nodes: Node<FlowNodeData>[];
	edges: Edge[];
	warnings: string[];
} {
	const warnings: string[] = [];

	const nodes: Node<FlowNodeData>[] = rawNodes.map((item, index) => {
		const raw = asRecord(item);
		const id = String(raw.id || `node-${index + 1}`);
		const nodeType = resolveImportedNodeType(raw);
		const rawType = normalizeNodeTypeKey(resolveRawNodeType(raw)) || "unknown_node";
		const dataRaw = asRecord(raw.data);
		const rootParams = asRecord(raw.params);
		const dataParams = asRecord(dataRaw.params);
		const mergedParams = { ...rootParams, ...dataParams };
		if (Object.keys(rootParams).length > 0 && Object.keys(dataParams).length === 0) {
			warnings.push(`Nœud ${id} : paramètres racine fusionnés dans data.params.`);
		}

		const entry = catalog.find((c) => c.node_type === nodeType);
		if (!entry && nodeType !== "unknown_node") {
			warnings.push(`Nœud ${id} : type « ${nodeType} » absent du catalogue.`);
		}

		const params = {
			...(entry ? schemaDefaults(entry) : {}),
			...mergedParams,
		};

		const category = (dataRaw.category ??
			entry?.category ??
			"Transformer") as NodeCategory;

		const data: FlowNodeData = {
			label: String(dataRaw.label ?? raw.label ?? entry?.label ?? nodeType),
			nodeType,
			requestedNodeType:
				typeof dataRaw.requestedNodeType === "string"
					? dataRaw.requestedNodeType
					: rawType !== nodeType
						? rawType
						: undefined,
			category,
			isSpatial: Boolean(
				dataRaw.isSpatial ?? dataRaw.is_spatial ?? entry?.is_spatial ?? false,
			),
			params,
			schema: (dataRaw.schema as FlowNodeData["schema"]) || entry?.schema,
			status: "idle",
			inputHandles: (Array.isArray(dataRaw.inputHandles)
				? dataRaw.inputHandles
				: entry?.input_handles) || ["input"],
			outputHandles: (Array.isArray(dataRaw.outputHandles)
				? dataRaw.outputHandles
				: entry?.output_handles) || ["output"],
			paletteGroup: String(
				dataRaw.paletteGroup ?? dataRaw.palette_group ?? entry?.palette_group ?? "",
			),
			notes: String(dataRaw.notes ?? ""),
			disabled: Boolean(dataRaw.disabled),
			outputSnapshot: dataRaw.outputSnapshot ?? dataRaw.output_snapshot,
			inputSnapshot: dataRaw.inputSnapshot ?? dataRaw.input_snapshot,
		};

		return {
			id,
			type: reactFlowTypeForNode(nodeType),
			position: normalizePosition(raw.position, index),
			data,
		};
	});

	const edges: Edge[] = [];
	const seenEdgeIds = new Set<string>();

	for (const item of rawEdges) {
		const raw = asRecord(item);
		const source = raw.source != null ? String(raw.source) : "";
		const target = raw.target != null ? String(raw.target) : "";
		if (!source || !target) {
			warnings.push("Liaison ignorée : source ou cible manquante.");
			continue;
		}
		const sourceHandle = raw.sourceHandle != null ? String(raw.sourceHandle) : "output";
		const targetHandle = raw.targetHandle != null ? String(raw.targetHandle) : "input";
		let id = raw.id != null ? String(raw.id) : "";
		if (!id) {
			id = `e-${source}-${target}-${sourceHandle}-${targetHandle}`;
			warnings.push(`Liaison ${source} → ${target} : id généré automatiquement.`);
		}
		let uniqueId = id;
		let suffix = 0;
		while (seenEdgeIds.has(uniqueId)) {
			suffix += 1;
			uniqueId = `${id}-${suffix}`;
		}
		seenEdgeIds.add(uniqueId);
		edges.push({
			id: uniqueId,
			source,
			target,
			sourceHandle,
			targetHandle,
		});
	}

	const sanitized = sanitizeReactFlowGraph(nodes, edges);
	return {
		nodes: sanitized.nodes,
		edges: sanitized.edges,
		warnings: [...warnings, ...sanitized.warnings],
	};
}

export async function readWorkflowJsonFile(file: File): Promise<WorkflowJsonDocument> {
	const text = await file.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		throw new Error("Fichier JSON illisible ou syntaxe invalide.");
	}
	return parseWorkflowJsonDocument(parsed);
}
