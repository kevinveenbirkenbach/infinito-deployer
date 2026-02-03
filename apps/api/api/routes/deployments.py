from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter

from api.schemas.deployment import DeploymentRequest
from api.schemas.deployment_job import (
    DeploymentCancelOut,
    DeploymentCreateOut,
    DeploymentJobOut,
)
from services.job_runner import JobRunnerService

router = APIRouter(prefix="/deployments", tags=["deployments"])


@lru_cache(maxsize=1)
def _jobs() -> JobRunnerService:
    """
    Lazy singleton to avoid side effects on import time (e.g. filesystem writes).
    """
    return JobRunnerService()


@router.post("", response_model=DeploymentCreateOut)
def create_deployment(req: DeploymentRequest) -> DeploymentCreateOut:
    """
    Create a deployment job and start the runner subprocess.

    Security:
      - Secrets (password/private_key) are never persisted.
      - Inventory is written with placeholders for secrets.
    """
    job = _jobs().create(req)
    return DeploymentCreateOut(job_id=job.job_id)


@router.get("/{job_id}", response_model=DeploymentJobOut)
def get_deployment(job_id: str) -> DeploymentJobOut:
    return _jobs().get(job_id)


@router.post("/{job_id}/cancel", response_model=DeploymentCancelOut)
def cancel_deployment(job_id: str) -> DeploymentCancelOut:
    ok = _jobs().cancel(job_id)
    return DeploymentCancelOut(ok=ok)
