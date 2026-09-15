# JARs Spark / Sedona (4GIx V02)

Placez ici les fichiers `.jar` requis par le moteur distribué (référence SirenSpark-master).

Fichiers attendus (noms indicatifs) :

- `postgresql-42.6.0.jar` — JDBC PostGIS
- `sedona-spark-shaded-3.0_2.12-1.5.0.jar` — Apache Sedona
- `geotools-wrapper-1.4.0-28.2.jar` — GDAL/GeoTools
- `spark-xml_2.12-0.13.0.jar` — lecture XML

Chemins alternatifs :

- variable d’environnement `FOURGIX_SPARK_JARS` (dossier)
- dossier `jars/` à la racine du monorepo `4gix V02`

Sans JARs, les workflows **CSV tabulaires** peuvent encore tourner ; Shapefile / GeoJSON / reprojection Sedona nécessitent les JARs.
