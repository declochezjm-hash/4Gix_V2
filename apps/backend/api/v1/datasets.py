from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.shapefile_zip import import_shapefile_zip_bytes, validate_zip_shapefile

router = APIRouter(tags=["datasets"])


@router.post("/datasets/import-shapefile-zip")
async def import_shapefile_zip(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Fichier attendu: archive .zip contenant un Shapefile.",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Archive vide.")
    ok, shape_sets, components = validate_zip_shapefile(raw)
    if not ok:
        raise HTTPException(
            status_code=422,
            detail=(
                "Archive .zip sans Shapefile valide. "
                "Attendu : au minimum .shp, .shx et .dbf (même préfixe de nom)."
            ),
        )
    try:
        payload = import_shapefile_zip_bytes(raw, filename=file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payload["validation"] = {
        "shapefile_sets": len(shape_sets),
        "components_detected": components,
    }
    return payload
