export type GeoJsonFeature = {
	type: string;
	geometry?: { type: string; coordinates: unknown } | null;
	properties?: Record<string, unknown>;
};

export type GeoJsonFeatureCollection = {
	type: "FeatureCollection";
	features: GeoJsonFeature[];
	crs?: unknown;
	truncated?: boolean;
	total?: number;
};

export function isFeatureCollection(
	value: unknown,
): value is GeoJsonFeatureCollection {
	return Boolean(
		value &&
			typeof value === "object" &&
			(value as { type?: string }).type === "FeatureCollection" &&
			Array.isArray((value as { features?: unknown }).features),
	);
}

export function asFeatureCollection(
	value: unknown,
): GeoJsonFeatureCollection | null {
	if (!value) return null;
	if (isFeatureCollection(value)) return value;
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (record.type === "RasterDataset" || record.kind === "raster") {
			return null;
		}
		if (record.type === "Feature" && record.geometry) {
			return { type: "FeatureCollection", features: [value as GeoJsonFeature] };
		}
		if (record.data) return asFeatureCollection(record.data);
		if (record.map_geojson) return asFeatureCollection(record.map_geojson);
		if (record.geojson) return asFeatureCollection(record.geojson);
		if (
			record.preview &&
			(record.preview as { type?: string }).type === "FeatureCollection"
		) {
			return asFeatureCollection(record.preview);
		}
		if (record.ports && typeof record.ports === "object") {
			const ports = record.ports as Record<string, unknown>;
			return (
				asFeatureCollection(ports.output) ||
				asFeatureCollection(Object.values(ports)[0])
			);
		}
		const nested: GeoJsonFeature[] = [];
		for (const [key, item] of Object.entries(record)) {
			if (
				[
					"preview_png_base64",
					"path",
					"crs",
					"stats",
					"ports",
					"metadata",
				].includes(key)
			)
				continue;
			const fc = asFeatureCollection(item);
			if (fc) nested.push(...fc.features);
		}
		if (nested.length) {
			return { type: "FeatureCollection", features: nested };
		}
	}
	return null;
}

export function tableRowsFromData(value: unknown): {
	columns: string[];
	rows: Record<string, unknown>[];
	total: number;
} {
	const fc = asFeatureCollection(value);
	if (fc) {
		const columns: string[] = [];
		const rows = fc.features.map((feature) => {
			const props = { ...(feature.properties || {}) };
			if (feature.geometry?.type) props._geom = feature.geometry.type;
			for (const key of Object.keys(props)) {
				if (!columns.includes(key)) columns.push(key);
			}
			return props;
		});
		const total =
			typeof fc.total === "number" ? fc.total : fc.features.length;
		return { columns, rows, total };
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const fromGeo = asFeatureCollection(record);
		if (fromGeo?.features.length) {
			return tableRowsFromData(fromGeo);
		}
		if (Array.isArray(record.records)) {
			const rows = record.records as Record<string, unknown>[];
			const columns: string[] = [];
			for (const row of rows) {
				for (const key of Object.keys(row || {})) {
					if (!columns.includes(key)) columns.push(key);
				}
			}
			const total =
				typeof record.total === "number" ? record.total : rows.length;
			return { columns, rows, total };
		}
	}
	return { columns: [], rows: [], total: 0 };
}

export type RasterPreview = {
	src: string;
	path?: string;
	crs?: string;
	width?: number;
	height?: number;
	stats?: Record<string, unknown>;
};

export function asRasterPreview(value: unknown): RasterPreview | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const payload =
		record.data && typeof record.data === "object"
			? (record.data as Record<string, unknown>)
			: record;
	const src =
		(typeof payload.preview_png_base64 === "string" &&
			payload.preview_png_base64) ||
		(typeof record.preview_png_base64 === "string" &&
			record.preview_png_base64) ||
		"";
	const isRaster =
		payload.type === "RasterDataset" ||
		payload.kind === "raster" ||
		record.kind === "raster" ||
		Boolean(src);
	if (!isRaster || !src) return null;
	return {
		src,
		path: typeof payload.path === "string" ? payload.path : undefined,
		crs: typeof payload.crs === "string" ? payload.crs : undefined,
		width: typeof payload.width === "number" ? payload.width : undefined,
		height: typeof payload.height === "number" ? payload.height : undefined,
		stats:
			payload.stats && typeof payload.stats === "object"
				? (payload.stats as Record<string, unknown>)
				: undefined,
	};
}

export function listPorts(value: unknown): string[] {
	if (!value || typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	if (record.ports && typeof record.ports === "object") {
		return Object.keys(record.ports as Record<string, unknown>);
	}
	return [];
}

export function pickPort(value: unknown, port?: string | null): unknown {
	if (!value || typeof value !== "object") return value;
	const record = value as Record<string, unknown>;
	const ports = record.ports as Record<string, unknown> | undefined;
	if (!ports || !port) return value;
	if (port in ports) return ports[port];
	const match = Object.keys(ports).find(
		(key) => key.toLowerCase() === port.toLowerCase(),
	);
	return match ? ports[match] : value;
}

export function vertexCount(
	geom?: { type?: string; coordinates?: unknown } | null,
): number {
	if (!geom) return 0;
	const walk = (item: unknown): number => {
		if (!Array.isArray(item) || !item.length) return 0;
		if (typeof item[0] === "number") return 1;
		return item.reduce<number>((sum, child) => sum + walk(child), 0);
	};
	return walk(geom.coordinates);
}

export function bboxOf(
	geom?: { coordinates?: unknown } | null,
): number[] | null {
	if (!geom) return null;
	let minx = Infinity;
	let miny = Infinity;
	let maxx = -Infinity;
	let maxy = -Infinity;
	const walk = (item: unknown) => {
		if (!Array.isArray(item) || !item.length) return;
		if (typeof item[0] === "number" && typeof item[1] === "number") {
			minx = Math.min(minx, item[0] as number);
			miny = Math.min(miny, item[1] as number);
			maxx = Math.max(maxx, item[0] as number);
			maxy = Math.max(maxy, item[1] as number);
			return;
		}
		for (const child of item) walk(child);
	};
	walk(geom.coordinates);
	if (!Number.isFinite(minx)) return null;
	return [minx, miny, maxx, maxy];
}

export function crsFromCollection(fc: GeoJsonFeatureCollection | null): string {
	if (!fc) return "EPSG:4326";
	const crs = fc.crs as { properties?: { name?: string } } | string | undefined;
	if (typeof crs === "string") return crs;
	return crs?.properties?.name || "EPSG:4326";
}

export function mapGeojsonFromInspection(
	value: unknown,
): GeoJsonFeatureCollection | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (record.map_geojson) return asFeatureCollection(record.map_geojson);
	return null;
}

export function bboxFromInspection(value: unknown): number[] | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const raw = record.bbox;
	if (
		Array.isArray(raw) &&
		raw.length === 4 &&
		raw.every((item) => typeof item === "number" && Number.isFinite(item))
	) {
		return raw as number[];
	}
	const meta = record.metadata;
	if (meta && typeof meta === "object") {
		const fromMeta = (meta as Record<string, unknown>).bbox;
		if (
			Array.isArray(fromMeta) &&
			fromMeta.length === 4 &&
			fromMeta.every(
				(item) => typeof item === "number" && Number.isFinite(item),
			)
		) {
			return fromMeta as number[];
		}
	}
	return null;
}

export function inspectFeature(
	feature: GeoJsonFeature | undefined,
	crsHint?: string,
) {
	const geom = feature?.geometry || null;
	const props = feature?.properties || {};
	return {
		geomType: geom?.type || "Null",
		bbox: bboxOf(geom),
		vertices: vertexCount(geom),
		epsg: String(props.gix_crs || props.fme_crs || crsHint || "EPSG:4326"),
		properties: props,
	};
}
