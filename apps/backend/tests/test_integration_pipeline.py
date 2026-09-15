"""Tests d'intégration E2E du pipeline CSV → filtre → GeoJSON (sans réseau)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engine.router import EngineRouter  # noqa: E402
from engine.spark.pipeline_executor import PipelineExecutor  # noqa: E402

DATASET_DIR = REPO_ROOT / "dataset"
CSV_PATH = DATASET_DIR / "eclairage_public.csv"
OUTPUT_DIR = DATASET_DIR / "output"
OUTPUT_GEOJSON = OUTPUT_DIR / "eclairage_lyon.geojson"


class FullPipelineIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not CSV_PATH.is_file():
            raise unittest.SkipTest(f"Jeu de données manquant: {CSV_PATH}")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if OUTPUT_GEOJSON.is_file():
            OUTPUT_GEOJSON.unlink()

    def _build_dag(self) -> dict:
        return {
            "name": "eclairage-lyon-export",
            "nodes": [
                {
                    "id": "csv_1",
                    "type": "etl",
                    "data": {
                        "label": "Éclairage public",
                        "nodeType": "csv_reader",
                        "params": {
                            "path": str(CSV_PATH),
                            "delimiter": ";",
                            "header": True,
                        },
                    },
                },
                {
                    "id": "filter_1",
                    "type": "etl",
                    "data": {
                        "label": "Filtre Lyon",
                        "nodeType": "attribute_filter",
                        "params": {
                            "field": "commune",
                            "operator": "equals",
                            "value": "Lyon",
                        },
                    },
                },
                {
                    "id": "writer_1",
                    "type": "etl",
                    "data": {
                        "label": "Export GeoJSON",
                        "nodeType": "file_writer",
                        "params": {
                            "path": str(OUTPUT_GEOJSON),
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

    def test_full_csv_to_geojson_pipeline(self) -> None:
        router = EngineRouter()
        result = router.execute_dag(self._build_dag())

        self.assertEqual(result["status"], "ROUTED")
        self.assertIsNotNone(result["definition"])
        self.assertEqual(result["errors"], [])

        pipeline_result = next(
            item for item in result["results"] if item.get("engine") == "pipeline"
        )
        self.assertEqual(pipeline_result["status"], "COMPLETED")
        self.assertIn(str(OUTPUT_GEOJSON.resolve()), [
            str(Path(p).resolve()) for p in pipeline_result.get("written_files") or []
        ])

        self.assertTrue(OUTPUT_GEOJSON.is_file(), "Le fichier GeoJSON de sortie doit exister.")
        summary = PipelineExecutor.validate_geojson(OUTPUT_GEOJSON)
        self.assertEqual(summary["type"], "FeatureCollection")
        self.assertGreaterEqual(summary["feature_count"], 1)

        payload = json.loads(OUTPUT_GEOJSON.read_text(encoding="utf-8"))
        communes = {
            (feature.get("properties") or {}).get("commune")
            for feature in payload.get("features") or []
        }
        self.assertEqual(communes, {"Lyon"})
        self.assertGreaterEqual(len(payload["features"]), 5)


if __name__ == "__main__":
    unittest.main()
