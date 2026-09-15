"""Gestionnaire unique de SparkSession locale pour le moteur SirenSpark embarqué."""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_APP_NAME = "4GIx-SirenSpark"
_JARS_DIRNAME = "jars"


class SirenSparkSessionManager:
    """Singleton : une seule JVM / SparkSession pour toute la durée de vie de l'IHM."""

    _instance: Optional["SirenSparkSessionManager"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "SirenSparkSessionManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._spark = None
                    cls._instance._sedona_registered = False
                    cls._instance._initialized = False
        return cls._instance

    def get_session(self):
        """Retourne la SparkSession locale, en la créant au premier appel."""
        if self._spark is not None:
            return self._spark
        with self._lock:
            if self._spark is None:
                self._spark = self._build_session()
                self._register_sedona(self._spark)
                self._initialized = True
                logger.info("SparkSession locale SirenSpark initialisée (master=local[*]).")
        return self._spark

    def stop_session(self) -> None:
        """Arrêt propre de Spark et libération de la JVM (fermeture de l'IHM)."""
        with self._lock:
            if self._spark is None:
                return
            try:
                self._spark.stop()
                logger.info("SparkSession SirenSpark arrêtée.")
            except Exception:
                logger.exception("Erreur lors de l'arrêt de la SparkSession.")
            finally:
                self._spark = None
                self._sedona_registered = False
                self._initialized = False
                self._reset_spark_context()

    @property
    def is_active(self) -> bool:
        return self._spark is not None

    def _build_session(self):
        from pyspark.sql import SparkSession
        from sedona.utils import KryoSerializer, SedonaKryoRegistrator

        import sys

        os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
        os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

        jars = self._discover_jars()
        builder = (
            SparkSession.builder.appName(_DEFAULT_APP_NAME)
            .master("local[*]")
            .config("spark.ui.enabled", "false")
            .config("spark.ui.showConsoleProgress", "false")
            .config("spark.eventLog.enabled", "false")
            .config("spark.sql.adaptive.enabled", "true")
            .config("spark.sql.shuffle.partitions", "8")
            .config("spark.driver.host", "127.0.0.1")
            .config("spark.driver.bindAddress", "127.0.0.1")
            .config("spark.serializer", KryoSerializer.getName)
            .config("spark.kryo.registrator", SedonaKryoRegistrator.getName)
            .config("spark.kryoserializer.buffer.max", "256m")
            .config("spark.sql.execution.arrow.pyspark.enabled", "true")
            .config("spark.driver.memory", os.environ.get("SIRENSPARK_DRIVER_MEMORY", "2g"))
            .config("spark.executor.memory", os.environ.get("SIRENSPARK_EXECUTOR_MEMORY", "2g"))
        )
        if jars:
            jars_csv = ",".join(jars)
            builder = (
                builder.config("spark.jars", jars_csv)
                .config("spark.driver.extraClassPath", jars_csv)
                .config("spark.executor.extraClassPath", jars_csv)
            )

        spark = builder.getOrCreate()
        spark.sparkContext.setLogLevel("ERROR")
        self._quiet_java_loggers()
        return spark

    def _register_sedona(self, spark) -> None:
        if self._sedona_registered:
            return
        from sedona.register import SedonaRegistrator

        SedonaRegistrator.registerAll(spark)
        self._sedona_registered = True
        logger.info("Apache Sedona enregistré sur la SparkSession locale.")

    @staticmethod
    def _quiet_java_loggers() -> None:
        try:
            import logging as py_logging

            py_logging.getLogger("py4j").setLevel(py_logging.ERROR)
            py_logging.getLogger("pyspark").setLevel(py_logging.ERROR)
            from py4j.java_gateway import java_import
            from pyspark import SparkContext

            jvm = SparkContext._active_spark_context._jvm  # type: ignore[union-attr]
            if jvm is None:
                return
            java_import(jvm, "org.apache.log4j.Logger")
            java_import(jvm, "org.apache.log4j.Level")
            logger_cls = jvm.org.apache.log4j.Logger
            level = jvm.org.apache.log4j.Level.ERROR
            logger_cls.getLogger("org").setLevel(level)
            logger_cls.getLogger("akka").setLevel(level)
            logger_cls.getLogger("org.apache.spark").setLevel(level)
        except Exception:
            logger.debug("Impossible de réduire les logs JVM Spark.", exc_info=True)

    @staticmethod
    def _discover_jars() -> list[str]:
        candidates = [
            Path(__file__).resolve().parents[4] / _JARS_DIRNAME,
            Path(__file__).resolve().parent / _JARS_DIRNAME,
            Path(os.environ.get("SIRENSPARK_JARS", "")),
        ]
        jars: list[str] = []
        for directory in candidates:
            if not directory or not directory.is_dir():
                continue
            jars.extend(str(path) for path in sorted(directory.glob("*.jar")))
            if jars:
                break
        return jars

    @staticmethod
    def _reset_spark_context() -> None:
        try:
            from pyspark import SparkContext

            SparkContext._active_spark_context = None  # type: ignore[attr-defined]
        except Exception:
            pass


def get_session_manager() -> SirenSparkSessionManager:
    """Point d'accès unique au singleton."""
    return SirenSparkSessionManager()
