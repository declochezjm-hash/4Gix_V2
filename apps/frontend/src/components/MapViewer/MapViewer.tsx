import { GeoJsonLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import type { MapViewState } from "../../lib/api";
import {
	asFeatureCollection,
	type GeoJsonFeatureCollection,
} from "../../lib/geo";

type MapViewerProps = {
	geojson?: unknown;
	view?: MapViewState | null;
	onViewChange?: (view: MapViewState) => void;
	accent?: string;
	selectedIndex?: number | null;
	fitBbox?: number[] | null;
	fitNonce?: number;
};

const EMPTY: GeoJsonFeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

function extendBounds(
	bounds: maplibregl.LngLatBounds,
	geom: { type: string; coordinates: unknown } | null | undefined,
) {
	if (!geom) return;
	const walk = (coords: unknown) => {
		if (!Array.isArray(coords)) return;
		if (typeof coords[0] === "number" && typeof coords[1] === "number") {
			bounds.extend([coords[0] as number, coords[1] as number]);
			return;
		}
		for (const item of coords) walk(item);
	};
	walk(geom.coordinates);
}

function elevationOf(feature: {
	properties?: Record<string, unknown>;
}): number {
	const props = feature.properties || {};
	const raw =
		props.height ?? props.Elevation ?? props.OverallHeight ?? props.z_mean;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : 8;
}

export function MapViewer({
	geojson,
	view,
	onViewChange,
	accent = "#2aa198",
	selectedIndex = null,
	fitBbox = null,
	fitNonce = 0,
}: MapViewerProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<maplibregl.Map | null>(null);
	const overlayRef = useRef<MapboxOverlay | null>(null);
	const applyingRef = useRef(false);
	const onViewChangeRef = useRef(onViewChange);
	onViewChangeRef.current = onViewChange;
	const [mode3d, setMode3d] = useState(false);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return;
		const map = new maplibregl.Map({
			container: containerRef.current,
			style: {
				version: 8,
				sources: {
					osm: {
						type: "raster",
						tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
						tileSize: 256,
						attribution: "© OpenStreetMap",
					},
				},
				layers: [{ id: "osm", type: "raster", source: "osm" }],
			},
			center: [2.3, 46.5],
			zoom: 4.4,
			pitch: 0,
			bearing: 0,
		});
		map.addControl(
			new maplibregl.NavigationControl({ visualizePitch: true }),
			"top-right",
		);
		map.on("load", () => {
			map.addSource("preview", {
				type: "geojson",
				data: EMPTY as FeatureCollection,
			});
			map.addLayer({
				id: "preview-fill",
				type: "fill",
				source: "preview",
				paint: { "fill-color": accent, "fill-opacity": 0.28 },
				filter: ["==", "$type", "Polygon"],
			});
			map.addLayer({
				id: "preview-line",
				type: "line",
				source: "preview",
				paint: { "line-color": accent, "line-width": 2 },
			});
			map.addLayer({
				id: "preview-point",
				type: "circle",
				source: "preview",
				paint: {
					"circle-radius": 6,
					"circle-color": "#cb4b16",
					"circle-stroke-width": 1.5,
					"circle-stroke-color": "#073642",
				},
				filter: ["==", "$type", "Point"],
			});
			map.addSource("preview-sel", {
				type: "geojson",
				data: EMPTY as FeatureCollection,
			});
			map.addLayer({
				id: "preview-sel-line",
				type: "line",
				source: "preview-sel",
				paint: { "line-color": "#facc15", "line-width": 4 },
			});
			map.addLayer({
				id: "preview-sel-point",
				type: "circle",
				source: "preview-sel",
				paint: {
					"circle-radius": 8,
					"circle-color": "#facc15",
					"circle-stroke-width": 2,
					"circle-stroke-color": "#073642",
				},
				filter: ["==", "$type", "Point"],
			});
			const overlay = new MapboxOverlay({
				interleaved: true,
				layers: [],
			});
			map.addControl(overlay);
			overlayRef.current = overlay;
		});
		map.on("moveend", () => {
			if (applyingRef.current) return;
			const center = map.getCenter();
			onViewChangeRef.current?.({
				longitude: center.lng,
				latitude: center.lat,
				zoom: map.getZoom(),
			});
		});
		mapRef.current = map;
		return () => {
			overlayRef.current = null;
			map.remove();
			mapRef.current = null;
		};
	}, [accent]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.easeTo({
			pitch: mode3d ? 60 : 0,
			bearing: mode3d ? -18 : 0,
			duration: 400,
		});
	}, [mode3d]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !view) return;
		const center = map.getCenter();
		const same =
			Math.abs(center.lng - view.longitude) < 1e-6 &&
			Math.abs(center.lat - view.latitude) < 1e-6 &&
			Math.abs(map.getZoom() - view.zoom) < 1e-4;
		if (same) return;
		applyingRef.current = true;
		map.jumpTo({ center: [view.longitude, view.latitude], zoom: view.zoom });
		map.once("idle", () => {
			applyingRef.current = false;
		});
	}, [view]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (!fitBbox || fitBbox.length !== 4) return;
		const applyFit = () => {
			applyingRef.current = true;
			map.fitBounds(
				[
					[fitBbox[0], fitBbox[1]],
					[fitBbox[2], fitBbox[3]],
				],
				{ padding: 40, maxZoom: 16, duration: 450 },
			);
			map.once("idle", () => {
				applyingRef.current = false;
				const center = map.getCenter();
				onViewChangeRef.current?.({
					longitude: center.lng,
					latitude: center.lat,
					zoom: map.getZoom(),
				});
			});
		};
		if (map.isStyleLoaded()) applyFit();
		else map.once("load", applyFit);
	}, [fitBbox, fitNonce]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const data = asFeatureCollection(geojson) || EMPTY;
		const apply = () => {
			const source = map.getSource("preview") as
				| maplibregl.GeoJSONSource
				| undefined;
			if (source) source.setData(data as FeatureCollection);
			const highlight =
				selectedIndex != null && data.features[selectedIndex]
					? {
							type: "FeatureCollection" as const,
							features: [data.features[selectedIndex]],
						}
					: EMPTY;
			const sel = map.getSource("preview-sel") as
				| maplibregl.GeoJSONSource
				| undefined;
			if (sel) sel.setData(highlight as FeatureCollection);
			overlayRef.current?.setProps({
				layers: mode3d
					? [
							new GeoJsonLayer({
								id: "bim-3d",
								data: data as FeatureCollection,
								extruded: true,
								wireframe: true,
								filled: true,
								getElevation: elevationOf,
								getFillColor: [42, 161, 152, 190],
								getLineColor: [7, 54, 66, 255],
								lineWidthMinPixels: 1,
								pickable: true,
								opacity: 0.85,
							}),
						]
					: [],
			});
			if (view) return;
			const features = data.features || [];
			if (!features.length) return;
			const bounds = new maplibregl.LngLatBounds();
			for (const feature of features) {
				extendBounds(bounds, feature.geometry);
			}
			if (!bounds.isEmpty()) {
				applyingRef.current = true;
				map.fitBounds(bounds, { padding: 32, maxZoom: 16, duration: 400 });
				map.once("idle", () => {
					applyingRef.current = false;
					const center = map.getCenter();
					onViewChangeRef.current?.({
						longitude: center.lng,
						latitude: center.lat,
						zoom: map.getZoom(),
					});
				});
			}
		};
		if (map.isStyleLoaded()) apply();
		else map.once("load", apply);
	}, [geojson, view, mode3d, selectedIndex]);

	return (
		<div className="map-viewer-wrap">
			<button
				type="button"
				className={`map-mode ${mode3d ? "is-active" : ""}`}
				onClick={() => setMode3d((value) => !value)}
			>
				{mode3d ? "3D BIM" : "2D"}
			</button>
			<div ref={containerRef} className="map-viewer" />
		</div>
	);
}
