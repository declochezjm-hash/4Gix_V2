import { useEffect, useMemo, useState } from "react";
import {
	asFeatureCollection,
	asRasterPreview,
	bboxFromInspection,
	listPorts,
	mapGeojsonFromInspection,
	pickPort,
	tableRowsFromData,
} from "../../lib/geo";
import { useDagStore } from "../../store/dagStore";
import { MapViewer } from "../MapViewer/MapViewer";
import { JsonTree } from "./JsonTree";

type DataPaneProps = {
	title: string;
	subtitle: string;
	data: unknown;
	empty: string;
	accent?: string;
	executionStatus?: string;
	dataKey?: string;
};

export function DataPane({
	title,
	subtitle,
	data,
	empty,
	accent,
	executionStatus,
	dataKey,
}: DataPaneProps) {
	const raster = asRasterPreview(data);
	const ports = listPorts(data);
	const [tab, setTab] = useState<"schema" | "raster" | "data_map">(
		raster ? "raster" : "schema",
	);
	const [port, setPort] = useState<string>("");
	const [filter, setFilter] = useState("");
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [mapFitNonce, _setMapFitNonce] = useState(0);
	const mapView = useDagStore((s) => s.mapView);
	const setMapView = useDagStore((s) => s.setMapView);
	const activePort = port && ports.includes(port) ? port : ports[0] || "";
	const scoped = ports.length ? pickPort(data, activePort) : data;
	const mapGeojson =
		mapGeojsonFromInspection(scoped) ||
		mapGeojsonFromInspection(data) ||
		asFeatureCollection(scoped);
	const mapBbox = bboxFromInspection(scoped) || bboxFromInspection(data) || undefined;
	const table = tableRowsFromData(scoped);
	const hasGeometry = Boolean(mapGeojson?.features.some((feature) => feature.geometry));
	const filteredRows = useMemo(() => {
		const query = filter.trim().toLowerCase();
		if (!query) {
			return table.rows.map((row, index) => ({ row, index }));
		}
		return table.rows
			.map((row, index) => ({ row, index }))
			.filter(({ row }) =>
				table.columns.some((column) =>
					String(row[column] ?? "")
						.toLowerCase()
						.includes(query),
				),
			);
	}, [filter, table.columns, table.rows]);

	const completed = executionStatus === "COMPLETED" || executionStatus === "success";

	const entityTotal = table.total || table.rows.length;

	useEffect(() => {
		setSelectedIndex(null);
		setFilter("");
		if (raster) {
			setTab("raster");
			return;
		}
		if (completed && table.rows.length > 0) {
			setTab("data_map");
			return;
		}
		setTab("schema");
	}, [completed, raster, table.rows.length]);

	return (
		<section className="inspector-pane">
			<header>
				<h3>{title}</h3>
				<p>{subtitle}</p>
				{ports.length ? (
					<label className="port-select">
						Port
						<select
							value={activePort}
							onChange={(event) => {
								setPort(event.target.value);
								setSelectedIndex(null);
							}}
						>
							{ports.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</label>
				) : null}
				<div className="pane-tabs" role="tablist">
					<button
						type="button"
						className={tab === "schema" ? "is-active" : ""}
						onClick={() => setTab("schema")}
					>
						Schema
					</button>
					<button
						type="button"
						className={tab === "data_map" ? "is-active" : ""}
						onClick={() => setTab("data_map")}
					>
						Data-Map
					</button>
					<button
						type="button"
						className={tab === "raster" ? "is-active" : ""}
						onClick={() => setTab("raster")}
					>
						Raster
					</button>
				</div>
			</header>
			{data == null ? (
				<div className="empty">{empty}</div>
			) : tab === "schema" ? (
				<div className="json-tree">
					<JsonTree data={stripBase64(scoped ?? data)} name="items" />
				</div>
			) : tab === "raster" ? (
				raster ? (
					<figure className="raster-preview">
						<img src={raster.src} alt="Prévisualisation raster" />
						<figcaption>
							{raster.path || "GeoTIFF"}
							{raster.width && raster.height
								? ` · ${raster.width}×${raster.height}`
								: ""}
							{raster.crs ? ` · ${raster.crs}` : ""}
							{raster.stats
								? ` · min ${raster.stats.min} / max ${raster.stats.max}`
								: ""}
						</figcaption>
					</figure>
				) : (
					<div className="empty">
						Pas de prévisualisation raster (PNG Base64) dans ce snapshot.
					</div>
				)
			) : tab === "data_map" ? (
				<div className="workflow-inspector">
					{hasGeometry ? (
						<div className="map-embed">
							<MapViewer
								geojson={mapGeojson}
								view={mapView}
								onViewChange={setMapView}
								accent={accent}
								selectedIndex={selectedIndex}
								fitBbox={mapBbox}
								fitNonce={mapFitNonce}
							/>
						</div>
					) : null}
					<input
						className="workflow-filter"
						placeholder="Filtrer les attributs…"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					/>
					<AttributeTable
						columns={table.columns}
						rows={filteredRows}
						totalEntities={entityTotal}
						selectedIndex={selectedIndex}
						onSelectRow={setSelectedIndex}
						filteredCount={filteredRows.length}
						hasActiveFilter={Boolean(filter.trim())}
						resetKey={`${dataKey ?? ""}:${filter}:${filteredRows.length}`}
					/>
				</div>
			) : (
				<pre>{JSON.stringify(stripBase64(data), null, 2)}</pre>
			)}
		</section>
	);
}

type AttributeTableProps = {
	columns: string[];
	rows: { row: Record<string, unknown>; index: number }[];
	totalEntities: number;
	selectedIndex: number | null;
	onSelectRow: (index: number) => void;
	filteredCount?: number;
	hasActiveFilter?: boolean;
	resetKey?: string;
};

const PAGE_SIZE_OPTIONS = [50, 200, 1000] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number] | "all";

function isFilteredList(hasActiveFilter: boolean): boolean {
	return hasActiveFilter;
}

function AttributeTable({
	columns,
	rows,
	totalEntities,
	selectedIndex,
	onSelectRow,
	filteredCount,
	resetKey = "",
	hasActiveFilter = false,
}: AttributeTableProps) {
	const [pageSize, setPageSize] = useState<PageSizeOption>(50);
	const [currentPage, setCurrentPage] = useState(0);

	const listTotal = filteredCount ?? rows.length;

	useEffect(() => {
		setCurrentPage(0);
	}, [resetKey, pageSize]);

	if (!rows.length) {
		return <div className="empty">Aucune entité à inspecter.</div>;
	}

	const effectivePageSize = pageSize === "all" ? Math.max(1, rows.length) : pageSize;
	const totalPages = Math.max(1, Math.ceil(rows.length / effectivePageSize));
	const safePage = Math.min(currentPage, totalPages - 1);
	const sliceStart = safePage * effectivePageSize;
	const pageRows = rows.slice(sliceStart, sliceStart + effectivePageSize);
	const rangeStart = rows.length ? sliceStart + 1 : 0;
	const rangeEnd = sliceStart + pageRows.length;
	const isFiltered = isFilteredList(hasActiveFilter);
	const displayTotal = isFiltered ? listTotal : totalEntities;

	return (
		<>
			<div className="attribute-table__toolbar">
				<p className="table-meta attribute-table__summary">
					Affichage de {rangeStart} à {rangeEnd} sur {displayTotal} entité
					{displayTotal > 1 ? "s" : ""}
					{isFiltered ? ` (filtre actif · ${totalEntities} au total)` : ""}
					{` · ${columns.length} colonne${columns.length > 1 ? "s" : ""}`}
				</p>
				<div className="attribute-table__pagination">
					<button
						type="button"
						className="attribute-table__page-btn"
						disabled={safePage <= 0}
						onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
					>
						Précédent
					</button>
					<span className="attribute-table__page-indicator">
						Page {safePage + 1} / {totalPages}
					</span>
					<button
						type="button"
						className="attribute-table__page-btn"
						disabled={safePage >= totalPages - 1}
						onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
					>
						Suivant
					</button>
					<label className="attribute-table__page-size">
						<span>Lignes</span>
						<select
							value={pageSize === "all" ? "all" : String(pageSize)}
							onChange={(event) => {
								const value = event.target.value;
								setPageSize(
									value === "all" ? "all" : (Number(value) as PageSizeOption),
								);
							}}
							aria-label="Taille de page"
						>
							{PAGE_SIZE_OPTIONS.map((size) => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
							<option value="all">Tout</option>
						</select>
					</label>
				</div>
			</div>
			<div className="table-wrap table-wrap--tall">
				<table>
					<thead>
						<tr>
							{columns.map((column) => (
								<th key={column}>{column}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{pageRows.map(({ row, index }) => (
							<tr
								key={index}
								className={selectedIndex === index ? "is-selected-feature" : ""}
								onClick={() => onSelectRow(index)}
							>
								{columns.map((column) => (
									<td key={column}>{formatCell(row[column])}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}

function formatCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function stripBase64(value: unknown): unknown {
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value)) return value;
	const record = { ...(value as Record<string, unknown>) };
	if (typeof record.preview_png_base64 === "string") {
		record.preview_png_base64 = `[png ${record.preview_png_base64.length} chars]`;
	}
	if (record.data && typeof record.data === "object") {
		record.data = stripBase64(record.data);
	}
	return record;
}
