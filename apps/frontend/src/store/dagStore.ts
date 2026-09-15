import {
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	reconnectEdge,
} from "@xyflow/react";
import { create } from "zustand";

import { enrichCatalog } from "../config/nodeRegistry";
import {
	type CatalogNode,
	type DataUploadResult,
	deleteWorkflow as deleteWorkflowApi,
	directProcessAgent,
	downloadExportFmw,
	type ExecutionResult,
	type FlowNodeData,
	type FmwImportResult,
	fetchCatalog,
	fetchNodeSnapshot,
	fetchWorkflows,
	fileLooksLikeGeoJSON,
	importFmwFile,
	isDataImportFilename,
	isFmwFilename,
	isShapefileZipFilename,
	type MapViewState,
	type NodeSnapshot,
	saveWorkflow,
	uploadDataFile,
	type WorkflowRecord,
	wsExecuteUrl,
	zipLooksLikeShapefile,
} from "../lib/api";
import {
	buildCanvasEdge,
	type EdgePathStyle,
	normalizeCanvasEdges,
} from "../lib/canvasEdges";
import {
	appendMaterializedProposals,
	applyComposerGraphReplacement,
	computeComposerRemoveIds,
} from "../lib/composerCanvas";
import {
	type DirectChatTurn,
	graphForDirectProcess,
	parseChatHistory,
} from "../lib/directProcess";
import { SHAPEFILE_INCOMPLETE_CHAT_MESSAGE } from "../lib/shapefileGuidance";
import {
	fetchSpatialPreview,
	shouldEnrichSpatialPreview,
} from "../lib/spatialPreview";
import {
	coerceCanvasNode,
	normalizeImportedWorkflowDefinition,
	parseWorkflowJsonDocument,
} from "../lib/workflowImport";
import {
	layoutNodesByLayer,
	PAGINATION_NODE_THRESHOLD,
	positionsOverlapRatio,
	splitWorkflowIntoPages,
} from "../lib/workflowPagination";
import type { PendingWorkflowExport } from "../lib/workspaceExport";
import { buildWorkflowExports } from "../lib/workspaceExport";

type NodeStatus = NonNullable<FlowNodeData["status"]>;

export type PendingConnect = {
	nodeId: string;
	handleId: string;
};

export type PendingEdgeInsert = {
	edgeId: string;
	source: string;
	target: string;
	sourceHandle: string;
	targetHandle: string;
};

export type ContextMenuState = {
	nodeId: string;
	x: number;
	y: number;
};

export type AppView = "editor" | "overview";

type DagState = {
	nodes: Node<FlowNodeData>[];
	edges: Edge[];
	catalog: CatalogNode[];
	catalogLoaded: boolean;
	workflows: WorkflowRecord[];
	workflowId: string | null;
	workflowName: string;
	selectedNodeId: string | null;
	snapshots: Record<string, NodeSnapshot>;
	lastExecution: ExecutionResult | null;
	running: boolean;
	error: string | null;
	importNotice: string | null;
	inspectorOpen: boolean;
	nodePanelOpen: boolean;
	pendingConnect: PendingConnect | null;
	pendingEdgeInsert: PendingEdgeInsert | null;
	contextMenu: ContextMenuState | null;
	nodeClipboard: Node<FlowNodeData> | null;
	canvasLocked: boolean;
	edgePathStyle: EdgePathStyle;
	viewportFitRequest: number;
	canvasPages: string[][];
	canvasPageIndex: number;
	canvasPaginationEnabled: boolean;
	appView: AppView;
	mapView: MapViewState | null;
	onNodesChange: (changes: NodeChange<Node<FlowNodeData>>[]) => void;
	onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
	onConnect: (connection: Connection) => void;
	onReconnect: (oldEdge: Edge, connection: Connection) => void;
	removeEdge: (edgeId: string) => void;
	setEdgePathStyle: (style: EdgePathStyle) => void;
	addCatalogNode: (
		entry: CatalogNode,
		position?: { x: number; y: number },
	) => string;
	insertNodeFromPanel: (entry: CatalogNode) => void;
	selectNode: (id: string | null) => void;
	openInspector: (id?: string | null) => void;
	openNodePanel: (pending?: PendingConnect | null) => void;
	openNodePanelForEdgeInsert: (pending: PendingEdgeInsert) => void;
	closeNodePanel: () => void;
	updateNodeParams: (id: string, params: Record<string, unknown>) => void;
	updateNodeData: (id: string, patch: Partial<FlowNodeData>) => void;
	setMapView: (view: MapViewState) => void;
	setWorkflowName: (name: string) => void;
	loadCatalog: () => Promise<void>;
	loadWorkflows: () => Promise<void>;
	loadWorkflow: (id: string) => void;
	duplicateWorkflow: (id: string) => Promise<string | null>;
	renameWorkflow: (id: string, name: string) => Promise<boolean>;
	deleteWorkflow: (id: string) => Promise<void>;
	saveCurrentWorkflow: () => Promise<void>;
	runDag: () => Promise<void>;
	runSelectedNode: () => Promise<void>;
	runDirectProcess: (nodeId: string, prompt: string) => Promise<void>;
	closeInspector: () => void;
	openContextMenu: (menu: ContextMenuState) => void;
	closeContextMenu: () => void;
	deleteNode: (id: string) => void;
	duplicateNode: (id: string) => void;
	copyNode: (id: string) => void;
	pasteNode: () => void;
	toggleNodeDisabled: (id: string) => void;
	renameSelectedNode: (id: string) => void;
	tidyUpWorkflow: () => void;
	rebuildCanvasPages: () => void;
	setCanvasPage: (index: number) => void;
	setCanvasPaginationEnabled: (enabled: boolean) => void;
	setAppView: (view: AppView) => void;
	focusNodeOnCanvas: (nodeId: string) => void;
	newWorkflow: () => void;
	loadImportedDefinition: (payload: FmwImportResult) => void;
	importFmwFromFile: (file: File) => Promise<void>;
	importLocalWorkflowFile: (file: File) => Promise<void>;
	importShapefileZipFromFile: (
		file: File,
		position?: { x: number; y: number },
	) => Promise<void>;
	importDataFileFromDrop: (
		file: File,
		position?: { x: number; y: number },
	) => Promise<void>;
	exportCurrentFmw: () => Promise<void>;
	setCanvasLocked: (locked: boolean) => void;
	applyComposerReplacement: (
		anchorNodeId: string,
		proposedNodes: Node<FlowNodeData>[],
		proposedEdges: Edge[],
	) => void;
	appendStepProposals: (
		proposedNodes: Node<FlowNodeData>[],
		proposedEdges: Edge[],
	) => void;
	stepProposalNodes: Node<FlowNodeData>[];
	stepProposalEdges: Edge[];
	isArchitectGenerating: boolean;
	architectGlobalPlan: string[];
	architectStepIndex: number;
	architectTotalSteps: number;
	architectPreviousSteps: import("../lib/api").StepArchitectPreviousStep[];
	architectSourceNodeId: string | null;
	architectGlobalObjective: string;
	setStepProposals: (
		proposedNodes: Node<FlowNodeData>[],
		proposedEdges: Edge[],
	) => void;
	discardProposals: () => void;
	setArchitectGenerating: (value: boolean) => void;
	setArchitectSession: (patch: {
		globalPlan?: string[];
		stepIndex?: number;
		totalSteps?: number;
		previousSteps?: import("../lib/api").StepArchitectPreviousStep[];
		sourceNodeId?: string | null;
		globalObjective?: string;
	}) => void;
	applyComposerProposals: () => void;
	composerDrawerOpen: boolean;
	setComposerDrawerOpen: (open: boolean) => void;
	shapefileProactivePrompt: string | null;
	queueShapefileProactivePrompt: (message: string) => void;
	clearShapefileProactivePrompt: () => void;
	exportQueue: PendingWorkflowExport[];
	exportModalOpen: boolean;
	closeExportModal: () => void;
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

function graphPayload(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
	extra: Record<string, unknown> = {},
) {
	return {
		...extra,
		nodes: nodes.map((node) => ({
			id: node.id,
			type: node.data.nodeType,
			params: node.data.params,
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
	};
}

function activeNodes(nodes: Node<FlowNodeData>[]) {
	return nodes.filter((node) => !node.data.disabled);
}

function activeEdges(edges: Edge[], nodes: Node<FlowNodeData>[]) {
	const activeIds = new Set(activeNodes(nodes).map((node) => node.id));
	return edges.filter(
		(edge) => activeIds.has(edge.source) && activeIds.has(edge.target),
	);
}

function orphanWriterNodes(nodes: Node<FlowNodeData>[], edges: Edge[]) {
	const incoming = new Set(edges.map((edge) => edge.target));
	return activeNodes(nodes).filter((node) => {
		const nodeType = (node.data.nodeType || "").toLowerCase();
		const category = (node.data.category || "").toLowerCase();
		const isWriter =
			nodeType.endsWith("_writer") ||
			category === "writer" ||
			nodeType.includes("writer");
		return isWriter && !incoming.has(node.id);
	});
}

function bumpViewportFit(get: () => DagState) {
	return get().viewportFitRequest + 1;
}

function topologicalLayers(
	nodes: Node<FlowNodeData>[],
	edges: Edge[],
): Map<string, number> {
	const ids = new Set(nodes.map((node) => node.id));
	const incoming = new Map<string, string[]>();
	for (const id of ids) incoming.set(id, []);
	for (const edge of edges) {
		if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
		incoming.get(edge.target)?.push(edge.source);
	}
	const layer = new Map<string, number>();
	const queue = [...ids].filter((id) => (incoming.get(id) || []).length === 0);
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
	for (const id of ids) {
		if (!layer.has(id)) layer.set(id, 0);
	}
	return layer;
}

function applyStatus(
	nodes: Node<FlowNodeData>[],
	nodeId: string,
	status: NodeStatus,
	extra: Partial<FlowNodeData> = {},
) {
	return nodes.map((node) =>
		node.id === nodeId
			? { ...node, data: { ...node.data, status, ...extra } }
			: node,
	);
}

function ancestorsOf(nodeId: string, edges: Edge[]): Set<string> {
	const incoming = new Map<string, string[]>();
	for (const edge of edges) {
		const list = incoming.get(edge.target) || [];
		list.push(edge.source);
		incoming.set(edge.target, list);
	}
	const seen = new Set<string>();
	const stack = [nodeId];
	while (stack.length) {
		const id = stack.pop() as string;
		if (seen.has(id)) continue;
		seen.add(id);
		for (const parent of incoming.get(id) || []) stack.push(parent);
	}
	return seen;
}

function reactFlowTypeForNode(nodeType: string): string {
	return nodeType === "direct_agent_processor"
		? "direct_agent_processor"
		: "etl";
}

function buildNode(entry: CatalogNode, position: { x: number; y: number }) {
	const id = `${entry.node_type}-${nodeSeq++}`;
	const node: Node<FlowNodeData> = {
		id,
		type: reactFlowTypeForNode(entry.node_type),
		position,
		data: {
			label: entry.label,
			nodeType: entry.node_type,
			category: entry.category,
			isSpatial: entry.is_spatial,
			params: schemaDefaults(entry),
			schema: entry.schema,
			status: "idle",
			inputHandles: entry.input_handles || ["input"],
			outputHandles: entry.output_handles || ["output"],
			paletteGroup: entry.palette_group || "",
			notes: "",
			disabled: false,
		},
	};
	return node;
}

let nodeSeq = 1;

export const useDagStore = create<DagState>((set, get) => ({
	nodes: [],
	edges: [],
	catalog: [],
	catalogLoaded: false,
	workflows: [],
	workflowId: null,
	workflowName: "Nouveau workflow",
	selectedNodeId: null,
	snapshots: {},
	lastExecution: null,
	running: false,
	error: null,
	importNotice: null,
	inspectorOpen: false,
	nodePanelOpen: false,
	pendingConnect: null,
	pendingEdgeInsert: null,
	contextMenu: null,
	nodeClipboard: null,
	canvasLocked: false,
	edgePathStyle: "default",
	viewportFitRequest: 0,
	canvasPages: [],
	canvasPageIndex: 0,
	canvasPaginationEnabled: false,
	appView: "editor",
	mapView: null,
	composerDrawerOpen: false,
	shapefileProactivePrompt: null,
	exportQueue: [],
	exportModalOpen: false,
	closeExportModal: () => set({ exportModalOpen: false, exportQueue: [] }),
	stepProposalNodes: [],
	stepProposalEdges: [],
	isArchitectGenerating: false,
	architectGlobalPlan: [],
	architectStepIndex: 0,
	architectTotalSteps: 0,
	architectPreviousSteps: [],
	architectSourceNodeId: null,
	architectGlobalObjective: "",

	onNodesChange: (changes) =>
		set({ nodes: applyNodeChanges(changes, get().nodes) }),

	onEdgesChange: (changes) =>
		set({ edges: applyEdgeChanges(changes, get().edges) }),

	onConnect: (connection) => {
		const pathStyle = get().edgePathStyle;
		set({
			edges: addEdge(buildCanvasEdge(connection, pathStyle), get().edges),
			pendingConnect: null,
		});
	},

	onReconnect: (oldEdge, connection) => {
		const pathStyle = get().edgePathStyle;
		const edgeType = buildCanvasEdge(connection, pathStyle).type;
		set({
			edges: reconnectEdge(
				{ ...oldEdge, type: edgeType },
				connection,
				get().edges,
			),
		});
	},

	removeEdge: (edgeId) =>
		set({ edges: get().edges.filter((edge) => edge.id !== edgeId) }),

	setEdgePathStyle: (style) =>
		set({
			edgePathStyle: style,
			edges: normalizeCanvasEdges(get().edges, style),
		}),

	addCatalogNode: (entry, position) => {
		const node = buildNode(
			entry,
			position || {
				x: 120 + (nodeSeq % 5) * 40,
				y: 80 + nodeSeq * 28,
			},
		);
		set({
			nodes: [...get().nodes, node],
			selectedNodeId: node.id,
			inspectorOpen: false,
			nodePanelOpen: false,
			pendingConnect: null,
		});
		return node.id;
	},

	insertNodeFromPanel: (entry) => {
		const { pendingConnect, pendingEdgeInsert, selectedNodeId, nodes, edges } =
			get();
		const pathStyle = get().edgePathStyle;

		if (pendingEdgeInsert) {
			const sourceNode = nodes.find((n) => n.id === pendingEdgeInsert.source);
			const targetNode = nodes.find((n) => n.id === pendingEdgeInsert.target);
			const position =
				sourceNode && targetNode
					? {
							x: (sourceNode.position.x + targetNode.position.x) / 2,
							y: (sourceNode.position.y + targetNode.position.y) / 2,
						}
					: {
							x: 280 + (nodes.length % 4) * 40,
							y: 140 + nodes.length * 12,
						};
			const node = buildNode(entry, position);
			const targetHandle = entry.input_handles?.[0] || "input";
			const outHandle = entry.output_handles?.[0] || "output";
			const linkIn: Connection = {
				source: pendingEdgeInsert.source,
				sourceHandle: pendingEdgeInsert.sourceHandle,
				target: node.id,
				targetHandle,
			};
			const linkOut: Connection = {
				source: node.id,
				sourceHandle: outHandle,
				target: pendingEdgeInsert.target,
				targetHandle: pendingEdgeInsert.targetHandle,
			};
			const without = edges.filter((e) => e.id !== pendingEdgeInsert.edgeId);
			let nextEdges = addEdge(buildCanvasEdge(linkIn, pathStyle), without);
			nextEdges = addEdge(buildCanvasEdge(linkOut, pathStyle), nextEdges);
			set({
				nodes: [...nodes, node],
				edges: nextEdges,
				selectedNodeId: node.id,
				nodePanelOpen: false,
				pendingConnect: null,
				pendingEdgeInsert: null,
				inspectorOpen: false,
			});
			return;
		}

		const sourceId = pendingConnect?.nodeId || selectedNodeId;
		const source = nodes.find((node) => node.id === sourceId);
		const position = source
			? { x: source.position.x + 240, y: source.position.y }
			: { x: 280 + (nodes.length % 4) * 40, y: 140 + nodes.length * 12 };
		const node = buildNode(entry, position);
		let nextEdges = edges;
		if (source) {
			const sourceHandle =
				pendingConnect?.handleId || source.data.outputHandles?.[0] || "output";
			const targetHandle = entry.input_handles?.[0] || "input";
			const link: Connection = {
				source: source.id,
				sourceHandle,
				target: node.id,
				targetHandle,
			};
			nextEdges = addEdge(buildCanvasEdge(link, pathStyle), edges);
		}
		set({
			nodes: [...nodes, node],
			edges: nextEdges,
			selectedNodeId: node.id,
			nodePanelOpen: false,
			pendingConnect: null,
			pendingEdgeInsert: null,
			inspectorOpen: false,
		});
	},

	selectNode: (id) => {
		set({ selectedNodeId: id });
	},

	openInspector: (id) => {
		const nodeId = id ?? get().selectedNodeId;
		if (!nodeId) return;
		set({
			selectedNodeId: nodeId,
			inspectorOpen: true,
			nodePanelOpen: false,
		});
		const executionId = get().lastExecution?.execution_id;
		if (!executionId) return;
		const existing = get().snapshots[nodeId];
		if (
			existing?.input_snapshot !== undefined ||
			existing?.output_snapshot !== undefined
		)
			return;
		void fetchNodeSnapshot(executionId, nodeId)
			.then((remote) => {
				set({
					snapshots: {
						...get().snapshots,
						[nodeId]: {
							...(existing || {
								node_id: nodeId,
								node_type: "",
								status: "COMPLETED",
								duration_ms: remote.execution_time_ms,
								metadata: {},
								preview: remote.output_snapshot,
							}),
							input_snapshot: remote.input_snapshot,
							output_snapshot: remote.output_snapshot,
							duration_ms: remote.execution_time_ms,
						},
					},
				});
			})
			.catch(() => undefined);
	},

	openNodePanel: (pending = null) =>
		set({
			nodePanelOpen: true,
			pendingConnect: pending,
			pendingEdgeInsert: null,
			inspectorOpen: false,
		}),

	openNodePanelForEdgeInsert: (pending) =>
		set({
			nodePanelOpen: true,
			pendingEdgeInsert: pending,
			pendingConnect: null,
			inspectorOpen: false,
		}),

	closeNodePanel: () =>
		set({
			nodePanelOpen: false,
			pendingConnect: null,
			pendingEdgeInsert: null,
		}),

	updateNodeParams: (id, params) =>
		set({
			nodes: get().nodes.map((node) =>
				node.id === id
					? {
							...node,
							data: {
								...node.data,
								params: { ...node.data.params, ...params },
							},
						}
					: node,
			),
		}),

	updateNodeData: (id, patch) =>
		set({
			nodes: get().nodes.map((node) =>
				node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
			),
		}),

	setMapView: (view) => set({ mapView: view }),
	setWorkflowName: (name) => set({ workflowName: name }),
	closeInspector: () => set({ inspectorOpen: false }),

	runDirectProcess: async (nodeId, prompt) => {
		const { nodes, edges, snapshots, lastExecution } = get();
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;
		const trimmed = prompt.trim();
		if (!trimmed) return;

		set({
			nodes: applyStatus(nodes, nodeId, "RUNNING", { error: null }),
			error: null,
		});

		const prevHistory = parseChatHistory(node.data.params?.chat_history);

		try {
			const result = await directProcessAgent({
				node_id: nodeId,
				prompt: trimmed,
				sample_limit: 500,
				current_graph: graphForDirectProcess(nodes, edges, snapshots),
				execution_id: lastExecution?.execution_id ?? undefined,
			});
			const snapshot = result.snapshot;
			const turn: DirectChatTurn = {
				prompt: trimmed,
				executedAt: new Date().toISOString(),
				ok: true,
				featureCountAfter: result.feature_count_after,
			};
			set((state) => ({
				snapshots: { ...state.snapshots, [nodeId]: snapshot },
				nodes: state.nodes.map((n) =>
					n.id === nodeId
						? {
								...n,
								data: {
									...n.data,
									status: "COMPLETED",
									durationMs: snapshot.duration_ms,
									error: null,
									params: {
										...n.data.params,
										prompt: trimmed,
										chat_history: [...prevHistory, turn],
										last_code: result.code ?? "",
									},
								},
							}
						: n,
				),
			}));
		} catch (err) {
			const message = err instanceof Error ? err.message : "Erreur inconnue";
			const turn: DirectChatTurn = {
				prompt: trimmed,
				executedAt: new Date().toISOString(),
				ok: false,
				error: message,
			};
			set((state) => ({
				error: message,
				nodes: state.nodes.map((n) =>
					n.id === nodeId
						? {
								...n,
								data: {
									...n.data,
									status: "FAILED",
									error: message,
									params: {
										...n.data.params,
										prompt: trimmed,
										chat_history: [...prevHistory, turn],
									},
								},
							}
						: n,
				),
			}));
		}
	},

	loadCatalog: async () => {
		try {
			const payload = await fetchCatalog();
			const nodes = enrichCatalog(payload.nodes || []);
			set({
				catalog: nodes,
				catalogLoaded: true,
				error: nodes.length
					? null
					: "Catalogue vide — redémarrez l’API backend (port 8000).",
			});
		} catch (err) {
			set({
				catalog: [],
				catalogLoaded: true,
				error:
					err instanceof Error
						? err.message
						: "Erreur catalogue (API injoignable ?)",
			});
		}
	},

	loadWorkflows: async () => {
		try {
			const payload = await fetchWorkflows();
			set({ workflows: payload.workflows });
		} catch (err) {
			set({ error: err instanceof Error ? err.message : "Erreur workflows" });
		}
	},

	duplicateWorkflow: async (id) => {
		const record = get().workflows.find((item) => item.id === id);
		if (!record) return null;
		const copyName = `${record.name} (copie)`;
		try {
			const saved = await saveWorkflow({
				name: copyName,
				definition: JSON.parse(JSON.stringify(record.definition ?? {})),
			});
			await get().loadWorkflows();
			set({
				error: null,
				importNotice: `Workflow dupliqué : « ${saved.name} » (en tête de liste).`,
			});
			return saved.id;
		} catch (err) {
			set({
				error:
					err instanceof Error
						? err.message
						: "Impossible de dupliquer le workflow.",
			});
			return null;
		}
	},

	renameWorkflow: async (id, name) => {
		const trimmed = name.trim();
		if (!trimmed) return false;
		const record = get().workflows.find((item) => item.id === id);
		if (!record) return false;
		try {
			const saved = await saveWorkflow({
				id,
				name: trimmed,
				definition: record.definition ?? {},
			});
			await get().loadWorkflows();
			if (get().workflowId === id) {
				set({ workflowName: saved.name });
			}
			set({
				error: null,
				importNotice: `Workflow renommé : « ${saved.name} ».`,
			});
			return true;
		} catch (err) {
			set({
				error:
					err instanceof Error
						? err.message
						: "Impossible de renommer le workflow.",
			});
			return false;
		}
	},

	deleteWorkflow: async (id) => {
		const record = get().workflows.find((item) => item.id === id);
		const label = record?.name ?? "Workflow";
		try {
			await deleteWorkflowApi(id);
			const wasCurrent = get().workflowId === id;
			await get().loadWorkflows();
			if (wasCurrent) {
				get().newWorkflow();
			}
			set({
				error: null,
				importNotice: `« ${label} » a été supprimé.`,
			});
		} catch (err) {
			set({
				error:
					err instanceof Error
						? err.message
						: "Impossible de supprimer le workflow.",
			});
		}
	},

	loadWorkflow: (id) => {
		const record = get().workflows.find((item) => item.id === id);
		if (!record) return;
		const definition = record.definition || {};
		const normalized = normalizeImportedWorkflowDefinition(
			(definition.nodes || []) as unknown[],
			(definition.edges || []) as unknown[],
			get().catalog,
		);
		const nodes = normalized.nodes.map((node, index) =>
			coerceCanvasNode(
				{
					...node,
					data: {
						...node.data,
						status: "idle",
						durationMs: undefined,
						error: null,
					},
				},
				index,
			),
		);
		set({
			workflowId: record.id,
			workflowName: record.name,
			nodes,
			edges: normalizeCanvasEdges(normalized.edges, get().edgePathStyle),
			snapshots: {},
			lastExecution: null,
			selectedNodeId: null,
			inspectorOpen: false,
			nodePanelOpen: false,
			viewportFitRequest: bumpViewportFit(get),
		});
		get().rebuildCanvasPages();
	},

	saveCurrentWorkflow: async () => {
		const { workflowName, workflowId, nodes, edges } = get();
		try {
			const saved = await saveWorkflow({
				id: workflowId,
				name: workflowName || "Sans nom",
				definition: { nodes, edges },
			});
			set({
				workflowId: saved.id,
				workflowName: saved.name,
				error: null,
			});
			await get().loadWorkflows();
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Échec de sauvegarde",
			});
		}
	},

	runDag: async () => {
		const orphans = orphanWriterNodes(get().nodes, get().edges);
		if (orphans.length > 0) {
			const sample = orphans
				.slice(0, 3)
				.map((node) => node.data.label || node.id)
				.join(", ");
			set({
				error: `${orphans.length} writer(s) sans liaison entrante (${sample}${orphans.length > 3 ? "…" : ""}). Reliez un flux en amont ou désactivez le nœud. Après import .fmw, vérifiez les liens (menu nœud → Tidy up workflow).`,
			});
			return;
		}
		await executeViaSocket(get, set);
	},

	runSelectedNode: async () => {
		const { selectedNodeId, nodes, edges } = get();
		if (!selectedNodeId) {
			await executeViaSocket(get, set);
			return;
		}
		const keep = ancestorsOf(selectedNodeId, edges);
		await executeViaSocket(
			get,
			set,
			nodes.filter((node) => keep.has(node.id)),
			edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
		);
	},

	openContextMenu: (menu) =>
		set({ contextMenu: menu, selectedNodeId: menu.nodeId }),
	closeContextMenu: () => set({ contextMenu: null }),

	deleteNode: (id) => {
		set({
			nodes: get().nodes.filter((node) => node.id !== id),
			edges: get().edges.filter(
				(edge) => edge.source !== id && edge.target !== id,
			),
			selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
			contextMenu: null,
		});
		get().rebuildCanvasPages();
	},

	duplicateNode: (id) => {
		const source = get().nodes.find((node) => node.id === id);
		if (!source) return;
		const copy: Node<FlowNodeData> = {
			...source,
			id: `${source.data.nodeType}-${nodeSeq++}`,
			position: {
				x: source.position.x + 40,
				y: source.position.y + 40,
			},
			data: {
				...source.data,
				status: "idle",
				durationMs: undefined,
				error: null,
			},
		};
		set({
			nodes: [...get().nodes, copy],
			selectedNodeId: copy.id,
			contextMenu: null,
		});
		get().rebuildCanvasPages();
	},

	copyNode: (id) => {
		const source = get().nodes.find((node) => node.id === id);
		if (!source) return;
		set({
			nodeClipboard: JSON.parse(JSON.stringify(source)) as Node<FlowNodeData>,
			contextMenu: null,
		});
	},

	pasteNode: () => {
		const clip = get().nodeClipboard;
		if (!clip) return;
		const copy: Node<FlowNodeData> = {
			...clip,
			id: `${clip.data.nodeType}-${nodeSeq++}`,
			position: {
				x: (clip.position?.x || 0) + 60,
				y: (clip.position?.y || 0) + 60,
			},
			data: {
				...clip.data,
				status: "idle",
				durationMs: undefined,
				error: null,
			},
		};
		set({ nodes: [...get().nodes, copy], selectedNodeId: copy.id });
	},

	toggleNodeDisabled: (id) =>
		set({
			nodes: get().nodes.map((node) =>
				node.id === id
					? { ...node, data: { ...node.data, disabled: !node.data.disabled } }
					: node,
			),
			contextMenu: null,
		}),

	renameSelectedNode: (id) => {
		const node = get().nodes.find((item) => item.id === id);
		if (!node) return;
		const next = window.prompt("Renommer le nœud", node.data.label);
		if (!next?.trim()) return;
		set({
			nodes: get().nodes.map((item) =>
				item.id === id
					? { ...item, data: { ...item.data, label: next.trim() } }
					: item,
			),
			contextMenu: null,
		});
	},

	tidyUpWorkflow: () => {
		const { nodes, edges } = get();
		if (!nodes.length) return;
		set({
			nodes: layoutNodesByLayer(nodes, edges).map((node, index) =>
				coerceCanvasNode(node, index),
			),
			contextMenu: null,
			viewportFitRequest: bumpViewportFit(get),
		});
	},

	rebuildCanvasPages: () => {
		const { nodes, edges } = get();
		if (!nodes.length) {
			set({
				canvasPages: [],
				canvasPageIndex: 0,
				canvasPaginationEnabled: false,
			});
			return;
		}
		const pages = splitWorkflowIntoPages(nodes, edges);
		const multiPage =
			nodes.length >= PAGINATION_NODE_THRESHOLD && pages.length > 1;
		set({
			canvasPages: pages,
			canvasPageIndex: Math.min(
				get().canvasPageIndex,
				Math.max(0, pages.length - 1),
			),
			canvasPaginationEnabled: multiPage,
			viewportFitRequest: bumpViewportFit(get),
		});
	},

	setCanvasPage: (index) => {
		const { canvasPages } = get();
		if (!canvasPages.length) return;
		const next = Math.max(0, Math.min(index, canvasPages.length - 1));
		set({
			canvasPageIndex: next,
			canvasPaginationEnabled: true,
			viewportFitRequest: bumpViewportFit(get),
		});
	},

	setCanvasPaginationEnabled: (enabled) => {
		set({
			canvasPaginationEnabled: enabled,
			viewportFitRequest: bumpViewportFit(get),
		});
	},

	setAppView: (view) => {
		if (view === "editor" && get().nodes.length > 0) {
			set({
				appView: view,
				viewportFitRequest: bumpViewportFit(get),
			});
			return;
		}
		set({ appView: view });
	},

	focusNodeOnCanvas: (nodeId) => {
		const { canvasPages, nodes } = get();
		if (!nodes.some((node) => node.id === nodeId)) return;
		const pageIndex = canvasPages.findIndex((page) => page.includes(nodeId));
		set({
			appView: "editor",
			selectedNodeId: nodeId,
			canvasPaginationEnabled:
				pageIndex >= 0 ? true : get().canvasPaginationEnabled,
			canvasPageIndex: pageIndex >= 0 ? pageIndex : get().canvasPageIndex,
			viewportFitRequest: bumpViewportFit(get),
			nodePanelOpen: false,
			inspectorOpen: false,
		});
	},

	newWorkflow: () => {
		set({
			nodes: [],
			edges: [],
			workflowId: null,
			workflowName: "Nouveau workflow",
			snapshots: {},
			lastExecution: null,
			selectedNodeId: null,
			inspectorOpen: false,
			nodePanelOpen: false,
			error: null,
			importNotice: null,
			canvasPages: [],
			canvasPageIndex: 0,
			canvasPaginationEnabled: false,
			appView: "editor",
		});
	},

	loadImportedDefinition: (payload) => {
		const catalog = get().catalog;
		const normalized = normalizeImportedWorkflowDefinition(
			payload.definition.nodes || [],
			payload.definition.edges || [],
			catalog,
		);
		const nodes = normalized.nodes.map((node, index) =>
			coerceCanvasNode(
				{
					...node,
					data: {
						...node.data,
						status: "idle",
						disabled: false,
						durationMs: undefined,
						error: null,
					},
				},
				index,
			),
		);
		const importWarnings = [
			...(payload.warnings || []),
			...normalized.warnings,
		];
		set({
			nodes,
			edges: normalizeCanvasEdges(normalized.edges, get().edgePathStyle),
			workflowName: payload.name,
			workflowId: null,
			snapshots: {},
			lastExecution: null,
			selectedNodeId: null,
			inspectorOpen: false,
			nodePanelOpen: false,
			stepProposalNodes: [],
			stepProposalEdges: [],
			appView: "editor",
			canvasPaginationEnabled: false,
			canvasPageIndex: 0,
			error: null,
			importNotice:
				importWarnings.length > 0
					? `Import : ${nodes.length} nœud(s), ${normalized.edges.length} lien(s) · ${importWarnings[0]}`
					: `Import : ${nodes.length} nœud(s), ${normalized.edges.length} lien(s) chargés.`,
			viewportFitRequest: bumpViewportFit(get),
		});
		try {
			if (nodes.length > 0) {
				get().tidyUpWorkflow();
			}
			get().rebuildCanvasPages();
			const state = get();
			const overlap = positionsOverlapRatio(state.nodes);
			const weakPositions = state.nodes.some(
				(node) =>
					typeof node.position?.x !== "number" ||
					typeof node.position?.y !== "number",
			);
			if (
				state.nodes.length >= PAGINATION_NODE_THRESHOLD ||
				overlap >= 0.25 ||
				weakPositions
			) {
				get().tidyUpWorkflow();
				get().rebuildCanvasPages();
				if (state.nodes.length >= 50) {
					set({
						edgePathStyle: "smoothstep",
						edges: normalizeCanvasEdges(get().edges, "smoothstep"),
					});
				}
			}
			if (state.nodes.length >= PAGINATION_NODE_THRESHOLD) {
				set({ appView: "overview" });
				const pageCount = get().canvasPages.length;
				set({
					importNotice:
						`${get().importNotice || ""} · Réorganisation automatique (${pageCount} page(s) max. ~26 nœuds)`.replace(
							/^ · /,
							"",
						),
				});
			}
		} catch (postImportError) {
			console.error("[4GIx] post-import layout", postImportError);
		}
	},

	importFmwFromFile: async (file: File) => {
		if (!isFmwFilename(file.name)) {
			set({ error: "Fichier attendu: .fmw ou .fmwt" });
			return;
		}
		try {
			const payload = await importFmwFile(file);
			get().loadImportedDefinition(payload);
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Import .fmw impossible.",
				importNotice: null,
			});
		}
	},

	importLocalWorkflowFile: async (file: File) => {
		const lower = file.name.toLowerCase();
		if (isFmwFilename(file.name)) {
			await get().importFmwFromFile(file);
			return;
		}
		if (isDataImportFilename(file.name)) {
			if (lower.endsWith(".json")) {
				const text = await file.text();
				let parsed: unknown;
				try {
					parsed = JSON.parse(text) as unknown;
				} catch {
					set({ error: "Fichier JSON illisible ou syntaxe invalide." });
					return;
				}
				const workflowDoc = parseWorkflowJsonDocument(parsed);
				if (workflowDoc.nodes.length > 0) {
					get().loadImportedDefinition({
						name: workflowDoc.name || file.name.replace(/\.[^.]+$/, ""),
						format: "4gix_dag",
						source: "json_file",
						warnings: workflowDoc.warnings || [],
						definition: {
							nodes: workflowDoc.nodes,
							edges: workflowDoc.edges,
						},
					});
					return;
				}
				const geoKind =
					parsed &&
					typeof parsed === "object" &&
					"type" in parsed &&
					typeof (parsed as { type?: unknown }).type === "string"
						? (parsed as { type: string }).type
						: "";
				if (
					geoKind === "FeatureCollection" ||
					geoKind === "Feature" ||
					geoKind === "Geometry"
				) {
					await get().importDataFileFromDrop(file);
					return;
				}
			} else {
				await get().importDataFileFromDrop(file);
				return;
			}
		}
		if (!lower.endsWith(".json") && !lower.endsWith(".4gix.json")) {
			set({
				error:
					"Formats acceptés: .fmw, .fmwt, .json workflow, .xlsx, .csv, .gpkg, .geojson, .kml, .dxf, .zip (Shapefile), .tif",
			});
			return;
		}
		try {
			const doc = parseWorkflowJsonDocument(
				JSON.parse(await file.text()) as unknown,
			);
			const payload: FmwImportResult = {
				name: doc.name || file.name.replace(/\.[^.]+$/, ""),
				format: "4gix_dag",
				source: "json_file",
				warnings: doc.warnings || [],
				definition: {
					nodes: doc.nodes,
					edges: doc.edges,
				},
			};
			if (!payload.definition.nodes.length) {
				set({ error: "JSON invalide: aucun nœud trouvé." });
				return;
			}
			get().loadImportedDefinition(payload);
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Import JSON impossible.",
			});
		}
	},

	importDataFileFromDrop: async (file, position) => {
		if (!isDataImportFilename(file.name)) {
			set({
				error:
					"Formats de données : .xlsx, .xls, .csv, .gpkg, .geojson, .json (GeoJSON), .kml, .kmz, .dxf, .zip (Shapefile), .shp, .tif.",
			});
			return;
		}
		if (file.name.toLowerCase().endsWith(".json")) {
			const isGeo = await fileLooksLikeGeoJSON(file);
			if (!isGeo) {
				set({ error: "Ce .json n’est pas un GeoJSON valide." });
				return;
			}
		}
		if (isShapefileZipFilename(file.name)) {
			const looksLike = await zipLooksLikeShapefile(file);
			if (!looksLike) {
				set({
					error:
						"Ce .zip ne semble pas contenir de Shapefile (.shp, .shx, .dbf).",
				});
				return;
			}
		}
		try {
			const payload: DataUploadResult = await uploadDataFile(file);
			const suggested = payload.suggested_node;
			if (!suggested?.node_type) {
				throw new Error(
					"Réponse serveur incomplète (suggested_node manquant).",
				);
			}
			const entry = get().catalog.find(
				(item) => item.node_type === suggested.node_type,
			);
			if (!entry) {
				set({
					error: `Nœud ${suggested.node_type} absent du catalogue.`,
				});
				return;
			}
			const pos =
				position ||
				({
					x: 120 + (get().nodes.length % 5) * 48,
					y: 80 + get().nodes.length * 24,
				} as const);
			const node = buildNode(entry, pos);
			node.data.label = suggested.label || entry.label;
			node.data.params = {
				...node.data.params,
				...suggested.params,
			};
			const typeLabels: Record<string, string> = {
				shapefile: "Shapefile",
				geojson: "GeoJSON",
				geotiff: "GeoTIFF",
			};
			const kind = typeLabels[payload.detected_type] || payload.detected_type;
			const isSoloShp = file.name.toLowerCase().endsWith(".shp");
			const shpSoloHint = isSoloShp
				? " — préférez un .zip (.shp+.shx+.dbf) pour les attributs"
				: "";
			set({
				nodes: [...get().nodes, node],
				selectedNodeId: node.id,
				inspectorOpen: true,
				nodePanelOpen: false,
				error: null,
				importNotice: `${kind} · ${file.name}${shpSoloHint}`,
				shapefileProactivePrompt: isSoloShp
					? SHAPEFILE_INCOMPLETE_CHAT_MESSAGE
					: null,
				composerDrawerOpen: isSoloShp ? true : get().composerDrawerOpen,
			});
		} catch (err) {
			set({
				error:
					err instanceof Error ? err.message : "Import de données impossible.",
				importNotice: null,
			});
		}
	},

	importShapefileZipFromFile: async (file, position) => {
		await get().importDataFileFromDrop(file, position);
	},

	exportCurrentFmw: async () => {
		const state = get();
		if (!state.nodes.length) {
			set({ error: "Aucun nœud à exporter." });
			return;
		}
		await get().saveCurrentWorkflow();
		const workflowId = get().workflowId;
		if (!workflowId) {
			set({ error: "Enregistrez le workflow avant l'export .fmw." });
			return;
		}
		try {
			const base = (get().workflowName || "workflow").replace(
				/[<>:"/\\|?*]+/g,
				"_",
			);
			await downloadExportFmw(workflowId, base);
			set({ error: null });
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Export .fmw impossible.",
			});
		}
	},

	setCanvasLocked: (locked) => set({ canvasLocked: locked }),

	setComposerDrawerOpen: (open) => set({ composerDrawerOpen: open }),

	queueShapefileProactivePrompt: (message) =>
		set({ shapefileProactivePrompt: message.trim() || null }),

	clearShapefileProactivePrompt: () => set({ shapefileProactivePrompt: null }),

	appendStepProposals: (proposedNodes, proposedEdges) => {
		const state = get();
		const { nodes, edges } = appendMaterializedProposals(
			state.nodes,
			state.edges,
			state.edgePathStyle,
			proposedNodes,
			proposedEdges,
		);
		set({ nodes, edges });
	},

	setStepProposals: (proposedNodes, proposedEdges) => {
		set({
			stepProposalNodes: proposedNodes,
			stepProposalEdges: proposedEdges,
		});
	},

	discardProposals: () => {
		set({ stepProposalNodes: [], stepProposalEdges: [] });
	},

	setArchitectGenerating: (value) => set({ isArchitectGenerating: value }),

	setArchitectSession: (patch) =>
		set((state) => ({
			architectGlobalPlan: patch.globalPlan ?? state.architectGlobalPlan,
			architectStepIndex: patch.stepIndex ?? state.architectStepIndex,
			architectTotalSteps: patch.totalSteps ?? state.architectTotalSteps,
			architectPreviousSteps:
				patch.previousSteps ?? state.architectPreviousSteps,
			architectSourceNodeId:
				patch.sourceNodeId !== undefined
					? patch.sourceNodeId
					: state.architectSourceNodeId,
			architectGlobalObjective:
				patch.globalObjective ?? state.architectGlobalObjective,
		})),

	applyComposerProposals: () => {
		const state = get();
		if (!state.stepProposalNodes.length) return;
		const { nodes, edges } = appendMaterializedProposals(
			state.nodes,
			state.edges,
			state.edgePathStyle,
			state.stepProposalNodes,
			state.stepProposalEdges,
		);
		set({
			nodes,
			edges,
			stepProposalNodes: [],
			stepProposalEdges: [],
			inspectorOpen: false,
			importNotice: "Pipeline consolidé sur le canvas.",
			error: null,
		});
	},

	applyComposerReplacement: (anchorNodeId, proposedNodes, proposedEdges) => {
		const state = get();
		const anchor = state.nodes.find((node) => node.id === anchorNodeId);
		const replaceDownstream = anchor?.data.params?.replace_downstream !== false;
		const removeIds = computeComposerRemoveIds(
			anchorNodeId,
			Boolean(replaceDownstream),
			state.nodes,
			state.edges,
		);
		const { nodes, edges } = applyComposerGraphReplacement(
			state.nodes,
			state.edges,
			state.edgePathStyle,
			anchorNodeId,
			removeIds,
			proposedNodes,
			proposedEdges,
		);
		set({
			nodes,
			edges,
			inspectorOpen: false,
			selectedNodeId:
				state.selectedNodeId && removeIds.includes(state.selectedNodeId)
					? null
					: state.selectedNodeId,
		});
	},
}));

async function enrichSnapshotIfNeeded(
	nodes: Node<FlowNodeData>[],
	snapshot: NodeSnapshot,
): Promise<NodeSnapshot> {
	const node = nodes.find((item) => item.id === snapshot.node_id);
	if (
		!node ||
		!shouldEnrichSpatialPreview(node.data.nodeType, snapshot.preview)
	) {
		return snapshot;
	}
	try {
		const preview = await fetchSpatialPreview(
			node.data.nodeType,
			node.data.params as Record<string, unknown>,
		);
		return { ...snapshot, preview };
	} catch {
		return snapshot;
	}
}

async function executeViaSocket(
	get: () => DagState,
	set: (
		partial: Partial<DagState> | ((state: DagState) => Partial<DagState>),
	) => void,
	subsetNodes?: Node<FlowNodeData>[],
	subsetEdges?: Edge[],
) {
	const { workflowId, workflowName } = get();
	const baseNodes = subsetNodes || get().nodes;
	const baseEdges = subsetEdges || get().edges;
	const nodes = activeNodes(baseNodes);
	const edges = activeEdges(baseEdges, baseNodes);
	const targetIds = new Set(nodes.map((node) => node.id));
	set({
		running: true,
		error: null,
		exportModalOpen: false,
		exportQueue: [],
		mapView: null,
		nodes: get().nodes.map((node) =>
			targetIds.has(node.id)
				? {
						...node,
						data: {
							...node.data,
							status: "idle",
							durationMs: undefined,
							error: null,
						},
					}
				: node,
		),
	});

	const payload = graphPayload(nodes, edges, {
		name: workflowName,
		workflow_id: workflowId,
	});

	await new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			resolve();
		};

		try {
			const socket = new WebSocket(wsExecuteUrl());
			socket.onopen = () => socket.send(JSON.stringify(payload));
			socket.onmessage = (event) => {
				const message = JSON.parse(event.data) as {
					type: string;
					payload: Record<string, unknown>;
				};
				if (message.type === "node_running") {
					const nodeId = String(message.payload.node_id || "");
					set({ nodes: applyStatus(get().nodes, nodeId, "RUNNING") });
				}
				if (message.type === "snapshot") {
					const snapshot = message.payload as unknown as NodeSnapshot;
					const failed =
						snapshot.status === "FAILED" || snapshot.status === "error";
					const applySnapshot = (resolved: NodeSnapshot) => {
						set({
							snapshots: {
								...get().snapshots,
								[resolved.node_id]: resolved,
							},
							nodes: applyStatus(
								get().nodes,
								resolved.node_id,
								failed ? "FAILED" : "COMPLETED",
								{
									durationMs: resolved.duration_ms,
									error: resolved.error || null,
								},
							),
						});
					};
					applySnapshot(snapshot);
					void enrichSnapshotIfNeeded(get().nodes, snapshot).then(
						(enriched) => {
							if (enriched.preview !== snapshot.preview) {
								applySnapshot(enriched);
							}
						},
					);
				}
				if (message.type === "completed" || message.type === "failed") {
					const result = message.payload as unknown as ExecutionResult;
					const snapshots: Record<string, NodeSnapshot> = {
						...get().snapshots,
					};
					for (const snapshot of result.snapshots || []) {
						snapshots[snapshot.node_id] = snapshot;
					}
					for (const snapshot of result.snapshots || []) {
						void enrichSnapshotIfNeeded(get().nodes, snapshot).then(
							(enriched) => {
								if (enriched.preview === snapshot.preview) return;
								set({
									snapshots: {
										...get().snapshots,
										[enriched.node_id]: enriched,
									},
								});
							},
						);
					}
					const failedRun =
						result.status === "FAILED" || result.status === "error";
					const exportQueue = failedRun
						? []
						: buildWorkflowExports(get().nodes, snapshots);
					set({
						lastExecution: result,
						snapshots,
						running: false,
						exportQueue,
						exportModalOpen: exportQueue.length > 0,
						error: failedRun ? result.error || "Échec d'exécution" : null,
						nodes: get().nodes.map((node) => {
							const snap = snapshots[node.id];
							if (!snap) return node;
							const failed =
								snap.status === "FAILED" || snap.status === "error";
							return {
								...node,
								data: {
									...node.data,
									status: failed ? "FAILED" : "COMPLETED",
									durationMs: snap.duration_ms,
									error: snap.error || null,
								},
							};
						}),
					});
					finish();
				}
				if (message.type === "error") {
					set({
						running: false,
						error: String(message.payload.error || "Erreur WebSocket"),
					});
					finish();
				}
			};
			socket.onerror = () => {
				set({ running: false, error: "Connexion WebSocket impossible." });
				finish();
			};
			socket.onclose = () => {
				if (get().running) {
					set({ running: false });
				}
				finish();
			};
		} catch (err) {
			set({
				running: false,
				error: err instanceof Error ? err.message : "Échec d'exécution",
			});
			finish();
		}
	});
}
