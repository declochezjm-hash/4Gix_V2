"""Conversion Definition 4GIx → projet JSON moteur Spark (référence SirenSpark-master)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Set  # noqa: F401 used in _epsg_code

from core.csv_io import effective_csv_delimiter, resolve_csv_encoding

from .models import Definition, Step

_STEP_TYPE_MAP = {
    "CsvReader": "CSVReader",
    "ShapefileReader": "ShapefileReader",
    "GeoJsonReader": "GeoJSONReader",
    "GpkgReader": "GpkgReader",
    "FilterTransformer": "FilterTransformer",
    "ReprojectTransformer": "Reprojector",
    "SpatialJoiner": "Joiner",
    "FileWriter": "GeoJSONFileWriter",
}

_UNSUPPORTED: set[str] = set()


def spark_supported_step_types() -> Set[str]:
    return set(_STEP_TYPE_MAP) | {"creator"}


def is_spark_compatible(definition: Definition) -> bool:
    for step in definition.steps:
        if step.type in _UNSUPPORTED:
            return False
        if step.type not in _STEP_TYPE_MAP:
            return False
    return len(definition.steps) > 0


def _epsg_code(value: Any) -> str:
    if value is None:
        return "4326"
    text = str(value).strip().upper()
    if text.startswith("EPSG:"):
        return text.split(":", 1)[1]
    return text


def _entry_nodes(definition: Definition) -> List[str]:
    referenced: Set[str] = set()
    for step in definition.steps:
        if step.output and step.output.success:
            referenced.update(step.output.success)
    return [step.id for step in definition.steps if step.id not in referenced]


def _to_spark_step(step: Step) -> Dict[str, Any]:
    spark_type = _STEP_TYPE_MAP[step.type]
    options = dict(step.options.model_dump(exclude_none=True))
    if step.type == "CsvReader":
        filepath = Path(options.get("filepath") or "")
        if filepath.is_file() and not str(options.get("delimiter") or "").strip():
            enc = resolve_csv_encoding(options.get("encoding"))
            options["delimiter"] = effective_csv_delimiter(
                options.get("delimiter"), filepath, enc
            )
    if step.type == "FileWriter":
        driver = (options.get("driver") or "GeoJSON").lower()
        spark_type = "GeoJSONFileWriter" if "geo" in driver or driver == "json" else "JSONFileWriter"
    if step.type == "ReprojectTransformer":
        options["column_name"] = options.get("column_name") or "geometry"
        options["source_srid"] = _epsg_code(
            options.get("source_srid") or options.get("source_crs")
        )
        options["new_srid"] = _epsg_code(
            options.get("new_srid") or options.get("target_crs")
        )
        options.pop("source_crs", None)
        options.pop("target_crs", None)
    payload: Dict[str, Any] = {
        "id": step.id,
        "type": spark_type,
        "options": options,
        "output": {
            "success": list(step.output.success if step.output else []),
            "error": list(step.output.error if step.output else []),
        },
    }
    if step.input:
        input_dict: Dict[str, Any] = {}
        if step.input.input:
            input_dict["input"] = step.input.input
        if step.input.left:
            input_dict["left"] = step.input.left
        if step.input.right:
            input_dict["right"] = step.input.right
        if input_dict:
            payload["input"] = input_dict
    return payload


def export_spark_project(definition: Definition) -> Dict[str, Any]:
    if not is_spark_compatible(definition):
        raise ValueError("Workflow incompatible avec le moteur Spark distribué.")
    entries = _entry_nodes(definition)
    first_ids = entries or ([definition.steps[0].id] if definition.steps else [])
    return {
        "properties": definition.properties.model_dump(),
        "trigger": {
            "id": "creator_4gix",
            "type": "creator",
            "output": {"success": first_ids, "error": []},
        },
        "steps": [_to_spark_step(step) for step in definition.steps],
    }
