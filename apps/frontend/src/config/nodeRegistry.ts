import type { CatalogNode } from "../lib/api";

export type NodeRegistryEntry = {
	displayName: string;
	paletteDescription: string;
	/** Alias historiques — utilisés uniquement pour la recherche */
	searchTags: string[];
};

/** Libellés palette style n8n — les `node_type` backend restent inchangés. */
export const NODE_PRESENTATION: Record<string, NodeRegistryEntry> = {
	attribute_manager: {
		displayName: "Edit Fields",
		paletteDescription: "Add, rename, remove or modify attributes",
		searchTags: ["AttributeManager", "Attribute Manager"],
	},
	counter: {
		displayName: "Increment Counter",
		paletteDescription: "Add sequence number or ID",
		searchTags: ["Counter"],
	},
	duplicate_filter: {
		displayName: "Remove Duplicates",
		paletteDescription: "Filter out identical records",
		searchTags: ["DuplicateFilter", "Duplicate Filter"],
	},
	attribute_filter: {
		displayName: "Filter by Attribute",
		paletteDescription: "Split stream by attribute values",
		searchTags: [
			"AttributeFilter",
			"Filtre attributaire",
			"Filtre",
			"attribute filter",
		],
	},
	list_exploder: {
		displayName: "Split List Array",
		paletteDescription: "Flatten list attributes into features",
		searchTags: ["ListExploder", "List Exploder"],
	},
	attribute_mapper: {
		displayName: "Map Values",
		paletteDescription: "Replace attribute values with lookup",
		searchTags: ["AttributeMapper", "Mapping attributaire", "Attribute Mapper"],
	},
	tester: {
		displayName: "If / Filter Condition",
		paletteDescription: "Validate conditions on feature fields",
		searchTags: ["Tester", "Test"],
	},
	test_filter: {
		displayName: "Switch / Multi-Condition",
		paletteDescription: "Route features based on rules",
		searchTags: ["TestFilter", "Test Filter"],
	},
	area_on_area_overlayer: {
		displayName: "Overlay Polygons",
		paletteDescription: "Intersect and combine overlapping areas",
		searchTags: ["AreaOnAreaOverlayer", "Area On Area Overlayer"],
	},
	bounding_box_replacer: {
		displayName: "Extract Bounding Box",
		paletteDescription: "Replace geometry with envelope bounds",
		searchTags: ["BoundingBoxReplacer", "Bounding Box Replacer"],
	},
	buffer: {
		displayName: "Create Buffer",
		paletteDescription: "Generate spatial proximity zones",
		searchTags: ["Buffer", "Bufferer"],
	},
	bufferer: {
		displayName: "Create Buffer",
		paletteDescription: "Generate spatial proximity zones",
		searchTags: ["Bufferer", "Buffer"],
	},
	dissolver: {
		displayName: "Merge Geometries",
		paletteDescription: "Dissolve boundaries based on attributes",
		searchTags: ["Dissolver"],
	},
	geometry_validator: {
		displayName: "Validate Geometry",
		paletteDescription: "Detect and repair invalid shapes",
		searchTags: ["GeometryValidator", "Geometry Validator"],
	},
	spatial_relator: {
		displayName: "Spatial Join / Intersect",
		paletteDescription: "Match features by location",
		searchTags: ["SpatialRelator", "SpatialFilter", "Spatial Relator"],
	},
	spatial_join: {
		displayName: "Spatial Join / Intersect",
		paletteDescription: "Match features by location",
		searchTags: ["Spatial Join", "SpatialJoin"],
	},
	reprojector: {
		displayName: "Transform Coordinate System",
		paletteDescription: "Reproject spatial reference CRS",
		searchTags: ["Reprojector", "Reproject", "CRS"],
	},
	reproject: {
		displayName: "Transform Coordinate System",
		paletteDescription: "Reproject spatial reference CRS",
		searchTags: ["Reproject", "Reprojection", "Reprojector"],
	},
	python_caller: {
		displayName: "Code",
		paletteDescription: "Run Python or SQL on features (Monaco editor)",
		searchTags: [
			"Python",
			"Code",
			"Python / Code Transformer",
			"python_caller",
			"GeoPandas",
			"Monaco",
		],
	},
	composer_agent: {
		displayName: "Composer Agent",
		paletteDescription:
			"Agent IA : propose des nœuds et remplace ce bloc à l'acceptation",
		searchTags: ["Composer", "Agent", "AI", "LLM", "Composer Agent"],
	},
	direct_agent_processor: {
		displayName: "AI Direct Processor",
		paletteDescription:
			"Traitement spatial direct via code Python généré (sans sous-graphe)",
		searchTags: [
			"Direct",
			"Processor",
			"AI",
			"LLM",
			"GeoPandas",
			"Cursor",
			"Intelligence Artificielle",
		],
	},
	auto_architect_agent: {
		displayName: "Auto-Architect Agent",
		paletteDescription:
			"Agent autonome multi-étapes : planifie et génère le pipeline nœud par nœud",
		searchTags: [
			"Auto",
			"Architect",
			"Agent",
			"AGENTS",
			"Advanced AI",
			"Step",
			"Multi-étapes",
			"step-architect",
		],
	},
	clipper: {
		displayName: "Clip Features",
		paletteDescription: "Split features inside and outside a clip mask",
		searchTags: ["Clipper", "Clip"],
	},
	centroid_extractor: {
		displayName: "Extract Centroid",
		paletteDescription: "Replace geometries with their center points",
		searchTags: ["CentroidExtractor", "Centroid"],
	},
	line_on_line_overlayer: {
		displayName: "Split Lines at Intersections",
		paletteDescription: "Break line networks where they cross",
		searchTags: ["LineOnLineOverlayer"],
	},
	densifier: {
		displayName: "Densify Geometry",
		paletteDescription: "Add vertices along lines at a fixed spacing",
		searchTags: ["Densifier"],
	},
	generalizer: {
		displayName: "Simplify Geometry",
		paletteDescription: "Reduce vertices while preserving shape",
		searchTags: ["Generalizer", "Douglas-Peucker"],
	},
	geometry_filter: {
		displayName: "Filter by Geometry Type",
		paletteDescription: "Route features by point, line, or polygon",
		searchTags: ["GeometryFilter", "Geometry Filter"],
	},
	snapper: {
		displayName: "Snap Vertices",
		paletteDescription: "Align vertices to a tolerance grid",
		searchTags: ["Snapper"],
	},
	orientor: {
		displayName: "Orient Polygons",
		paletteDescription: "Normalize ring orientation (clockwise / CCW)",
		searchTags: ["Orientor"],
	},
	feature_merger: {
		displayName: "Merge Features",
		paletteDescription: "Join request and supplier streams by key",
		searchTags: ["FeatureMerger", "Feature Merger"],
	},
	neighbor_finder: {
		displayName: "Find Neighbors",
		paletteDescription: "Locate nearest features between two layers",
		searchTags: ["NeighborFinder"],
	},
	excel_reader: {
		displayName: "Excel Reader",
		paletteDescription: "Import sheet data from .xlsx / .xls",
		searchTags: ["Excel", "XLSX", "spreadsheet"],
	},
	csv_reader: {
		displayName: "CSV Reader",
		paletteDescription: "Parse tabular text files with custom delimiters",
		searchTags: ["CSV", "delimiter", "tabular"],
	},
	gpkg_reader: {
		displayName: "GeoPackage Reader",
		paletteDescription: "Read vector/raster layers from OGC .gpkg",
		searchTags: ["GPKG", "GeoPackage", "OGC"],
	},
	geojson_reader: {
		displayName: "GeoJSON Reader",
		paletteDescription: "Import GeoJSON spatial features",
		searchTags: ["GeoJSON", "JSON"],
	},
	kml_reader: {
		displayName: "KML / KMZ Reader",
		paletteDescription: "Read Google Earth vector data",
		searchTags: ["KML", "KMZ", "Google Earth"],
	},
	dxf_reader: {
		displayName: "CAD / DXF Reader",
		paletteDescription: "Import AutoCAD geometry features",
		searchTags: ["DXF", "CAD", "AutoCAD"],
	},
	shapefile_reader: {
		displayName: "Shapefile Reader",
		paletteDescription: "Import ESRI Shapefile or .zip archive",
		searchTags: ["Shapefile", "Shapefile Reader", "SHP"],
	},
	postgis_reader: {
		displayName: "Read PostGIS",
		paletteDescription: "Query spatial tables from PostgreSQL",
		searchTags: ["PostGIS"],
	},
};

function humanizeLabel(label: string): string {
	if (!label.includes("_") && /[a-z][A-Z]/.test(label)) {
		return label.replace(/([a-z])([A-Z])/g, "$1 $2");
	}
	return label
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function paletteSubtitle(entry: CatalogNode, override?: string): string {
	if (override?.trim()) return override;
	const pres = nodePresentation(entry);
	if (pres.paletteDescription.trim()) return pres.paletteDescription;
	if (entry.description?.trim() && entry.description !== entry.node_type) {
		return entry.description;
	}
	return "";
}

export function nodePresentation(
	entry: Pick<CatalogNode, "node_type" | "label" | "description">,
): NodeRegistryEntry & { searchBlob: string } {
	const mapped = NODE_PRESENTATION[entry.node_type];
	if (mapped) {
		const searchBlob = [
			mapped.displayName,
			mapped.paletteDescription,
			entry.node_type,
			entry.label,
			entry.description,
			...mapped.searchTags,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		return { ...mapped, searchBlob };
	}
	const searchBlob = [entry.label, entry.node_type, entry.description || ""]
		.join(" ")
		.toLowerCase();
	return {
		displayName: humanizeLabel(entry.label),
		paletteDescription:
			entry.description?.trim() && entry.description !== entry.node_type
				? entry.description
				: "",
		searchTags: [entry.label, entry.node_type],
		searchBlob,
	};
}

export function matchesNodeSearch(entry: CatalogNode, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return nodePresentation(entry).searchBlob.includes(needle);
}

export function applyNodePresentation(entry: CatalogNode): CatalogNode {
	const pres = NODE_PRESENTATION[entry.node_type];
	if (!pres) return entry;
	return {
		...entry,
		label: pres.displayName,
		description: pres.paletteDescription,
	};
}

export function enrichCatalog(nodes: CatalogNode[]): CatalogNode[] {
	return nodes.map(applyNodePresentation);
}
