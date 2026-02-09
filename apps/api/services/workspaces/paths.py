from __future__ import annotations

from pathlib import Path

from services.job_runner.paths import state_dir


def workspaces_root() -> Path:
    return state_dir() / "workspaces"


def workspace_dir(workspace_id: str) -> Path:
    return workspaces_root() / workspace_id
