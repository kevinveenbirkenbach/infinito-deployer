from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class ProviderOut(BaseModel):
    id: str
    name: str
    supports: List[str] = Field(default_factory=list)


class ProviderListOut(BaseModel):
    providers: List[ProviderOut] = Field(default_factory=list)


class ProviderOfferOut(BaseModel):
    provider: str
    product_type: str
    offer_id: str
    name: str
    region: str
    location_label: str
    cpu_cores: int
    ram_gb: float
    storage: Dict[str, Any] = Field(default_factory=dict)
    network: Dict[str, Any] = Field(default_factory=dict)
    pricing: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ProviderOffersOut(BaseModel):
    updated_at: str
    stale: bool = False
    offers: List[ProviderOfferOut] = Field(default_factory=list)


class ProviderOrderServerIn(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    offer_id: str = Field(..., min_length=1)
    provider: Optional[str] = None
    alias: Optional[str] = None
    primary_domain: Optional[str] = None
    confirm: bool = False

    @field_validator("workspace_id", "offer_id", "provider", "alias", "primary_domain")
    @classmethod
    def _strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class ProviderOrderServerOut(BaseModel):
    provider: str
    offer_id: str
    name: str
    region: str
    specs: Dict[str, Any] = Field(default_factory=dict)
    monthly_estimate: float
    currency: str
    device: Dict[str, Any] = Field(default_factory=dict)


class ProviderOrderDomainIn(BaseModel):
    provider: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    confirm: bool = False


class ProviderOrderDomainOut(BaseModel):
    ok: bool = True
    provider: str
    domain: str
    note: str


class ProviderDnsZoneIn(BaseModel):
    provider: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    records: List[Dict[str, Any]] = Field(default_factory=list)
    confirm: bool = False


class ProviderDnsZoneOut(BaseModel):
    ok: bool = True
    provider: str
    domain: str
    records: List[Dict[str, Any]] = Field(default_factory=list)
    note: str


class ProviderPrimaryDomainIn(BaseModel):
    workspace_id: str = Field(..., min_length=1)
    alias: str = Field(..., min_length=1)
    primary_domain: Optional[str] = None

    @field_validator("workspace_id", "alias", "primary_domain")
    @classmethod
    def _strip_primary(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class ProviderPrimaryDomainOut(BaseModel):
    alias: str
    host_vars_path: str
    primary_domain: Optional[str] = None
