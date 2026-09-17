import { API_BASE } from "./api";

const SPATIAL_READERS = new Set(["shapefile_reader", "gpkg_reader", "geojson_reader"]);

export function isSparseSpatialPreview(preview: unknown): boolean {
	if (!preview || typeof preview !== "object") return false;
	const record = preview as Record<string, unknown>;
	const rowCount =
		typeof record.row_count === "number"
			? record.row_count
			: typeof record.total === "number"
				? record.total
				: 0;
	if (rowCount <= 0) return false;
	if (record.map_geojson || record.geojson) return false;
	if (Array.isArray(record.records) && record.records.length > 0) return false;
	return true;
}

export async function fetchSpatialPreview(
	nodeType: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	const path = params.path || params.filepath;
	if (!path) {
		throw new Error("Chemin source manquant pour l'aperçu spatial.");
	}
	const response = await fetch(`${API_BASE}/api/v1/datasets/spatial-preview`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			node_type: nodeType,
			path,
			zip_path: params.zip_path,
			layer_name: params.layer_name,
			layer: params.layer,
			encoding: params.encoding,
		}),
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(detail || `Aperçu spatial HTTP ${response.status}`);
	}
	return response.json();
}

export function shouldEnrichSpatialPreview(
	nodeType: string,
	preview: unknown,
): boolean {
	return SPATIAL_READERS.has(nodeType) && isSparseSpatialPreview(preview);
}
