"""Détection séparateur CSV et prévisualisation tabulaire."""

from __future__ import annotations

import unittest
from pathlib import Path

from core.csv_io import detect_csv_delimiter, read_csv_file, tabular_preview

REPO_ROOT = Path(__file__).resolve().parents[3]
CSV_PATH = REPO_ROOT / "dataset" / "eclairage_public.csv"


class CsvIoTests(unittest.TestCase):
    def test_detect_semicolon_delimiter(self) -> None:
        if not CSV_PATH.is_file():
            self.skipTest(f"Dataset manquant: {CSV_PATH}")
        self.assertEqual(detect_csv_delimiter(CSV_PATH, "utf-8-sig"), ";")

    def test_read_without_explicit_delimiter(self) -> None:
        if not CSV_PATH.is_file():
            self.skipTest(f"Dataset manquant: {CSV_PATH}")
        frame = read_csv_file(CSV_PATH, delimiter="", encoding="")
        self.assertGreater(len(frame.columns), 1)
        self.assertIn("commune", frame.columns)

    def test_tabular_preview_includes_records(self) -> None:
        if not CSV_PATH.is_file():
            self.skipTest(f"Dataset manquant: {CSV_PATH}")
        frame = read_csv_file(CSV_PATH, delimiter=";")
        preview = tabular_preview(frame, limit=5)
        self.assertEqual(preview["row_count"], len(frame))
        self.assertGreater(len(preview["records"]), 0)
        self.assertIn("commune", preview["records"][0])


if __name__ == "__main__":
    unittest.main()
