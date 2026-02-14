from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas.pricing import PricingQuoteIn, PricingQuoteOut
from services.pricing_engine import PricingValidationError, quote_role_pricing
from services.role_index import RoleIndexService

router = APIRouter(prefix="/pricing", tags=["pricing"])

_index = RoleIndexService()


@router.post("/quote", response_model=PricingQuoteOut)
def quote_pricing(payload: PricingQuoteIn) -> PricingQuoteOut:
    role = _index.get(payload.role_id)
    pricing = role.pricing
    if not isinstance(pricing, dict) or not pricing:
        raise HTTPException(status_code=400, detail="pricing metadata not available")

    try:
        quoted = quote_role_pricing(
            pricing=pricing,
            offering_id=payload.offering_id,
            plan_id=payload.plan_id,
            inputs=payload.inputs,
            currency=payload.currency,
            region=payload.region,
            include_setup_fee=payload.include_setup_fee,
        )
    except PricingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PricingQuoteOut(**quoted)
