from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import httpx


_SIMPLEICONS_CDN = "https://cdn.simpleicons.org"
_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days


def _now() -> int:
    return int(time.time())


def _safe_mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _atomic_write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def _data_url_placeholder_svg(label: str = "app") -> str:
    # A tiny inline SVG placeholder (data URL) -> never broken
    safe = re.sub(r"[^a-zA-Z0-9 _-]+", "", label).strip() or "app"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect x="6" y="6" width="84" height="84" rx="18" fill="#111827"/>
  <text x="48" y="54" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="18" fill="#F9FAFB">{safe[:8]}</text>
</svg>"""
    # data:image/svg+xml;utf8 is fine here; keep it small and robust
    return "data:image/svg+xml;utf8," + svg.replace("\n", "").replace("#", "%23")


@dataclass(frozen=True)
class ResolvedLogo:
    source: str  # "meta" | "simpleicons" | "placeholder"
    css_class: Optional[str] = None
    url: Optional[str] = None


class SimpleIconsResolver:
    """
    Resolve an icon URL via Simple Icons CDN, with:
      - manual overrides
      - deterministic normalization
      - HEAD/GET validation to prevent broken URLs
      - persistent cache under STATE_DIR/cache/simpleicons.json

    Cache records:
      { "<role_id>": {"url": "...", "slug": "...", "ok": true/false, "ts": <unix>} }
    """

    def __init__(self) -> None:
        state_dir = os.getenv("STATE_DIR", "/state").strip() or "/state"
        self._cache_path = Path(state_dir) / "cache" / "simpleicons.json"
        _safe_mkdir(self._cache_path.parent)

        self._mem: Dict[str, dict] = {}
        self._load_cache()

        # Keep this list small and pragmatic; extend as you notice mismatches.
        self._overrides: Dict[str, str] = {
            # role id -> simpleicons slug
            "web-app-nextcloud": "nextcloud",
            "web-app-keycloak": "keycloak",
            "web-app-gitea": "gitea",
            "web-app-github": "github",
            "web-app-gitlab": "gitlab",
            "web-app-mastodon": "mastodon",
            "web-app-peertube": "peertube",
            "web-app-pixelfed": "pixelfed",
            "web-app-discourse": "discourse",
            "web-app-wordpress": "wordpress",
            "web-app-mediawiki": "mediawiki",
            "web-app-openproject": "openproject",
            "web-app-taiga": "taiga",
            "web-app-mailu": "maildotru",  # NOTE: likely not ideal; adjust if you prefer placeholder
            "svc-prx-openresty": "openresty",
            "web-svc-libretranslate": "libretranslate",
            "web-app-postgresql": "postgresql",
            "web-app-pgadmin": "postgresql",
            "web-app-phpmyadmin": "phpmyadmin",
            "web-app-redis": "redis",
            "web-app-mariadb": "mariadb",
            "web-app-mongodb": "mongodb",
            "web-app-rabbitmq": "rabbitmq",
            "web-app-traefik": "traefikproxy",  # simpleicons slug is "traefikproxy"
            "web-app-nginx": "nginx",
            "web-app-apache": "apache",
            "web-app-docker-registry": "docker",
            "web-app-oauth2-proxy": "oauth",
        }

        self._client = httpx.Client(timeout=2.5, follow_redirects=True)

    def _load_cache(self) -> None:
        if not self._cache_path.is_file():
            self._mem = {}
            return
        try:
            data = json.loads(self._cache_path.read_text(encoding="utf-8"))
            self._mem = data if isinstance(data, dict) else {}
        except Exception:
            self._mem = {}

    def _save_cache(self) -> None:
        _atomic_write_json(self._cache_path, self._mem)

    def _is_fresh(self, rec: dict) -> bool:
        ts = rec.get("ts")
        if not isinstance(ts, int):
            return False
        return (_now() - ts) < _DEFAULT_TTL_SECONDS

    def _normalize_role_to_candidates(self, role_id: str) -> List[str]:
        """
        Normalize role id -> list of candidate simpleicons slugs.

        Strategy:
          1) strip known prefixes
          2) use remaining token(s) to form candidates
          3) try "joined", then last token, then a few heuristic merges
        """
        rid = (role_id or "").strip().lower()
        if not rid:
            return []

        prefixes = [
            "web-app-",
            "web-svc-",
            "svc-",
            "sys-",
            "util-srv-",
            "util-desk-",
            "desk-",
            "drv-",
            "persona-provider-",
            "persona-",
        ]
        base = rid
        for p in prefixes:
            if base.startswith(p):
                base = base[len(p) :]
                break

        parts = [x for x in re.split(r"[-_]+", base) if x]
        if not parts:
            return []

        joined = "".join(parts)

        cands: List[str] = []
        # Most specific first
        cands.append(joined)  # e.g. "oauth2proxy" style
        cands.append(
            "-".join(parts)
        )  # sometimes slugs contain hyphen (rare for simpleicons CDN)
        cands.append(parts[-1])  # last token is often the product name

        # Common heuristic: remove "docker", "core", "server", "svc", etc.
        stop = {"docker", "core", "server", "svc", "app", "web", "proxy", "provider"}
        filtered = [p for p in parts if p not in stop]
        if filtered and filtered != parts:
            cands.append("".join(filtered))
            cands.append(filtered[-1])

        # Dedup, keep order
        out: List[str] = []
        seen = set()
        for c in cands:
            c = c.strip().lower()
            c = c.replace(".", "").replace(" ", "")
            if not c:
                continue
            if c not in seen:
                out.append(c)
                seen.add(c)
        return out

    def _simpleicons_url(self, slug: str) -> str:
        # cdn.simpleicons.org returns an SVG if the slug exists; 404 otherwise.
        return f"{_SIMPLEICONS_CDN}/{slug}"

    def _validate_url(self, url: str) -> bool:
        # GET is more reliable across CDNs than HEAD.
        try:
            r = self._client.get(url)
            if r.status_code != 200:
                return False
            ctype = r.headers.get("content-type", "").lower()
            return (
                "image/svg+xml" in ctype or "text/plain" in ctype or "image/" in ctype
            )
        except Exception:
            return False

    def resolve_logo_url(
        self, role_id: str, *, display_hint: str = "app"
    ) -> ResolvedLogo:
        """
        Resolve a logo for a role_id, returning:
          - source="simpleicons" + url if found
          - otherwise source="placeholder" + data-url
        """
        rid = (role_id or "").strip()
        if not rid:
            return ResolvedLogo(
                source="placeholder", url=_data_url_placeholder_svg(display_hint)
            )

        # Cache hit
        rec = self._mem.get(rid)
        if isinstance(rec, dict) and self._is_fresh(rec):
            if rec.get("ok") is True and isinstance(rec.get("url"), str):
                return ResolvedLogo(source="simpleicons", url=rec["url"])
            # Negative cache -> skip re-check until TTL
            if rec.get("ok") is False:
                return ResolvedLogo(
                    source="placeholder", url=_data_url_placeholder_svg(display_hint)
                )

        # Overrides first
        slug = self._overrides.get(rid)
        if slug:
            url = self._simpleicons_url(slug)
            ok = self._validate_url(url)
            self._mem[rid] = {"slug": slug, "url": url, "ok": bool(ok), "ts": _now()}
            self._save_cache()
            if ok:
                return ResolvedLogo(source="simpleicons", url=url)
            return ResolvedLogo(
                source="placeholder", url=_data_url_placeholder_svg(display_hint)
            )

        # Try candidates
        for cand in self._normalize_role_to_candidates(rid):
            url = self._simpleicons_url(cand)
            if self._validate_url(url):
                self._mem[rid] = {"slug": cand, "url": url, "ok": True, "ts": _now()}
                self._save_cache()
                return ResolvedLogo(source="simpleicons", url=url)

        # Negative cache
        self._mem[rid] = {"slug": None, "url": None, "ok": False, "ts": _now()}
        self._save_cache()
        return ResolvedLogo(
            source="placeholder", url=_data_url_placeholder_svg(display_hint)
        )
