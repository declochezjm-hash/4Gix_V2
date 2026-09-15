# Architecture cible 4GIx V02

## Objectif produit

| Couche | Source de référence | Emplacement V02 |
|--------|---------------------|-----------------|
| **Frontend** | `D:\CODE\4gix V02\GisForge-main\4gix\frontend` | `apps/frontend/src/` (copie intégrée) |
| **Moteur distribué** | `D:\CODE\4gix V02\SirenSpark-master\SirenSpark-master\engine` | `apps/backend/vendor/spark_runtime/engine/` |

## Exécution backend

1. Le graphe **React Flow** (UI 4GIx) est compilé en `Definition` (`engine/spark/compiler.py`).
2. Si le workflow est **compatible Spark** (types mappés, dont filtre et GPKG via extensions 4GIx dans le runtime vendu), le routeur tente le **runtime vendu** (`SparkRuntimeExecutor` → sous-processus `vendor/spark_runtime/engine/main.py`).
3. Sinon, ou en cas d’échec Spark en mode `auto`, repli **GeoPandas** (`pipeline_executor.py`).

Variable d’environnement :

- `FOURGIX_SPARK_ENGINE=auto` (défaut) — Spark si possible, sinon local
- `always` — Spark uniquement (erreur si incompatible ou JVM/JARs manquants)
- `never` — toujours GeoPandas

## Prérequis Spark/Sedona

Placez les JARs dans `apps/backend/vendor/spark_runtime/jars/` (voir README du dossier). Sans JARs, les workflows **CSV + filtre** peuvent tourner en Spark ; Shapefile / GeoJSON / reprojection Sedona nécessitent les JARs. Repli GeoPandas en `auto` si Spark échoue.

## API complémentaire (UI 4GIx)

Catalogue, workflows, uploads : implémentés dans `apps/backend/api/` pour coller au frontend GisForge, indépendamment du moteur Spark.
