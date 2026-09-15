"""Filtre attributaire (extension 4GIx pour le runtime Spark)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from model_base import BaseStep
from pyspark.sql import DataFrame
from pyspark.sql.functions import col


class FilterTransformerStep(BaseStep):
    type = "FilterTransformer"
    options: Dict[str, Any] = {
        "field": str,
        "operator": str,
        "value": Optional[Any],
    }


class FilterTransformer:
    def __init__(
        self,
        df: DataFrame,
        types: Dict[str, Any],
        field: str,
        operator: str = "equals",
        value: Any = None,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.df = df
        self.types = types
        self.field = field
        self.operator = (operator or "equals").lower()
        self.value = value
        self.properties = properties or {}

    def run(self):
        if self.field not in self.df.columns:
            return False, False, "error"
        series = col(self.field)
        if self.operator in {"equals", "eq", "="}:
            filtered = self.df.filter(series == str(self.value))
        elif self.operator in {"not_equals", "neq", "!="}:
            filtered = self.df.filter(series != str(self.value))
        elif self.operator in {"contains", "like"}:
            filtered = self.df.filter(series.contains(str(self.value)))
        else:
            return False, False, "error"
        return filtered, self.types, "success"
