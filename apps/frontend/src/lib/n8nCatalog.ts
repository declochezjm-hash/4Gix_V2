import type { CatalogNode } from "./api";

export type N8nGroupId = "ai" | "data" | "gis" | "bim" | "raster" | "io";

const CONNECTOR_PREFIX = "connector_";

function isConnectorNode(nodeType: string | undefined | null): boolean {
	if (nodeType === "human_approval") return true;
	return Boolean(typeof nodeType === "string" && nodeType.startsWith(CONNECTOR_PREFIX));
}

export type N8nGroup = {
	id: N8nGroupId;
	title: string;
	shortTitle: string;
	description: string;
	color: string;
};

export const N8N_GROUPS: N8nGroup[] = [
	{
		id: "ai",
		title: "Advanced AI / ML",
		shortTitle: "Advanced AI",
		description: "Agents, résumés de documents et recherche sémantique.",
		color: "#8B5CF6",
	},
	{
		id: "data",
		title: "Data Transformation",
		shortTitle: "Data transformation",
		description: "Modifier, filtrer, fusionner et transformer les attributs.",
		color: "#7C3AED",
	},
	{
		id: "gis",
		title: "GIS & Spatial Analysis",
		shortTitle: "GIS & spatial",
		description: "Buffers, jointures spatiales, géométrie et projections.",
		color: "#3B82F6",
	},
	{
		id: "bim",
		title: "BIM & 3D",
		shortTitle: "BIM & 3D",
		description: "IFC, DXF et modèles 3D pour l’analyse métier.",
		color: "#F59E0B",
	},
	{
		id: "raster",
		title: "Raster & MNT",
		shortTitle: "Raster & elevation",
		description: "GeoTIFF, statistiques zonales et raster.",
		color: "#14B8A6",
	},
	{
		id: "io",
		title: "Readers & Data Stores",
		shortTitle: "Readers & data stores",
		description: "Excel, CSV, GeoPackage, GeoJSON, KML, DXF, Shapefile, PostGIS.",
		color: "#22C55E",
	},
];

const TYPE_GROUP: Record<string, N8nGroupId> = {
	attribute_manager: "data",
	attribute_mapper: "data",
	attribute_filter: "data",
	tester: "data",
	test_filter: "data",
	list_exploder: "data",
	counter: "data",
	duplicate_filter: "data",
	python_caller: "data",
	code_node: "data",
	composer_agent: "ai",
	direct_agent_processor: "ai",
	auto_architect_agent: "ai",
	geometry_validator: "gis",
	geometry_filter: "gis",
	snapper: "gis",
	orientor: "gis",
	bufferer: "gis",
	buffer: "gis",
	clipper: "gis",
	dissolver: "gis",
	area_on_area_overlayer: "gis",
	line_on_line_overlayer: "gis",
	centroid_extractor: "gis",
	bounding_box_replacer: "gis",
	densifier: "gis",
	generalizer: "gis",
	feature_merger: "gis",
	spatial_relator: "gis",
	neighbor_finder: "gis",
	spatial_join: "gis",
	reprojector: "gis",
	reproject: "gis",
	ifc_bim_reader: "bim",
	geotiff_raster_reader: "raster",
	raster_clipper: "raster",
	zonal_statistics: "raster",
	postgis_reader: "io",
	postgis_writer: "io",
	excel_reader: "io",
	csv_reader: "io",
	gpkg_reader: "io",
	kml_reader: "io",
	geojson_reader: "io",
	file_reader: "io",
	shapefile_reader: "io",
	dxf_reader: "io",
	file_writer: "io",
	log_writer: "io",
	rest_wfs_reader: "io",
};

export function groupIdOf(
	entry: Pick<CatalogNode, "node_type" | "category"> | null | undefined,
): N8nGroupId {
	if (!entry) return "data";
	const nodeType =
		entry.node_type != null && String(entry.node_type).trim()
			? String(entry.node_type).trim()
			: "";
	if (nodeType && TYPE_GROUP[nodeType]) return TYPE_GROUP[nodeType];
	if (isConnectorNode(nodeType || undefined)) return "io";
	if (entry.category === "Reader" || entry.category === "Writer") return "io";
	return "data";
}

export function groupMeta(id: N8nGroupId): N8nGroup {
	return N8N_GROUPS.find((group) => group.id === id) || N8N_GROUPS[1];
}

export function nodeChrome(entry: {
	nodeType?: string;
	node_type?: string;
	category: string;
}): N8nGroup {
	const nodeType =
		entry.nodeType != null && String(entry.nodeType).trim()
			? String(entry.nodeType).trim()
			: entry.node_type != null && String(entry.node_type).trim()
				? String(entry.node_type).trim()
				: "unknown_node";
	const group = groupMeta(
		groupIdOf({
			node_type: nodeType,
			category: (entry.category || "Transformer") as CatalogNode["category"],
		}),
	);
	return group;
}

const CATALOG_PRIORITY = ["python_caller"];

function sortCatalogNodes(nodes: CatalogNode[]): CatalogNode[] {
	return [...nodes].sort((left, right) => {
		const li = CATALOG_PRIORITY.indexOf(left.node_type);
		const ri = CATALOG_PRIORITY.indexOf(right.node_type);
		const lRank = li === -1 ? 999 : li;
		const rRank = ri === -1 ? 999 : ri;
		if (lRank !== rRank) return lRank - rRank;
		return left.label.localeCompare(right.label, "fr");
	});
}

export function groupCatalog(nodes: CatalogNode[]): {
	group: N8nGroup;
	nodes: CatalogNode[];
}[] {
	return N8N_GROUPS.map((group) => ({
		group,
		nodes: sortCatalogNodes(nodes.filter((node) => groupIdOf(node) === group.id)),
	}));
}

export function featuredCatalogNodes(nodes: CatalogNode[]): CatalogNode[] {
	return sortCatalogNodes(
		nodes.filter((node) => CATALOG_PRIORITY.includes(node.node_type)),
	);
}

const SUBGROUP_ORDER = [
	"Core",
	"Popular",
	"Data Transformation",
	"Attribute Operations",
	"Geometry & Quality",
	"Spatial Analysis",
	"Combiners",
];

export function catalogSubgroups(
	nodes: CatalogNode[],
): { id: string; title: string; nodes: CatalogNode[] }[] {
	const buckets = new Map<string, CatalogNode[]>();
	for (const node of nodes) {
		const legacyGroup =
			node.palette_group?.trim() ||
			(node as CatalogNode & { fme_group?: string }).fme_group?.trim() ||
			"";
		const title =
			node.node_type === "python_caller" || node.node_type === "code_node"
				? "Popular"
				: legacyGroup || "Other";
		const list = buckets.get(title) || [];
		list.push(node);
		buckets.set(title, list);
	}
	return Array.from(buckets.entries())
		.sort(([left], [right]) => {
			const li = SUBGROUP_ORDER.indexOf(left);
			const ri = SUBGROUP_ORDER.indexOf(right);
			const lRank = li === -1 ? 999 : li;
			const rRank = ri === -1 ? 999 : ri;
			if (lRank !== rRank) return lRank - rRank;
			return left.localeCompare(right, "fr");
		})
		.map(([title, items]) => ({
			id: title,
			title,
			nodes: sortCatalogNodes(items),
		}));
}
