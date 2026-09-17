import { API_BASE } from "./api";
import {
	getNodeExportHandle,
	setNodeExportHandle,
	takeNodeExportHandle,
} from "./exportHandles";

export type WorkspaceExportMeta = {
	workspacePath: string;
	driver?: string;
	suggestedName?: string;
};

export type PendingWorkflowExport = {
	nodeId: string;
	label: string;
	meta: WorkspaceExportMeta;
};

function apiBase(): string {
	return API_BASE || "";
}

export function driverFromWriterNode(
	params: Record<string, unknown> | undefined,
	requestedNodeType?: string,
): string | undefined {
	if (params?.driver) return String(params.driver);
	const req = (requestedNodeType || "").toLowerCase();
	if (req.includes("shapefile") || req === "vector_writer") {
		return "ESRI Shapefile";
	}
	if (req.includes("gpkg")) return "GPKG";
	if (req.includes("geojson")) return "GeoJSON";
	if (req.includes("csv")) return "CSV";
	return undefined;
}

export function isFileWriterNode(nodeType: string, requested?: string): boolean {
	const key = (requested || nodeType || "").toLowerCase();
	if (key === "file_writer") return true;
	return key.endsWith("_writer") && !key.includes("postgis") && key !== "log_writer";
}

export function defaultExtensionForDriver(driver?: string): string {
	const d = (driver || "").toUpperCase();
	if (d.includes("SHAPE")) return ".zip";
	if (d === "GPKG") return ".gpkg";
	if (d === "CSV") return ".csv";
	return ".geojson";
}

export function basenameFromWorkspacePath(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const name = normalized.split("/").pop() || "export";
	if (name.toLowerCase().endsWith(".shp")) {
		return `${name.slice(0, -4)}.zip`;
	}
	return name;
}

export function workspaceDownloadUrl(workspacePath: string): string {
	const base = apiBase().replace(/\/$/, "");
	return `${base}/api/v1/workspace/download?path=${encodeURIComponent(workspacePath)}`;
}

async function fetchWorkspaceBlob(
	meta: WorkspaceExportMeta,
): Promise<{ blob: Blob; filename: string }> {
	const response = await fetch(workspaceDownloadUrl(meta.workspacePath));
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(detail || "Téléchargement impossible.");
	}
	const blob = await response.blob();
	const disposition = response.headers.get("Content-Disposition") || "";
	const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
	const headerName = decodeURIComponent(match?.[1] || match?.[2] || "");
	const filename =
		meta.suggestedName || headerName || basenameFromWorkspacePath(meta.workspacePath);
	return { blob, filename };
}

async function saveWithPicker(
	blob: Blob,
	suggestedName: string,
	driver?: string,
	existingHandle?: FileSystemFileHandle,
): Promise<void> {
	const ext = defaultExtensionForDriver(driver);
	const types =
		ext === ".zip"
			? [
					{
						description: "Archive Shapefile",
						accept: { "application/zip": [".zip"] },
					},
				]
			: [
					{
						description: "Fichier exporté",
						accept: { "application/octet-stream": [ext] },
					},
				];

	let handle = existingHandle;
	if (!handle && typeof window.showSaveFilePicker === "function") {
		handle = await window.showSaveFilePicker({
			suggestedName,
			types,
		});
	}
	if (handle) {
		const writable = await handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return;
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = suggestedName;
	anchor.rel = "noopener";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export async function pickExportDestination(
	nodeId: string,
	options: {
		driver?: string;
		currentPath?: string;
	},
): Promise<string> {
	const driver = options.driver;
	const ext = defaultExtensionForDriver(driver);
	const current = options.currentPath || "";
	const currentBase = current.split("/").pop() || `output${ext}`;
	const suggested = currentBase.toLowerCase().endsWith(".shp")
		? `${currentBase.slice(0, -4)}.zip`
		: currentBase.toLowerCase().endsWith(ext)
			? currentBase
			: currentBase.includes(".")
				? currentBase
				: `${currentBase}${ext}`;

	if (typeof window.showSaveFilePicker === "function") {
		const handle = await window.showSaveFilePicker({
			suggestedName: suggested,
			types: [
				{
					description: "Export 4GIx",
					accept: {
						"application/octet-stream": [ext],
						...(ext === ".zip" ? { "application/zip": [".zip"] } : {}),
					},
				},
			],
		});
		setNodeExportHandle(nodeId, handle);
		const picked = handle.name;
		const workspaceName =
			driver?.toUpperCase().includes("SHAPE") && picked.toLowerCase().endsWith(".zip")
				? `${picked.slice(0, -4)}.shp`
				: picked;
		return `/workspace/exports/${workspaceName}`;
	}

	const fallback = window.prompt(
		"Nom du fichier à produire (dans exports/) :",
		suggested,
	);
	if (!fallback?.trim()) {
		throw new Error("Export annulé.");
	}
	const name = fallback.trim();
	const workspaceName =
		driver?.toUpperCase().includes("SHAPE") && name.toLowerCase().endsWith(".zip")
			? `${name.slice(0, -4)}.shp`
			: name;
	return `/workspace/exports/${workspaceName}`;
}

export async function downloadWorkspaceExport(
	nodeId: string,
	meta: WorkspaceExportMeta,
): Promise<void> {
	const { blob, filename } = await fetchWorkspaceBlob(meta);
	const handle = getNodeExportHandle(nodeId) || takeNodeExportHandle(nodeId);
	await saveWithPicker(blob, filename, meta.driver, handle);
}

function slugifyLabel(label: string): string {
	const slug = label
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\w.-]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48);
	return slug || "export";
}

export function buildWorkflowExports(
	nodes: Array<{
		id: string;
		data: {
			label: string;
			nodeType: string;
			requestedNodeType?: string;
			params: Record<string, unknown>;
		};
	}>,
	snapshots: Record<
		string,
		{
			status: string;
			metadata?: Record<string, unknown>;
		}
	>,
): PendingWorkflowExport[] {
	const items: PendingWorkflowExport[] = [];
	for (const node of nodes) {
		const snap = snapshots[node.id];
		if (!snap) continue;
		if (snap.status === "FAILED" || snap.status === "error") continue;
		if (!isFileWriterNode(node.data.nodeType, node.data.requestedNodeType)) {
			continue;
		}
		const driver =
			node.data.params.driver ||
			driverFromWriterNode(node.data.params, node.data.requestedNodeType);
		const meta = exportMetaFromSnapshot(snap.metadata, {
			...node.data.params,
			driver,
		});
		if (!meta) continue;
		const ext = defaultExtensionForDriver(
			meta.driver || (driver as string | undefined),
		);
		const base = slugifyLabel(node.data.label || node.id);
		meta.suggestedName =
			meta.suggestedName && meta.suggestedName !== "output.zip"
				? meta.suggestedName
				: `${base}${ext}`;
		items.push({
			nodeId: node.id,
			label: node.data.label || "Export",
			meta,
		});
	}
	return items;
}

export function exportMetaFromSnapshot(
	metadata: Record<string, unknown> | undefined,
	params?: Record<string, unknown>,
): WorkspaceExportMeta | null {
	const workspacePath =
		(metadata?.workspace_path as string) || (metadata?.path as string) || "";
	if (!workspacePath.startsWith("/workspace/")) {
		const normalized = workspacePath.replace(/\\/g, "/");
		const idx = normalized.toLowerCase().indexOf("/workspace/");
		if (idx >= 0) {
			return {
				workspacePath: normalized.slice(idx),
				driver: (metadata?.driver as string) || (params?.driver as string),
				suggestedName: basenameFromWorkspacePath(normalized.slice(idx)),
			};
		}
		return null;
	}
	return {
		workspacePath,
		driver: (metadata?.driver as string) || (params?.driver as string),
		suggestedName: basenameFromWorkspacePath(workspacePath),
	};
}
