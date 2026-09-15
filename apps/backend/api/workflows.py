"""CRUD workflows (persistance locale)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.persistence import (
    delete_workflow,
    get_workflow,
    list_workflows,
    upsert_workflow,
)

router = APIRouter(prefix="/api", tags=["workflows"])


class WorkflowSpec(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1)
    definition: Dict[str, Any] = Field(default_factory=dict)


@router.get("/workflows")
def list_workflows_route() -> Dict[str, Any]:
    items = list_workflows()
    return {"count": len(items), "workflows": items}


@router.get("/workflows/{workflow_id}")
def get_workflow_route(workflow_id: str) -> Dict[str, Any]:
    item = get_workflow(workflow_id)
    if not item:
        raise HTTPException(status_code=404, detail="Workflow introuvable.")
    return item


@router.delete("/workflows/{workflow_id}")
def delete_workflow_route(workflow_id: str) -> Dict[str, Any]:
    if not delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow introuvable.")
    return {"ok": True, "id": workflow_id}


@router.post("/workflows")
def save_workflow_route(spec: WorkflowSpec) -> Dict[str, Any]:
    try:
        return upsert_workflow(
            name=spec.name,
            definition=spec.definition,
            workflow_id=spec.id,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
