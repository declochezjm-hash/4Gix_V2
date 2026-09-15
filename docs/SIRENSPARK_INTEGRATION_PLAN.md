# Plan d'intégration SirenSpark → 4GIx V02 (Desktop)

**Date :** 2026-03-25  
**Périmètre audité :** `D:\CODE\4gix V02\SirenSpark-master\SirenSpark-master`  
**Référence UI / orchestration :** `D:\CODE\4gix V02\GisForge-main\4gix` (frontend React Flow + backend FastAPI `RecflowEngine`)

---

## 1. Synthèse exécutive

SirenSpark est un **moteur ETL géospatial** Python centré sur **Apache Spark + Apache Sedona**, piloté par un **fichier projet JSON** (graphe implicite via `trigger` + `steps[].output.success`). Le client historique est Angular/Electron ; le dépôt livré ici contient surtout le **module `engine/`**.

4GIx V02 cible une application **desktop locale** avec un canvas **React Flow** (`nodes` + `edges`), un contrat de nœud `{ id, data: { label, nodeType, params, … } }`, et un orchestrateur **`RecflowEngine`** (NetworkX, tri topologique, exécution synchrone nœud par nœud via `Base4GIxNode.execute`).

**Positionnement recommandé :** SirenSpark devient le **backend de calcul distribuable / volumétrique** derrière une couche d’adaptation, tandis que 4GIx conserve l’**UX, le catalogue étendu, les agents** et un **mode « léger »** (GeoPandas/Shapely) pour petits jeux et prévisualisation. L’intégration passe par une **API FastAPI unifiée** (déjà présente) enrichie d’un **profil d’exécution `engine=sirenspark`** et d’un **compilateur DAG 4GIx → Definition SirenSpark**.

**Risques majeurs identifiés :**

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Lecteurs GDAL chargent tout en RAM Python avant Spark | OOM sur .shp / GeoJSON volumineux | Lecteurs Sedona/GDAL partitionnés ; seuils de bascule ; chunking |
| Pas de reader GPKG dans SirenSpark | Écart fonctionnel vs 4GIx | Adapter GDAL ou déléguer GPKG au runtime 4GIx |
| Schéma Pydantic `Definition` incomplet | Projets Shapefile/Joiner invalidés à la validation | Refactor `models.py` (discriminated union) |
| Double `SparkSession` (`main.py` vs `Runner`) | Comportement JVM indéterminé | Session unique injectée |
| `Intersector` non branché dans `Runner` | Code mort / docs trompeuses | Brancher ou retirer du périmètre MVP |
| Modèle de données WKB/EWKB vs GeoJSON FeatureCollection | Friction adaptateurs | Couche `SirenSparkDataContext` + convertisseurs aux frontières |

---

## 2. Audit d’architecture SirenSpark

### 2.1 Structure des répertoires

```
SirenSpark-master/
├── README.md, notes.md, requirements.txt
├── jars/                    # Sedona, GeoTools wrapper, spark-xml, PostgreSQL JDBC (référencés par main.py)
└── engine/
    ├── main.py              # Point d’entrée CLI : SparkSession + SedonaRegistrator + Runner
    ├── models.py            # Definition Pydantic (projet JSON)
    ├── model_base.py        # BaseStep (id, type, input, output)
    ├── runner/runner.py     # Orchestration récursive + cache Spark
    ├── readers/             # Sources
    ├── transformers/        # Transformations
    ├── writers/               # Destinations
    ├── utils/                 # postgis, pandas/geopandas, evaluator
    └── samples/               # Projets JSON d’exemple
```

**Gestionnaire de dépendances :** `requirements.txt` (pip) — `pyspark`, `apache-sedona`, `pydantic`, `gdal`/`ogr`, `geopandas`, `pandas`, `psycopg2`, `lxml`, `jmespath`, `tqdm`. **Prérequis système :** JDK, GDAL, libpq (documentés README).

**Point d’entrée principal :** `engine/main.py` — argument = chemin vers JSON projet ; configure Spark (Kryo, Sedona, JARs) puis `Runner(definition).run()`.

### 2.2 Modèle de graphe SirenSpark

| Concept | Structure |
|---------|-----------|
| Métadonnées | `properties: { name, description, parameters }` |
| Départ | `trigger: BaseStep` (souvent `type: "creator"`) |
| Étapes | `steps: BaseStep[]` |
| Nœud | `id`, `type`, `options`, `input?`, `output: { success: [ids], error: [] }` |
| Multi-entrées | `input: { left: "step_id", right: "step_id" }` (Joiner, ArrayJoiner, ClosestPoint) |

Exécution : **DFS récursive** depuis `trigger`, pas de tri topologique explicite ; détection de **boucles** via `steps_cache`. Chaque étape produisant un DataFrame est **`cache()`** puis **`unpersist()`** en fin de run.

### 2.3 Inventaire des modules de traitement

#### Readers (`engine/readers/`)

| Type `step.type` | Fichier | Moteur | Notes |
|------------------|---------|--------|-------|
| `PostgisReader` | `postgis_reader.py` | JDBC Spark + Sedona | Connexion PostGIS |
| `JSONReader` | `json_reader.py` | Spark | JSON tabulaire |
| `CSVReader` | `csv_reader.py` | `spark.read.csv` | Scalable ; types = dtypes Spark string |
| `XMLReader` | `xml_reader.py` | spark-xml (JAR) | |
| `ShapefileReader` | `shapefile_reader.py` | OGR → liste Python → `createDataFrame` | **Non scalable** |
| `GeoJSONReader` | `geojson_reader.py` | OGR + tqdm | **Non scalable** |

#### Transformers (`engine/transformers/`)

| Type | Fichier | Branché dans Runner |
|------|---------|----------------------|
| `AttributeCreator` | `attribute_creator.py` | Oui |
| `AttributeRemover` | `attribute_remover.py` | Oui |
| `AttributeMapper` | `attribute_mapper.py` | Oui |
| `Joiner` | `joiner.py` | Oui (2 entrées cache) |
| `ArrayJoiner` | `array_joiner.py` | Oui |
| `ClosestPoint` | `closest_point.py` | Oui |
| `CalcRotation` | `calc_rotation.py` | Oui |
| `PythonCaller` | `python_caller.py` | Oui |
| `MergeBuffer` | `merge_buffer.py` | Oui |
| `Reprojector` | `reprojector.py` | Oui (Sedona `ST_Transform`) |
| `Intersector` | `intersector.py` | **Non** |

#### Writers (`engine/writers/`)

| Type | Fichier | Notes |
|------|---------|-------|
| `PostgisWriter` | `postgis_writer.py` | |
| `JSONFileWriter` | `json_file_writer.py` | |
| `GeoJSONFileWriter` | `geojson_file_writer.py` | |
| `ShapefileWriter` | `shapefile_writer.py` | `toPandas` → GeoPandas `to_file` (driver collect) |
| `CSVFileWriter` | `csv_file_writer.py` | |
| `TextFileWriter` | `text_file_writer.py` | Hors Runner |

#### Utilitaires

- `utils/pandas.py` : pont Spark ↔ GeoPandas (WKT/WKB, CRS fixé **4326** dans `toPandas`).
- `utils/postgis.py`, `utils/evaluator.py` : expressions / PostGIS.

### 2.4 Dette technique moteur (à traiter en refactor)

1. **`models.py`** : l’union `Definition.steps` n’inclut pas `ShapefileReader`, `GeoJSONReader`, `Joiner`, writers fichier, etc. — les samples Shapefile **échoueraient** à `Definition.parse_raw` si typage strict.
2. **`Runner.__init__`** recrée `SparkSession.builder.getOrCreate()` alors que `main.py` configure déjà Sedona/JARs — la session du Runner peut **ignorer** la config de `main.py` selon l’ordre d’appel.
3. **`recusrive_run_step`** ne propage pas correctement les branches parallèles multiples (un seul `curr_df` linéaire) — les joins multi-branches reposent entièrement sur `steps_cache` + `input`, pas sur le flux `curr_df`.
4. **`df.count()`** et **`show(10)`** à chaque étape : coût cluster inutile en production.

---

## 3. Matrice de compatibilité 4GIx ↔ SirenSpark

### 3.1 Modèle de nœud canvas

| Dimension | 4GIx (React Flow + Recflow) | SirenSpark |
|-----------|------------------------------|------------|
| Identité | `node.id` | `step.id` |
| Type logique | `data.nodeType` (snake_case, ex. `shapefile_reader`) | `step.type` (PascalCase, ex. `ShapefileReader`) |
| Libellé UI | `data.label` | `properties.name` (projet) |
| Paramètres | `data.params` (JSON Schema par nœud) | `step.options` |
| Topologie | `edges[]` source/target + handles | `output.success[]` + `input` nommé |
| Déclenchement | Tous les nœuds sans prédécesseur ou tri topo | Nœud `creator` + chaîne explicite |
| Sortie runtime | `Dict` ports (`output`, metadata, GeoJSON preview) | `(DataFrame, column_types, status)` |
| Multi-port | `left`/`right` via `sourceHandle`/`targetHandle` | `input.left` / `input.right` |

### 3.2 Mapping types de nœuds (MVP intégration)

| 4GIx `nodeType` | SirenSpark `type` | Adapteur params | Priorité |
|-----------------|-------------------|-----------------|----------|
| `csv_reader` | `CSVReader` | `path` → `filepath`, `delimiter`, `header` | P0 |
| `shapefile_reader` | `ShapefileReader` | `path` → `filepath` | P0 |
| `geojson_reader` | `GeoJSONReader` | `path` → `filepath` | P0 |
| `postgis_reader` | `PostgisReader` | mapping connexion + requête | P1 |
| `reproject` / `reprojector` | `Reprojector` | `source_crs`/`target_crs` → `source_srid`/`new_srid` (strip EPSG:) | P0 |
| `attribute_filter` | — | **Pas d’équivalent direct** ; `Tester`/`FilterTransformer` côté 4GIx ou SQL Sedona | P1 |
| `attribute_manager` | `AttributeCreator` + `AttributeRemover` | Décomposer ou mapper sous-ops | P2 |
| `attribute_mapper` (transformer) | `AttributeMapper` | `mappings` | P1 |
| `python_caller` | `PythonCaller` | code / module | P1 |
| `spatial_join` / `feature_merger` | `Joiner` | `join_keys`, `join_type` | P1 |
| `file_writer` / `shapefile_writer` | `ShapefileWriter` / `GeoJSONFileWriter` / `JSONFileWriter` | `format` + `path` → `filepath` | P0 |
| `postgis_writer` | `PostgisWriter` | | P1 |
| `gpkg_reader` | — | **Manquant** — runtime 4GIx ou nouveau reader | P0 gap |
| Agents (`auto_architect_agent`, etc.) | — | Restent **100 % 4GIx** | — |

Types 4GIx **sans** pendant SirenSpark (buffer, clip, dissolve, raster, WFS, DXF, IFC…) : exécution **native 4GIx** ou roadmap contributeurs SirenSpark.

### 3.3 CRS, géométrie, typage

| Sujet | SirenSpark | 4GIx |
|-------|------------|------|
| Stockage interne | Colonne géom. en **EWKB** (Sedona) | **GeoJSON** / FeatureCollection, CRS explicite sur payload |
| Métadonnées type | `column_types[col] = { data_type, type?, srid, coord_dimension }` | `metadata.crs`, schéma attributaire dans snapshot |
| Lecture SHP | SRID depuis `.prj` ; reprojection forcée **EPSG:4326** dans reader | `read_shapefile` → EPSG:4326 pour carte |
| Reprojection | `ST_Transform` Sedona, met à jour `types[col].srid` | GeoPandas `to_crs` |
| 3D | `coord_dimension` lu ; branche 2D/3D redondante | Selon nœud (souvent 2D) |
| CRS manquant | `int(spatial_ref.GetAuthorityCode(None))` peut **échouer** | Fallback configurable côté 4GIx |

**Règle d’intégration :** fixer un **CRS de travail pipeline** (ex. EPSG:4326 pour preview, EPSG:2154 pour calcul métrique) dans `properties.parameters` SirenSpark / `workflow.settings` 4GIx ; convertir aux **frontières** (readers/writers et snapshots UI).

### 3.4 Mémoire et fichiers volumineux

| Format | SirenSpark | 4GIx actuel | Recommandation fusion |
|--------|------------|-------------|------------------------|
| **CSV** | Lecture Spark lazy | Pandas/chunk possible | Garder **CSVReader Spark** au-delà d’un seuil (ex. 50 Mo / 100k lignes) |
| **SHP** | Toutes les entités en `list` puis DF | GeoPandas/Fiona streaming partiel | Remplacer par **Sedona `shapefile` reader** ou lecture par partition OGR ; seuil bascule |
| **GPKG** | Absent | `read_gpkg_file` | 4GIx reader jusqu’à impl. SirenSpark |
| **GeoJSON** | Liste + tqdm | JSON parse | NDJSON / FlatGeobuf pour gros volumes |
| **Écriture SHP** | `collect` via `toPandas` | Écriture fichier locale | Limiter aux exports validés ; avertissement UI |

Signaux d’alerte actuels : `Runner` appelle `df.cache()` + `count()` par étape → **double matérialisation**.

---

## 4. Stratégie d’intégration (Desktop 4GIx V02)

### 4.1 Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│  Electron / Tauri shell (futur)                              │
│  ┌──────────────────────┐    REST / WS                        │
│  │ React Flow 4GIx UI   │◄──► FastAPI (localhost)             │
│  └──────────────────────┘         │                           │
│                                    ├── RecflowEngine (léger)   │
│                                    └── SirenSparkBridge        │
│                                         │ compile DAG          │
│                                         ▼                      │
│                                    Runner + SparkSession       │
│                                    (processus ou sous-proc)    │
└─────────────────────────────────────────────────────────────┘
```

**Principes :**

1. **Une seule API** côté UI : conserver `/api/execute`, `/api/validate`, `/api/ws/execute` (`GisForge-main/4gix/backend/app/api/execution.py`).
2. **Routage par nœud ou par workflow** : champ `data.params._engine: "native" | "sirenspark"` ou politique globale `workflow.engine`.
3. **Sous-processus Spark** pour desktop : JVM isolée, redémarrage propre, variables `SPARK_LOCAL_IP`, `JAVA_HOME` documentées pour Windows.
4. **Snapshots UI** : convertir un échantillon DataFrame → GeoJSON (limite N features) pour la carte 4GIx.

### 4.2 Composants à développer (adapteurs)

| Composant | Responsabilité |
|-----------|----------------|
| `DagToSirenSparkCompiler` | `GraphSpec` → `Definition` (trigger synthétique, steps, output.success, input left/right depuis handles) |
| `NodeTypeRegistry` | Table bidirectionnelle snake_case ↔ PascalCase + mapping schémas params |
| `SirenSparkSessionManager` | Singleton Spark/Sedona, config JARs, shutdown gracieux |
| `SirenSparkRunnerAdapter` | Implémente sous-ensemble `Base4GIxNode` ou hook dans `RecflowEngine` pour déléguer un sous-graphe |
| `GeometryPayloadConverter` | EWKB ↔ GeoJSON, gestion CRS |
| `ExecutionProgressEmitter` | Mapper logs Spark → événements WS `node_running` / `snapshot` |
| `LargeFilePolicy` | Seuils bascule native vs Spark |

### 4.3 Flux d’exécution proposé

1. UI envoie `{ nodes, edges, execution_id }`.
2. `RecflowEngine` valide DAG (existant).
3. **Partition** du graphe en composantes connexes selon moteur (ou sous-graphe marqué « bulk »).
4. Pour segment SirenSpark : compiler → écrire JSON temporaire → `Runner.run()` avec callbacks.
5. Résultat final du segment : FeatureCollection pour nœuds terminaux writers / dernier transform.
6. Persistance snapshots (PostgreSQL optionnel desktop → SQLite ultérieur).

### 4.4 Alignement avec le dépôt V02

Le dossier `D:\CODE\4gix V02\4gix V02` est le **conteneur cible** de la refonte. Structure suggérée :

```
4gix V02/
├── apps/frontend/          # depuis GisForge-main/4gix/frontend
├── apps/backend/           # FastAPI + Recflow + bridge
├── engines/sirenspark/     # vendor ou submodule SirenSpark engine
└── docs/
    └── SIRENSPARK_INTEGRATION_PLAN.md
```

---

## 5. Premières actions de refactoring (ordre recommandé)

### Phase 0 — Stabilisation SirenSpark (1–2 semaines)

1. **Unifier SparkSession** : injecter `spark` dans `Runner` ; supprimer les `getOrCreate()` dispersés dans readers.
2. **Compléter `Definition`** : union discriminée Pydantic v2 sur `type` pour tous les steps réellement supportés par `Runner`.
3. **Brancher ou retirer `Intersector`** du périmètre documenté.
4. **Désactiver `count()`/`show()`** derrière flag `DEBUG_SPARK`.
5. **Tests CLI** : faire passer tous les fichiers sous `engine/samples/`.

### Phase 1 — Pont minimal (2–3 semaines)

1. Créer `apps/backend/app/engines/sirenspark/compiler.py` + tests unitaires (graphe 4GIx simple CSV → JSON).
2. Implémenter `SirenSparkSessionManager` (Windows + chemins JAR relatifs).
3. Exposer endpoint `POST /api/execute/sirenspark` (debug) puis fusionner dans `/api/execute`.
4. Mapping P0 : `csv_reader`, `shapefile_reader`, `file_writer`, `reprojector`.

### Phase 2 — Parité opérationnelle

1. Lecteurs volumétriques : spike Sedona Shapefile vs OGR chunké.
2. `gpkg_reader` : reader SirenSpark ou politique « toujours native ».
3. Multi-entrées React Flow (`left`/`right`) → validation compile-time.
4. Packaging desktop : script lancement JVM + venv Python.

### Phase 3 — Expérience produit

1. Indicateur moteur sur le nœud (icône Spark).
2. Estimation mémoire / durée avant run.
3. Auto-routing (architecte) : choix `native` vs `sirenspark` selon taille fichier.

---

## 6. Critères d’acceptation intégration MVP

- [ ] Un workflow 4GIx « CSV → Reproject → GeoJSON file » s’exécute via SirenSpark sans modification manuelle du JSON SirenSpark.
- [ ] WebSocket émet `node_running` et `snapshot` pour chaque étape mappée.
- [ ] Preview carte alimentée en EPSG:4326 depuis sortie Spark.
- [ ] Échec propre si Spark/JDK absent (message desktop explicite).
- [ ] Pas de régression des nœuds 4GIx non mappés (exécution native).

---

## 7. Références code

| Élément | Emplacement |
|---------|-------------|
| Entrée CLI Spark | `SirenSpark-master/engine/main.py` |
| Orchestrateur SirenSpark | `SirenSpark-master/engine/runner/runner.py` |
| Projet JSON exemple | `SirenSpark-master/engine/samples/shapefile2json/shapefile2json.json` |
| API exécution 4GIx | `GisForge-main/4gix/backend/app/api/execution.py` |
| RecflowEngine | `GisForge-main/4gix/backend/app/core/recflow_engine.py` |
| Contrat nœud UI | `GisForge-main/4gix/frontend/src/lib/api.ts` (`FlowNodeData`) |
| Registre nœuds 4GIx | `GisForge-main/4gix/backend/app/nodes/__init__.py` |

---

*Document généré dans le cadre de la refonte 4GIx V02 — à mettre à jour à chaque jalon de fusion moteur.*
