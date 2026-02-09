from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Set

_ALLOWED_STATUSES: Set[str] = {"pre-alpha", "alpha", "beta", "stable", "deprecated"}
_ALLOWED_TARGETS: Set[str] = {"server", "workstation"}


def safe_lower(s: str) -> str:
    return (s or "").strip().lower()


def split_csv(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class RoleQuery:
    statuses: Set[str]
    deploy_targets: Set[str]
    categories: Set[str]
    tags: Set[str]
    q: Optional[str]

    @staticmethod
    def from_raw(
        *,
        status: Optional[str],
        deploy_target: Optional[str],
        category: Optional[str],
        tags: Optional[str],
        q: Optional[str],
    ) -> "RoleQuery":
        statuses = {safe_lower(x) for x in split_csv(status)}
        deploy_targets = {safe_lower(x) for x in split_csv(deploy_target)}
        categories = {safe_lower(x) for x in split_csv(category)}
        tagset = {safe_lower(x) for x in split_csv(tags)}
        qq = (q or "").strip() or None

        return RoleQuery(
            statuses=statuses,
            deploy_targets=deploy_targets,
            categories=categories,
            tags=tagset,
            q=qq,
        )


def statuses_valid(statuses: Set[str]) -> bool:
    return not statuses or statuses.issubset(_ALLOWED_STATUSES)


def targets_valid(targets: Set[str]) -> bool:
    return not targets or targets.issubset(_ALLOWED_TARGETS)
