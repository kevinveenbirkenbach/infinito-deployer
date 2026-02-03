from __future__ import annotations

import os
import signal
import subprocess
from pathlib import Path
from typing import Dict, Optional

from .util import atomic_write_text


def write_runner_script(path: Path) -> None:
    """
    Generate a reusable CLI wrapper script.
    """
    script = """#!/usr/bin/env bash
set -euo pipefail

log_cmd() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\\n'
}

run_cmd() {
  log_cmd "$@"
  if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL "$@"
  else
    "$@"
  fi
}

echo "+ pwd"
pwd

echo "+ ls -la"
ls -la

if [ "$#" -gt 0 ]; then
  run_cmd "$@"
  exit $?
fi

if [ -n "${RUNNER_CMD:-}" ]; then
  run_cmd /bin/bash -lc "${RUNNER_CMD}"
  exit $?
fi

if command -v ansible-playbook >/dev/null 2>&1 && [ -f "./playbook.yml" ]; then
  run_cmd ansible-playbook -i inventory.yml playbook.yml
  exit $?
fi

echo "No command provided. Set RUNNER_CMD or pass a command to this script."
exit 1
"""
    atomic_write_text(path, script)
    path.chmod(0o700)


def runner_env() -> Dict[str, str]:
    env = dict(os.environ)
    env.setdefault("STATE_DIR", env.get("STATE_DIR", "/state"))
    return env


def start_process(
    *, run_path: Path, cwd: Path, log_path: Path
) -> tuple[subprocess.Popen, object]:
    """
    Start the runner in its own process group so cancellation can kill the group.
    """
    log_fh = open(log_path, "ab", buffering=0)  # binary, unbuffered
    proc = subprocess.Popen(
        ["/bin/bash", str(run_path)],
        cwd=str(cwd),
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        env=runner_env(),
        start_new_session=True,  # new process group/session
    )
    return proc, log_fh


def terminate_process_group(pid: Optional[int]) -> None:
    if not isinstance(pid, int) or pid <= 0:
        return
    try:
        os.killpg(pid, signal.SIGTERM)
    except Exception:
        # Best-effort; ignore failures (already gone / permission)
        return
