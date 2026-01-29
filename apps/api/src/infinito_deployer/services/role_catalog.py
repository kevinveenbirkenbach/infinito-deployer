from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RoleEntry:
    id: str
    enabled: bool = True
    hidden: bool = False


class RoleCatalogError(RuntimeError):
    pass


class RoleCatalogService:
    """
    Loads the canonical role list from a generated roles/list.json.

    Strict behavior:
      - Missing file -> RoleCatalogError
      - Invalid JSON -> RoleCatalogError
      - Unsupported structure -> RoleCatalogError

    Supported formats:
      1) ["roleA", "roleB", ...]
      2) [{"id": "roleA", "enabled": true, "hidden": false}, ...]
         (also accepts "role_id" as identifier key)
    """

    def __init__(self) -> None:
        self._list_path = os.getenv("ROLE_CATALOG_LIST_JSON", "").strip()

    def load_roles(self) -> list[RoleEntry]:
        if not self._list_path:
            raise RoleCatalogError("ROLE_CATALOG_LIST_JSON is not set")

        if not os.path.isfile(self._list_path):
            raise RoleCatalogError(f"roles list missing: {self._list_path}")

        try:
            with open(self._list_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            raise RoleCatalogError(f"roles list invalid JSON: {exc}") from exc

        entries: list[RoleEntry] = []

        # Format (1): list[str]
        if isinstance(data, list) and all(isinstance(x, str) for x in data):
            entries = [RoleEntry(id=x.strip()) for x in data if x.strip()]

        # Format (2): list[dict]
        elif isinstance(data, list) and all(isinstance(x, dict) for x in data):
            for obj in data:
                rid = obj.get("id") or obj.get("role_id")
                if not isinstance(rid, str) or not rid.strip():
                    # Skip malformed entry (non-fatal for individual entries)
                    continue

                enabled = obj.get("enabled", True)
                hidden = obj.get("hidden", False)

                entries.append(
                    RoleEntry(
                        id=rid.strip(),
                        enabled=bool(enabled),
                        hidden=bool(hidden),
                    )
                )

        else:
            raise RoleCatalogError(
                "roles list must be a JSON list of strings or objects"
            )

        # Filter enabled/hidden
        entries = [e for e in entries if e.enabled and not e.hidden]

        # Enforce uniqueness (no duplication)
        seen: set[str] = set()
        unique: list[RoleEntry] = []
        for e in entries:
            if e.id in seen:
                continue
            seen.add(e.id)
            unique.append(e)

        return unique
