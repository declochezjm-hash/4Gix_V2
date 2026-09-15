# Pipeline ETL backend 4GIx V02

## Vue d'ensemble

Le backend compile un graphe **React Flow** en une `Definition` (liste d'étapes typées) puis l'exécute localement via **GeoPandas / Pandas** (`engine/spark/pipeline_executor.py`). Une session **Spark + Sedona** reste optionnelle (`session_manager.py`) pour la volumétrie future.

## Flux

1. `POST /api/execute` ou WebSocket `/api/ws/execute` reçoit `nodes` + `edges`.
2. `EngineRouter` analyse le routage (`distributed` vs `native`).
3. `DagToPipelineCompiler` produit la définition (types `CsvReader`, `FilterTransformer`, etc.).
4. `PipelineExecutor` exécute dans l'ordre topologique et émet des snapshots par nœud.

## Nœuds supportés (MVP)

| nodeType frontend | Étape pipeline |
|-------------------|----------------|
| csv_reader | CsvReader |
| shp_reader | ShapefileReader |
| gpkg_reader | GpkgReader |
| filter / attribute_filter | FilterTransformer |
| reproject | ReprojectTransformer |
| spatial_join | SpatialJoiner |
| file_writer | FileWriter |

Les nœuds **agents**, **raster** et **code** sont réservés au moteur natif (non implémentés dans ce MVP).

## Tests

```powershell
cd "D:\CODE\4gix V02\4gix V02"
python -m unittest apps.backend.tests.test_compiler apps.backend.tests.test_integration_pipeline apps.backend.tests.test_ws_execution -v
```

Voir aussi `docs/DEMARRAGE_LOCAL.md` pour lancer backend + frontend.
