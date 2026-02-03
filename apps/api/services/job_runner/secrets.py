from __future__ import annotations

from typing import Any, Iterable, List
import re

from api.schemas.deployment import DeploymentRequest

MASK = "********"

_SECRET_KEYWORDS = (
    "password",
    "passwd",
    "secret",
    "token",
    "private_key",
    "apikey",
    "api_key",
    "access_key",
    "client_secret",
)

_INLINE_VALUE_PATTERNS = [
    re.compile(
        r"(?i)((?:password|passwd|secret|token|apikey|api_key|access_key|private_key)\s*[:=]\s*)([^\s]+)"
    ),
    re.compile(r"(?i)((?:sshpass\s+-p\s+))([^\s]+)"),
    re.compile(r"(?i)((?:--password\s+))([^\s]+)"),
    re.compile(r"(?i)((?:--token\s+))([^\s]+)"),
]

_PRIVATE_KEY_BLOCK = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.DOTALL,
)


def _is_secret_key(key: str) -> bool:
    lowered = (key or "").lower()
    return any(k in lowered for k in _SECRET_KEYWORDS)


def _collect_from_vars(value: Any, *, key_hint: bool, out: List[str]) -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            hint = key_hint or _is_secret_key(str(k))
            _collect_from_vars(v, key_hint=hint, out=out)
        return

    if isinstance(value, list):
        for item in value:
            _collect_from_vars(item, key_hint=key_hint, out=out)
        return

    if key_hint and isinstance(value, str):
        s = value.strip()
        if s:
            out.append(s)


def collect_secrets(req: DeploymentRequest) -> List[str]:
    secrets: List[str] = []

    if req.auth.password:
        secrets.append(req.auth.password)
    if req.auth.private_key:
        secrets.append(req.auth.private_key)
        for line in req.auth.private_key.splitlines():
            s = line.strip()
            if s:
                secrets.append(s)

    _collect_from_vars(req.inventory_vars or {}, key_hint=False, out=secrets)

    return _dedupe(secrets)


def _dedupe(items: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def mask_secrets(text: str, secrets: Iterable[str]) -> str:
    if not text:
        return text

    redacted = text

    secret_set = {s for s in secrets if s}
    if secret_set:
        for secret in sorted(secret_set, key=len, reverse=True):
            if secret and secret in redacted:
                redacted = redacted.replace(secret, MASK)

    if _PRIVATE_KEY_BLOCK.search(redacted):
        redacted = _PRIVATE_KEY_BLOCK.sub(MASK, redacted)

    for pattern in _INLINE_VALUE_PATTERNS:
        redacted = pattern.sub(lambda m: f"{m.group(1)}{MASK}", redacted)

    return redacted
