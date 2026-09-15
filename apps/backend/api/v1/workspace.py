from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from core.paths import resolve_workspace_path

router = APIRouter(tags=["workspace"])


@router.get("/workspace/download")
def download_workspace_file(
    path: str = Query(..., description="Chemin logique /workspace/…"),
) -> Response:
    try:
        file_path = resolve_workspace_path(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    filename = file_path.name
    safe_name = quote(filename)
    media = "application/octet-stream"
    lower = file_path.suffix.lower()
    if lower == ".geojson":
        media = "application/geo+json"
    elif lower == ".csv":
        media = "text/csv"
    return FileResponse(
        path=file_path,
        media_type=media,
        filename=filename,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"; filename*=UTF-8\'\'{safe_name}'
            ),
        },
    )
