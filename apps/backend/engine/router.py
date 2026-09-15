"""Routeur d'exécution hybride : SirenSpark (Spark/Sedona) vs moteur natif 4GIx."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set

from .sirenspark.compiler import CompilerError, DagToSirenSparkCompiler
from .sirenspark.executor import DefinitionExecutor, PipelineExecutionError
from .sirenspark.models import Definition

ENGINE_SIRENSPARK = "sirenspark"
ENGINE_NATIVE = "native"

# Nœuds exécutés localement (GeoPandas/GDAL, raster, agents IA).
NATIVE_NODE_TYPES: Set[str] = {
    "gpkg_reader",
    "gpkg_writer",
    "geotiff_reader",
    "raster_clipper",
    "zonal_statistics",
    "dxf_reader",
    "ifc_reader",
    "kml_reader",
    "excel_reader",
    "rest_wfs_reader",
    "auto_architect_agent",
    "composer_agent",
    "direct_agent_processor",
    "python_caller",
    "code_node",
}

# Nœuds compilables / exécutables par Spark + Sedona.
SIRENSPARK_NODE_TYPES: Set[str] = {
    "csv_reader",
    "shapefile_reader",
    "geojson_reader",
    "attribute_filter",
    "filter",
    "filter_transformer",
    "reproject",
    "reprojector",
    "spatial_join",
    "joiner",
    "file_writer",
    "shapefile_writer",
    "geojson_writer",
    "csv_writer",
    "postgis_reader",
    "postgis_writer",
}


def _normalize_node_type(node_type: str) -> str:
    key = (node_type or "").strip().replace("-", "_")
    key = re.sub(r"([a-z])([A-Z])", r"\1_\2", key)
    return key.lower()


def _extract_node_type(node: Dict[str, Any]) -> str:
    data = node.get("data") or {}
    raw = data.get("nodeType") or data.get("node_type") or node.get("type") or ""
    if raw == "etl":
        raw = data.get("nodeType") or ""
    return _normalize_node_type(str(raw))


def _extract_engine_override(node: Dict[str, Any]) -> Optional[str]:
    data = node.get("data") or {}
    params = node.get("params") or data.get("params") or {}
    override = params.get("_engine") or data.get("engine")
    if not override:
        return None
    value = str(override).strip().lower()
    if value in {ENGINE_SIRENSPARK, ENGINE_NATIVE}:
        return value
    return None


@dataclass
class RoutingPlan:
    """Résultat de l'analyse moteur par nœud."""

    assignments: Dict[str, str] = field(default_factory=dict)
    sirenspark_nodes: List[str] = field(default_factory=list)
    native_nodes: List[str] = field(default_factory=list)

    def engine_for(self, node_id: str) -> str:
        return self.assignments.get(node_id, ENGINE_NATIVE)


class SirenSparkEngine:
    """Exécuteur Spark/Sedona (compilation + exécution locale du pipeline)."""

    def __init__(self, executor: Optional[DefinitionExecutor] = None) -> None:
        self.executor = executor or DefinitionExecutor()

    def execute(self, definition: Definition, graph: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        try:
            result = self.executor.run(definition)
        except PipelineExecutionError as exc:
            return {
                "engine": ENGINE_SIRENSPARK,
                "status": "FAILED",
                "error": str(exc),
                "definition": definition.model_dump(),
            }
        return {
            "engine": ENGINE_SIRENSPARK,
            "status": result.get("status", "COMPLETED"),
            "step_count": len(definition.steps),
            "definition": definition.model_dump(),
            "written_files": result.get("written_files") or [],
            "row_counts": result.get("row_counts") or {},
        }


class NativeEngine:
    """Exécuteur local 4GIx (GPKG, rasters, agents). Stub jusqu'au Recflow natif."""

    def execute(
        self,
        graph: Dict[str, Any],
        node_ids: Optional[Sequence[str]] = None,
    ) -> Dict[str, Any]:
        ids = list(node_ids) if node_ids is not None else [
            str(node.get("id")) for node in (graph.get("nodes") or []) if node.get("id")
        ]
        return {
            "engine": ENGINE_NATIVE,
            "status": "READY",
            "node_ids": ids,
            "node_count": len(ids),
        }


class EngineRouter:
    """Analyse un DAG 4GIx, compile le sous-graphe Spark et aiguille l'exécution."""

    def __init__(
        self,
        compiler: Optional[DagToSirenSparkCompiler] = None,
        sirenspark_engine: Optional[SirenSparkEngine] = None,
        native_engine: Optional[NativeEngine] = None,
    ) -> None:
        self.compiler = compiler or DagToSirenSparkCompiler()
        self.sirenspark_engine = sirenspark_engine or SirenSparkEngine()
        self.native_engine = native_engine or NativeEngine()

    def analyze(self, graph: Dict[str, Any]) -> RoutingPlan:
        plan = RoutingPlan()
        for node in graph.get("nodes") or []:
            node_id = str(node.get("id") or "").strip()
            if not node_id:
                continue
            engine = self._resolve_engine(node)
            plan.assignments[node_id] = engine
            if engine == ENGINE_SIRENSPARK:
                plan.sirenspark_nodes.append(node_id)
            else:
                plan.native_nodes.append(node_id)
        return plan

    def execute_dag(self, graph: Dict[str, Any]) -> Dict[str, Any]:
        """Compile le sous-graphe SirenSpark et délègue chaque segment à son exécuteur."""
        plan = self.analyze(graph)
        results: List[Dict[str, Any]] = []
        definition: Optional[Definition] = None
        errors: List[str] = []

        if plan.sirenspark_nodes:
            try:
                definition = self.compiler.compile(graph, node_ids=plan.sirenspark_nodes)
                results.append(self.sirenspark_engine.execute(definition, graph))
            except CompilerError as exc:
                errors.append(str(exc))
                results.append(
                    {
                        "engine": ENGINE_SIRENSPARK,
                        "status": "FAILED",
                        "error": str(exc),
                    }
                )

        if plan.native_nodes:
            results.append(self.native_engine.execute(graph, node_ids=plan.native_nodes))

        status = "FAILED" if errors else "ROUTED"
        if not plan.sirenspark_nodes and not plan.native_nodes:
            status = "EMPTY"
        for item in results:
            if item.get("engine") == ENGINE_SIRENSPARK and item.get("status") == "FAILED":
                status = "FAILED"
                errors.append(str(item.get("error") or "Échec SirenSpark"))
            if item.get("engine") == ENGINE_SIRENSPARK and item.get("status") == "COMPLETED":
                status = "ROUTED"

        return {
            "status": status,
            "routing": {
                "assignments": plan.assignments,
                "sirenspark_nodes": plan.sirenspark_nodes,
                "native_nodes": plan.native_nodes,
            },
            "definition": definition.model_dump() if definition else None,
            "results": results,
            "errors": errors,
        }

    def _resolve_engine(self, node: Dict[str, Any]) -> str:
        override = _extract_engine_override(node)
        if override:
            return override
        node_type = _extract_node_type(node)
        compact = node_type.replace("_", "")
        if node_type in NATIVE_NODE_TYPES or compact in {item.replace("_", "") for item in NATIVE_NODE_TYPES}:
            return ENGINE_NATIVE
        if node_type in SIRENSPARK_NODE_TYPES or compact in {
            item.replace("_", "") for item in SIRENSPARK_NODE_TYPES
        }:
            return ENGINE_SIRENSPARK
        if node_type.endswith("_agent"):
            return ENGINE_NATIVE
        if "raster" in node_type or node_type.startswith("gpkg"):
            return ENGINE_NATIVE
        return ENGINE_NATIVE
