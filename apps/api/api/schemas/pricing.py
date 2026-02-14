from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class PricingQuoteIn(BaseModel):
    role_id: str = Field(..., min_length=1)
    offering_id: str = Field(..., min_length=1)
    plan_id: str = Field(..., min_length=1)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    currency: str = Field(..., min_length=3, max_length=3)
    region: Optional[str] = Field(default=None, min_length=1)
    include_setup_fee: bool = False

    @field_validator("role_id", "offering_id", "plan_id", "currency", "region")
    @classmethod
    def _strip_values(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        return trimmed


class PricingMinimumCommitOut(BaseModel):
    applied: bool = False
    delta: float = 0.0


class PricingBreakdownOut(BaseModel):
    base: float = 0.0
    usage: float = 0.0
    addons: float = 0.0
    factors: float = 0.0
    setup_fee: float = 0.0
    minimum_commit_applied: PricingMinimumCommitOut = Field(
        default_factory=PricingMinimumCommitOut
    )


class PricingQuoteOut(BaseModel):
    total: Optional[float] = None
    currency: str
    region: str
    interval: str
    breakdown: PricingBreakdownOut
    notes: List[str] = Field(default_factory=list)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    contact_sales: bool = False
