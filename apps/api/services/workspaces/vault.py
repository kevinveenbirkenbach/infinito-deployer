from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from services.job_runner.util import safe_mkdir

SECRETS_DIRNAME = "secrets"
KDBX_FILENAME = "credentials.kdbx"
KEYS_DIRNAME = "keys"


def _sanitize_host_filename(host: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", host.strip())
    return cleaned or "host"


def _secrets_dir(root: Path) -> Path:
    return root / SECRETS_DIRNAME


def _keys_dir(root: Path) -> Path:
    return _secrets_dir(root) / KEYS_DIRNAME


def _kdbx_path(root: Path) -> Path:
    return _secrets_dir(root) / KDBX_FILENAME


def _ensure_secrets_dirs(root: Path) -> None:
    safe_mkdir(_secrets_dir(root))
    safe_mkdir(_keys_dir(root))


def _vault_alias(alias: Optional[str]) -> str:
    cleaned = _sanitize_host_filename(alias or "default")
    return cleaned or "default"


def _vault_entry_title(kind: str, alias: Optional[str] = None) -> str:
    if kind == "vault_password":
        return "vault_password"
    if kind == "server_password":
        return f"server_password::{_vault_alias(alias)}"
    if kind == "key_passphrase":
        return f"key_passphrase::{_vault_alias(alias)}"
    raise ValueError(f"unknown vault entry kind: {kind}")


def _open_kdbx(
    root: Path,
    master_password: str,
    *,
    create_if_missing: bool,
    master_password_confirm: Optional[str] = None,
):
    if not (master_password or "").strip():
        raise HTTPException(status_code=400, detail="master_password is required")
    path = _kdbx_path(root)
    if not path.exists():
        if not create_if_missing:
            raise HTTPException(status_code=404, detail="credentials vault not found")
        if (
            master_password_confirm is None
            or master_password_confirm != master_password
        ):
            raise HTTPException(
                status_code=400, detail="master password confirmation mismatch"
            )
        _ensure_secrets_dirs(root)
        try:
            from pykeepass import create_database
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"pykeepass not available: {exc}"
            )
        create_database(str(path), password=master_password)
        try:
            path.chmod(0o600)
        except Exception:
            pass
    try:
        from pykeepass import PyKeePass
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"pykeepass not available: {exc}")
    try:
        return PyKeePass(str(path), password=master_password)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid master password")


def _upsert_kdbx_entry(kp, title: str, password: Optional[str]) -> None:
    entry = kp.find_entries(title=title, first=True)
    if password is None:
        return
    if password == "":
        if entry:
            kp.delete_entry(entry)
        return
    if entry:
        entry.password = password
    else:
        kp.add_entry(kp.root_group, title=title, username="", password=password)


def _read_kdbx_entry(kp, title: str) -> Optional[str]:
    entry = kp.find_entries(title=title, first=True)
    if not entry:
        return None
    value = entry.password or ""
    return value or None


def _vault_password_from_kdbx(
    root: Path,
    master_password: str,
    *,
    create_if_missing: bool = False,
    provision_if_missing: bool = False,
) -> str:
    kp = _open_kdbx(
        root,
        master_password,
        create_if_missing=create_if_missing,
        master_password_confirm=master_password if create_if_missing else None,
    )
    value = _read_kdbx_entry(kp, _vault_entry_title("vault_password"))
    if value:
        return value

    if not provision_if_missing:
        raise HTTPException(status_code=400, detail="vault password not set")

    value = _generate_passphrase()
    _upsert_kdbx_entry(kp, _vault_entry_title("vault_password"), value)
    kp.save()
    return value


def _generate_passphrase() -> str:
    return secrets.token_urlsafe(24)
