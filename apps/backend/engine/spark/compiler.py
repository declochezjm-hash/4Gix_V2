"""Compilation d'un graphe React Flow 4GIx vers une Definition pipeline."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from core.paths import resolve_workspace_path

from .models import Definition, Properties, Step, StepInput, StepOptions, StepOutput

NODE_TYPE_TO_STEP: Dict[str, str] = {
    "csv_reader": "CsvReader",
    "csvreader": "CsvReader",
    "shp_reader": "ShapefileReader",
    "shpreader": "ShapefileReader",
    "shapefile_reader": "ShapefileReader",
    "gpkg_reader": "GpkgReader",
    "gpkgreader": "GpkgReader",
    "geojson_reader": "GeoJsonReader",
    "geojsonreader": "GeoJsonReader",
    "attribute_filter": "FilterTransformer",
    "attributefilter": "FilterTransformer",
    "filter": "FilterTransformer",
    "filter_transformer": "FilterTransformer",
    "reproject": "ReprojectTransformer",
    "reprojector": "ReprojectTransformer",
    "spatial_join": "SpatialJoiner",
    "joiner": "SpatialJoiner",
    "file_writer": "FileWriter",
    "geojson_writer": "FileWriter",
    "shapefile_writer": "FileWriter",
    "csv_writer": "FileWriter",
}

_EPSG_RE = re.compile(r"(?:EPSG:)?\s*(\d+)\s*$", re.IGNORECASE)
_LEFT_HANDLES = {"left", "request", "input_left"}
_RIGHT_HANDLES = {"right", "supplier", "input_right"}


class CompilerError(ValueError):
    pass


class DagToPipelineCompiler:
    def compile(
        self,
        graph: Dict[str, Any],
        node_ids: Optional[Sequence[str]] = None,
        name: Optional[str] = None,
    ) -> Definition:
        nodes = list(graph.get("nodes") or [])
        edges = list(graph.get("edges") or [])
        if not nodes:
            raise CompilerError("Le graphe ne contient aucun nœud.")

        allowed = set(node_ids) if node_ids is not None else None
        selected = [n for n in nodes if allowed is None or n.get("id") in allowed]
        compiled: List[Step] = []
        compiled_ids: set[str] = set()

        for node in selected:
            step = self._node_to_step(node)
            if step is None:
                raise CompilerError(
                    f"Type de nœud non supporté: {self._extract_node_type(node)}"
                )
            compiled.append(step)
            compiled_ids.add(step.id)

        successors, inbound = self._adjacency(edges, compiled_ids)
        for step in compiled:
            step.output = StepOutput(
                success=successors.get(step.id, []),
                error=[],
                output=successors.get(step.id, []),
            )
            incoming = inbound.get(step.id, [])
            if incoming or step.type == "SpatialJoiner":
                step.input = self._build_input(step.type, incoming)

        return Definition(
            properties=Properties(
                name=name or graph.get("name") or "4GIx-workflow",
                description=graph.get("description"),
                parameters=dict(graph.get("parameters") or {}),
            ),
            trigger="creator",
            steps=compiled,
        )

    def _node_to_step(self, node: Dict[str, Any]) -> Optional[Step]:
        node_id = str(node.get("id") or "").strip()
        if not node_id:
            raise CompilerError("Chaque nœud doit posséder un `id`.")
        step_type = self._map_type(self._extract_node_type(node))
        if not step_type:
            return None
        options = self._map_options(step_type, self._extract_params(node))
        return Step(id=node_id, type=step_type, options=options)

    def _map_options(self, step_type: str, params: Dict[str, Any]) -> StepOptions:
        payload = dict(params)
        condition = payload.pop("condition", None)
        if isinstance(condition, dict):
            payload.setdefault("field", condition.get("field"))
            payload.setdefault("operator", condition.get("operator"))
            payload.setdefault("value", condition.get("value"))

        filepath = payload.get("filepath") or payload.get("path")
        if filepath:
            payload["filepath"] = self._normalize_filepath(filepath)
            payload.pop("path", None)
        zip_path = payload.get("zip_path")
        if zip_path:
            try:
                payload["zip_path"] = str(self._normalize_filepath(zip_path))
            except ValueError:
                payload["zip_path"] = str(zip_path).strip()

        source_srid = self._to_srid(payload.get("source_srid") or payload.get("source_crs"))
        target_srid = self._to_srid(
            payload.get("new_srid") or payload.get("target_srid") or payload.get("target_crs")
        )
        if source_srid is not None:
            payload["source_srid"] = source_srid
            payload.setdefault("source_crs", f"EPSG:{source_srid}")
        if target_srid is not None:
            payload["new_srid"] = target_srid
            payload.setdefault("target_crs", f"EPSG:{target_srid}")

        if step_type == "FileWriter":
            payload["driver"] = payload.get("driver") or payload.get("format") or "GeoJSON"

        readers = {"CsvReader", "ShapefileReader", "GpkgReader", "GeoJsonReader", "FileWriter"}
        if step_type in readers and not payload.get("filepath"):
            raise CompilerError(f"L'étape `{step_type}` requiert `path` / `filepath`.")
        if step_type == "FilterTransformer" and not payload.get("field"):
            raise CompilerError("Le filtre requiert `field` ou `condition.field`.")
        return StepOptions.model_validate(payload)

    def _build_input(self, step_type: str, incoming: List[Dict[str, str]]) -> Optional[StepInput]:
        if not incoming:
            return None
        mapping: Dict[str, str] = {}
        unused: List[str] = []
        for edge in incoming:
            handle = (edge.get("targetHandle") or "input").lower()
            source = edge["source"]
            if handle in _LEFT_HANDLES:
                mapping["left"] = source
            elif handle in _RIGHT_HANDLES:
                mapping["right"] = source
            else:
                unused.append(source)
        if step_type == "SpatialJoiner":
            if "left" not in mapping and unused:
                mapping["left"] = unused.pop(0)
            if "right" not in mapping and unused:
                mapping["right"] = unused.pop(0)
        elif unused:
            mapping["input"] = unused[-1]
        return StepInput.model_validate(mapping) if mapping else None

    @staticmethod
    def _adjacency(edges: Iterable[Dict[str, Any]], compiled_ids: set[str]):
        successors: Dict[str, List[str]] = defaultdict(list)
        inbound: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        seen: set[tuple[str, str]] = set()
        for edge in edges:
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            if source not in compiled_ids or target not in compiled_ids:
                continue
            if (source, target) not in seen:
                successors[source].append(target)
                seen.add((source, target))
            inbound[target].append(
                {
                    "source": source,
                    "targetHandle": str(edge.get("targetHandle") or "input"),
                    "sourceHandle": str(edge.get("sourceHandle") or "output"),
                }
            )
        return dict(successors), dict(inbound)

    @staticmethod
    def _extract_node_type(node: Dict[str, Any]) -> str:
        data = node.get("data") or {}
        raw = data.get("nodeType") or data.get("node_type") or node.get("type") or ""
        if raw == "etl":
            raw = data.get("nodeType") or ""
        return str(raw).strip()

    @staticmethod
    def _extract_params(node: Dict[str, Any]) -> Dict[str, Any]:
        data = node.get("data") or {}
        params = node.get("params")
        if params is None:
            params = data.get("params") or {}
        return dict(params)

    @staticmethod
    def _map_type(node_type: str) -> Optional[str]:
        snake = re.sub(r"([a-z])([A-Z])", r"\1_\2", (node_type or "").strip()).replace("-", "_").lower()
        compact = re.sub(r"[^a-z0-9]", "", snake)
        return NODE_TYPE_TO_STEP.get(snake) or NODE_TYPE_TO_STEP.get(compact)

    @staticmethod
    def _normalize_filepath(value: Any) -> str:
        raw = str(value).strip().strip('"')
        if raw.startswith("/workspace/"):
            return str(resolve_workspace_path(raw))
        path = Path(raw)
        if not path.is_absolute():
            try:
                return str(resolve_workspace_path(raw))
            except ValueError:
                pass
        return str(path)

    @staticmethod
    def _to_srid(value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        if isinstance(value, int):
            return value
        match = _EPSG_RE.search(str(value).strip())
        return int(match.group(1)) if match else None
