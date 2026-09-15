"""Tests téléversement /api/v1/upload."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app  # noqa: E402

REPO_ROOT = BACKEND_ROOT.parents[1]
CSV_PATH = REPO_ROOT / "dataset" / "eclairage_public.csv"


class UploadApiTests(unittest.TestCase):
    def test_upload_csv_creates_workspace_file(self) -> None:
        if not CSV_PATH.is_file():
            self.skipTest(f"Dataset manquant: {CSV_PATH}")
        client = TestClient(app)
        with CSV_PATH.open("rb") as handle:
            response = client.post(
                "/api/v1/upload",
                files={"file": ("eclairage_public.csv", handle, "text/csv")},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["detected_type"], "csv")
        self.assertTrue(body["workspace_path"].startswith("/workspace/uploads/"))
        self.assertEqual(body["suggested_node"]["node_type"], "csv_reader")
        stored = Path(body["filepath"])
        self.assertTrue(stored.is_file())


if __name__ == "__main__":
    unittest.main()
