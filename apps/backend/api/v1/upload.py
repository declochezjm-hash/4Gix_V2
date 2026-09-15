from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.data_upload import process_upload

router = APIRouter(tags=["upload"])


@router.post("/upload")
@router.post("/data/upload")
async def upload_data_file(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant.")
    raw = await file.read()
    try:
        return process_upload(raw, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
