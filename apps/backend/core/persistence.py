"""Persistance locale des workflows (fichier JSON)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_WORKFLOWS_FILE = _DATA_DIR / "workflows.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_store() -> List[Dict[str, Any]]:
    if not _WORKFLOWS_FILE.is_file():
        return []
    try:
        payload = json.loads(_WORKFLOWS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    items = payload.get("workflows") if isinstance(payload, dict) else payload
    return list(items) if isinstance(items, list) else []


def _save_store(workflows: List[Dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _WORKFLOWS_FILE.write_text(
        json.dumps({"workflows": workflows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def list_workflows() -> List[Dict[str, Any]]:
    return sorted(_load_store(), key=lambda w: w.get("updated_at") or "", reverse=True)


def get_workflow(workflow_id: str) -> Optional[Dict[str, Any]]:
    for item in _load_store():
        if str(item.get("id")) == workflow_id:
            return item
    return None


def delete_workflow(workflow_id: str) -> bool:
    workflows = _load_store()
    kept = [w for w in workflows if str(w.get("id")) != workflow_id]
    if len(kept) == len(workflows):
        return False
    _save_store(kept)
    return True


def upsert_workflow(
    name: str,
    definition: Dict[str, Any],
    workflow_id: Optional[str] = None,
) -> Dict[str, Any]:
    workflows = _load_store()
    now = _now_iso()
    if workflow_id:
        for item in workflows:
            if str(item.get("id")) == workflow_id:
                item["name"] = name
                item["definition"] = definition
                item["updated_at"] = now
                _save_store(workflows)
                return item
    record = {
        "id": workflow_id or str(uuid.uuid4()),
        "name": name,
        "definition": definition,
        "created_at": now,
        "updated_at": now,
    }
    workflows.insert(0, record)
    _save_store(workflows)
    return record
