"""Validation et import Shapefile (.zip)."""

from __future__ import annotations

import json
import uuid
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Set, Tuple

import geopandas as gpd

from .paths import workspace_subdir, workspace_uri
from .shapefile_preview import shapefile_read_outputs

SHAPEFILE_REQUIRED = {".shp", ".shx", ".dbf"}
SHAPEFILE_SIDECAR = {".prj", ".cpg", ".sbn", ".sbx", ".xml", ".shp.xml", ".qix", ".fix"}


def _posix(path: str) -> str:
    return path.replace("\\", "/")


def _safe_upload_name(filename: str) -> str:
    base = Path(filename or "upload.zip").name
    cleaned = "".join(ch for ch in base if ch.isalnum() or ch in "._- ")
    return cleaned.strip() or "upload.zip"


def list_zip_entries(raw: bytes) -> List[str]:
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        return [_posix(name) for name in archive.namelist() if not name.endswith("/")]


def discover_shapefile_sets(entry_names: List[str]) -> List[Dict[str, Any]]:
    by_stem: Dict[str, Set[str]] = {}
    for name in entry_names:
        path = PurePosixPath(name)
        ext = path.suffix.lower()
        if ext not in SHAPEFILE_REQUIRED | SHAPEFILE_SIDECAR | {".shp"}:
            continue
        stem = _posix(str(path.with_suffix("")))
        by_stem.setdefault(stem, set()).add(ext)

    sets: List[Dict[str, Any]] = []
    for stem, extensions in sorted(by_stem.items()):
        if not SHAPEFILE_REQUIRED.issubset(extensions):
            continue
        shp_path = f"{stem}.shp"
        sets.append(
            {
                "stem": stem,
                "shp_path_in_zip": shp_path,
                "extensions": sorted(extensions),
                "layer_name": PurePosixPath(stem).name,
            },
        )
    return sets


def validate_zip_shapefile(raw: bytes) -> Tuple[bool, List[Dict[str, Any]], List[str]]:
    entries = list_zip_entries(raw)
    sets = discover_shapefile_sets(entries)
    components = sorted(
        {
            PurePosixPath(name).suffix.lower()
            for name in entries
            if PurePosixPath(name).suffix.lower() in SHAPEFILE_REQUIRED | SHAPEFILE_SIDECAR
        },
    )
    return bool(sets), sets, components


def _extract_shapefile_sidecars(zip_path: Path, inner_shp: str) -> Path:
    inner = PurePosixPath(_posix(inner_shp))
    stem_key = _posix(str(inner.with_suffix("")))
    out_root = workspace_subdir("imports", f"{zip_path.stem}-{inner.stem}", create=True)
    allowed = SHAPEFILE_REQUIRED | SHAPEFILE_SIDECAR
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            normalized = _posix(name)
            path = PurePosixPath(normalized)
            if path.suffix.lower() not in allowed:
                continue
            if _posix(str(path.with_suffix(""))) != stem_key:
                continue
            target = out_root / path.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
    shp_out = out_root / inner.name
    if not shp_out.is_file():
        raise FileNotFoundError(
            f"Extraction Shapefile incomplète pour {inner_shp} dans {zip_path.name}.",
        )
    return shp_out


def resolve_shapefile_path(
    filepath: Path,
    *,
    layer_name: Optional[str] = None,
    zip_path: Optional[Path] = None,
) -> Path:
    """Résout un chemin .shp sur disque (extraction depuis .zip si nécessaire)."""
    if filepath.suffix.lower() == ".shp" and filepath.is_file():
        return filepath

    archive = filepath if filepath.suffix.lower() == ".zip" else zip_path
    if archive is None or not archive.is_file():
        if filepath.is_file():
            return filepath
        raise FileNotFoundError(f"Shapefile introuvable: {filepath}")

    with zipfile.ZipFile(archive) as zf:
        entries = [_posix(name) for name in zf.namelist() if not name.endswith("/")]
    shape_sets = discover_shapefile_sets(entries)
    if not shape_sets:
        raise ValueError(
            f"Archive {archive.name} sans Shapefile complet (.shp + .shx + .dbf).",
        )

    chosen = shape_sets[0]
    if layer_name:
        layer_key = layer_name.strip().lower()
        for item in shape_sets:
            name = str(item.get("layer_name") or "").lower()
            stem = str(item.get("stem") or "").lower()
            if layer_key in {name, PurePosixPath(stem).name.lower()}:
                chosen = item
                break

    return _extract_shapefile_sidecars(archive, chosen["shp_path_in_zip"])


def import_shapefile_zip_bytes(raw: bytes, *, filename: str) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Archive vide.")
    ok, shape_sets, _components = validate_zip_shapefile(raw)
    if not ok:
        raise ValueError(
            "Archive .zip invalide : aucun Shapefile complet (.shp + .shx + .dbf) trouvé.",
        )

    uploads = workspace_subdir("imports", create=True)
    safe_name = _safe_upload_name(filename)
    zip_path = uploads / f"{uuid.uuid4().hex[:10]}-{safe_name}"
    zip_path.write_bytes(raw)

    primary = shape_sets[0]
    if len(shape_sets) > 1:
        primary = max(shape_sets, key=lambda item: len(item.get("extensions") or []))

    inner_shp = primary["shp_path_in_zip"]
    shp_path = _extract_shapefile_sidecars(zip_path, inner_shp)
    import os

    os.environ.setdefault("SHAPE_RESTORE_SHX", "YES")
    gdf = gpd.read_file(shp_path)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    geojson, map_geojson, meta = shapefile_read_outputs(gdf)
    metadata: Dict[str, Any] = {
        "source": "shapefile",
        **meta,
        "zip_path": str(zip_path),
        "zip_workspace_path": workspace_uri(zip_path),
        "shapefile_path": str(shp_path),
        "shapefile_workspace_path": workspace_uri(shp_path),
        "shapefile_in_zip": inner_shp,
        "layer_name": primary["layer_name"],
        "shapefile_sets_in_zip": len(shape_sets),
        "components": primary.get("extensions") or [],
    }

    label = primary["layer_name"] or Path(filename).stem
    return {
        "format": "geojson",
        "source": "shapefile_zip",
        "filename": filename,
        "label": f"Shapefile — {label}",
        "geojson": geojson,
        "map_geojson": map_geojson,
        "metadata": metadata,
        "suggested_node": {
            "node_type": "shapefile_reader",
            "label": f"Shapefile — {label}",
            "params": {
                "path": metadata["shapefile_workspace_path"],
                "zip_path": metadata["zip_workspace_path"],
                "layer_name": label,
                "encoding": "utf-8",
            },
        },
    }
