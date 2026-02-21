from __future__ import annotations

from typing import Any

from .pricing_resolution import (
    _calc_progressive_tiers,
    _calc_volume_bands,
    _contains_regional_prices,
    _find_offering,
    _find_plan,
    _get_units_value,
    _resolve_amount,
    _resolve_input_specs,
    _resolve_inputs,
)
from .pricing_schema import (
    PricingValidationError,
    _REGIONS,
    _as_list,
    _as_mapping,
    _as_str,
    _normalize_interval,
    _to_number,
)


def _evaluate_pricing(
    block: dict[str, Any],
    *,
    inputs: dict[str, Any],
    currency: str,
    region: str | None,
    field: str,
) -> dict[str, Any]:
    price_type = _as_str(block.get("type")).lower() or "fixed"
    interval = _normalize_interval(
        block.get("interval"),
        field=f"{field}.interval",
        default="month",
    )

    if price_type == "custom":
        return {
            "custom": True,
            "interval": interval,
            "amount": None,
            "base": 0.0,
            "usage": 0.0,
            "notes": ["Contact sales for this plan."],
        }

    if price_type in {"fixed", "addon"}:
        amount, _ = _resolve_amount(
            block, currency=currency, region=region, field=field
        )
        return {
            "custom": False,
            "interval": interval,
            "amount": amount,
            "base": amount,
            "usage": 0.0,
            "notes": [],
        }

    if price_type == "per_unit":
        quantity = _get_units_value(block, inputs)
        unit_price, _ = _resolve_amount(
            block, currency=currency, region=region, field=field
        )
        usage = quantity * unit_price
        return {
            "custom": False,
            "interval": interval,
            "amount": usage,
            "base": 0.0,
            "usage": usage,
            "notes": [],
        }

    if price_type == "tiered_per_unit":
        quantity = _get_units_value(block, inputs)
        usage = _calc_progressive_tiers(
            quantity,
            [_as_mapping(item) for item in _as_list(block.get("tiers"))],
            currency=currency,
            region=region,
            field=f"{field}.tiers",
        )
        return {
            "custom": False,
            "interval": interval,
            "amount": usage,
            "base": 0.0,
            "usage": usage,
            "notes": [],
        }

    if price_type == "volume_per_unit":
        quantity = _get_units_value(block, inputs)
        usage = _calc_volume_bands(
            quantity,
            [_as_mapping(item) for item in _as_list(block.get("bands"))],
            currency=currency,
            region=region,
            field=f"{field}.bands",
        )
        return {
            "custom": False,
            "interval": interval,
            "amount": usage,
            "base": 0.0,
            "usage": usage,
            "notes": [],
        }

    if price_type == "bundle":
        base_block = _as_mapping(block.get("base"))
        base_amount, _ = _resolve_amount(
            base_block,
            currency=currency,
            region=region,
            field=f"{field}.base",
        )
        included_units = _as_mapping(block.get("included_units"))
        overage_block = _as_mapping(block.get("overage"))
        unit_key = (
            _as_str(overage_block.get("unit"))
            or _as_str(overage_block.get("input_id"))
            or next(iter(included_units.keys()), "users")
        )
        quantity = _to_number(inputs.get(unit_key, 0), field=f"inputs.{unit_key}")
        included = _to_number(
            included_units.get(unit_key, 0),
            field=f"{field}.included_units.{unit_key}",
        )
        overage_quantity = max(0.0, quantity - included)
        usage = 0.0
        if overage_quantity > 0:
            overage_block = dict(overage_block)
            overage_block["input_id"] = "__overage_units__"
            usage_inputs = dict(inputs)
            usage_inputs["__overage_units__"] = overage_quantity
            nested = _evaluate_pricing(
                overage_block,
                inputs=usage_inputs,
                currency=currency,
                region=region,
                field=f"{field}.overage",
            )
            if nested.get("custom"):
                raise PricingValidationError(f"{field}.overage cannot be custom")
            usage = float(nested.get("amount") or 0.0)

        return {
            "custom": False,
            "interval": interval,
            "amount": base_amount + usage,
            "base": base_amount,
            "usage": usage,
            "notes": [],
        }

    raise PricingValidationError(f"{field}.type '{price_type}' is not supported")


def quote_role_pricing(
    *,
    pricing: dict[str, Any],
    offering_id: str,
    plan_id: str,
    inputs: dict[str, Any] | None,
    currency: str,
    region: str | None,
    include_setup_fee: bool,
) -> dict[str, Any]:
    offering = _find_offering(pricing, offering_id)
    plan = _find_plan(offering, plan_id)

    normalized_region = _as_str(region).lower() or "global"
    if _contains_regional_prices(plan) and not _as_str(region):
        raise PricingValidationError("region is required for region-specific pricing")
    if normalized_region not in _REGIONS:
        raise PricingValidationError(f"region '{normalized_region}' is not supported")

    specs = _resolve_input_specs(pricing, offering, plan)
    resolved_inputs = _resolve_inputs(specs, _as_mapping(inputs or {}))
    quoted_main = _evaluate_pricing(
        _as_mapping(plan.get("pricing")),
        inputs=resolved_inputs,
        currency=currency,
        region=normalized_region,
        field="pricing",
    )

    if quoted_main.get("custom"):
        return {
            "total": None,
            "currency": _as_str(currency).upper(),
            "region": normalized_region,
            "interval": quoted_main.get("interval") or "month",
            "breakdown": {
                "base": 0.0,
                "usage": 0.0,
                "addons": 0.0,
                "factors": 0.0,
                "setup_fee": 0.0,
                "minimum_commit_applied": {"applied": False, "delta": 0.0},
            },
            "notes": quoted_main.get("notes") or ["Contact sales"],
            "inputs": resolved_inputs,
            "contact_sales": True,
        }

    base = float(quoted_main.get("base") or 0.0)
    usage = float(quoted_main.get("usage") or 0.0)
    interval = _as_str(quoted_main.get("interval")) or "month"
    subtotal = float(quoted_main.get("amount") or 0.0)
    addons_total = 0.0
    factors_delta = 0.0
    notes: list[str] = []

    for index, addon in enumerate(_as_list(plan.get("addons"))):
        addon_map = _as_mapping(addon)
        addon_input = (
            _as_str(addon_map.get("input_id"))
            or _as_str(addon_map.get("id"))
            or f"addon_{index}"
        )
        raw_value = resolved_inputs.get(addon_input, addon_map.get("default", False))
        quantity = 1.0 if isinstance(raw_value, bool) and raw_value else 0.0
        if not isinstance(raw_value, bool):
            quantity = _to_number(raw_value, field=f"inputs.{addon_input}")
        if quantity <= 0:
            continue

        block = dict(addon_map)
        if block.get("type") == "fixed":
            amount, _ = _resolve_amount(
                block,
                currency=currency,
                region=normalized_region,
                field=f"addons[{index}]",
            )
            addon_amount = amount * quantity
        else:
            block["input_id"] = "__addon_qty__"
            addon_inputs = dict(resolved_inputs)
            addon_inputs["__addon_qty__"] = quantity
            addon_quote = _evaluate_pricing(
                block,
                inputs=addon_inputs,
                currency=currency,
                region=normalized_region,
                field=f"addons[{index}]",
            )
            addon_amount = float(addon_quote.get("amount") or 0.0)

        addons_total += addon_amount
        subtotal += addon_amount

    for index, factor in enumerate(_as_list(plan.get("factors"))):
        factor_map = _as_mapping(factor)
        input_id = _as_str(factor_map.get("input_id"))
        if not input_id:
            continue

        option = _as_str(resolved_inputs.get(input_id, factor_map.get("default")))
        values = _as_mapping(factor_map.get("values"))
        if option not in values:
            raise PricingValidationError(
                f"factor '{input_id}' does not support value '{option}'"
            )
        multiplier = _to_number(
            values.get(option), field=f"factors[{index}].values.{option}"
        )
        next_subtotal = subtotal * multiplier
        factors_delta += next_subtotal - subtotal
        subtotal = next_subtotal

    minimum_commit_info = {"applied": False, "delta": 0.0}
    minimum_commit = _as_mapping(plan.get("minimum_commit"))
    if minimum_commit:
        minimum_amount, _ = _resolve_amount(
            minimum_commit,
            currency=currency,
            region=normalized_region,
            field="minimum_commit",
        )
        if subtotal < minimum_amount:
            delta = minimum_amount - subtotal
            subtotal = minimum_amount
            minimum_commit_info = {"applied": True, "delta": delta}
            notes.append("Minimum spend applied.")

    setup_fee_amount = 0.0
    setup_fee = _as_mapping(plan.get("setup_fee"))
    if include_setup_fee and setup_fee:
        setup_fee_amount, _ = _resolve_amount(
            setup_fee,
            currency=currency,
            region=normalized_region,
            field="setup_fee",
        )

    total = subtotal + setup_fee_amount
    return {
        "total": round(total, 4),
        "currency": _as_str(currency).upper(),
        "region": normalized_region,
        "interval": interval,
        "breakdown": {
            "base": round(base, 4),
            "usage": round(usage, 4),
            "addons": round(addons_total, 4),
            "factors": round(factors_delta, 4),
            "setup_fee": round(setup_fee_amount, 4),
            "minimum_commit_applied": {
                "applied": bool(minimum_commit_info["applied"]),
                "delta": round(float(minimum_commit_info["delta"]), 4),
            },
        },
        "notes": notes,
        "inputs": resolved_inputs,
        "contact_sales": False,
    }
