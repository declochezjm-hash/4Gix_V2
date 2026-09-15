"""Catalogue des nœuds exposé à l'UI 4GIx."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["catalog"])

_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "nodes_catalog.json"


def _load_catalog() -> Dict[str, Any]:
    if not _CATALOG_PATH.is_file():
        return {"count": 0, "nodes": [], "by_category": {}}
    return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))


@router.get("/nodes")
def get_nodes_catalog() -> Dict[str, Any]:
    payload = _load_catalog()
    nodes = payload.get("nodes") or []
    grouped: Dict[str, list] = {"Reader": [], "Transformer": [], "Writer": []}
    for entry in nodes:
        category = str(entry.get("category") or "Transformer")
        grouped.setdefault(category, []).append(entry)
    return {
        "count": len(nodes),
        "nodes": nodes,
        "by_category": grouped,
    }


@router.get("/nodes/{node_type}")
def get_node_schema(node_type: str) -> Dict[str, Any]:
    for entry in _load_catalog().get("nodes") or []:
        if str(entry.get("node_type")) == node_type:
            return entry
    raise HTTPException(status_code=404, detail=f"Nœud inconnu: {node_type}")
