"""Exécution locale d'une Definition SirenSpark (pandas / GeoPandas, sans réseau)."""

from __future__ import annotations

import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from .models import Definition, Step


class PipelineExecutionError(RuntimeError):
    pass


class DefinitionExecutor:
    """Exécute les étapes compilées et écrit les fichiers de sortie sur disque."""

    def run(self, definition: Definition) -> Dict[str, Any]:
        order = self._execution_order(definition)
        frames: Dict[str, pd.DataFrame] = {}
        written_files: List[str] = []

        for step in order:
            if step.type in {"CsvReader", "CSVReader", "csv_reader"}:
                frames[step.id] = self._read_csv(step)
            elif step.type in {"ShapefileReader", "shapefile_reader"}:
                frames[step.id] = self._read_shapefile(step)
            elif step.type in {"FilterTransformer", "attribute_filter", "filter"}:
                source_id = self._single_input(step)
                frames[step.id] = self._filter(frames[source_id], step)
            elif step.type in {
                "ReprojectTransformer",
                "Reprojector",
                "reproject",
                "reprojector",
            }:
                source_id = self._single_input(step)
                frames[step.id] = frames[source_id].copy()
            elif step.type in {"SpatialJoiner", "Joiner", "spatial_join"}:
                left_id = (step.input.left if step.input else None) or ""
                right_id = (step.input.right if step.input else None) or ""
                frames[step.id] = self._spatial_join(
                    frames[left_id], frames[right_id], step
                )
            elif step.type in {
                "FileWriter",
                "JSONFileWriter",
                "GeoJSONFileWriter",
                "ShapefileWriter",
                "file_writer",
            }:
                source_id = self._single_input(step)
                path = self._write_file(frames[source_id], step)
                written_files.append(path)
                frames[step.id] = frames[source_id]
            else:
                raise PipelineExecutionError(f"Type d'étape non supporté: {step.type}")

        return {
            "status": "COMPLETED",
            "step_count": len(order),
            "written_files": written_files,
            "row_counts": {step_id: len(df) for step_id, df in frames.items()},
        }

    def _execution_order(self, definition: Definition) -> List[Step]:
        steps = {step.id: step for step in definition.steps}
        indegree: Dict[str, int] = {step_id: 0 for step_id in steps}
        successors: Dict[str, List[str]] = defaultdict(list)

        for step in definition.steps:
            for target in (step.output.success if step.output else []):
                if target in steps:
                    successors[step.id].append(target)
                    indegree[target] += 1

        queue = deque([step_id for step_id, degree in indegree.items() if degree == 0])
        order: List[Step] = []
        while queue:
            step_id = queue.popleft()
            order.append(steps[step_id])
            for target in successors[step_id]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)

        if len(order) != len(steps):
            raise PipelineExecutionError("Le graphe SirenSpark contient un cycle ou des nœuds isolés.")
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

    def _read_csv(self, step: Step) -> pd.DataFrame:
        opts = step.options
        filepath = Path(opts.filepath or opts.path or "")
        if not filepath.is_file():
            raise PipelineExecutionError(f"Fichier CSV introuvable: {filepath}")
        delimiter = opts.delimiter or ","
        header = 0 if opts.header else None
        return pd.read_csv(filepath, sep=delimiter, header=header, encoding=opts.encoding or "utf-8")

    def _read_shapefile(self, step: Step) -> pd.DataFrame:
        import geopandas as gpd

        filepath = Path(step.options.filepath or step.options.path or "")
        if not filepath.is_file():
            raise PipelineExecutionError(f"Shapefile introuvable: {filepath}")
        gdf = gpd.read_file(filepath)
        return pd.DataFrame(gdf.drop(columns="geometry", errors="ignore"))

    def _filter(self, frame: pd.DataFrame, step: Step) -> pd.DataFrame:
        field = step.options.field
        operator = (step.options.operator or "equals").lower()
        value = step.options.value
        if field not in frame.columns:
            raise PipelineExecutionError(f"Colonne `{field}` absente du CSV.")
        series = frame[field]
        if operator in {"equals", "eq", "="}:
            mask = series.astype(str) == str(value)
        elif operator in {"contains", "like"}:
            mask = series.astype(str).str.contains(str(value), case=False, na=False)
        elif operator in {"not_equals", "neq", "!="}:
            mask = series.astype(str) != str(value)
        else:
            raise PipelineExecutionError(f"Opérateur de filtre non supporté: {operator}")
        return frame.loc[mask].copy()

    @staticmethod
    def _spatial_join(left: pd.DataFrame, right: pd.DataFrame, step: Step) -> pd.DataFrame:
        keys = step.options.join_keys
        if not keys:
            raise PipelineExecutionError("SpatialJoiner requiert `join_keys`.")
        how = step.options.join_type or "inner"
        return left.merge(right, on=keys, how=how)

    def _write_file(self, frame: pd.DataFrame, step: Step) -> str:
        import geopandas as gpd
        from shapely.geometry import Point

        filepath = Path(step.options.filepath or step.options.path or "")
        filepath.parent.mkdir(parents=True, exist_ok=True)
        driver = (step.options.driver or step.options.format or "GeoJSON").lower()

        lat_col = next((c for c in frame.columns if c.lower() in {"latitude", "lat", "y"}), None)
        lon_col = next((c for c in frame.columns if c.lower() in {"longitude", "lon", "x"}), None)
        if lat_col and lon_col:
            geometry = [
                Point(float(row[lon_col]), float(row[lat_col]))
                for _, row in frame.iterrows()
            ]
            gdf = gpd.GeoDataFrame(frame, geometry=geometry, crs="EPSG:4326")
        else:
            gdf = gpd.GeoDataFrame(frame)

        if driver in {"geojson", "json"}:
            gdf.to_file(filepath, driver="GeoJSON")
        elif driver in {"csv"}:
            gdf.drop(columns="geometry", errors="ignore").to_csv(filepath, index=False)
        elif "shape" in driver:
            gdf.to_file(filepath, driver="ESRI Shapefile")
        else:
            gdf.to_file(filepath, driver="GeoJSON")

        return str(filepath.resolve())

    @staticmethod
    def validate_geojson(path: Path) -> Dict[str, Any]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("type") != "FeatureCollection":
            raise PipelineExecutionError("Le GeoJSON généré n'est pas une FeatureCollection.")
        features = payload.get("features") or []
        if not features:
            raise PipelineExecutionError("Le GeoJSON généré ne contient aucune entité.")
        return {"type": payload["type"], "feature_count": len(features)}
