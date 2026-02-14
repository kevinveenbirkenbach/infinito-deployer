from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class BundleOut(BaseModel):
    id: str
    slug: str
    deploy_target: str
    title: str
    description: str
    logo_class: Optional[str] = None
    tags: List[str] = []
    categories: List[str] = []
    role_ids: List[str] = []
