"""Lecture GeoPackage via GeoPandas → GeoJSON temporaire (extension 4GIx)."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

import geopandas as gpd

from model_base import BaseStep
from readers.geojson_reader import GeoJSONReader


class GpkgReaderStep(BaseStep):
    type = "GpkgReader"
    options: Dict[str, Any] = {
        "filepath": str,
        "layer": Optional[str],
    }


class GpkgReader:
    def __init__(self, filepath: str, layer: Optional[str] = None) -> None:
        self.filepath = filepath
        self.layer = (layer or "").strip() or None

    def run(self):
        path = Path(self.filepath)
        if not path.is_file():
            return False, False, "error"
        try:
            gdf = gpd.read_file(path, layer=self.layer)
        except Exception:
            return False, False, "error"
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as handle:
            tmp = Path(handle.name)
        gdf.to_file(tmp, driver="GeoJSON")
        return GeoJSONReader(str(tmp)).run()
