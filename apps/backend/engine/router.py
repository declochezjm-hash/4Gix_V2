"""Orchestration des workflows DAG 4GIx (compilation + exécution)."""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Callable, Dict, List, Optional, Set

from .spark.compiler import CompilerError, DagToPipelineCompiler
from .spark.pipeline_executor import PipelineExecutionError, PipelineExecutor
from .spark.spark_project_exporter import is_spark_compatible
from .spark.spark_runtime_executor import SparkRuntimeExecutionError, SparkRuntimeExecutor

logger = logging.getLogger(__name__)

ENGINE_DISTRIBUTED = "distributed"
ENGINE_NATIVE = "native"

NATIVE_NODE_TYPES: Set[str] = {
    "geotiff_reader",
    "raster_clipper",
    "auto_architect_agent",
    "composer_agent",
    "direct_agent_processor",
    "python_caller",
    "code_node",
}

DISTRIBUTED_NODE_TYPES: Set[str] = {
    "csv_reader",
    "shp_reader",
    "shapefile_reader",
    "gpkg_reader",
    "geojson_reader",
    "excel_reader",
    "kml_reader",
    "dxf_reader",
    "attribute_filter",
    "filter",
    "filter_transformer",
    "reproject",
    "reprojector",
    "spatial_join",
    "joiner",
    "file_writer",
}

NodeEventCallback = Callable[[str, str, Optional[Dict[str, Any]]], None]


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


class EngineRouter:
    """Compile et exécute un graphe React Flow de bout en bout."""

    def __init__(
        self,
        compiler: Optional[DagToPipelineCompiler] = None,
        executor: Optional[PipelineExecutor] = None,
        spark_executor: Optional[SparkRuntimeExecutor] = None,
    ) -> None:
        self.compiler = compiler or DagToPipelineCompiler()
        self.executor = executor or PipelineExecutor()
        self.spark_executor = spark_executor or SparkRuntimeExecutor()
        self.spark_mode = os.environ.get("FOURGIX_SPARK_ENGINE", "auto").lower()

    def analyze(self, graph: Dict[str, Any]) -> Dict[str, Any]:
        assignments: Dict[str, str] = {}
        distributed: List[str] = []
        native: List[str] = []
        for node in graph.get("nodes") or []:
            node_id = str(node.get("id") or "").strip()
            if not node_id:
                continue
            ntype = _extract_node_type(node)
            engine = (
                ENGINE_NATIVE
                if ntype in NATIVE_NODE_TYPES or ntype.endswith("_agent")
                else ENGINE_DISTRIBUTED
            )
            assignments[node_id] = engine
            (native if engine == ENGINE_NATIVE else distributed).append(node_id)
        return {
            "assignments": assignments,
            "distributed_nodes": distributed,
            "native_nodes": native,
        }

    def execute_dag(
        self,
        graph: Dict[str, Any],
        on_node_event: Optional[NodeEventCallback] = None,
    ) -> Dict[str, Any]:
        started = time.perf_counter()
        routing = self.analyze(graph)
        errors: List[str] = []
        unsupported = [
            nid
            for nid in routing["native_nodes"]
            if _extract_node_type(self._node_by_id(graph, nid) or {}) in NATIVE_NODE_TYPES
        ]
        if unsupported:
            errors.append(
                f"Nœuds non encore implémentés: {', '.join(unsupported)}"
            )
            return self._failed(routing, errors, started)

        definition = None
        try:
            definition = self.compiler.compile(graph)
            engine_name, result = self._run_definition(definition, on_node_event)
        except (CompilerError, PipelineExecutionError, SparkRuntimeExecutionError) as exc:
            errors.append(str(exc))
            return self._failed(routing, errors, started, definition=definition)

        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "status": "ROUTED",
            "duration_ms": duration_ms,
            "routing": routing,
            "definition": definition.model_dump(),
            "results": [
                {
                    "engine": engine_name,
                    "status": result.get("status"),
                    "written_files": result.get("written_files") or [],
                    "row_counts": result.get("row_counts") or {},
                }
            ],
            "snapshots": result.get("snapshots") or [],
            "errors": [],
        }

    def _run_definition(
        self,
        definition: Any,
        on_node_event: Optional[NodeEventCallback],
    ) -> tuple[str, Dict[str, Any]]:
        use_spark = self.spark_mode in {"1", "true", "always", "spark"}
        compatible = is_spark_compatible(definition)
        if self.spark_mode == "never":
            return "pipeline", self.executor.run(definition, on_node_event=on_node_event)
        if use_spark or (self.spark_mode == "auto" and compatible):
            try:
                return "spark_runtime", self.spark_executor.run(
                    definition, on_node_event=on_node_event
                )
            except SparkRuntimeExecutionError as exc:
                if use_spark:
                    raise
                logger.warning("Spark indisponible, repli GeoPandas: %s", exc)
        return "pipeline", self.executor.run(definition, on_node_event=on_node_event)

    @staticmethod
    def _node_by_id(graph: Dict[str, Any], node_id: str) -> Optional[Dict[str, Any]]:
        for node in graph.get("nodes") or []:
            if str(node.get("id")) == node_id:
                return node
        return None

    @staticmethod
    def _failed(
        routing: Dict[str, Any],
        errors: List[str],
        started: float,
        definition: Any = None,
    ) -> Dict[str, Any]:
        return {
            "status": "FAILED",
            "duration_ms": round((time.perf_counter() - started) * 1000, 3),
            "routing": routing,
            "definition": definition.model_dump() if definition else None,
            "results": [],
            "snapshots": [],
            "errors": errors,
        }
