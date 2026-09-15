"""Résolution des chemins logiques /workspace/…."""

from __future__ import annotations

from pathlib import Path

from .config import workspace_dir


def workspace_subdir(*parts: str, create: bool = True) -> Path:
    path = workspace_dir().joinpath(*parts)
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def workspace_uri(path: Path) -> str:
    base = workspace_dir()
    resolved = path.resolve()
    try:
        rel = resolved.relative_to(base)
    except ValueError:
        return str(resolved)
    return f"/workspace/{rel.as_posix()}"


def resolve_workspace_path(raw_path: str | None, default: str | None = None) -> Path:
    value = (raw_path or default or "").strip()
    if not value:
        raise ValueError("Chemin de fichier manquant.")
    normalized = value.replace("\\", "/")
    base = workspace_dir()
    if normalized.startswith("/workspace/"):
        rel = normalized[len("/workspace/") :].lstrip("/")
        return (base / rel).resolve()
    path = Path(value)
    if not path.is_absolute():
        return (base / path).resolve()
    return path.resolve()
