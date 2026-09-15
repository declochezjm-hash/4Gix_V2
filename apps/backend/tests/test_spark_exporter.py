"""Compatibilité export Spark (filtre + GPKG)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engine.spark.compiler import DagToPipelineCompiler  # noqa: E402
from engine.spark.spark_project_exporter import export_spark_project, is_spark_compatible  # noqa: E402


class SparkExporterTests(unittest.TestCase):
    def test_csv_filter_writer_is_spark_compatible(self) -> None:
        graph = {
            "nodes": [
                {
                    "id": "csv_1",
                    "data": {
                        "nodeType": "csv_reader",
                        "params": {"path": "dataset/eclairage_public.csv", "delimiter": ";"},
                    },
                },
                {
                    "id": "filter_1",
                    "data": {
                        "nodeType": "attribute_filter",
                        "params": {"field": "commune", "operator": "equals", "value": "Lyon"},
                    },
                },
                {
                    "id": "writer_1",
                    "data": {
                        "nodeType": "file_writer",
                        "params": {"path": "dataset/output/out.geojson", "driver": "GeoJSON"},
                    },
                },
            ],
            "edges": [
                {"source": "csv_1", "target": "filter_1"},
                {"source": "filter_1", "target": "writer_1"},
            ],
        }
        definition = DagToPipelineCompiler().compile(graph)
        self.assertTrue(is_spark_compatible(definition))
        project = export_spark_project(definition)
        types = {step["type"] for step in project["steps"]}
        self.assertIn("FilterTransformer", types)
        self.assertIn("CSVReader", types)


if __name__ == "__main__":
    unittest.main()
