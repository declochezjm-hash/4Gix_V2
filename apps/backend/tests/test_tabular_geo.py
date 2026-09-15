"""Géométrie à partir de colonnes X/Y dans les tableaux."""

from __future__ import annotations

import unittest

import pandas as pd

from core.csv_io import tabular_preview
from core.tabular_geo import find_coordinate_columns, infer_crs_from_coordinates


class TabularGeoTests(unittest.TestCase):
    def test_find_xy_columns(self) -> None:
        lon, lat = find_coordinate_columns(["CODE", "X", "Y", "ADRESSE"])
        self.assertEqual(lon, "X")
        self.assertEqual(lat, "Y")

    def test_infer_lambert93(self) -> None:
        frame = pd.DataFrame({"X": [650000.0, 651000.0], "Y": [6860000.0, 6861000.0]})
        self.assertEqual(infer_crs_from_coordinates(frame, "X", "Y"), "EPSG:2154")

    def test_preview_includes_map_geojson(self) -> None:
        frame = pd.DataFrame(
            {
                "id": [1, 2],
                "X": [4.835659, 4.828],
                "Y": [45.764043, 45.758],
            }
        )
        preview = tabular_preview(frame, limit=10)
        self.assertIn("map_geojson", preview)
        fc = preview["map_geojson"]
        self.assertEqual(fc["type"], "FeatureCollection")
        self.assertGreaterEqual(len(fc["features"]), 1)


if __name__ == "__main__":
    unittest.main()
