from __future__ import annotations

import os


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def runner_backend() -> str:
    return (os.getenv("JOB_RUNNER_BACKEND") or "local").strip().lower()
