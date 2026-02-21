from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from services.pricing_engine import (
    PricingValidationError,
    load_role_pricing_metadata,
    quote_role_pricing,
)


def _sample_pricing() -> dict:
    return {
        "schema": "v2",
        "default_offering_id": "default",
        "default_plan_id": "starter",
        "inputs": [
            {
                "id": "users",
                "type": "number",
                "label": "Users",
                "description": "",
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
                        "id": "starter",
                        "label": "Starter",
                        "pricing": {
                            "type": "per_unit",
                            "unit": "users",
                            "interval": "month",
                            "prices": {"EUR": 2.0},
                        },
                    }
                ],
            }
        ],
    }


class TestPricingEngineRefactor(unittest.TestCase):
    def test_quote_role_pricing_calculates_per_unit_amount(self) -> None:
        quote = quote_role_pricing(
            pricing=_sample_pricing(),
            offering_id="default",
            plan_id="starter",
            inputs={"users": 3},
            currency="EUR",
            region="global",
            include_setup_fee=False,
        )

        self.assertEqual(quote["total"], 6.0)
        self.assertEqual(quote["currency"], "EUR")
        self.assertFalse(quote["contact_sales"])

    def test_quote_role_pricing_requires_region_for_regional_prices(self) -> None:
        pricing = _sample_pricing()
        pricing["offerings"][0]["plans"][0]["pricing"] = {
            "type": "fixed",
            "interval": "month",
            "regional_prices": {"eu": {"EUR": 10.0}},
        }

        with self.assertRaises(PricingValidationError):
            quote_role_pricing(
                pricing=pricing,
                offering_id="default",
                plan_id="starter",
                inputs={},
                currency="EUR",
                region=None,
                include_setup_fee=False,
            )

    def test_load_role_pricing_metadata_falls_back_to_implicit(self) -> None:
        with TemporaryDirectory() as tmp:
            role_dir = Path(tmp) / "roles" / "demo"
            role_dir.mkdir(parents=True, exist_ok=True)

            normalized, summary, warnings = load_role_pricing_metadata(
                role_dir, role_id="demo"
            )

            self.assertEqual(normalized["schema"], "v2")
            self.assertTrue(summary["implicit"])
            self.assertIn("default", summary["offering_ids"])
            self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
