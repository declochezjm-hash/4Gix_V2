from pydantic import BaseModel
from typing import Dict, Any, Optional


class BaseStep(BaseModel):
    id: str
    type: str
    options: Optional[Dict[str, Any]] = None
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
