from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_REGIONS = {"global", "eu", "us", "uk", "apac", "latam"}
_INPUT_TYPES = {"number", "enum", "boolean"}
_INTERVALS = {"month", "year", "once"}


class PricingValidationError(ValueError):
    pass


def _as_mapping(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _as_str(value: Any) -> str:
    return str(value or "").strip()


def _to_number(value: Any, *, field: str) -> float:
    try:
        number = float(value)
    except Exception as exc:
        raise PricingValidationError(f"{field} must be numeric") from exc
    if number < 0:
        raise PricingValidationError(f"{field} must be >= 0")
    return number


def _normalize_currency_map(raw: Any, *, field: str) -> Dict[str, float]:
    node = _as_mapping(raw)
    if not node:
        raise PricingValidationError(f"{field} must not be empty")
    out: Dict[str, float] = {}
    for code_raw, amount_raw in node.items():
        code = _as_str(code_raw).upper()
        if not _CURRENCY_RE.match(code):
            raise PricingValidationError(f"{field} has invalid currency '{code_raw}'")
        out[code] = _to_number(amount_raw, field=f"{field}.{code}")
    return out


def _normalize_price_point(raw: Dict[str, Any], *, field: str) -> Dict[str, Any]:
    has_prices = "prices" in raw
    has_regional = "regional_prices" in raw
    if not has_prices and not has_regional:
        raise PricingValidationError(f"{field} requires prices or regional_prices")

    out = copy.deepcopy(raw)
    if has_prices:
        out["prices"] = _normalize_currency_map(raw.get("prices"), field=f"{field}.prices")
    if has_regional:
        regional = _as_mapping(raw.get("regional_prices"))
        if not regional:
            raise PricingValidationError(f"{field}.regional_prices must not be empty")
        norm_regional: Dict[str, Dict[str, float]] = {}
        for region_raw, cmap in regional.items():
            region = _as_str(region_raw).lower()
            if region not in _REGIONS:
                raise PricingValidationError(
                    f"{field}.regional_prices has invalid region '{region_raw}'"
                )
            norm_regional[region] = _normalize_currency_map(
                cmap,
                field=f"{field}.regional_prices.{region}",
            )
        out["regional_prices"] = norm_regional
    return out


def _normalize_interval(raw: Any, *, field: str, default: str) -> str:
    interval = _as_str(raw).lower() or default
    if interval not in _INTERVALS:
        raise PricingValidationError(f"{field} has invalid interval '{interval}'")
    return interval


def _normalize_input_spec(raw: Any, *, field: str) -> Dict[str, Any]:
    spec = _as_mapping(raw)
    input_id = _as_str(spec.get("id"))
    if not input_id:
        raise PricingValidationError(f"{field}.id is required")
    input_type = _as_str(spec.get("type")).lower() or "number"
    if input_type not in _INPUT_TYPES:
        raise PricingValidationError(f"{field}.{input_id} has invalid type '{input_type}'")
    if "default" not in spec:
        raise PricingValidationError(f"{field}.{input_id} requires a default")

    out: Dict[str, Any] = {
        "id": input_id,
        "type": input_type,
        "label": _as_str(spec.get("label")) or input_id,
        "description": _as_str(spec.get("description")) or "",
    }
    applies_to = [
        _as_str(item)
        for item in _as_list(spec.get("applies_to"))
        if _as_str(item)
    ]
    if applies_to:
        out["applies_to"] = applies_to

    if input_type == "number":
        out["default"] = _to_number(spec.get("default"), field=f"{field}.{input_id}.default")
        if "min" in spec and spec.get("min") is not None:
            out["min"] = _to_number(spec.get("min"), field=f"{field}.{input_id}.min")
        if "max" in spec and spec.get("max") is not None:
            out["max"] = _to_number(spec.get("max"), field=f"{field}.{input_id}.max")
        if "min" in out and "max" in out and out["min"] > out["max"]:
            raise PricingValidationError(f"{field}.{input_id} has min > max")
    elif input_type == "boolean":
        out["default"] = bool(spec.get("default"))
    else:
        options = [_as_str(item) for item in _as_list(spec.get("options")) if _as_str(item)]
        if not options:
            raise PricingValidationError(f"{field}.{input_id}.options must not be empty")
        default = _as_str(spec.get("default"))
        if default not in options:
            raise PricingValidationError(
                f"{field}.{input_id}.default must be one of options"
            )
        out["options"] = options
        out["default"] = default
    return out


def _normalize_price_bands(raw: Any, *, field: str) -> List[Dict[str, Any]]:
    bands = _as_list(raw)
    if not bands:
        raise PricingValidationError(f"{field} must not be empty")
    out: List[Dict[str, Any]] = []
    for index, entry_raw in enumerate(bands):
        entry = _as_mapping(entry_raw)
        up_to_raw = entry.get("up_to")
        up_to = None if up_to_raw is None else _to_number(up_to_raw, field=f"{field}[{index}].up_to")
        normalized = _normalize_price_point(
            entry,
            field=f"{field}[{index}]",
        )
        normalized["up_to"] = up_to
        out.append(normalized)
    return out


def _normalize_pricing_block(raw: Any, *, field: str) -> Dict[str, Any]:
    block = _as_mapping(raw)
    if not block:
        raise PricingValidationError(f"{field} must be a mapping")

    price_type = _as_str(block.get("type")).lower() or "fixed"
    out = copy.deepcopy(block)
    out["type"] = price_type
    out["interval"] = _normalize_interval(
        block.get("interval"),
        field=f"{field}.interval",
        default="month",
    )

    if price_type in {"fixed", "per_unit", "addon"}:
        out = _normalize_price_point(out, field=field)
    elif price_type in {"tiered_per_unit", "volume_per_unit"}:
        key = "tiers" if price_type == "tiered_per_unit" else "bands"
        out[key] = _normalize_price_bands(block.get(key), field=f"{field}.{key}")
    elif price_type == "bundle":
        base_raw = _as_mapping(block.get("base"))
        if not base_raw:
            raise PricingValidationError(f"{field}.base is required")
        out["base"] = _normalize_price_point(base_raw, field=f"{field}.base")
        included_units = _as_mapping(block.get("included_units"))
        if not included_units:
            raise PricingValidationError(f"{field}.included_units is required")
        norm_included: Dict[str, float] = {}
        for key, value in included_units.items():
            unit = _as_str(key)
            if not unit:
                continue
            norm_included[unit] = _to_number(
                value, field=f"{field}.included_units.{unit}"
            )
        if not norm_included:
            raise PricingValidationError(f"{field}.included_units must not be empty")
        out["included_units"] = norm_included
        out["overage"] = _normalize_pricing_block(
            block.get("overage"),
            field=f"{field}.overage",
        )
        overage_type = _as_str(out["overage"].get("type")).lower()
        if overage_type not in {"per_unit", "tiered_per_unit", "volume_per_unit"}:
            raise PricingValidationError(
                f"{field}.overage.type must be per_unit, tiered_per_unit or volume_per_unit"
            )
    elif price_type == "factor":
        values = _as_mapping(block.get("values"))
        if not values:
            raise PricingValidationError(f"{field}.values is required")
        norm_values: Dict[str, float] = {}
        for key, value in values.items():
            option = _as_str(key)
            if not option:
                continue
            norm_values[option] = _to_number(
                value, field=f"{field}.values.{option}"
            )
        if not norm_values:
            raise PricingValidationError(f"{field}.values must not be empty")
        out["values"] = norm_values
    elif price_type == "custom":
        # Contact sales flow: no numeric price required.
        pass
    else:
        raise PricingValidationError(f"{field}.type '{price_type}' is not supported")

    return out


def _default_pricing(role_id: str) -> Dict[str, Any]:
    return {
        "schema": "v2",
        "default_offering_id": "default",
        "default_plan_id": "community",
        "inputs": [
            {
                "id": "users",
                "type": "number",
                "label": "Users",
                "default": 1,
                "min": 1,
            }
        ],
        "offerings": [
            {
                "id": "default",
                "label": "Default",
                "provider": "generic",
                "plans": [
                    {
                        "id": "community",
                        "label": "Community",
                        "description": f"Default community plan for {role_id}",
                        "pricing": {
                            "type": "per_unit",
                            "unit": "users",
                            "interval": "month",
                            "prices": {"EUR": 1.0},
                        },
                    }
                ],
            }
        ],
    }


def _collect_dimensions(node: Any, currencies: set[str], regions: set[str]) -> None:
    if isinstance(node, dict):
        prices = node.get("prices")
        if isinstance(prices, dict):
            for code in prices:
                cur = _as_str(code).upper()
                if _CURRENCY_RE.match(cur):
                    currencies.add(cur)
        regional = node.get("regional_prices")
        if isinstance(regional, dict):
            for region_key, region_prices in regional.items():
                region = _as_str(region_key).lower()
                if region in _REGIONS:
                    regions.add(region)
                if isinstance(region_prices, dict):
                    for code in region_prices:
                        cur = _as_str(code).upper()
                        if _CURRENCY_RE.match(cur):
                            currencies.add(cur)
        for value in node.values():
            _collect_dimensions(value, currencies, regions)
        return

    if isinstance(node, list):
        for item in node:
            _collect_dimensions(item, currencies, regions)


def build_pricing_summary(pricing: Dict[str, Any], *, implicit: bool) -> Dict[str, Any]:
    offerings = _as_list(pricing.get("offerings"))
    plan_count = 0
    has_setup_fee = False
    has_minimum_commit = False
    has_custom = False
    for offering in offerings:
        for plan in _as_list(_as_mapping(offering).get("plans")):
            plan_count += 1
            plan_map = _as_mapping(plan)
            if isinstance(plan_map.get("setup_fee"), dict):
                has_setup_fee = True
            if isinstance(plan_map.get("minimum_commit"), dict):
                has_minimum_commit = True
            pricing_type = _as_str(_as_mapping(plan_map.get("pricing")).get("type")).lower()
            if pricing_type == "custom":
                has_custom = True

    currencies: set[str] = set()
    regions: set[str] = set()
    _collect_dimensions(pricing, currencies, regions)
    if not regions:
        regions.add("global")
    return {
        "schema": _as_str(pricing.get("schema")) or "v2",
        "implicit": bool(implicit),
        "offering_count": len(offerings),
        "plan_count": plan_count,
        "offering_ids": [
            _as_str(_as_mapping(item).get("id")) for item in offerings if _as_str(_as_mapping(item).get("id"))
        ],
        "default_offering_id": _as_str(pricing.get("default_offering_id")) or "default",
        "default_plan_id": _as_str(pricing.get("default_plan_id")) or "community",
        "currencies": sorted(currencies) or ["EUR"],
        "regions": sorted(regions),
        "has_setup_fee": has_setup_fee,
        "has_minimum_commit": has_minimum_commit,
        "has_custom_pricing": has_custom,
    }


def _pricing_file_from_meta(role_dir: Path) -> Path:
    default_path = role_dir / "meta" / "pricing.yml"
    meta_path = role_dir / "meta" / "main.yml"
    if not meta_path.is_file():
        return default_path
    try:
        meta = _as_mapping(yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {})
    except Exception:
        return default_path
    galaxy_info = _as_mapping(meta.get("galaxy_info"))
    pricing_meta = _as_mapping(galaxy_info.get("pricing"))
    file_name = _as_str(pricing_meta.get("file"))
    if not file_name:
        return default_path
    resolved = (role_dir / file_name).resolve()
    try:
        resolved.relative_to(role_dir.resolve())
    except Exception:
        return default_path
    return resolved


def _normalize_pricing_doc(doc: Dict[str, Any], *, role_id: str) -> Dict[str, Any]:
    schema = _as_str(doc.get("schema")).lower()
    if schema != "v2":
        raise PricingValidationError("schema must be v2")

    normalized: Dict[str, Any] = {
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

    offerings: List[Dict[str, Any]] = []
    for o_idx, offering_raw in enumerate(offerings_raw):
        offering_map = _as_mapping(offering_raw)
        offering_id = _as_str(offering_map.get("id"))
        if not offering_id:
            raise PricingValidationError(f"offerings[{o_idx}].id is required")
        plans_raw = _as_list(offering_map.get("plans"))
        if not plans_raw:
            raise PricingValidationError(f"offerings[{o_idx}].plans must not be empty")

        offering_out: Dict[str, Any] = {
            "id": offering_id,
            "label": _as_str(offering_map.get("label")) or offering_id,
            "provider": _as_str(offering_map.get("provider")) or "generic",
            "description": _as_str(offering_map.get("description")) or "",
        }

        offering_inputs = [
            _normalize_input_spec(item, field=f"offerings[{o_idx}].inputs")
            for item in _as_list(offering_map.get("inputs"))
        ]
        if offering_inputs:
            offering_out["inputs"] = offering_inputs

        plans: List[Dict[str, Any]] = []
        for p_idx, plan_raw in enumerate(plans_raw):
            plan_map = _as_mapping(plan_raw)
            plan_id = _as_str(plan_map.get("id"))
            if not plan_id:
                raise PricingValidationError(
                    f"offerings[{o_idx}].plans[{p_idx}].id is required"
                )
            pricing_block = _normalize_pricing_block(
                plan_map.get("pricing"),
                field=f"offerings[{o_idx}].plans[{p_idx}].pricing",
            )

            plan_out: Dict[str, Any] = {
                "id": plan_id,
                "label": _as_str(plan_map.get("label")) or plan_id,
                "description": _as_str(plan_map.get("description")) or "",
                "pricing": pricing_block,
            }

            plan_inputs = [
                _normalize_input_spec(
                    item,
                    field=f"offerings[{o_idx}].plans[{p_idx}].inputs",
                )
                for item in _as_list(plan_map.get("inputs"))
            ]
            if plan_inputs:
                plan_out["inputs"] = plan_inputs

            addons: List[Dict[str, Any]] = []
            for a_idx, addon_raw in enumerate(_as_list(plan_map.get("addons"))):
                addon = _as_mapping(addon_raw)
                addon_id = _as_str(addon.get("id"))
                if not addon_id:
                    raise PricingValidationError(
                        f"offerings[{o_idx}].plans[{p_idx}].addons[{a_idx}].id is required"
                    )
                addon_block = _normalize_pricing_block(
                    addon,
                    field=f"offerings[{o_idx}].plans[{p_idx}].addons[{a_idx}]",
                )
                if addon_block.get("type") not in {"fixed", "per_unit", "addon"}:
                    raise PricingValidationError(
                        f"offerings[{o_idx}].plans[{p_idx}].addons[{a_idx}] must be fixed/per_unit"
                    )
                addon_block["id"] = addon_id
                addon_block["label"] = _as_str(addon.get("label")) or addon_id
                addons.append(addon_block)
            if addons:
                plan_out["addons"] = addons

            factors: List[Dict[str, Any]] = []
            for f_idx, factor_raw in enumerate(_as_list(plan_map.get("factors"))):
                factor = _normalize_pricing_block(
                    factor_raw,
                    field=f"offerings[{o_idx}].plans[{p_idx}].factors[{f_idx}]",
                )
                if factor.get("type") != "factor":
                    raise PricingValidationError(
                        f"offerings[{o_idx}].plans[{p_idx}].factors[{f_idx}] must be factor"
                    )
                factors.append(factor)
            if factors:
                plan_out["factors"] = factors

            if isinstance(plan_map.get("setup_fee"), dict):
                setup_fee = _normalize_pricing_block(
                    plan_map.get("setup_fee"),
                    field=f"offerings[{o_idx}].plans[{p_idx}].setup_fee",
                )
                setup_fee["interval"] = "once"
                plan_out["setup_fee"] = setup_fee

            if isinstance(plan_map.get("minimum_commit"), dict):
                minimum_commit = _normalize_pricing_block(
                    plan_map.get("minimum_commit"),
                    field=f"offerings[{o_idx}].plans[{p_idx}].minimum_commit",
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
) -> Tuple[Dict[str, Any], Dict[str, Any], List[str]]:
    warnings: List[str] = []
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
    point: Dict[str, Any],
    *,
    currency: str,
    region: str | None,
    field: str,
) -> Tuple[float, str]:
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
        return _to_number(currencies[curr], field=f"{field}.{wanted_region}.{curr}"), wanted_region

    prices = _as_mapping(point.get("prices"))
    if curr not in prices:
        raise PricingValidationError(f"{field} does not support currency '{curr}'")
    return _to_number(prices[curr], field=f"{field}.{curr}"), "global"


def _contains_regional_prices(node: Any) -> bool:
    if isinstance(node, dict):
        if isinstance(node.get("regional_prices"), dict) and node.get("regional_prices"):
            return True
        return any(_contains_regional_prices(value) for value in node.values())
    if isinstance(node, list):
        return any(_contains_regional_prices(item) for item in node)
    return False


def _find_offering(pricing: Dict[str, Any], offering_id: str) -> Dict[str, Any]:
    wanted = _as_str(offering_id)
    for offering in _as_list(pricing.get("offerings")):
        if _as_str(_as_mapping(offering).get("id")) == wanted:
            return _as_mapping(offering)
    raise PricingValidationError(f"offering '{wanted}' not found")


def _find_plan(offering: Dict[str, Any], plan_id: str) -> Dict[str, Any]:
    wanted = _as_str(plan_id)
    for plan in _as_list(offering.get("plans")):
        if _as_str(_as_mapping(plan).get("id")) == wanted:
            return _as_mapping(plan)
    raise PricingValidationError(f"plan '{wanted}' not found")


def _resolve_input_specs(
    pricing: Dict[str, Any], offering: Dict[str, Any], plan: Dict[str, Any]
) -> List[Dict[str, Any]]:
    specs: Dict[str, Dict[str, Any]] = {}

    def put_many(items: Any) -> None:
        for entry in _as_list(items):
            spec = _as_mapping(entry)
            input_id = _as_str(spec.get("id"))
            if not input_id:
                continue
            applies_to = [_as_str(x) for x in _as_list(spec.get("applies_to")) if _as_str(x)]
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
    specs: List[Dict[str, Any]], given: Dict[str, Any]
) -> Dict[str, Any]:
    inputs = _as_mapping(given)
    out: Dict[str, Any] = {}
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
            out[input_id] = number
        elif input_type == "boolean":
            out[input_id] = bool(value)
        else:
            allowed = [_as_str(item) for item in _as_list(spec.get("options"))]
            text = _as_str(value)
            if text not in allowed:
                raise PricingValidationError(
                    f"inputs.{input_id} must be one of: {', '.join(allowed)}"
                )
            out[input_id] = text
    return out


def _get_units_value(
    pricing_block: Dict[str, Any],
    inputs: Dict[str, Any],
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
    tiers: List[Dict[str, Any]],
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
    bands: List[Dict[str, Any]],
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


def _evaluate_pricing(
    block: Dict[str, Any],
    *,
    inputs: Dict[str, Any],
    currency: str,
    region: str | None,
    field: str,
) -> Dict[str, Any]:
    price_type = _as_str(block.get("type")).lower() or "fixed"
    interval = _normalize_interval(block.get("interval"), field=f"{field}.interval", default="month")

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
        amount, _ = _resolve_amount(block, currency=currency, region=region, field=field)
        return {
            "custom": False,
            "interval": interval,
            "amount": amount,
            "base": amount,
            "usage": 0.0,
            "notes": [],
        }

    if price_type == "per_unit":
        qty = _get_units_value(block, inputs)
        unit_price, _ = _resolve_amount(block, currency=currency, region=region, field=field)
        usage = qty * unit_price
        return {
            "custom": False,
            "interval": interval,
            "amount": usage,
            "base": 0.0,
            "usage": usage,
            "notes": [],
        }

    if price_type == "tiered_per_unit":
        qty = _get_units_value(block, inputs)
        tiers = _as_list(block.get("tiers"))
        usage = _calc_progressive_tiers(
            qty,
            [_as_mapping(item) for item in tiers],
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
        qty = _get_units_value(block, inputs)
        bands = _as_list(block.get("bands"))
        usage = _calc_volume_bands(
            qty,
            [_as_mapping(item) for item in bands],
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
        overage_type = _as_str(overage_block.get("type")).lower()
        unit_key = (
            _as_str(overage_block.get("unit"))
            or _as_str(overage_block.get("input_id"))
            or next(iter(included_units.keys()), "users")
        )
        qty = _to_number(inputs.get(unit_key, 0), field=f"inputs.{unit_key}")
        included = _to_number(included_units.get(unit_key, 0), field=f"{field}.included_units.{unit_key}")
        overage_qty = max(0.0, qty - included)
        usage = 0.0
        if overage_qty > 0:
            block_for_overage = dict(overage_block)
            block_for_overage["input_id"] = "__overage_units__"
            usage_inputs = dict(inputs)
            usage_inputs["__overage_units__"] = overage_qty
            nested = _evaluate_pricing(
                block_for_overage,
                inputs=usage_inputs,
                currency=currency,
                region=region,
                field=f"{field}.overage",
            )
            if nested.get("custom"):
                raise PricingValidationError(f"{field}.overage cannot be custom")
            usage = float(nested.get("amount") or 0.0)
        amount = base_amount + usage
        return {
            "custom": False,
            "interval": interval,
            "amount": amount,
            "base": base_amount,
            "usage": usage,
            "notes": [],
        }

    raise PricingValidationError(f"{field}.type '{price_type}' is not supported")


def quote_role_pricing(
    *,
    pricing: Dict[str, Any],
    offering_id: str,
    plan_id: str,
    inputs: Dict[str, Any] | None,
    currency: str,
    region: str | None,
    include_setup_fee: bool,
) -> Dict[str, Any]:
    offering = _find_offering(pricing, offering_id)
    plan = _find_plan(offering, plan_id)

    normalized_region = _as_str(region).lower() or "global"
    if _contains_regional_prices(plan) and not _as_str(region):
        raise PricingValidationError("region is required for region-specific pricing")
    if normalized_region not in _REGIONS:
        raise PricingValidationError(f"region '{normalized_region}' is not supported")

    specs = _resolve_input_specs(pricing, offering, plan)
    resolved_inputs = _resolve_inputs(specs, _as_mapping(inputs or {}))
    pricing_block = _as_mapping(plan.get("pricing"))
    quoted_main = _evaluate_pricing(
        pricing_block,
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
    notes: List[str] = []

    for index, addon in enumerate(_as_list(plan.get("addons"))):
        addon_map = _as_mapping(addon)
        addon_input = (
            _as_str(addon_map.get("input_id"))
            or _as_str(addon_map.get("id"))
            or f"addon_{index}"
        )
        raw_value = resolved_inputs.get(addon_input, addon_map.get("default", False))
        if isinstance(raw_value, bool):
            qty = 1.0 if raw_value else 0.0
        else:
            qty = _to_number(raw_value, field=f"inputs.{addon_input}")
        if qty <= 0:
            continue
        block = dict(addon_map)
        if block.get("type") == "fixed":
            amount, _ = _resolve_amount(
                block,
                currency=currency,
                region=normalized_region,
                field=f"addons[{index}]",
            )
            addon_amount = amount * qty
        else:
            block["input_id"] = "__addon_qty__"
            addon_inputs = dict(resolved_inputs)
            addon_inputs["__addon_qty__"] = qty
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
        multiplier = _to_number(values.get(option), field=f"factors[{index}].values.{option}")
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
