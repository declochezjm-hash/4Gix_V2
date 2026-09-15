"""Tests de compilation React Flow 4GIx → Definition pipeline."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engine.spark.compiler import DagToPipelineCompiler  # noqa: E402
from engine.spark.models import Definition  # noqa: E402


def _sample_csv_filter_writer_graph() -> dict:
    return {
        "name": "csv-filter-writer",
        "nodes": [
            {
                "id": "csv_1",
                "type": "etl",
                "data": {
                    "label": "CSV",
                    "nodeType": "csv_reader",
                    "params": {
                        "path": r"D:\data\input.csv",
                        "header": True,
                        "delimiter": ";",
                    },
                },
            },
            {
                "id": "filter_1",
                "type": "etl",
                "data": {
                    "label": "Filtre",
                    "nodeType": "attribute_filter",
                    "params": {
                        "field": "statut",
                        "operator": "equals",
                        "value": "actif",
                    },
                },
            },
            {
                "id": "writer_1",
                "type": "etl",
                "data": {
                    "label": "Export",
                    "nodeType": "file_writer",
                    "params": {
                        "path": r"D:\data\output.geojson",
                        "driver": "GeoJSON",
                    },
                },
            },
        ],
        "edges": [
            {
                "id": "e1",
                "source": "csv_1",
                "target": "filter_1",
                "sourceHandle": "output",
                "targetHandle": "input",
            },
            {
                "id": "e2",
                "source": "filter_1",
                "target": "writer_1",
                "sourceHandle": "output",
                "targetHandle": "input",
            },
        ],
    }


class DagToPipelineCompilerTests(unittest.TestCase):
    def test_compile_csv_filter_filewriter(self) -> None:
        compiler = DagToPipelineCompiler()
        definition = compiler.compile(_sample_csv_filter_writer_graph())

        self.assertIsInstance(definition, Definition)
        self.assertEqual(definition.trigger, "creator")
        self.assertEqual(len(definition.steps), 3)

        by_id = {step.id: step for step in definition.steps}
        self.assertEqual(set(by_id), {"csv_1", "filter_1", "writer_1"})

        csv_step = by_id["csv_1"]
        self.assertEqual(csv_step.type, "CsvReader")
        self.assertEqual(csv_step.options.filepath, str(Path(r"D:\data\input.csv")))
        self.assertIsNone(csv_step.options.path)
        self.assertEqual(csv_step.output.success, ["filter_1"])

        filter_step = by_id["filter_1"]
        self.assertEqual(filter_step.type, "FilterTransformer")
        self.assertEqual(filter_step.options.field, "statut")
        self.assertEqual(filter_step.options.operator, "equals")
        self.assertEqual(filter_step.options.value, "actif")
        self.assertEqual(filter_step.output.success, ["writer_1"])

        writer_step = by_id["writer_1"]
        self.assertEqual(writer_step.type, "FileWriter")
        self.assertEqual(writer_step.options.filepath, str(Path(r"D:\data\output.geojson")))
        self.assertEqual(writer_step.options.driver, "GeoJSON")
        self.assertEqual(writer_step.output.success, [])

        typed = definition.typed_steps()
        self.assertEqual([step.__class__.__name__ for step in typed], [
            "CsvReader",
            "FilterTransformer",
            "FileWriter",
        ])


if __name__ == "__main__":
    unittest.main()
