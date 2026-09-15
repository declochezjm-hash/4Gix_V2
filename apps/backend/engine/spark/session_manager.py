"""Gestionnaire SparkSession locale (optionnel, volumétrie)."""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_APP_NAME = "4GIx-Spark"
_JARS_DIRNAME = "jars"


class SparkSessionManager:
    _instance: Optional["SparkSessionManager"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "SparkSessionManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._spark = None
                    cls._instance._sedona_registered = False
        return cls._instance

    def get_session(self):
        if self._spark is not None:
            return self._spark
        with self._lock:
            if self._spark is None:
                self._spark = self._build_session()
                self._register_sedona(self._spark)
                logger.info("SparkSession locale initialisée.")
        return self._spark

    def stop_session(self) -> None:
        with self._lock:
            if self._spark is None:
                return
            try:
                self._spark.stop()
            except Exception:
                logger.exception("Erreur arrêt SparkSession.")
            finally:
                self._spark = None
                self._sedona_registered = False

    @property
    def is_active(self) -> bool:
        return self._spark is not None

    def _build_session(self):
        import sys

        from pyspark.sql import SparkSession

        os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
        os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)
        jars = self._discover_jars()
        builder = (
            SparkSession.builder.appName(_DEFAULT_APP_NAME)
            .master("local[*]")
            .config("spark.ui.enabled", "false")
            .config("spark.eventLog.enabled", "false")
            .config("spark.driver.memory", os.environ.get("FOURGIX_SPARK_DRIVER_MEMORY", "2g"))
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
                logger.warning(
                    "Package apache-sedona absent — session Spark sans enregistrement Python Sedona."
                )
        spark = builder.getOrCreate()
        spark.sparkContext.setLogLevel("ERROR")
        return spark

    def _register_sedona(self, spark) -> None:
        if self._sedona_registered:
            return
        try:
            from sedona.register import SedonaRegistrator

            SedonaRegistrator.registerAll(spark)
            self._sedona_registered = True
        except ImportError:
            logger.warning("apache-sedona non installé — géométrie JVM via JARs uniquement.")

    @staticmethod
    def _discover_jars() -> list[str]:
        from core.spark_jars import discover_jar_paths

        return discover_jar_paths()


def get_session_manager() -> SparkSessionManager:
    return SparkSessionManager()
