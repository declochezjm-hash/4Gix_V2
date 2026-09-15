"""Téléversement de fichiers de données (workspace local)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Dict

from .csv_io import detect_csv_delimiter, resolve_csv_encoding
from .paths import workspace_subdir, workspace_uri
from .shapefile_zip import _safe_upload_name, import_shapefile_zip_bytes, validate_zip_shapefile

GEOTIFF_SUFFIXES = {".tif", ".tiff", ".geotiff"}
GEOJSON_SUFFIXES = {".geojson", ".json"}
EXCEL_SUFFIXES = {".xlsx", ".xls"}
TABULAR_SUFFIXES = {".csv"}
GPKG_SUFFIXES = {".gpkg"}
KML_SUFFIXES = {".kml", ".kmz"}
DXF_SUFFIXES = {".dxf"}
SHP_SUFFIXES = {".shp"}


def detect_data_type(filename: str, raw: bytes) -> str:
    lower = (filename or "").lower()
    suffix = Path(lower).suffix

    if suffix == ".zip":
        ok, _sets, _components = validate_zip_shapefile(raw)
        if ok:
            return "shapefile"
        raise ValueError("Archive .zip sans Shapefile valide (.shp + .shx + .dbf).")

    if suffix in SHP_SUFFIXES:
        return "shapefile"
    if suffix in EXCEL_SUFFIXES:
        return "excel"
    if suffix in TABULAR_SUFFIXES:
        return "csv"
    if suffix in GPKG_SUFFIXES:
        return "gpkg"
    if suffix in KML_SUFFIXES:
        return "kml"
    if suffix in DXF_SUFFIXES:
        return "dxf"
    if suffix in GEOTIFF_SUFFIXES:
        return "geotiff"
    if suffix in GEOJSON_SUFFIXES:
        if suffix == ".json" and not _looks_like_geojson(raw):
            raise ValueError("Fichier .json non reconnu comme GeoJSON.")
        return "geojson"

    raise ValueError(
        "Format non supporté. Extensions acceptées : "
        ".xlsx, .xls, .csv, .gpkg, .geojson, .json (GeoJSON), "
        ".kml, .kmz, .dxf, .shp, .zip (Shapefile), .tif / .tiff.",
    )


def _looks_like_geojson(raw: bytes) -> bool:
    sample = raw[:65536].decode("utf-8", errors="ignore").strip()
    if not sample:
        return False
    try:
        parsed = json.loads(sample)
    except json.JSONDecodeError:
        return False
    if not isinstance(parsed, dict):
        return False
    kind = parsed.get("type")
    return kind in {"FeatureCollection", "Feature", "Geometry"}


def save_upload(raw: bytes, filename: str) -> Path:
    uploads = workspace_subdir("uploads", create=True)
    safe_name = _safe_upload_name(filename)
    dest = uploads / f"{uuid.uuid4().hex[:10]}-{safe_name}"
    dest.write_bytes(raw)
    return dest


def suggested_reader(detected_type: str, filename: str, stored: Path) -> Dict[str, Any]:
    ws_path = workspace_uri(stored)
    stem = Path(filename).stem or "couche"
    if detected_type == "shapefile":
        return {
            "node_type": "shapefile_reader",
            "label": f"Shapefile — {stem}",
            "params": {
                "path": ws_path,
                "zip_path": ws_path if stored.suffix.lower() == ".zip" else "",
                "layer_name": stem,
                "encoding": "utf-8",
            },
        }
    if detected_type == "geojson":
        return {
            "node_type": "geojson_reader",
            "label": f"GeoJSON — {stem}",
            "params": {"path": ws_path, "use_sample": False, "geojson": ""},
        }
    if detected_type == "geotiff":
        return {
            "node_type": "geotiff_raster_reader",
            "label": f"GeoTIFF — {stem}",
            "params": {"path": ws_path, "band": 1},
        }
    if detected_type == "excel":
        return {
            "node_type": "excel_reader",
            "label": f"Excel — {stem}",
            "params": {"path": ws_path, "sheet_name": ""},
        }
    if detected_type == "csv":
        enc = resolve_csv_encoding("")
        delimiter = detect_csv_delimiter(stored, enc)
        return {
            "node_type": "csv_reader",
            "label": f"CSV — {stem}",
            "params": {"path": ws_path, "encoding": "", "delimiter": delimiter},
        }
    if detected_type == "gpkg":
        return {
            "node_type": "gpkg_reader",
            "label": f"GeoPackage — {stem}",
            "params": {"path": ws_path, "layer": ""},
        }
    if detected_type == "kml":
        return {
            "node_type": "kml_reader",
            "label": f"KML — {stem}",
            "params": {"path": ws_path, "layer": ""},
        }
    if detected_type == "dxf":
        return {
            "node_type": "dxf_reader",
            "label": f"CAD / DXF — {stem}",
            "params": {"path": ws_path, "source_crs": "EPSG:4326"},
        }
    raise ValueError(f"Type de données inconnu: {detected_type}")


def process_upload(raw: bytes, filename: str) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Fichier vide.")
    detected_type = detect_data_type(filename, raw)
    if detected_type == "shapefile" and Path(filename).suffix.lower() == ".zip":
        imported = import_shapefile_zip_bytes(raw, filename=filename)
        meta = imported["metadata"]
        shp_stored = Path(meta["shapefile_path"])
        return {
            "filename": Path(filename).name,
            "filepath": str(shp_stored.resolve()),
            "workspace_path": meta["shapefile_workspace_path"],
            "detected_type": detected_type,
            "suggested_node": imported["suggested_node"],
            "import_metadata": meta,
        }
    stored = save_upload(raw, filename)
    suggested = suggested_reader(detected_type, filename, stored)
    return {
        "filename": Path(filename).name,
        "filepath": str(stored.resolve()),
        "workspace_path": workspace_uri(stored),
        "detected_type": detected_type,
        "suggested_node": suggested,
    }
