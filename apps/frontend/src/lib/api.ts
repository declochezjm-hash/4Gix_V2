export type NodeCategory = "Reader" | "Transformer" | "Writer";

export type SchemaProperty = {
	type?: string;
	title?: string;
	description?: string;
	default?: unknown;
	enum?: string[];
	enumNames?: string[];
	format?: "epsg" | "slider" | "sql" | "mapping" | "textarea" | "code" | string;
	minimum?: number;
	maximum?: number;
	multipleOf?: number;
};

export type NodeSchema = {
	title?: string;
	description?: string;
	type?: string;
	properties?: Record<string, SchemaProperty>;
	required?: string[];
};

export type CatalogNode = {
	node_type: string;
	category: NodeCategory;
	is_spatial: boolean;
	label: string;
	description: string;
	schema: NodeSchema;
	input_handles?: string[];
	output_handles?: string[];
	palette_group?: string;
};

export type NodeSnapshot = {
	node_id: string;
	node_type: string;
	status: "success" | "error" | "COMPLETED" | "FAILED" | "RUNNING" | string;
	duration_ms: number;
	metadata: Record<string, unknown>;
	preview: unknown;
	input_snapshot?: unknown;
	output_snapshot?: unknown;
	error?: string | null;
};

export type ExecutionResult = {
	execution_id: string;
	workflow_id?: string | null;
	status: string;
	snapshots: NodeSnapshot[];
	error?: string | null;
	duration_ms: number;
	node_count: number;
	logs?: string;
};

export type WorkflowRecord = {
	id: string;
	name: string;
	definition: {
		nodes?: unknown[];
		edges?: unknown[];
	};
	created_at?: string;
	updated_at?: string;
};

export type MapViewState = {
	longitude: number;
	latitude: number;
	zoom: number;
};

export type FlowNodeData = {
	label: string;
	nodeType: string;
	requestedNodeType?: string;
	category: NodeCategory;
	isSpatial: boolean;
	params: Record<string, unknown>;
	schema?: NodeSchema;
	status?:
		| "idle"
		| "running"
		| "success"
		| "error"
		| "COMPLETED"
		| "FAILED"
		| "RUNNING";
	durationMs?: number;
	error?: string | null;
	inputHandles?: string[];
	outputHandles?: string[];
	paletteGroup?: string;
	notes?: string;
	disabled?: boolean;
	isGhost?: boolean;
	outputSnapshot?: unknown;
	inputSnapshot?: unknown;
};

function resolveApiBase(): string {
	const configured = import.meta.env.VITE_API_URL?.trim();
	if (configured) return configured.replace(/\/$/, "");
	if (
		typeof window !== "undefined" &&
		(window.location.protocol === "http:" || window.location.protocol === "https:")
	) {
		return "";
	}
	return "http://127.0.0.1:8000";
}

export const API_BASE = resolveApiBase();

const STEP_ARCHITECT_TIMEOUT_MS = 90_000;

function formatFastApiDetail(detail: unknown): string {
	if (typeof detail === "string") return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((item) => {
				if (typeof item === "object" && item !== null && "msg" in item) {
					const loc = (item as { loc?: unknown[] }).loc;
					const prefix = Array.isArray(loc) ? `${loc.join(".")}: ` : "";
					return `${prefix}${String((item as { msg: unknown }).msg)}`;
				}
				return JSON.stringify(item);
			})
			.join(" ; ");
	}
	if (typeof detail === "object" && detail !== null) {
		return JSON.stringify(detail);
	}
	return "Échec de l’auto-architecte.";
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error(
				`Délai dépassé (${Math.round(timeoutMs / 1000)} s) — le serveur ne répond pas.`,
			);
		}
		throw err;
	} finally {
		window.clearTimeout(timer);
	}
}

export function wsExecuteUrl(): string {
	const explicit = import.meta.env.VITE_WS_URL;
	if (explicit) {
		return `${explicit.replace(/\/$/, "")}/api/ws/execute`;
	}
	if (API_BASE) {
		return `${API_BASE.replace(/^http/, "ws").replace(/\/$/, "")}/api/ws/execute`;
	}
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/api/ws/execute`;
}

export async function fetchCatalog(): Promise<{
	count: number;
	nodes: CatalogNode[];
	by_category: Record<string, CatalogNode[]>;
}> {
	const response = await fetch(`${API_BASE}/api/nodes`);
	if (!response.ok) {
		throw new Error("Impossible de charger le catalogue de nœuds.");
	}
	return response.json();
}

export async function executeGraph(payload: {
	nodes: unknown[];
	edges: unknown[];
	name?: string;
	workflow_id?: string | null;
}): Promise<ExecutionResult> {
	const response = await fetch(`${API_BASE}/api/execute`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await response.json();
	if (!response.ok) {
		throw new Error(body.detail || "Échec d'exécution du DAG.");
	}
	return body;
}

export async function fetchWorkflows(): Promise<{
	count: number;
	workflows: WorkflowRecord[];
}> {
	const response = await fetch(`${API_BASE}/api/workflows`);
	if (!response.ok) {
		throw new Error("Impossible de lister les workflows.");
	}
	return response.json();
}

export async function saveWorkflow(payload: {
	id?: string | null;
	name: string;
	definition: unknown;
}): Promise<WorkflowRecord> {
	const response = await fetch(`${API_BASE}/api/workflows`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await response.json();
	if (!response.ok) {
		throw new Error(body.detail || "Impossible d'enregistrer le workflow.");
	}
	return body;
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
	const response = await fetch(`${API_BASE}/api/workflows/${workflowId}`, {
		method: "DELETE",
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(
			typeof body.detail === "string"
				? body.detail
				: "Impossible de supprimer le workflow.",
		);
	}
}

export async function fetchNodeSnapshot(
	executionId: string,
	nodeId: string,
): Promise<{
	execution_id: string;
	node_id: string;
	input_snapshot: unknown;
	output_snapshot: unknown;
	execution_time_ms: number;
}> {
	const response = await fetch(
		`${API_BASE}/api/executions/${executionId}/snapshots/${nodeId}`,
	);
	if (!response.ok) {
		throw new Error("Snapshot introuvable.");
	}
	return response.json();
}

export function healthUrl(): string {
	return `${API_BASE}/health`;
}

export type FmwImportResult = {
	name: string;
	format: string;
	source: string;
	filename?: string;
	warnings: string[];
	definition: {
		nodes: unknown[];
		edges: unknown[];
	};
};

export type DataUploadResult = {
	filename: string;
	filepath: string;
	workspace_path?: string;
	detected_type: "shapefile" | "geojson" | "geotiff";
	suggested_node?: {
		node_type: string;
		label: string;
		params: Record<string, unknown>;
	};
};

export type ShapefileZipImportResult = {
	format: string;
	source: string;
	filename: string;
	label: string;
	geojson: Record<string, unknown>;
	metadata: Record<string, unknown>;
	suggested_node: {
		node_type: string;
		label: string;
		params: Record<string, unknown>;
	};
	validation?: {
		shapefile_sets: number;
		components_detected: string[];
	};
};

export function formatApiErrorDetail(payload: unknown, fallback: string): string {
	if (!payload || typeof payload !== "object") return fallback;
	const detail = (payload as { detail?: unknown }).detail;
	if (typeof detail === "string") return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((item) =>
				typeof item === "object" && item && "msg" in item
					? String((item as { msg: string }).msg)
					: String(item),
			)
			.join(" ");
	}
	return fallback;
}

export type FmeEngineRunResult = {
	status: string;
	exit_code: number;
	log: string;
	name?: string;
	source?: string;
};

export async function executeFmwFile(file: File): Promise<FmeEngineRunResult> {
	const body = new FormData();
	body.append("file", file);
	const response = await fetch(`${API_BASE}/api/v1/workflows/execute-fmw`, {
		method: "POST",
		body,
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(formatApiErrorDetail(payload, "Exécution .fmw impossible."));
	}
	return payload as FmeEngineRunResult;
}

export async function importFmwFile(file: File): Promise<FmwImportResult> {
	const body = new FormData();
	body.append("file", file);
	const response = await fetch(`${API_BASE}/api/v1/workflows/import-fmw`, {
		method: "POST",
		body,
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(formatApiErrorDetail(payload, "Import .fmw impossible."));
	}
	return payload;
}

export function isShapefileZipFilename(name: string): boolean {
	return name.toLowerCase().endsWith(".zip");
}

export function isGeoJsonDataFilename(name: string): boolean {
	return name.toLowerCase().endsWith(".geojson");
}

export function isGeoTiffDataFilename(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower.endsWith(".tif") || lower.endsWith(".tiff") || lower.endsWith(".geotiff")
	);
}

const DATA_IMPORT_SUFFIXES = [
	".xlsx",
	".xls",
	".csv",
	".gpkg",
	".kml",
	".kmz",
	".dxf",
	".geojson",
	".shp",
	".zip",
	".tif",
	".tiff",
	".geotiff",
] as const;

export function isWorkflowJsonFilename(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith(".4gix.json");
}

/** Fichiers acceptés pour POST /api/v1/upload + drop canvas. */
export function isDataImportFilename(name: string): boolean {
	const lower = name.toLowerCase();
	if (DATA_IMPORT_SUFFIXES.some((ext) => lower.endsWith(ext))) return true;
	if (lower.endsWith(".json") && !isWorkflowJsonFilename(name)) return true;
	return false;
}

export async function fileLooksLikeGeoJSON(file: File): Promise<boolean> {
	try {
		const sample = (await file.slice(0, 65536).text()).trim();
		if (!sample) return false;
		const parsed = JSON.parse(sample) as { type?: string };
		const kind = parsed?.type;
		return kind === "FeatureCollection" || kind === "Feature" || kind === "Geometry";
	} catch {
		return false;
	}
}

/** @deprecated Préférer isDataImportFilename */
export function isSpatialDataFilename(name: string): boolean {
	return isDataImportFilename(name);
}

export async function uploadDataFile(file: File): Promise<DataUploadResult> {
	const body = new FormData();
	body.append("file", file);
	const response = await fetch(`${API_BASE}/api/v1/upload`, {
		method: "POST",
		body,
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(
			formatApiErrorDetail(payload, "Téléversement de données impossible."),
		);
	}
	return payload as DataUploadResult;
}

/** Détection légère côté navigateur (signature PK + présence .shp/.dbf/.shx dans les noms). */
export async function zipLooksLikeShapefile(file: File): Promise<boolean> {
	if (!isShapefileZipFilename(file.name)) return false;
	const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
	if (head[0] !== 0x50 || head[1] !== 0x4b) return false;
	try {
		const buffer = await file.arrayBuffer();
		const text = new TextDecoder("latin1").decode(buffer);
		const lower = text.toLowerCase();
		return lower.includes(".shp") && lower.includes(".dbf") && lower.includes(".shx");
	} catch {
		return true;
	}
}

export async function importShapefileZip(
	file: File,
): Promise<ShapefileZipImportResult> {
	const body = new FormData();
	body.append("file", file);
	const response = await fetch(`${API_BASE}/api/v1/datasets/import-shapefile-zip`, {
		method: "POST",
		body,
	});
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(
			formatApiErrorDetail(payload, "Import Shapefile (.zip) impossible."),
		);
	}
	return payload as ShapefileZipImportResult;
}

export function exportFmwUrl(workflowId: string): string {
	return `${API_BASE}/api/v1/workflows/${workflowId}/export-fmw`;
}

export function isFmwFilename(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith(".fmw") || lower.endsWith(".fmwt");
}

export async function downloadExportFmw(
	workflowId: string,
	filename: string,
): Promise<void> {
	const response = await fetch(exportFmwUrl(workflowId));
	if (!response.ok) {
		let detail = "Export .fmw impossible.";
		try {
			const payload = (await response.json()) as { detail?: string };
			if (payload.detail) detail = payload.detail;
		} catch {
			/* ignore */
		}
		throw new Error(detail);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename.toLowerCase().endsWith(".fmw")
		? filename
		: `${filename}.fmw`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export type DirectProcessResult = {
	ok: boolean;
	node_id: string;
	parent_node_id: string;
	snapshot: NodeSnapshot;
	code?: string;
	log?: string;
	feature_count_before?: number;
	feature_count_after?: number;
};

export async function directProcessAgent(payload: {
	node_id: string;
	prompt: string;
	sample_limit?: number;
	current_graph: {
		nodes: unknown[];
		edges: unknown[];
		snapshots: Record<string, NodeSnapshot>;
	};
	execution_id?: string | null;
	api_key?: string;
}): Promise<DirectProcessResult> {
	const response = await fetch(`${API_BASE}/api/v1/agent/direct-process`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await response.json();
	if (!response.ok) {
		const detail =
			typeof body.detail === "string"
				? body.detail
				: body.detail?.error || body.detail?.log || "Échec du traitement direct.";
		throw new Error(detail);
	}
	return body as DirectProcessResult;
}

export type StepArchitectPreviousStep = {
	index: number;
	node_id: string;
	step_summary: string;
	branch_id?: number;
};

export type StepArchitectResult = {
	ok: boolean;
	global_objective: string;
	global_plan: string[];
	current_step_index: number;
	total_steps: number;
	is_complete: boolean;
	step_summary?: string | null;
	next_step_hint?: string | null;
	step_kind?: string;
	proposed_node?: Record<string, unknown> | null;
	proposed_edge?: Record<string, unknown> | null;
	anchor_node_id?: string;
	layout_anchor_node_id?: string;
	attach_to_source?: boolean;
	branch_index?: number;
	branch_id?: number;
	inspect?: Record<string, unknown>;
	proactive_suggestions?: string[];
	geometry_notices?: string[];
};

export type ExecutionHealResult = {
	ok: boolean;
	explanation?: string;
	chat_message?: string;
	suggest_shapefile_zip_upload?: boolean;
	suggest_excel_openpyxl_install?: boolean;
	error?: string;
	failed_node_id?: string;
	corrective_steps?: Array<Record<string, unknown>>;
	proposed_node?: Record<string, unknown> | null;
	proposed_edge?: Record<string, unknown> | null;
	heal_followup_edge?: {
		from_node_id?: string | null;
		to_node_id?: string | null;
	} | null;
};

export async function executionHealAgent(payload: {
	error_message: string;
	failed_node_id: string;
	global_objective?: string;
	source_node_id?: string | null;
	current_graph: {
		nodes: unknown[];
		edges: unknown[];
		snapshots: Record<string, NodeSnapshot>;
	};
}): Promise<ExecutionHealResult> {
	const response = await fetchWithTimeout(
		`${API_BASE}/api/v1/agent/execution-heal`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		},
		STEP_ARCHITECT_TIMEOUT_MS,
	);
	const raw = await response.text();
	let body: Record<string, unknown> = {};
	try {
		body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
	} catch {
		throw new Error(
			raw.trim().slice(0, 240) || `Réponse invalide du serveur (${response.status}).`,
		);
	}
	if (!response.ok) {
		const detail =
			body.detail !== undefined
				? formatFastApiDetail(body.detail)
				: typeof body.error === "string"
					? body.error
					: `Échec HTTP ${response.status} — auto-healing.`;
		throw new Error(detail);
	}
	return body as ExecutionHealResult;
}

export async function stepArchitectAgent(payload: {
	global_objective: string;
	current_step_index: number;
	previous_steps: StepArchitectPreviousStep[];
	current_graph: {
		nodes: unknown[];
		edges: unknown[];
		snapshots: Record<string, NodeSnapshot>;
	};
	source_node_id: string;
	layout_anchor_node_id?: string | null;
}): Promise<StepArchitectResult> {
	const response = await fetchWithTimeout(
		`${API_BASE}/api/v1/agent/step-architect`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		},
		STEP_ARCHITECT_TIMEOUT_MS,
	);
	const raw = await response.text();
	let body: Record<string, unknown> = {};
	try {
		body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
	} catch {
		throw new Error(
			raw.trim().slice(0, 240) || `Réponse invalide du serveur (${response.status}).`,
		);
	}
	if (!response.ok) {
		const detail =
			body.detail !== undefined
				? formatFastApiDetail(body.detail)
				: typeof body.error === "string"
					? body.error
					: `Échec HTTP ${response.status} — auto-architecte.`;
		throw new Error(detail);
	}
	return body as StepArchitectResult;
}
