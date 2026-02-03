import importlib.util
import unittest
from pathlib import Path
import os
import tempfile


def _load_main_module():
    repo_root = Path(__file__).resolve().parents[3]
    main_py = repo_root / "apps" / "api" / "main.py"

    old_state_dir = os.environ.get("STATE_DIR")
    os.environ["STATE_DIR"] = tempfile.mkdtemp(prefix="state-")

    spec = importlib.util.spec_from_file_location("api_main_test", main_py)
    assert spec is not None
    assert spec.loader is not None

    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    if old_state_dir is None:
        os.environ.pop("STATE_DIR", None)
    else:
        os.environ["STATE_DIR"] = old_state_dir

    return mod


class TestCorsValidation(unittest.TestCase):
    def test_parse_origins_splits_and_trims(self) -> None:
        main = _load_main_module()
        origins = main._parse_origins(" https://a.com , ,http://b.local ")
        self.assertEqual(origins, ["https://a.com", "http://b.local"])

    def test_validate_origins_rejects_wildcard(self) -> None:
        main = _load_main_module()
        with self.assertRaises(ValueError):
            main._validate_origins(["*"])

    def test_validate_origins_rejects_invalid(self) -> None:
        main = _load_main_module()
        with self.assertRaises(ValueError):
            main._validate_origins(["ftp://example.com"])

        with self.assertRaises(ValueError):
            main._validate_origins(["example.com"])

    def test_validate_origins_accepts_http(self) -> None:
        main = _load_main_module()
        self.assertEqual(
            main._validate_origins(["http://localhost:3000"]),
            ["http://localhost:3000"],
        )
