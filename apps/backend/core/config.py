"""Configuration runtime backend 4GIx V02."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

_DEFAULT_WORKSPACE = BACKEND_ROOT / "data" / "workspace"


def workspace_dir() -> Path:
    raw = os.environ.get("FOURGIX_WORKSPACE_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _DEFAULT_WORKSPACE.resolve()
