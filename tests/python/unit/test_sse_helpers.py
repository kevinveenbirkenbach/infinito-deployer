import importlib.util
import unittest
from pathlib import Path


def _load_deployments_module():
    repo_root = Path(__file__).resolve().parents[3]
    deployments_py = repo_root / "apps" / "api" / "api" / "routes" / "deployments.py"

    spec = importlib.util.spec_from_file_location(
        "deployments_sse_test", deployments_py
    )
    assert spec is not None
    assert spec.loader is not None

    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestSseHelpers(unittest.TestCase):
    def test_sse_event_format(self) -> None:
        mod = _load_deployments_module()
        payload = mod._sse_event("log", "hello\nworld")

        self.assertIn("event: log", payload)
        self.assertIn("data: hello", payload)
        self.assertIn("data: world", payload)
        self.assertTrue(payload.endswith("\n\n"))

    def test_split_log_lines_handles_cr_and_lf(self) -> None:
        mod = _load_deployments_module()
        lines, rest = mod._split_log_lines("one\rtwo\nthree")

        self.assertEqual(lines, ["one", "two"])
        self.assertEqual(rest, "three")
