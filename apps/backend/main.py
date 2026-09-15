"""
Point d'entrée FastAPI du sidecar backend 4GIx V02 (Desktop).
"""

from __future__ import annotations

import asyncio
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from engine.router import EngineRouter  # noqa: E402
from engine.sirenspark.session_manager import get_session_manager  # noqa: E402

HOST = os.environ.get("FOURGIX_HOST", "127.0.0.1")
PORT = int(os.environ.get("FOURGIX_PORT", "8000"))

app = FastAPI(title="4GIx V02 Backend", version="0.1.0")
router = EngineRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1",
        "http://localhost",
        f"http://{HOST}:{PORT}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GraphSpec(BaseModel):
    """Graphe React Flow 4GIx (nœuds + arêtes)."""

    nodes: list[Dict[str, Any]] = Field(default_factory=list)
    edges: list[Dict[str, Any]] = Field(default_factory=list)
    execution_id: Optional[str] = None
    workflow_id: Optional[str] = None
    name: Optional[str] = None


def _normalize_result(raw: Dict[str, Any], execution_id: str) -> Dict[str, Any]:
    status = raw.get("status") or "ROUTED"
    ui_status = "COMPLETED" if status in {"ROUTED", "EMPTY"} else "FAILED"
    return {
        "execution_id": execution_id,
        "workflow_id": raw.get("workflow_id"),
        "status": ui_status,
        "engine_status": status,
        "routing": raw.get("routing"),
        "definition": raw.get("definition"),
        "results": raw.get("results") or [],
        "errors": raw.get("errors") or [],
        "node_count": len(raw.get("routing", {}).get("assignments") or {}),
        "duration_ms": raw.get("duration_ms", 0),
    }


@app.get("/api/health")
def health() -> Dict[str, Any]:
    session = get_session_manager()
    return {
        "status": "ok",
        "service": "4gix-backend",
        "host": HOST,
        "port": PORT,
        "spark_active": session.is_active,
    }


@app.post("/api/shutdown")
def shutdown() -> Dict[str, str]:
    get_session_manager().stop_session()

    def _exit_later() -> None:
        time.sleep(0.2)
        os._exit(0)

    threading.Thread(target=_exit_later, daemon=True).start()
    return {"status": "shutting_down"}


@app.post("/api/execute")
def execute_graph(spec: GraphSpec) -> Dict[str, Any]:
    execution_id = spec.execution_id or str(uuid.uuid4())
    started = time.perf_counter()
    try:
        raw = router.execute_dag(spec.model_dump())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    raw["duration_ms"] = round((time.perf_counter() - started) * 1000, 3)
    raw["workflow_id"] = spec.workflow_id
    result = _normalize_result(raw, execution_id)
    if result["status"] == "FAILED" and result["errors"]:
        raise HTTPException(status_code=400, detail="; ".join(result["errors"]))
    return result


@app.websocket("/api/ws/execute")
async def execute_graph_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        payload = await websocket.receive_json()
        execution_id = payload.get("execution_id") or str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()

        def emit(event: Dict[str, Any]) -> None:
            asyncio.run_coroutine_threadsafe(queue.put(event), loop)

        def run() -> None:
            started = time.perf_counter()
            emit(
                {
                    "type": "started",
                    "payload": {
                        "execution_id": execution_id,
                        "name": payload.get("name"),
                        "workflow_id": payload.get("workflow_id"),
                        "status": "RUNNING",
                    },
                }
            )
            for node_id in (payload.get("nodes") or []):
                nid = node_id.get("id") if isinstance(node_id, dict) else None
                if nid:
                    emit(
                        {
                            "type": "node_running",
                            "payload": {"node_id": nid, "status": "RUNNING"},
                        }
                    )
            try:
                raw = router.execute_dag(payload)
                raw["duration_ms"] = round((time.perf_counter() - started) * 1000, 3)
                result = _normalize_result(raw, execution_id)
                event_type = "completed" if result["status"] == "COMPLETED" else "failed"
                emit({"type": event_type, "payload": result})
            except Exception as exc:  # noqa: BLE001
                emit(
                    {
                        "type": "failed",
                        "payload": {
                            "execution_id": execution_id,
                            "status": "FAILED",
                            "error": str(exc),
                        },
                    }
                )

        worker = loop.run_in_executor(None, run)
        while True:
            if worker.done() and queue.empty():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.15)
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                continue
        await worker
    except WebSocketDisconnect:
        return
    except Exception as exc:  # noqa: BLE001
        try:
            await websocket.send_json(
                {"type": "error", "payload": {"error": str(exc), "status": "FAILED"}}
            )
        except Exception:  # noqa: BLE001
            pass
        await websocket.close()


@app.on_event("shutdown")
def on_shutdown() -> None:
    get_session_manager().stop_session()


def main() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level=os.environ.get("FOURGIX_LOG_LEVEL", "info"),
        reload=False,
    )


if __name__ == "__main__":
    main()
