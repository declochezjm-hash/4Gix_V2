"""Lecture GeoPackage (moteur natif GDAL / GeoPandas)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import geopandas as gpd


def read_gpkg_layer(path: Path, layer: Optional[str] = None) -> gpd.GeoDataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"GeoPackage introuvable: {path}")
    if layer:
        return gpd.read_file(path, layer=layer)
    import fiona

    layers = fiona.listlayers(path)
    if not layers:
        raise ValueError(f"Aucune couche dans {path}")
    return gpd.read_file(path, layer=layers[0])
