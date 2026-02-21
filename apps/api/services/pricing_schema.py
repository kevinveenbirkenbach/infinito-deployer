from __future__ import annotations

import copy

import re

from pathlib import Path

from typing import Any, Dict, List

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
        out["prices"] = _normalize_currency_map(
            raw.get("prices"), field=f"{field}.prices"
        )
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
        raise PricingValidationError(
            f"{field}.{input_id} has invalid type '{input_type}'"
        )
    if "default" not in spec:
        raise PricingValidationError(f"{field}.{input_id} requires a default")

    out: Dict[str, Any] = {
        "id": input_id,
        "type": input_type,
        "label": _as_str(spec.get("label")) or input_id,
        "description": _as_str(spec.get("description")) or "",
    }
    applies_to = [
        _as_str(item) for item in _as_list(spec.get("applies_to")) if _as_str(item)
    ]
    if applies_to:
        out["applies_to"] = applies_to

    if input_type == "number":
        out["default"] = _to_number(
            spec.get("default"), field=f"{field}.{input_id}.default"
        )
        if "min" in spec and spec.get("min") is not None:
            out["min"] = _to_number(spec.get("min"), field=f"{field}.{input_id}.min")
        if "max" in spec and spec.get("max") is not None:
            out["max"] = _to_number(spec.get("max"), field=f"{field}.{input_id}.max")
        if "min" in out and "max" in out and out["min"] > out["max"]:
            raise PricingValidationError(f"{field}.{input_id} has min > max")
    elif input_type == "boolean":
        out["default"] = bool(spec.get("default"))
    else:
        options = [
            _as_str(item) for item in _as_list(spec.get("options")) if _as_str(item)
        ]
        if not options:
            raise PricingValidationError(
                f"{field}.{input_id}.options must not be empty"
            )
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
        up_to = (
            None
            if up_to_raw is None
            else _to_number(up_to_raw, field=f"{field}[{index}].up_to")
        )
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
            norm_values[option] = _to_number(value, field=f"{field}.values.{option}")
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
            pricing_type = _as_str(
                _as_mapping(plan_map.get("pricing")).get("type")
            ).lower()
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
            _as_str(_as_mapping(item).get("id"))
            for item in offerings
            if _as_str(_as_mapping(item).get("id"))
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
