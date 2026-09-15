"""Exécution locale du pipeline (GeoPandas / Pandas)."""

from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

import pandas as pd

from core.csv_io import read_csv_file, tabular_preview
from core.tabular_geo import dataframe_to_geodataframe
from engine.native.gpkg import read_gpkg_layer

from .models import Definition, Step

Frame = Union[pd.DataFrame, Any]
NodeEventCallback = Callable[[str, str, Optional[Dict[str, Any]]], None]


class PipelineExecutionError(RuntimeError):
    pass


class PipelineExecutor:
    def run(
        self,
        definition: Definition,
        on_node_event: Optional[NodeEventCallback] = None,
    ) -> Dict[str, Any]:
        order = self._execution_order(definition)
        frames: Dict[str, Frame] = {}
        written_files: List[str] = []
        snapshots: List[Dict[str, Any]] = []

        for step in order:
            started = time.perf_counter()
            if on_node_event:
                on_node_event(step.id, "RUNNING", None)
            try:
                frame, meta = self._run_step(step, frames)
                frames[step.id] = frame
                duration_ms = round((time.perf_counter() - started) * 1000, 3)
                if meta.get("written_file"):
                    written_files.append(meta["written_file"])
                snapshot = {
                    "node_id": step.id,
                    "node_type": step.type,
                    "status": "COMPLETED",
                    "duration_ms": duration_ms,
                    "metadata": meta,
                    "preview": meta.get("preview"),
                }
                snapshots.append(snapshot)
                if on_node_event:
                    on_node_event(step.id, "COMPLETED", snapshot)
            except Exception as exc:  # noqa: BLE001
                duration_ms = round((time.perf_counter() - started) * 1000, 3)
                snapshot = {
                    "node_id": step.id,
                    "node_type": step.type,
                    "status": "FAILED",
                    "duration_ms": duration_ms,
                    "error": str(exc),
                }
                snapshots.append(snapshot)
                if on_node_event:
                    on_node_event(step.id, "FAILED", snapshot)
                raise PipelineExecutionError(
                    f"Échec du nœud `{step.id}` ({step.type}): {exc}"
                ) from exc

        return {
            "status": "COMPLETED",
            "step_count": len(order),
            "written_files": written_files,
            "row_counts": {sid: self._row_count(frames[sid]) for sid in frames},
            "snapshots": snapshots,
        }

    def _run_step(self, step: Step, frames: Dict[str, Frame]) -> tuple[Frame, Dict[str, Any]]:
        meta: Dict[str, Any] = {"step_type": step.type}
        if step.type in {"CsvReader", "CSVReader"}:
            frame = self._read_csv(step)
            meta["preview"] = tabular_preview(frame)
            return frame, meta
        if step.type in {"ShapefileReader"}:
            frame = self._read_shapefile(step)
            meta["preview"] = {"row_count": len(frame), "crs": str(getattr(frame, "crs", None))}
            return frame, meta
        if step.type in {"GpkgReader"}:
            frame = self._read_gpkg(step)
            meta["preview"] = {"row_count": len(frame), "crs": str(getattr(frame, "crs", None))}
            return frame, meta
        if step.type in {"GeoJsonReader"}:
            frame = self._read_geojson(step)
            meta["preview"] = {"row_count": len(frame), "crs": str(getattr(frame, "crs", None))}
            return frame, meta
        if step.type in {"FilterTransformer"}:
            source_id = self._single_input(step)
            frame = self._filter(frames[source_id], step)
            meta["preview"] = {"row_count": len(frame)}
            return frame, meta
        if step.type in {"ReprojectTransformer"}:
            source_id = self._single_input(step)
            frame = self._reproject(frames[source_id], step)
            meta["preview"] = {"row_count": len(frame), "target_crs": step.options.target_crs}
            return frame, meta
        if step.type in {"SpatialJoiner"}:
            left_id = step.input.left if step.input else ""
            right_id = step.input.right if step.input else ""
            frame = self._spatial_join(frames[left_id], frames[right_id], step)
            meta["preview"] = {"row_count": len(frame)}
            return frame, meta
        if step.type in {"FileWriter"}:
            source_id = self._single_input(step)
            path = self._write_file(frames[source_id], step)
            meta["written_file"] = path
            meta["preview"] = {"path": path}
            return frames[source_id], meta
        raise PipelineExecutionError(f"Type d'étape non supporté: {step.type}")

    def _execution_order(self, definition: Definition) -> List[Step]:
        steps = {step.id: step for step in definition.steps}
        indegree = {step_id: 0 for step_id in steps}
        successors: Dict[str, List[str]] = defaultdict(list)
        for step in definition.steps:
            for target in (step.output.success if step.output else []):
                if target in steps:
                    successors[step.id].append(target)
                    indegree[target] += 1
        queue = deque([sid for sid, deg in indegree.items() if deg == 0])
        order: List[Step] = []
        while queue:
            step_id = queue.popleft()
            order.append(steps[step_id])
            for target in successors[step_id]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)
        if len(order) != len(steps):
            raise PipelineExecutionError("Le graphe contient un cycle ou des nœuds isolés.")
        return order

    @staticmethod
    def _single_input(step: Step) -> str:
        if not step.input:
            raise PipelineExecutionError(f"L'étape `{step.id}` requiert une entrée.")
        for key in ("input", "left"):
            value = getattr(step.input, key, None)
            if value:
                return value
        raise PipelineExecutionError(f"Entrée introuvable pour `{step.id}`.")

    @staticmethod
    def _row_count(frame: Frame) -> int:
        return len(frame)

    def _read_csv(self, step: Step) -> pd.DataFrame:
        opts = step.options
        filepath = Path(opts.filepath or "")
        if not filepath.is_file():
            raise PipelineExecutionError(f"Fichier CSV introuvable: {filepath}")
        header = True if opts.header is None else bool(opts.header)
        return read_csv_file(
            filepath,
            delimiter=opts.delimiter,
            encoding=opts.encoding,
            header=header,
        )

    def _read_shapefile(self, step: Step):
        import geopandas as gpd

        filepath = Path(step.options.filepath or "")
        if not filepath.is_file():
            raise PipelineExecutionError(f"Shapefile introuvable: {filepath}")
        return gpd.read_file(filepath)

    def _read_gpkg(self, step: Step):
        filepath = Path(step.options.filepath or "")
        layer = (step.options.layer or "").strip() or None
        return read_gpkg_layer(filepath, layer=layer)

    def _read_geojson(self, step: Step):
        import geopandas as gpd

        filepath = Path(step.options.filepath or "")
        if not filepath.is_file():
            raise PipelineExecutionError(f"GeoJSON introuvable: {filepath}")
        return gpd.read_file(filepath)

    def _filter(self, frame: Frame, step: Step) -> Frame:
        field = step.options.field
        operator = (step.options.operator or "equals").lower()
        value = step.options.value
        if field not in frame.columns:
            raise PipelineExecutionError(f"Colonne `{field}` absente.")
        series = frame[field]
        if operator in {"equals", "eq", "="}:
            mask = series.astype(str) == str(value)
        elif operator in {"contains", "like"}:
            mask = series.astype(str).str.contains(str(value), case=False, na=False)
        elif operator in {"not_equals", "neq", "!="}:
            mask = series.astype(str) != str(value)
        else:
            raise PipelineExecutionError(f"Opérateur non supporté: {operator}")
        return frame.loc[mask].copy()

    def _reproject(self, frame: Frame, step: Step):
        import geopandas as gpd

        target = step.options.target_crs or (
            f"EPSG:{step.options.new_srid}" if step.options.new_srid else "EPSG:4326"
        )
        source = step.options.source_crs or "EPSG:4326"
        if isinstance(frame, gpd.GeoDataFrame):
            gdf = frame
            if gdf.crs is None:
                gdf = gdf.set_crs(source)
        else:
            gdf = self._tabular_to_gdf(frame, source)
        return gdf.to_crs(target)

    @staticmethod
    def _tabular_to_gdf(frame: pd.DataFrame, crs: str):
        try:
            return dataframe_to_geodataframe(frame, crs=crs or None)
        except ValueError as exc:
            raise PipelineExecutionError(
                "Géométrie impossible : colonnes X/Y ou longitude/latitude requises."
            ) from exc

    @staticmethod
    def _spatial_join(left: Frame, right: Frame, step: Step) -> pd.DataFrame:
        import geopandas as gpd

        keys = [k for k in (step.options.join_keys or []) if k]
        if keys:
            return left.merge(right, on=keys, how=step.options.join_type or "inner")

        if not isinstance(left, gpd.GeoDataFrame) or not isinstance(right, gpd.GeoDataFrame):
            raise PipelineExecutionError(
                "Jointure spatiale sans `join_keys` : GeoDataFrame requis des deux côtés."
            )
        how_map = {
            "inner": "inner",
            "left": "left",
            "left_outer": "left",
            "right": "right",
            "right_outer": "right",
        }
        join_type = (step.options.join_type or "inner").lower()
        how = how_map.get(join_type, "inner")
        predicate = (step.options.predicate or "intersects").lower()
        return gpd.sjoin(left, right, how=how, predicate=predicate)

    def _write_file(self, frame: Frame, step: Step) -> str:
        import geopandas as gpd

        filepath = Path(step.options.filepath or "")
        filepath.parent.mkdir(parents=True, exist_ok=True)
        driver = (step.options.driver or "GeoJSON").lower()
        crs = step.options.crs or "EPSG:4326"

        if isinstance(frame, gpd.GeoDataFrame):
            gdf = frame
        else:
            gdf = self._tabular_to_gdf(frame, crs)

        if driver in {"geojson", "json"}:
            gdf.to_file(filepath, driver="GeoJSON")
        elif driver == "csv":
            gdf.drop(columns="geometry", errors="ignore").to_csv(filepath, index=False)
        elif "shape" in driver:
            gdf.to_file(filepath, driver="ESRI Shapefile")
        elif driver == "gpkg":
            gdf.to_file(filepath, driver="GPKG")
        else:
            gdf.to_file(filepath, driver="GeoJSON")
        return str(filepath.resolve())

    @staticmethod
    def validate_geojson(path: Path) -> Dict[str, Any]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("type") != "FeatureCollection":
            raise PipelineExecutionError("GeoJSON invalide (FeatureCollection attendue).")
        features = payload.get("features") or []
        if not features:
            raise PipelineExecutionError("GeoJSON vide.")
        return {"type": payload["type"], "feature_count": len(features)}
