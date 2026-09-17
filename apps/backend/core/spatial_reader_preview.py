"""Aperçu spatial pour les lecteurs (API UI)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from core.paths import resolve_workspace_path
from core.shapefile_preview import geodataframe_execution_preview
from engine.native.gpkg import read_gpkg_layer
from engine.spark.models import Step, StepOptions


def _resolve_optional_path(raw: str | None) -> Path | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return resolve_workspace_path(value)
    except ValueError:
        return Path(value)


def spatial_reader_preview(node_type: str, params: Dict[str, Any]) -> Dict[str, Any]:
    kind = (node_type or "").strip().replace("-", "_").lower()
    path_raw = (params.get("path") or params.get("filepath") or "").strip()
    if not path_raw:
        raise ValueError("Paramètre `path` manquant.")

    filepath = _resolve_optional_path(path_raw)
    if filepath is None:
        raise ValueError("Chemin invalide.")

    if kind == "shapefile_reader":
        opts = StepOptions.model_validate(
            {
                "filepath": str(filepath),
                "zip_path": str(_resolve_optional_path(params.get("zip_path")))
                if params.get("zip_path")
                else None,
                "layer_name": params.get("layer_name"),
                "encoding": params.get("encoding"),
            }
        )
        from engine.spark.pipeline_executor import PipelineExecutor

        step = Step(id="_preview", type="ShapefileReader", options=opts)
        gdf = PipelineExecutor()._read_shapefile(step)
        return geodataframe_execution_preview(gdf)

    if kind == "gpkg_reader":
        layer = (params.get("layer") or "").strip() or None
        gdf = read_gpkg_layer(filepath, layer=layer)
        return geodataframe_execution_preview(gdf)

    if kind == "geojson_reader":
        import geopandas as gpd

        if not filepath.is_file():
            raise FileNotFoundError(f"GeoJSON introuvable: {filepath}")
        gdf = gpd.read_file(filepath)
        return geodataframe_execution_preview(gdf)

    raise ValueError(f"Type de lecteur non supporté pour l'aperçu: {node_type}")
