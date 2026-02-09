from __future__ import annotations

import os
import shlex
import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import HTTPException

from .config import env_bool


@dataclass(frozen=True)
class ContainerRunnerConfig:
    image: str
    repo_dir: str
    workdir: str
    network: Optional[str]
    extra_args: List[str]
    repo_host_path: Optional[str]
    skip_cleanup: bool
    skip_build: bool


def _require_absolute(path: str, label: str) -> Path:
    p = Path(path)
    if not p.is_absolute():
        raise HTTPException(
            status_code=500,
            detail=f"{label} must be an absolute path when using JOB_RUNNER_BACKEND=container",
        )
    return p


def load_container_config() -> ContainerRunnerConfig:
    image = (os.getenv("JOB_RUNNER_IMAGE") or os.getenv("INFINITO_NEXUS_IMAGE") or "").strip()
    if not image:
        raise HTTPException(
            status_code=500,
            detail="JOB_RUNNER_IMAGE (or INFINITO_NEXUS_IMAGE) must be set for container runner",
        )

    repo_dir = (
        os.getenv("JOB_RUNNER_REPO_DIR")
        or os.getenv("INFINITO_SRC_DIR")
        or "/opt/src/infinito"
    ).strip()
    workdir = (os.getenv("JOB_RUNNER_WORKDIR") or "/workspace").strip()

    network = (os.getenv("DOCKER_NETWORK_NAME") or "").strip() or None
    extra_raw = (os.getenv("JOB_RUNNER_DOCKER_ARGS") or "").strip()
    extra_args = shlex.split(extra_raw) if extra_raw else []

    repo_host_path = (os.getenv("JOB_RUNNER_REPO_HOST_PATH") or "").strip() or None
    if repo_host_path:
        repo_host_path_path = _require_absolute(
            repo_host_path, "JOB_RUNNER_REPO_HOST_PATH"
        )
        if not repo_host_path_path.is_dir():
            raise HTTPException(
                status_code=500,
                detail="JOB_RUNNER_REPO_HOST_PATH is invalid",
            )
        repo_host_path = str(repo_host_path_path)

    return ContainerRunnerConfig(
        image=image,
        repo_dir=repo_dir,
        workdir=workdir,
        network=network,
        extra_args=extra_args,
        repo_host_path=repo_host_path,
        skip_cleanup=env_bool("JOB_RUNNER_SKIP_CLEANUP", False),
        skip_build=env_bool("JOB_RUNNER_SKIP_BUILD", False),
    )


def resolve_docker_bin() -> str:
    preferred = (os.getenv("JOB_RUNNER_DOCKER_BIN") or "").strip()
    candidates = [preferred, "docker", "docker.io"] if preferred else ["docker", "docker.io"]
    for cand in candidates:
        if cand and shutil.which(cand):
            return cand
    raise HTTPException(
        status_code=500,
        detail=(
            "Docker CLI not found in PATH. Install docker-cli in the API container "
            "or set JOB_RUNNER_DOCKER_BIN to the correct binary name."
        ),
    )


def resolve_host_job_dir(job_dir: Path) -> Path:
    state_dir = Path((os.getenv("STATE_DIR") or "/state").strip())
    host_state = (os.getenv("STATE_HOST_PATH") or "").strip()
    if not host_state:
        raise HTTPException(
            status_code=500,
            detail="STATE_HOST_PATH must be set for container runner volume mounts",
        )
    host_state_path = _require_absolute(host_state, "STATE_HOST_PATH")
    try:
        rel = job_dir.relative_to(state_dir)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"job_dir is not inside STATE_DIR: {exc}",
        )
    return host_state_path / rel


def build_container_command(
    *,
    job_id: str,
    job_dir: Path,
    cli_args: List[str],
    cfg: Optional[ContainerRunnerConfig] = None,
) -> Tuple[List[str], str, ContainerRunnerConfig]:
    cfg = cfg or load_container_config()
    docker_bin = resolve_docker_bin()
    host_job_dir = resolve_host_job_dir(job_dir)

    container_name = f"infinito-job-{job_id}"
    inner_cmd = (
        f"export PATH={shlex.quote(cfg.workdir)}:$PATH; "
        + " ".join(shlex.quote(arg) for arg in cli_args)
    )

    cmd: List[str] = [
        docker_bin,
        "run",
        "--rm",
        "--name",
        container_name,
    ]

    if cfg.network:
        cmd.extend(["--network", cfg.network])

    if cfg.extra_args:
        cmd.extend(cfg.extra_args)

    cmd.extend(["-v", f"{host_job_dir}:{cfg.workdir}"])

    if cfg.repo_host_path:
        cmd.extend(["-v", f"{cfg.repo_host_path}:{cfg.repo_dir}:ro"])

    cmd.extend(
        [
            "-e",
            f"PYTHONPATH={cfg.repo_dir}",
            "-w",
            cfg.repo_dir,
            cfg.image,
            "/bin/bash",
            "-lc",
            inner_cmd,
        ]
    )

    return cmd, container_name, cfg


def stop_container(container_name: Optional[str]) -> None:
    name = (container_name or "").strip()
    if not name:
        return
    try:
        subprocess.run(
            ["docker", "stop", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        # Best-effort only
        return
