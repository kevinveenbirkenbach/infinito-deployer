from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import HTTPException

from services.job_runner.secrets import mask_secrets
from services.job_runner.util import safe_mkdir
from .workspace_context import WORKSPACE_META_FILENAME, _WorkspaceYamlLoader, _safe_resolve

_HISTORY_USER_NAME = "Infinito Workspace"
_HISTORY_USER_EMAIL = "workspace@infinito.local"
_TRACKED_DIFF_FILTER = "AM"
_SECRET_KEY_RE = re.compile(
    r"(?i)(password|passwd|passphrase|secret|token|private_key|api[_-]?key|access[_-]?key)"
)
_YAML_ASSIGN_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$")
_ENV_ASSIGN_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*?)\s*$")
_VAULT_BLOCK_START_RE = re.compile(r"^\s*[A-Za-z0-9_.-]+\s*:\s*!vault\s*\|")
_BLOCK_SCALAR_RE = re.compile(r"^[>|][+-]?$")


def _env_flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name, "") or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _as_non_empty(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


class WorkspaceServiceHistoryMixin:
    def _history_enabled(self) -> bool:
        return _env_flag("WORKSPACE_HISTORY_ENABLED", default=True)

    def _history_include_kdbx(self) -> bool:
        return _env_flag("WORKSPACE_HISTORY_INCLUDE_KDBX", default=False)

    def _git_dir(self, root: Path) -> Path:
        return root / ".git"

    def _history_repo_exists(self, root: Path) -> bool:
        return self._git_dir(root).is_dir()

    def _run_git(
        self,
        root: Path,
        args: list[str],
        *,
        check: bool = True,
        text: bool = True,
        timeout: int = 30,
    ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
        command = ["git", "-C", str(root), *args]
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=text,
                timeout=timeout,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail="git binary not available") from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=500, detail="git command timed out") from exc

        if check and result.returncode != 0:
            stderr = (
                result.stderr.decode("utf-8", errors="replace")
                if isinstance(result.stderr, bytes)
                else str(result.stderr or "")
            ).strip()
            detail = stderr or f"git command failed: {' '.join(args)}"
            raise HTTPException(status_code=500, detail=detail)
        return result

    def _ensure_history_gitignore(self, root: Path) -> None:
        ignore_path = root / ".gitignore"
        required_lines = [
            "# Infinito workspace runtime artifacts",
            WORKSPACE_META_FILENAME,
            "logs/",
        ]
        if not self._history_include_kdbx():
            required_lines.append("secrets/credentials.kdbx")

        existing: list[str] = []
        if ignore_path.is_file():
            existing = ignore_path.read_text(encoding="utf-8", errors="replace").splitlines()

        existing_set = {line.strip() for line in existing}
        additions = [line for line in required_lines if line.strip() not in existing_set]
        if not additions:
            return

        next_lines = list(existing)
        if next_lines and next_lines[-1].strip():
            next_lines.append("")
        next_lines.extend(additions)
        ignore_path.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")

    def _ensure_history_repo(self, root: Path) -> None:
        if not self._history_enabled():
            return
        if self._history_repo_exists(root):
            self._ensure_history_gitignore(root)
            return

        self._run_git(root, ["init", "-q"])
        self._run_git(root, ["config", "user.name", _HISTORY_USER_NAME])
        self._run_git(root, ["config", "user.email", _HISTORY_USER_EMAIL])
        self._run_git(root, ["config", "commit.gpgsign", "false"])
        self._ensure_history_gitignore(root)

    def _normalize_history_path(self, root: Path, raw_path: str | None) -> str | None:
        if raw_path is None:
            return None
        path = (raw_path or "").strip().lstrip("/")
        if not path:
            return None
        target = _safe_resolve(root, path)
        return target.relative_to(root).as_posix()

    def _history_unstage_all(self, root: Path) -> None:
        if not self._history_repo_exists(root):
            return
        self._run_git(root, ["reset", "--quiet"], check=False)

    def _history_stage_all(self, root: Path) -> None:
        self._run_git(root, ["add", "-A", "."])

    def _history_has_index_changes(self, root: Path) -> bool:
        result = self._run_git(root, ["diff", "--cached", "--quiet"], check=False)
        return result.returncode == 1

    def _history_tracked_paths(self, root: Path) -> list[str]:
        result = self._run_git(
            root,
            ["diff", "--cached", "--name-only", f"--diff-filter={_TRACKED_DIFF_FILTER}"],
            check=False,
        )
        if result.returncode != 0:
            return []
        return [
            str(line).strip()
            for line in str(result.stdout or "").splitlines()
            if str(line).strip()
        ]

    def _is_binary_path(self, path: str) -> bool:
        lowered = path.lower()
        return lowered.endswith(
            (
                ".kdbx",
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".svg",
                ".ico",
                ".woff",
                ".woff2",
                ".ttf",
                ".otf",
                ".zip",
                ".gz",
                ".bz2",
                ".xz",
                ".bin",
            )
        )

    def _contains_plaintext_secret(self, text: str) -> tuple[bool, int | None]:
        in_vault_block = False
        vault_block_indent = 0
        for line_number, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if in_vault_block:
                if not stripped:
                    continue
                current_indent = len(line) - len(line.lstrip(" "))
                if current_indent > vault_block_indent:
                    continue
                in_vault_block = False

            if _VAULT_BLOCK_START_RE.match(line):
                in_vault_block = True
                vault_block_indent = len(line) - len(line.lstrip(" "))
                continue

            if not stripped or stripped.startswith("#"):
                continue

            yaml_match = _YAML_ASSIGN_RE.match(line)
            if yaml_match:
                key = yaml_match.group(1).strip()
                value = yaml_match.group(2).strip()
                if _SECRET_KEY_RE.search(key):
                    if not value:
                        return True, line_number
                    if value.startswith(("!vault", "$ANSIBLE_VAULT;", "{{")):
                        continue
                    if _BLOCK_SCALAR_RE.match(value):
                        return True, line_number
                    if value.lower() in {"null", "~"}:
                        continue
                    return True, line_number

            env_match = _ENV_ASSIGN_RE.match(line)
            if env_match:
                key = env_match.group(1).strip()
                value = env_match.group(2).strip()
                if _SECRET_KEY_RE.search(key):
                    if not value:
                        continue
                    if value.startswith(("{{", "$ANSIBLE_VAULT;")):
                        continue
                    return True, line_number

        return False, None

    def _validate_no_plaintext_secrets(self, root: Path) -> None:
        violations: list[str] = []
        for rel_path in self._history_tracked_paths(root):
            if self._is_binary_path(rel_path):
                continue
            path = root / rel_path
            if not path.is_file():
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            has_secret, line_number = self._contains_plaintext_secret(content)
            if not has_secret:
                continue
            if line_number is None:
                violations.append(rel_path)
            else:
                violations.append(f"{rel_path}:{line_number}")

        if violations:
            first = violations[0]
            raise HTTPException(
                status_code=400,
                detail=(
                    "plaintext secret detected in workspace file "
                    f"({first}). Use vault-encrypted values."
                ),
            )

    def _format_commit_message(self, message: str, metadata: dict[str, str] | None) -> str:
        summary = (message or "").strip()
        if not summary:
            summary = "context: workspace update"
        if not metadata:
            return summary
        parts = []
        for key in ("server", "role"):
            value = _as_non_empty(metadata.get(key))
            if value:
                parts.append(f"{key}={value}")
        if not parts:
            return summary
        return f"{summary}\n\n{' '.join(parts)}"

    def _history_commit(
        self, root: Path, message: str, metadata: dict[str, str] | None = None
    ) -> str | None:
        if not self._history_enabled():
            return None

        self._ensure_history_repo(root)
        self._history_stage_all(root)
        if not self._history_has_index_changes(root):
            return None

        try:
            self._validate_no_plaintext_secrets(root)
            full_message = self._format_commit_message(message, metadata)
            self._run_git(root, ["commit", "--quiet", "-m", full_message, "--no-gpg-sign"])
        except Exception:
            self._history_unstage_all(root)
            raise

        sha = str(self._run_git(root, ["rev-parse", "HEAD"]).stdout).strip()
        tracked_status = str(
            self._run_git(root, ["status", "--porcelain", "--untracked-files=no"]).stdout
            or ""
        ).strip()
        if tracked_status:
            raise HTTPException(status_code=500, detail="workspace history index not clean")
        return sha

    def commit_workspace_history(
        self, workspace_id: str, message: str, metadata: dict[str, str] | None = None
    ) -> str | None:
        root = self.ensure(workspace_id)
        return self._history_commit(root, message, metadata=metadata)

    def _resolve_history_sha(self, root: Path, sha: str) -> str:
        candidate = (sha or "").strip()
        if not candidate:
            raise HTTPException(status_code=400, detail="sha is required")
        result = self._run_git(
            root, ["rev-parse", "--verify", f"{candidate}^{{commit}}"], check=False
        )
        if result.returncode != 0:
            raise HTTPException(status_code=404, detail="history commit not found")
        return str(result.stdout or "").strip()

    def _has_history_commits(self, root: Path) -> bool:
        result = self._run_git(root, ["rev-parse", "--verify", "HEAD"], check=False)
        return result.returncode == 0

    def _parse_name_status_lines(self, raw: str) -> list[dict[str, Any]]:
        changes: list[dict[str, Any]] = []
        for line in (raw or "").splitlines():
            entry = line.strip()
            if not entry:
                continue
            parts = entry.split("\t")
            status = parts[0] if parts else ""
            code = status[:1]
            if code in {"R", "C"} and len(parts) >= 3:
                changes.append(
                    {
                        "status": code,
                        "path": parts[2],
                        "old_path": parts[1],
                    }
                )
                continue
            if len(parts) >= 2:
                changes.append({"status": code or "M", "path": parts[1]})
        return changes

    def _history_changed_files(
        self, root: Path, sha: str, path_filter: str | None
    ) -> list[dict[str, Any]]:
        args = ["show", "--name-status", "--find-renames", "--pretty=format:", sha]
        if path_filter:
            args.extend(["--", path_filter])
        result = self._run_git(root, args)
        return self._parse_name_status_lines(str(result.stdout or ""))

    def list_history(
        self,
        workspace_id: str,
        *,
        path: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        root = self.ensure(workspace_id)
        if not self._history_repo_exists(root) or not self._has_history_commits(root):
            return []

        if limit < 1:
            limit = 1
        if limit > 500:
            limit = 500
        if offset < 0:
            offset = 0

        normalized_path = self._normalize_history_path(root, path)

        args = [
            "log",
            "--date=iso-strict",
            "--pretty=format:%H%x1f%cI%x1f%s",
            f"--skip={offset}",
            f"-n{limit}",
            "--no-color",
        ]
        if normalized_path:
            args.extend(["--", normalized_path])

        result = self._run_git(root, args, check=False)
        if result.returncode != 0:
            return []

        commits: list[dict[str, Any]] = []
        for line in str(result.stdout or "").splitlines():
            if "\x1f" not in line:
                continue
            parts = line.split("\x1f", 2)
            if len(parts) != 3:
                continue
            sha, created_at, summary = parts
            commit_sha = sha.strip()
            if not commit_sha:
                continue
            commits.append(
                {
                    "sha": commit_sha,
                    "created_at": created_at.strip(),
                    "summary": summary.strip(),
                    "files": self._history_changed_files(
                        root, commit_sha, normalized_path
                    ),
                }
            )
        return commits

    def get_history_commit(
        self, workspace_id: str, sha: str, *, path: str | None = None
    ) -> dict[str, Any]:
        root = self.ensure(workspace_id)
        if not self._history_repo_exists(root):
            raise HTTPException(status_code=404, detail="history not initialized")

        normalized_path = self._normalize_history_path(root, path)
        resolved = self._resolve_history_sha(root, sha)

        info = self._run_git(
            root,
            ["show", "-s", "--date=iso-strict", "--pretty=format:%H%x1f%cI%x1f%s", resolved],
        )
        parts = str(info.stdout or "").split("\x1f", 2)
        if len(parts) != 3:
            raise HTTPException(status_code=500, detail="invalid history commit format")

        return {
            "sha": parts[0].strip(),
            "created_at": parts[1].strip(),
            "summary": parts[2].strip(),
            "files": self._history_changed_files(root, resolved, normalized_path),
        }

    def get_history_diff(
        self,
        workspace_id: str,
        sha: str,
        *,
        path: str | None = None,
        against_current: bool = False,
    ) -> dict[str, Any]:
        root = self.ensure(workspace_id)
        if not self._history_repo_exists(root):
            raise HTTPException(status_code=404, detail="history not initialized")

        normalized_path = self._normalize_history_path(root, path)
        resolved = self._resolve_history_sha(root, sha)

        if against_current:
            diff_args = ["diff", "--no-color", "--unified=3", resolved]
            files_args = ["diff", "--name-status", resolved]
            if normalized_path:
                diff_args.extend(["--", normalized_path])
                files_args.extend(["--", normalized_path])
            diff_result = self._run_git(root, diff_args, check=False)
            files_result = self._run_git(root, files_args, check=False)
            if diff_result.returncode not in {0, 1}:
                raise HTTPException(status_code=500, detail="failed to compute diff")
            if files_result.returncode not in {0, 1}:
                raise HTTPException(status_code=500, detail="failed to compute diff")
            file_changes = self._parse_name_status_lines(str(files_result.stdout or ""))
        else:
            diff_args = ["show", "--no-color", "--unified=3", "--pretty=format:", resolved]
            if normalized_path:
                diff_args.extend(["--", normalized_path])
            diff_result = self._run_git(root, diff_args, check=False)
            if diff_result.returncode != 0:
                raise HTTPException(status_code=500, detail="failed to compute diff")
            file_changes = self._history_changed_files(root, resolved, normalized_path)

        diff_text = str(diff_result.stdout or "")
        masked = mask_secrets(diff_text, secrets=[])
        return {
            "sha": resolved,
            "path": normalized_path,
            "against_current": bool(against_current),
            "files": file_changes,
            "diff": masked,
        }

    def _export_history_snapshot(
        self, root: Path, sha: str, destination: Path, path: str | None = None
    ) -> None:
        args = ["archive", "--format=tar", sha]
        if path:
            args.append(path)
        result = self._run_git(root, args, text=False, check=False)
        if result.returncode != 0:
            stderr = (
                result.stderr.decode("utf-8", errors="replace")
                if isinstance(result.stderr, bytes)
                else str(result.stderr or "")
            ).strip()
            if "did not match any files" in stderr.lower():
                raise HTTPException(status_code=404, detail="path not found in history commit")
            raise HTTPException(status_code=500, detail=stderr or "failed to export history")

        payload = result.stdout if isinstance(result.stdout, bytes) else b""
        if not payload:
            return
        safe_mkdir(destination)
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            for member in archive.getmembers():
                target = destination / member.name
                resolved = target.resolve()
                if destination.resolve() not in resolved.parents and resolved != destination.resolve():
                    raise HTTPException(status_code=400, detail="invalid archive path")
            archive.extractall(destination)

    def _validate_snapshot_files(self, snapshot_root: Path) -> None:
        for path in snapshot_root.rglob("*"):
            if not path.is_file():
                continue
            suffix = path.suffix.lower()
            if suffix not in {".yml", ".yaml", ".json"}:
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            try:
                if suffix == ".json":
                    json.loads(raw or "{}")
                else:
                    yaml.load(raw or "{}", Loader=_WorkspaceYamlLoader)
            except Exception as exc:
                rel = path.relative_to(snapshot_root).as_posix()
                raise HTTPException(
                    status_code=400,
                    detail=f"restored content invalid in {rel}: {exc}",
                ) from exc

    def _clear_workspace_payload(self, root: Path) -> None:
        for child in list(root.iterdir()):
            if child.name in {".git", WORKSPACE_META_FILENAME}:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink(missing_ok=True)

    def _copy_workspace_payload(self, source: Path, target: Path) -> None:
        for child in source.iterdir():
            if child.name in {".git", WORKSPACE_META_FILENAME}:
                continue
            dest = target / child.name
            if child.is_dir():
                shutil.copytree(child, dest)
            else:
                safe_mkdir(dest.parent)
                shutil.copy2(child, dest)

    def restore_history_workspace(self, workspace_id: str, sha: str) -> dict[str, Any]:
        root = self.ensure(workspace_id)
        if not self._history_repo_exists(root):
            raise HTTPException(status_code=404, detail="history not initialized")
        resolved = self._resolve_history_sha(root, sha)

        snapshot_dir = Path(tempfile.mkdtemp(prefix="workspace-restore-snapshot-"))
        backup_dir = Path(tempfile.mkdtemp(prefix="workspace-restore-backup-"))
        try:
            self._export_history_snapshot(root, resolved, snapshot_dir, path=None)
            self._validate_snapshot_files(snapshot_dir)
            self._copy_workspace_payload(root, backup_dir)

            try:
                self._clear_workspace_payload(root)
                self._copy_workspace_payload(snapshot_dir, root)
            except Exception as exc:
                self._clear_workspace_payload(root)
                self._copy_workspace_payload(backup_dir, root)
                raise HTTPException(
                    status_code=500, detail=f"failed to restore workspace: {exc}"
                ) from exc
        finally:
            shutil.rmtree(snapshot_dir, ignore_errors=True)
            shutil.rmtree(backup_dir, ignore_errors=True)

        self._history_commit(root, f"context: restore workspace ({resolved[:12]})")
        return {"ok": True, "sha": resolved}

    def _remove_path(self, path: Path) -> None:
        if not path.exists():
            return
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)

    def restore_history_path(
        self, workspace_id: str, sha: str, path: str
    ) -> dict[str, Any]:
        root = self.ensure(workspace_id)
        if not self._history_repo_exists(root):
            raise HTTPException(status_code=404, detail="history not initialized")

        normalized_path = self._normalize_history_path(root, path)
        if not normalized_path:
            raise HTTPException(status_code=400, detail="path is required")
        resolved = self._resolve_history_sha(root, sha)

        snapshot_dir = Path(tempfile.mkdtemp(prefix="workspace-restore-path-snapshot-"))
        backup_dir = Path(tempfile.mkdtemp(prefix="workspace-restore-path-backup-"))
        destination = _safe_resolve(root, normalized_path)
        source = snapshot_dir / normalized_path

        had_destination = destination.exists()
        backup_payload = backup_dir / "payload"
        try:
            self._export_history_snapshot(root, resolved, snapshot_dir, path=normalized_path)
            if not source.exists():
                raise HTTPException(status_code=404, detail="path not found in history commit")
            self._validate_snapshot_files(snapshot_dir)

            if had_destination:
                if destination.is_dir():
                    shutil.copytree(destination, backup_payload)
                else:
                    safe_mkdir(backup_payload.parent)
                    shutil.copy2(destination, backup_payload)

            try:
                self._remove_path(destination)
                if source.is_dir():
                    safe_mkdir(destination.parent)
                    shutil.copytree(source, destination)
                else:
                    safe_mkdir(destination.parent)
                    shutil.copy2(source, destination)
            except Exception as exc:
                self._remove_path(destination)
                if had_destination and backup_payload.exists():
                    if backup_payload.is_dir():
                        shutil.copytree(backup_payload, destination)
                    else:
                        safe_mkdir(destination.parent)
                        shutil.copy2(backup_payload, destination)
                raise HTTPException(
                    status_code=500, detail=f"failed to restore path: {exc}"
                ) from exc
        finally:
            shutil.rmtree(snapshot_dir, ignore_errors=True)
            shutil.rmtree(backup_dir, ignore_errors=True)

        self._history_commit(
            root,
            f"context: restore path ({normalized_path})",
        )
        return {"ok": True, "sha": resolved, "path": normalized_path}
