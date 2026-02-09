from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


JobStatus = Literal[
    "queued",
    "running",
    "succeeded",
    "failed",
    "canceled",
]


class DeploymentCreateOut(BaseModel):
    job_id: str


class DeploymentCancelOut(BaseModel):
    ok: bool


class DeploymentJobOut(BaseModel):
    job_id: str
    status: JobStatus

    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    pid: Optional[int] = None
    exit_code: Optional[int] = None
    container_id: Optional[str] = None

    # Paths inside the container (useful for debugging)
    workspace_dir: str
    log_path: str
    inventory_path: str
    request_path: str
