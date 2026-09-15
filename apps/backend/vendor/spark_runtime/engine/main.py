import logging
import os
import sys
from pathlib import Path

from pydantic import ValidationError
from pyspark.sql import SparkSession

from models import Definition
from runner.runner import Runner

logging.basicConfig(level=logging.INFO)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def _discover_jars() -> list[str]:
    try:
        from core.spark_jars import discover_jar_paths

        return discover_jar_paths()
    except Exception:
        jars_dir = Path(__file__).resolve().parent.parent / "jars"
        if jars_dir.is_dir():
            return [str(p) for p in sorted(jars_dir.glob("*.jar"))]
        return []


def _build_spark() -> SparkSession:
    jars = _discover_jars()
    builder = (
        SparkSession.builder.appName("4GIx-Spark")
        .master(os.environ.get("FOURGIX_SPARK_MASTER", "local[*]"))
        .config("spark.ui.enabled", "false")
        .config("spark.eventLog.enabled", "false")
    )
    if jars:
        jars_csv = ",".join(jars)
        builder = builder.config("spark.jars", jars_csv).config(
            "spark.driver.extraClassPath", jars_csv
        )
        try:
            from sedona.utils import KryoSerializer, SedonaKryoRegistrator

            builder = builder.config("spark.serializer", KryoSerializer.getName).config(
                "spark.kryo.registrator", SedonaKryoRegistrator.getName
            )
        except ImportError:
            logging.warning("Sedona non installé — session Spark sans géométrie native.")
    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("ERROR")
    if jars:
        try:
            from sedona.register import SedonaRegistrator

            SedonaRegistrator.registerAll(spark)
        except Exception as exc:
            logging.warning("Enregistrement Sedona ignoré: %s", exc)
    return spark


spark = _build_spark()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        logging.error("Please provide a file path as a command line argument")
        sys.exit(1)
    file_path = sys.argv[1]
    try:
        with open(file_path, "r", encoding="utf-8") as handle:
            config_data = handle.read()
        if hasattr(Definition, "model_validate_json"):
            definition = Definition.model_validate_json(config_data)
        else:
            definition = Definition.parse_raw(config_data)
        logging.info("Config file is valid")
        Runner(definition=definition).run()
        logging.info("END")
    except FileNotFoundError:
        logging.error("File not found: %s", file_path)
        sys.exit(1)
    except ValidationError as exc:
        logging.error("Invalid config file: %s", exc)
        sys.exit(1)
