"""Compilation d'un graphe React Flow 4GIx vers une Definition SirenSpark."""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .models import Definition, Properties, Step, StepInput, StepOptions, StepOutput

NODE_TYPE_TO_SIREN: Dict[str, str] = {
    "csv_reader": "CsvReader",
    "csvreader": "CsvReader",
    "shapefile_reader": "ShapefileReader",
    "shapefilereader": "ShapefileReader",
    "attribute_filter": "FilterTransformer",
    "attributefilter": "FilterTransformer",
    "filter_transformer": "FilterTransformer",
    "filtertransformer": "FilterTransformer",
    "filter": "FilterTransformer",
    "reproject": "ReprojectTransformer",
    "reprojector": "ReprojectTransformer",
    "reprojecttransformer": "ReprojectTransformer",
    "spatial_join": "SpatialJoiner",
    "spatialjoiner": "SpatialJoiner",
    "joiner": "SpatialJoiner",
    "file_writer": "FileWriter",
    "filewriter": "FileWriter",
    "shapefile_writer": "FileWriter",
    "geojson_writer": "FileWriter",
    "csv_writer": "FileWriter",
    "jsonfilewriter": "FileWriter",
}

_EPSG_RE = re.compile(r"(?:EPSG:)?\s*(\d+)\s*$", re.IGNORECASE)

_LEFT_HANDLES = {"left", "request", "input_left"}
_RIGHT_HANDLES = {"right", "supplier", "input_right"}


class CompilerError(ValueError):
    """Le graphe React Flow ne peut pas être compilé vers SirenSpark."""


class DagToSirenSparkCompiler:
    """Traduit `{nodes, edges}` 4GIx en `Definition` Pydantic SirenSpark."""

    def compile(
        self,
        graph: Dict[str, Any],
        node_ids: Optional[Sequence[str]] = None,
        name: Optional[str] = None,
    ) -> Definition:
        nodes = list(graph.get("nodes") or [])
        edges = list(graph.get("edges") or [])
        if not nodes:
            raise CompilerError("Le graphe React Flow ne contient aucun nœud.")

        allowed = set(node_ids) if node_ids is not None else None
        selected = [node for node in nodes if allowed is None or node.get("id") in allowed]
        compiled: List[Step] = []
        compiled_ids: set[str] = set()

        for node in selected:
            step = self._node_to_step(node)
            if step is None:
                continue
            compiled.append(step)
            compiled_ids.add(step.id)

        if not compiled:
            raise CompilerError("Aucun nœud du graphe n'est compilable vers SirenSpark.")

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

        properties = Properties(
            name=name or graph.get("name") or "4GIx-SirenSpark",
            description=graph.get("description"),
            parameters=dict(graph.get("parameters") or {}),
        )
        return Definition(properties=properties, trigger="creator", steps=compiled)

    def _node_to_step(self, node: Dict[str, Any]) -> Optional[Step]:
        node_id = str(node.get("id") or "").strip()
        if not node_id:
            raise CompilerError("Chaque nœud React Flow doit posséder un `id`.")
        node_type = self._extract_node_type(node)
        siren_type = self._map_type(node_type)
        if siren_type is None:
            return None
        params = self._extract_params(node)
        options = self._map_options(siren_type, params)
        return Step(id=node_id, type=siren_type, options=options)

    def _map_options(self, siren_type: str, params: Dict[str, Any]) -> StepOptions:
        payload = dict(params)
        filepath = payload.get("filepath") or payload.get("path")
        if filepath:
            payload["filepath"] = self._normalize_filepath(filepath)
            payload.pop("path", None)

        source_srid = self._to_srid(payload.get("source_srid") or payload.get("source_crs"))
        target_srid = self._to_srid(
            payload.get("new_srid") or payload.get("target_srid") or payload.get("target_crs")
        )
        if source_srid is not None:
            payload["source_srid"] = source_srid
            if not payload.get("source_crs"):
                payload["source_crs"] = f"EPSG:{source_srid}"
        if target_srid is not None:
            payload["new_srid"] = target_srid
            if not payload.get("target_crs"):
                payload["target_crs"] = f"EPSG:{target_srid}"

        if siren_type == "FileWriter":
            driver = payload.get("driver") or payload.get("format") or "GeoJSON"
            payload["driver"] = driver
        if siren_type in {"CsvReader", "ShapefileReader", "FileWriter"} and not payload.get("filepath"):
            raise CompilerError(
                f"L'étape `{siren_type}` requiert un chemin de fichier (`path` / `filepath`)."
            )
        if siren_type == "FilterTransformer" and not payload.get("field"):
            raise CompilerError("FilterTransformer requiert le paramètre `field`.")
        return StepOptions.model_validate(payload)

    def _build_input(self, siren_type: str, incoming: List[Dict[str, str]]) -> Optional[StepInput]:
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
            elif handle in {"input", "output", ""}:
                unused.append(source)
            else:
                mapping[handle] = source
        if siren_type == "SpatialJoiner":
            if "left" not in mapping and unused:
                mapping["left"] = unused.pop(0)
            if "right" not in mapping and unused:
                mapping["right"] = unused.pop(0)
        elif unused and "input" not in mapping:
            mapping["input"] = unused[0] if len(unused) == 1 else unused[-1]
        return StepInput.model_validate(mapping) if mapping else None

    @staticmethod
    def _adjacency(
        edges: Iterable[Dict[str, Any]],
        compiled_ids: set[str],
    ) -> tuple[Dict[str, List[str]], Dict[str, List[Dict[str, str]]]]:
        successors: Dict[str, List[str]] = defaultdict(list)
        inbound: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        seen_success: set[tuple[str, str]] = set()
        for edge in edges:
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            if source not in compiled_ids or target not in compiled_ids:
                continue
            key = (source, target)
            if key not in seen_success:
                successors[source].append(target)
                seen_success.add(key)
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
        raw = (
            data.get("nodeType")
            or data.get("node_type")
            or data.get("requestedNodeType")
            or node.get("type")
            or ""
        )
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
        raw = (node_type or "").strip()
        snake = re.sub(r"([a-z])([A-Z])", r"\1_\2", raw).replace("-", "_").lower()
        compact = re.sub(r"[^a-z0-9]", "", snake)
        return NODE_TYPE_TO_SIREN.get(snake) or NODE_TYPE_TO_SIREN.get(compact)

    @staticmethod
    def _normalize_filepath(value: Any) -> str:
        text = str(value).strip().strip('"')
        if not text:
            return text
        return str(Path(text))

    @staticmethod
    def _to_srid(value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        if isinstance(value, int):
            return value
        match = _EPSG_RE.search(str(value).strip())
        if not match:
            return None
        return int(match.group(1))
