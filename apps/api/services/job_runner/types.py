from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, TypedDict


@dataclass(frozen=True)
class JobPaths:
    job_dir: Path
    meta_path: Path
    request_path: Path
    inventory_path: Path
    vars_json_path: Path
    vars_yaml_path: Path
    ssh_key_path: Path
    log_path: Path
    run_path: Path


class JobMeta(TypedDict, total=False):
    job_id: str
    status: str
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]
    pid: Optional[int]
    exit_code: Optional[int]
