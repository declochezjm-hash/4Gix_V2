"""Lecture CSV avec détection d'encodage et de séparateur (FR : point-virgule)."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from .tabular_geo import attach_map_preview

_PREVIEW_LIMIT = 50
_MAP_PREVIEW_LIMIT = 2500


def resolve_csv_encoding(encoding: Optional[str]) -> str:
    if encoding and str(encoding).strip():
        return str(encoding).strip()
    return "utf-8-sig"


def detect_csv_delimiter(path: Path, encoding: str) -> str:
    sample_bytes = path.read_bytes()[:65536]
    text = sample_bytes.decode(encoding, errors="replace")
    if not text.strip():
        return ","
    try:
        dialect = csv.Sniffer().sniff(text, delimiters=";,\t|")
        return dialect.delimiter
    except csv.Error:
        pass
    first_line = text.splitlines()[0] if text.splitlines() else ""
    candidates = [";", "\t", "|", ","]
    best = max(candidates, key=lambda sep: first_line.count(sep))
    return best if first_line.count(best) > 0 else ","


def effective_csv_delimiter(
    delimiter: Optional[str], path: Path, encoding: str
) -> str:
    if delimiter is not None and str(delimiter).strip():
        return str(delimiter).strip()
    return detect_csv_delimiter(path, encoding)


def read_csv_file(
    path: Path,
    *,
    delimiter: Optional[str] = None,
    encoding: Optional[str] = None,
    header: bool = True,
) -> pd.DataFrame:
    enc = resolve_csv_encoding(encoding)
    sep = effective_csv_delimiter(delimiter, path, enc)
    try:
        return pd.read_csv(
            path,
            sep=sep,
            header=0 if header else None,
            encoding=enc,
        )
    except UnicodeDecodeError:
        enc = "latin-1"
        sep = effective_csv_delimiter(delimiter, path, enc)
        return pd.read_csv(
            path,
            sep=sep,
            header=0 if header else None,
            encoding=enc,
        )


def tabular_preview(frame: pd.DataFrame, limit: int = _PREVIEW_LIMIT) -> Dict[str, Any]:
    total = len(frame)
    records: List[Dict[str, Any]] = []
    for row in frame.head(limit).to_dict(orient="records"):
        cleaned: Dict[str, Any] = {}
        for key, value in row.items():
            if pd.isna(value):
                cleaned[str(key)] = None
            elif hasattr(value, "item"):
                try:
                    cleaned[str(key)] = value.item()
                except (ValueError, AttributeError):
                    cleaned[str(key)] = str(value)
            else:
                cleaned[str(key)] = value
        records.append(cleaned)
    preview: Dict[str, Any] = {
        "row_count": total,
        "columns": [str(c) for c in frame.columns],
        "total": total,
        "records": records,
    }
    return attach_map_preview(preview, frame, map_limit=_MAP_PREVIEW_LIMIT)
