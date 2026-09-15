"""Exécution via le moteur vendu (référence D:\\CODE\\4gix V02\\SirenSpark-master)."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .models import Definition
from .spark_project_exporter import export_spark_project

logger = logging.getLogger(__name__)

NodeEventCallback = Callable[[str, str, Optional[Dict[str, Any]]], None]

_VENDOR_ENGINE = (
    Path(__file__).resolve().parents[2] / "vendor" / "spark_runtime" / "engine"
)
_RUNTIME_MAIN = _VENDOR_ENGINE / "main.py"


class SparkRuntimeExecutionError(RuntimeError):
    pass


class SparkRuntimeExecutor:
    """Lance le Runner Spark/Sedona du runtime vendu (sous-processus)."""

    def run(
        self,
        definition: Definition,
        on_node_event: Optional[NodeEventCallback] = None,
    ) -> Dict[str, Any]:
        if not _RUNTIME_MAIN.is_file():
            raise SparkRuntimeExecutionError(
                f"Moteur Spark introuvable: {_RUNTIME_MAIN}"
            )

        project = export_spark_project(definition)
        for step in definition.steps:
            if on_node_event:
                on_node_event(step.id, "RUNNING", None)

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            delete=False,
            encoding="utf-8",
        ) as handle:
            json.dump(project, handle, ensure_ascii=False, indent=2)
            project_path = handle.name

        backend_root = _VENDOR_ENGINE.parents[1]
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join([str(_VENDOR_ENGINE), str(backend_root)])
        try:
            completed = subprocess.run(
                [sys.executable, str(_RUNTIME_MAIN), project_path],
                cwd=str(_VENDOR_ENGINE),
                env=env,
                capture_output=True,
                text=True,
                timeout=int(os.environ.get("FOURGIX_SPARK_TIMEOUT_SEC", "600")),
            )
        finally:
            Path(project_path).unlink(missing_ok=True)

        log_tail = (completed.stdout or "")[-4000:] + (completed.stderr or "")[-4000:]
        if completed.returncode != 0:
            raise SparkRuntimeExecutionError(
                f"Échec moteur Spark (code {completed.returncode}).\n{log_tail}"
            )

        snapshots = []
        for step in definition.steps:
            snapshot = {
                "node_id": step.id,
                "node_type": step.type,
                "status": "COMPLETED",
                "duration_ms": 0,
                "metadata": {"engine": "spark_runtime", "log_tail": log_tail[-500:]},
            }
            snapshots.append(snapshot)
            if on_node_event:
                on_node_event(step.id, "COMPLETED", snapshot)

        written = []
        for step in definition.steps:
            if step.type == "FileWriter" and step.options.filepath:
                written.append(step.options.filepath)

        return {
            "status": "COMPLETED",
            "step_count": len(definition.steps),
            "written_files": written,
            "row_counts": {},
            "snapshots": snapshots,
            "spark_log": log_tail,
        }
