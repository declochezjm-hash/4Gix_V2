"""Points à partir de colonnes X/Y ou lon/lat (CSV, Excel, etc.)."""

from __future__ import annotations

import re
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from .shapefile_preview import MAP_CRS, shapefile_read_outputs

_LON_PRIORITY = (
    "longitude",
    "lon",
    "long",
    "x",
    "coord_x",
    "coordonnee_x",
    "easting",
    "est",
    "abs_x",
)
_LAT_PRIORITY = (
    "latitude",
    "lat",
    "y",
    "coord_y",
    "coordonnee_y",
    "northing",
    "nord",
    "abs_y",
)


def normalize_column_name(name: str) -> str:
    return re.sub(r"[\s._-]+", "_", str(name).strip().lower())


def find_coordinate_columns(columns: List[str]) -> Tuple[Optional[str], Optional[str]]:
    by_norm: Dict[str, str] = {}
    for col in columns:
        key = normalize_column_name(col)
        if key not in by_norm:
            by_norm[key] = col
    lon_col = next((by_norm[k] for k in _LON_PRIORITY if k in by_norm), None)
    lat_col = next((by_norm[k] for k in _LAT_PRIORITY if k in by_norm), None)
    return lon_col, lat_col


def parse_coord(value: Any) -> float:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        raise ValueError("coordonnée vide")
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("\u00a0", "").replace(" ", "")
    if "," in text and "." not in text:
        text = text.replace(",", ".")
    return float(text)


def infer_crs_from_coordinates(
    frame: pd.DataFrame, lon_col: str, lat_col: str, sample: int = 200
) -> str:
    xs: List[float] = []
    ys: List[float] = []
    for _, row in frame.head(sample).iterrows():
        try:
            xs.append(parse_coord(row[lon_col]))
            ys.append(parse_coord(row[lat_col]))
        except (ValueError, TypeError):
            continue
    if not xs or not ys:
        return MAP_CRS
    mx = median(xs)
    my = median(ys)
    if abs(mx) <= 180 and abs(my) <= 90 and max(map(abs, xs)) <= 180 and max(map(abs, ys)) <= 90:
        return MAP_CRS
    if 100_000 < mx < 1_300_000 and 6_000_000 < my < 7_500_000:
        return "EPSG:2154"
    if max(abs(mx), abs(my)) > 1_000_000:
        return "EPSG:3857"
    return MAP_CRS


def dataframe_to_geodataframe(
    frame: pd.DataFrame,
    lon_col: Optional[str] = None,
    lat_col: Optional[str] = None,
    crs: Optional[str] = None,
):
    import geopandas as gpd
    from shapely.geometry import Point

    x_col, y_col = lon_col, lat_col
    if not x_col or not y_col:
        x_col, y_col = find_coordinate_columns(list(frame.columns))
    if not x_col or not y_col:
        raise ValueError("Colonnes de coordonnées introuvables (X/Y ou lon/lat).")

    inferred = infer_crs_from_coordinates(frame, x_col, y_col)
    if crs and str(crs).strip() and str(crs) not in (MAP_CRS, "EPSG:4326"):
        resolved_crs = str(crs)
    else:
        resolved_crs = inferred
    geometry = []
    for _, row in frame.iterrows():
        try:
            geometry.append(Point(parse_coord(row[x_col]), parse_coord(row[y_col])))
        except (ValueError, TypeError):
            geometry.append(None)
    gdf = gpd.GeoDataFrame(frame, geometry=geometry, crs=resolved_crs)
    return gdf[~gdf.geometry.isna()].copy()


def attach_map_preview(
    preview: Dict[str, Any],
    frame: pd.DataFrame,
    *,
    map_limit: int = 2500,
) -> Dict[str, Any]:
    lon_col, lat_col = find_coordinate_columns(list(frame.columns))
    if not lon_col or not lat_col:
        return preview
    try:
        gdf = dataframe_to_geodataframe(frame, lon_col, lat_col)
    except (ValueError, ImportError):
        return preview
    if len(gdf) == 0:
        return preview
    _, map_geojson, meta = shapefile_read_outputs(gdf, preview_limit=map_limit)
    preview["map_geojson"] = map_geojson
    preview["bbox"] = meta.get("bbox")
    preview["crs"] = meta.get("crs")
    preview["coordinate_columns"] = {"x": lon_col, "y": lat_col}
    return preview
