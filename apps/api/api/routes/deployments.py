from __future__ import annotations

import asyncio
import json
import time
from functools import lru_cache

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from api.schemas.deployment import DeploymentRequest
from api.schemas.deployment_job import (
    DeploymentCancelOut,
    DeploymentCreateOut,
    DeploymentJobOut,
)
from services.job_runner import JobRunnerService
from services.job_runner.paths import job_paths
from services.job_runner.persistence import load_json
from services.job_runner.secrets import mask_secrets
from services.job_runner.util import utc_iso

router = APIRouter(prefix="/deployments", tags=["deployments"])
_TERMINAL_STATUSES = {"succeeded", "failed", "canceled"}


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
      - Inventory is copied from the workspace.
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


def _sse_event(event: str, data: str) -> str:
    lines = data.splitlines() if data else [""]
    payload = [f"event: {event}"]
    payload.extend(f"data: {line}" for line in lines)
    return "\n".join(payload) + "\n\n"


def _split_log_lines(buffer: str) -> tuple[list[str], str]:
    lines: list[str] = []
    while True:
        idx_n = buffer.find("\n")
        idx_r = buffer.find("\r")

        if idx_n == -1 and idx_r == -1:
            break

        if idx_n == -1:
            idx = idx_r
        elif idx_r == -1:
            idx = idx_n
        else:
            idx = idx_n if idx_n < idx_r else idx_r

        line = buffer[:idx]
        buffer = buffer[idx + 1 :]
        lines.append(line)

    return lines, buffer


@router.get("/{job_id}/logs")
async def stream_logs(job_id: str, request: Request) -> StreamingResponse:
    """
    Stream deployment logs via Server-Sent Events (SSE).

    Events:
      - log:    individual log lines
      - status: job status changes
      - done:   terminal status + exit code
    """
    _jobs().get(job_id)  # validate job exists
    paths = job_paths(job_id)
    secrets = _jobs().get_secrets(job_id)
    queue, buffered_lines = _jobs().subscribe_logs(job_id)

    async def event_stream():
        last_status = None
        buffer = ""
        log_fh = None
        terminal_since: float | None = None
        last_heartbeat = time.monotonic()

        meta = load_json(paths.meta_path)
        status = meta.get("status") or "queued"
        last_status = status
        yield _sse_event(
            "status",
            json.dumps(
                {
                    "job_id": job_id,
                    "status": status,
                    "started_at": meta.get("started_at"),
                    "finished_at": meta.get("finished_at"),
                    "exit_code": meta.get("exit_code"),
                    "timestamp": utc_iso(),
                },
                ensure_ascii=False,
            ),
        )

        try:
            for line in buffered_lines:
                yield _sse_event("log", mask_secrets(line, secrets))

            while True:
                if await request.is_disconnected():
                    break

                new_data = False
                while True:
                    try:
                        line = queue.get_nowait()
                    except Exception:
                        break
                    new_data = True
                    yield _sse_event("log", mask_secrets(line, secrets))

                if not new_data and log_fh is None and paths.log_path.exists():
                    # Fallback for older jobs created before the log hub.
                    log_fh = open(
                        paths.log_path,
                        "rb",
                        buffering=0,  # noqa: SIM115
                    )

                if log_fh is not None:
                    chunk = log_fh.read()
                    if chunk:
                        new_data = True
                        buffer += chunk.decode("utf-8", errors="replace")
                        lines, buffer = _split_log_lines(buffer)
                        for line in lines:
                            yield _sse_event("log", mask_secrets(line, secrets))

                meta = load_json(paths.meta_path)
                status = meta.get("status") or "queued"
                if status != last_status:
                    last_status = status
                    yield _sse_event(
                        "status",
                        json.dumps(
                            {
                                "job_id": job_id,
                                "status": status,
                                "started_at": meta.get("started_at"),
                                "finished_at": meta.get("finished_at"),
                                "exit_code": meta.get("exit_code"),
                                "timestamp": utc_iso(),
                            },
                            ensure_ascii=False,
                        ),
                    )

                if status in _TERMINAL_STATUSES:
                    if terminal_since is None:
                        terminal_since = time.monotonic()

                    if not new_data and (time.monotonic() - terminal_since) >= 0.5:
                        if buffer:
                            yield _sse_event("log", mask_secrets(buffer, secrets))
                            buffer = ""
                        yield _sse_event(
                            "done",
                            json.dumps(
                                {
                                    "job_id": job_id,
                                    "status": status,
                                    "finished_at": meta.get("finished_at"),
                                    "exit_code": meta.get("exit_code"),
                                    "timestamp": utc_iso(),
                                },
                                ensure_ascii=False,
                            ),
                        )
                        break
                else:
                    terminal_since = None

                if time.monotonic() - last_heartbeat >= 10:
                    last_heartbeat = time.monotonic()
                    yield ": keep-alive\n\n"

                await asyncio.sleep(0.2)
        finally:
            if log_fh is not None:
                try:
                    log_fh.close()
                except Exception:
                    pass
            _jobs().unsubscribe_logs(job_id, queue)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=headers,
    )
