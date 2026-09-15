"""Découverte des JARs Sedona / GeoTools pour le runtime Spark."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_VENDOR_ROOT = _BACKEND_ROOT / "vendor" / "spark_runtime"
_REPO_JARS = _BACKEND_ROOT.parents[1] / "jars"


def jar_directories() -> List[Path]:
    extra = os.environ.get("FOURGIX_SPARK_JARS", "").strip()
    candidates = [
        Path(extra) if extra else None,
        _VENDOR_ROOT / "jars",
        _REPO_JARS,
        _BACKEND_ROOT / "jars",
    ]
    return [path for path in candidates if path and path.is_dir()]


def discover_jar_paths() -> List[str]:
    jars: List[str] = []
    for directory in jar_directories():
        jars.extend(str(p) for p in sorted(directory.glob("*.jar")))
    return jars
