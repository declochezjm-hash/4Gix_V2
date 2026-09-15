"""Prévisualisation GeoJSON pour Shapefile importé."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

import geopandas as gpd
import pandas as pd

MAP_CRS = "EPSG:4326"
MAX_PREVIEW_FEATURES = 2500


def _geojson_dict(gdf: gpd.GeoDataFrame) -> Dict[str, Any]:
    return json.loads(gdf.to_json())


def _bbox_wgs84(gdf_map: gpd.GeoDataFrame) -> Optional[List[float]]:
    if gdf_map is None or len(gdf_map) == 0:
        return None
    minx, miny, maxx, maxy = gdf_map.total_bounds
    return [float(minx), float(miny), float(maxx), float(maxy)]


def _truncate_fc(fc: Dict[str, Any], *, limit: int) -> Tuple[Dict[str, Any], bool]:
    features = fc.get("features") or []
    if len(features) <= limit:
        return fc, False
    preview = {"type": "FeatureCollection", "features": features[:limit]}
    if fc.get("crs"):
        preview["crs"] = fc.get("crs")
    return preview, True


def shapefile_read_outputs(
    gdf: gpd.GeoDataFrame,
    *,
    preview_limit: int = MAX_PREVIEW_FEATURES,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    if gdf.crs is None:
        gdf = gdf.set_crs(MAP_CRS)

    native_full = _geojson_dict(gdf)
    gdf_map = gdf.to_crs(MAP_CRS) if str(gdf.crs) != MAP_CRS else gdf
    map_full = _geojson_dict(gdf_map)

    native, native_truncated = _truncate_fc(native_full, limit=preview_limit)
    map_geojson, map_truncated = _truncate_fc(map_full, limit=preview_limit)

    feature_count = len(gdf)
    metadata: Dict[str, Any] = {
        "feature_count": feature_count,
        "columns": [col for col in gdf.columns if col != "geometry"],
        "crs": str(gdf.crs) if gdf.crs else None,
        "map_crs": MAP_CRS,
        "bbox": _bbox_wgs84(gdf_map),
        "bounds": list(gdf.total_bounds) if len(gdf) else None,
        "geometry_types": sorted({str(value) for value in gdf.geom_type.dropna().unique()}),
    }
    if native_truncated or map_truncated:
        metadata["preview_truncated"] = True
        metadata["preview_feature_count"] = preview_limit

    return native, map_geojson, metadata


def geodataframe_execution_preview(
    gdf: gpd.GeoDataFrame,
    *,
    preview_limit: int = MAX_PREVIEW_FEATURES,
) -> Dict[str, Any]:
    """Aperçu OUTPUT (carte, tableau, schéma) après exécution d'un lecteur spatial."""
    geojson, map_geojson, meta = shapefile_read_outputs(gdf, preview_limit=preview_limit)
    feature_count = int(meta.get("feature_count") or len(gdf))
    columns = list(meta.get("columns") or [])
    records: List[Dict[str, Any]] = []
    attr_cols = [col for col in gdf.columns if col != "geometry"]
    for _, row in gdf.head(preview_limit).iterrows():
        item: Dict[str, Any] = {}
        for col in attr_cols:
            value = row[col]
            if value is None or (hasattr(value, "__bool__") and pd.isna(value)):
                item[str(col)] = None
            elif hasattr(value, "item"):
                try:
                    item[str(col)] = value.item()
                except (ValueError, AttributeError):
                    item[str(col)] = str(value)
            else:
                item[str(col)] = value
        geom = row.geometry
        if geom is not None and not pd.isna(geom):
            item["_geom"] = str(getattr(geom, "geom_type", type(geom).__name__))
        records.append(item)

    preview: Dict[str, Any] = {
        "row_count": feature_count,
        "total": feature_count,
        "crs": meta.get("crs"),
        "columns": columns,
        "bbox": meta.get("bbox"),
        "geometry_types": meta.get("geometry_types"),
        "geojson": geojson,
        "map_geojson": map_geojson,
        "records": records,
    }
    if meta.get("preview_truncated"):
        preview["preview_truncated"] = True
        preview["preview_feature_count"] = meta.get("preview_feature_count")
    return preview
