from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .pricing_schema import (
    PricingValidationError,
    _CURRENCY_RE,
    _as_list,
    _as_mapping,
    _as_str,
    _default_pricing,
    _normalize_input_spec,
    _normalize_pricing_block,
    _pricing_file_from_meta,
    _to_number,
    build_pricing_summary,
)


def _normalize_pricing_doc(doc: dict[str, Any], *, role_id: str) -> dict[str, Any]:
    schema = _as_str(doc.get("schema")).lower()
    if schema != "v2":
        raise PricingValidationError("schema must be v2")

    normalized: dict[str, Any] = {
        "schema": "v2",
        "default_offering_id": _as_str(doc.get("default_offering_id")) or "default",
        "default_plan_id": _as_str(doc.get("default_plan_id")) or "community",
    }

    inputs = [
        _normalize_input_spec(item, field="inputs")
        for item in _as_list(doc.get("inputs"))
    ]
    if inputs:
        normalized["inputs"] = inputs

    offerings_raw = _as_list(doc.get("offerings"))
    if not offerings_raw:
        raise PricingValidationError("offerings must not be empty")

    offerings: list[dict[str, Any]] = []
    for offering_index, offering_raw in enumerate(offerings_raw):
        offering_map = _as_mapping(offering_raw)
        offering_id = _as_str(offering_map.get("id"))
        if not offering_id:
            raise PricingValidationError(f"offerings[{offering_index}].id is required")

        plans_raw = _as_list(offering_map.get("plans"))
        if not plans_raw:
            raise PricingValidationError(
                f"offerings[{offering_index}].plans must not be empty"
            )

        offering_out: dict[str, Any] = {
            "id": offering_id,
            "label": _as_str(offering_map.get("label")) or offering_id,
            "provider": _as_str(offering_map.get("provider")) or "generic",
            "description": _as_str(offering_map.get("description")) or "",
        }

        offering_inputs = [
            _normalize_input_spec(item, field=f"offerings[{offering_index}].inputs")
            for item in _as_list(offering_map.get("inputs"))
        ]
        if offering_inputs:
            offering_out["inputs"] = offering_inputs

        plans: list[dict[str, Any]] = []
        for plan_index, plan_raw in enumerate(plans_raw):
            plan_map = _as_mapping(plan_raw)
            plan_id = _as_str(plan_map.get("id"))
            if not plan_id:
                raise PricingValidationError(
                    f"offerings[{offering_index}].plans[{plan_index}].id is required"
                )

            pricing_block = _normalize_pricing_block(
                plan_map.get("pricing"),
                field=f"offerings[{offering_index}].plans[{plan_index}].pricing",
            )
            plan_out: dict[str, Any] = {
                "id": plan_id,
                "label": _as_str(plan_map.get("label")) or plan_id,
                "description": _as_str(plan_map.get("description")) or "",
                "pricing": pricing_block,
            }

            plan_inputs = [
                _normalize_input_spec(
                    item,
                    field=f"offerings[{offering_index}].plans[{plan_index}].inputs",
                )
                for item in _as_list(plan_map.get("inputs"))
            ]
            if plan_inputs:
                plan_out["inputs"] = plan_inputs

            addons: list[dict[str, Any]] = []
            for addon_index, addon_raw in enumerate(_as_list(plan_map.get("addons"))):
                addon = _as_mapping(addon_raw)
                addon_id = _as_str(addon.get("id"))
                if not addon_id:
                    raise PricingValidationError(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].addons[{addon_index}].id"
                        " is required"
                    )

                addon_block = _normalize_pricing_block(
                    addon,
                    field=(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].addons[{addon_index}]"
                    ),
                )
                if addon_block.get("type") not in {"fixed", "per_unit", "addon"}:
                    raise PricingValidationError(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].addons[{addon_index}]"
                        " must be fixed/per_unit"
                    )
                addon_block["id"] = addon_id
                addon_block["label"] = _as_str(addon.get("label")) or addon_id
                addons.append(addon_block)
            if addons:
                plan_out["addons"] = addons

            factors: list[dict[str, Any]] = []
            for factor_index, factor_raw in enumerate(
                _as_list(plan_map.get("factors"))
            ):
                factor = _normalize_pricing_block(
                    factor_raw,
                    field=(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].factors[{factor_index}]"
                    ),
                )
                if factor.get("type") != "factor":
                    raise PricingValidationError(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].factors[{factor_index}]"
                        " must be factor"
                    )
                factors.append(factor)
            if factors:
                plan_out["factors"] = factors

            if isinstance(plan_map.get("setup_fee"), dict):
                setup_fee = _normalize_pricing_block(
                    plan_map.get("setup_fee"),
                    field=f"offerings[{offering_index}].plans[{plan_index}].setup_fee",
                )
                setup_fee["interval"] = "once"
                plan_out["setup_fee"] = setup_fee

            if isinstance(plan_map.get("minimum_commit"), dict):
                minimum_commit = _normalize_pricing_block(
                    plan_map.get("minimum_commit"),
                    field=(
                        "offerings"
                        f"[{offering_index}].plans[{plan_index}].minimum_commit"
                    ),
                )
                if minimum_commit.get("type") not in {"fixed", "per_unit", "addon"}:
                    raise PricingValidationError(
                        "minimum_commit must define a fixed-like price point"
                    )
                plan_out["minimum_commit"] = minimum_commit

            plans.append(plan_out)

        offering_out["plans"] = plans
        offerings.append(offering_out)

    normalized["offerings"] = offerings
    if not _as_str(normalized.get("default_offering_id")):
        normalized["default_offering_id"] = offerings[0]["id"]
    if not _as_str(normalized.get("default_plan_id")):
        normalized["default_plan_id"] = offerings[0]["plans"][0]["id"]
    return normalized


def load_role_pricing_metadata(
    role_dir: Path, *, role_id: str
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    warnings: list[str] = []
    file_path = _pricing_file_from_meta(role_dir)
    if not file_path.is_file():
        implicit = _default_pricing(role_id)
        return implicit, build_pricing_summary(implicit, implicit=True), warnings

    try:
        doc = yaml.safe_load(file_path.read_text(encoding="utf-8")) or {}
        if not isinstance(doc, dict):
            raise PricingValidationError("pricing file root must be a mapping")
        normalized = _normalize_pricing_doc(doc, role_id=role_id)
    except Exception as exc:
        warnings.append(f"pricing metadata ignored: {exc}")
        implicit = _default_pricing(role_id)
        return implicit, build_pricing_summary(implicit, implicit=True), warnings

    return normalized, build_pricing_summary(normalized, implicit=False), warnings


def _resolve_amount(
    point: dict[str, Any],
    *,
    currency: str,
    region: str | None,
    field: str,
) -> tuple[float, str]:
    curr = _as_str(currency).upper()
    if not _CURRENCY_RE.match(curr):
        raise PricingValidationError("currency must be an ISO 4217 code")

    regional = _as_mapping(point.get("regional_prices"))
    if regional:
        wanted_region = _as_str(region).lower()
        if not wanted_region:
            raise PricingValidationError(f"{field} requires region")
        if wanted_region not in regional:
            raise PricingValidationError(
                f"{field} does not support region '{wanted_region}'"
            )
        currencies = _as_mapping(regional.get(wanted_region))
        if curr not in currencies:
            raise PricingValidationError(
                f"{field} does not support currency '{curr}' in region '{wanted_region}'"
            )
        return _to_number(
            currencies[curr], field=f"{field}.{wanted_region}.{curr}"
        ), wanted_region

    prices = _as_mapping(point.get("prices"))
    if curr not in prices:
        raise PricingValidationError(f"{field} does not support currency '{curr}'")
    return _to_number(prices[curr], field=f"{field}.{curr}"), "global"


def _contains_regional_prices(node: Any) -> bool:
    if isinstance(node, dict):
        if isinstance(node.get("regional_prices"), dict) and node.get(
            "regional_prices"
        ):
            return True
        return any(_contains_regional_prices(value) for value in node.values())
    if isinstance(node, list):
        return any(_contains_regional_prices(item) for item in node)
    return False


def _find_offering(pricing: dict[str, Any], offering_id: str) -> dict[str, Any]:
    wanted = _as_str(offering_id)
    for offering in _as_list(pricing.get("offerings")):
        if _as_str(_as_mapping(offering).get("id")) == wanted:
            return _as_mapping(offering)
    raise PricingValidationError(f"offering '{wanted}' not found")


def _find_plan(offering: dict[str, Any], plan_id: str) -> dict[str, Any]:
    wanted = _as_str(plan_id)
    for plan in _as_list(offering.get("plans")):
        if _as_str(_as_mapping(plan).get("id")) == wanted:
            return _as_mapping(plan)
    raise PricingValidationError(f"plan '{wanted}' not found")


def _resolve_input_specs(
    pricing: dict[str, Any], offering: dict[str, Any], plan: dict[str, Any]
) -> list[dict[str, Any]]:
    specs: dict[str, dict[str, Any]] = {}

    def put_many(items: Any) -> None:
        for entry in _as_list(items):
            spec = _as_mapping(entry)
            input_id = _as_str(spec.get("id"))
            if not input_id:
                continue
            applies_to = [
                _as_str(x) for x in _as_list(spec.get("applies_to")) if _as_str(x)
            ]
            if applies_to:
                plan_id = _as_str(plan.get("id"))
                if plan_id not in applies_to:
                    continue
            specs[input_id] = spec

    put_many(pricing.get("inputs"))
    put_many(offering.get("inputs"))
    put_many(plan.get("inputs"))
    return list(specs.values())


def _resolve_inputs(
    specs: list[dict[str, Any]], given: dict[str, Any]
) -> dict[str, Any]:
    inputs = _as_mapping(given)
    resolved: dict[str, Any] = {}
    for spec in specs:
        input_id = _as_str(spec.get("id"))
        input_type = _as_str(spec.get("type")).lower()
        value = inputs.get(input_id, spec.get("default"))

        if input_type == "number":
            number = _to_number(value, field=f"inputs.{input_id}")
            minimum = spec.get("min")
            maximum = spec.get("max")
            if minimum is not None and number < float(minimum):
                raise PricingValidationError(f"inputs.{input_id} must be >= {minimum}")
            if maximum is not None and number > float(maximum):
                raise PricingValidationError(f"inputs.{input_id} must be <= {maximum}")
            resolved[input_id] = number
        elif input_type == "boolean":
            resolved[input_id] = bool(value)
        else:
            allowed = [_as_str(item) for item in _as_list(spec.get("options"))]
            text = _as_str(value)
            if text not in allowed:
                raise PricingValidationError(
                    f"inputs.{input_id} must be one of: {', '.join(allowed)}"
                )
            resolved[input_id] = text
    return resolved


def _get_units_value(
    pricing_block: dict[str, Any],
    inputs: dict[str, Any],
    *,
    fallback: str = "users",
) -> float:
    input_id = (
        _as_str(pricing_block.get("input_id"))
        or _as_str(pricing_block.get("unit"))
        or fallback
    )
    return _to_number(inputs.get(input_id, 0), field=f"inputs.{input_id}")


def _calc_progressive_tiers(
    qty: float,
    tiers: list[dict[str, Any]],
    *,
    currency: str,
    region: str | None,
    field: str,
) -> float:
    remaining = qty
    lower_bound = 0.0
    total = 0.0
    for index, tier in enumerate(tiers):
        if remaining <= 0:
            break

        up_to = tier.get("up_to")
        max_in_tier = remaining
        if up_to is not None:
            cap = max(float(up_to) - lower_bound, 0.0)
            max_in_tier = min(max_in_tier, cap)
        if max_in_tier <= 0:
            lower_bound = float(up_to or lower_bound)
            continue

        unit_price, _ = _resolve_amount(
            tier,
            currency=currency,
            region=region,
            field=f"{field}[{index}]",
        )
        total += max_in_tier * unit_price
        remaining -= max_in_tier
        if up_to is None:
            break
        lower_bound = float(up_to)
    return total


def _calc_volume_bands(
    qty: float,
    bands: list[dict[str, Any]],
    *,
    currency: str,
    region: str | None,
    field: str,
) -> float:
    for index, band in enumerate(bands):
        up_to = band.get("up_to")
        if up_to is None or qty <= float(up_to):
            unit_price, _ = _resolve_amount(
                band,
                currency=currency,
                region=region,
                field=f"{field}[{index}]",
            )
            return qty * unit_price
    raise PricingValidationError(f"{field} has no matching volume band")
