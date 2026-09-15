"""Tests WebSocket /api/ws/execute (progression temps réel)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

CSV_PATH = REPO_ROOT / "dataset" / "eclairage_public.csv"


def _minimal_dag() -> dict:
    return {
        "name": "ws-smoke",
        "nodes": [
            {
                "id": "csv_ws",
                "type": "etl",
                "data": {
                    "nodeType": "csv_reader",
                    "params": {
                        "path": str(CSV_PATH),
                        "delimiter": ";",
                        "header": True,
                    },
                },
            },
            {
                "id": "filter_ws",
                "type": "etl",
                "data": {
                    "nodeType": "attribute_filter",
                    "params": {
                        "field": "type_equipement",
                        "operator": "equals",
                        "value": "LED",
                    },
                },
            },
        ],
        "edges": [
            {
                "source": "csv_ws",
                "target": "filter_ws",
                "sourceHandle": "output",
                "targetHandle": "input",
            }
        ],
    }


class WebSocketExecutionTests(unittest.TestCase):
    def test_ws_execute_emits_progress_events(self) -> None:
        if not CSV_PATH.is_file():
            self.skipTest(f"Jeu de données manquant: {CSV_PATH}")

        client = TestClient(main.app)
        events: list[dict] = []

        with client.websocket_connect("/api/ws/execute") as websocket:
            websocket.send_json(_minimal_dag())
            while True:
                message = websocket.receive_json()
                events.append(message)
                if message.get("type") in {"completed", "failed", "error"}:
                    break

        types = [event.get("type") for event in events]
        self.assertIn("started", types)
        self.assertTrue(any(t == "node_running" for t in types))
        self.assertIn("completed", types)

        started = next(e for e in events if e["type"] == "started")
        self.assertEqual(started["payload"]["status"], "RUNNING")

        completed = next(e for e in events if e["type"] == "completed")
        self.assertEqual(completed["payload"]["status"], "COMPLETED")
        self.assertIn("routing", completed["payload"])


if __name__ == "__main__":
    unittest.main()
