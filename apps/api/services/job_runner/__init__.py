from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .service import JobRunnerService

__all__ = ["JobRunnerService"]


def __getattr__(name: str):
    if name == "JobRunnerService":
        from .service import JobRunnerService

        return JobRunnerService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
