from fastapi import APIRouter

from .datasets import router as datasets_router
from .upload import router as upload_router
from .workspace import router as workspace_router

router = APIRouter(prefix="/api/v1")
router.include_router(upload_router)
router.include_router(datasets_router)
router.include_router(workspace_router)
