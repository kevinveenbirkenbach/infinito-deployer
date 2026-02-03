import importlib.util
import unittest
from pathlib import Path


class TestDeploymentsRouter(unittest.TestCase):
    def test_router_prefix(self) -> None:
        # Load the module directly from file to avoid importing api.routes.__init__
        # (which pulls in roles/inventories and may require extra deps like httpx).
        repo_root = Path(__file__).resolve().parents[3]
        deployments_py = (
            repo_root / "apps" / "api" / "api" / "routes" / "deployments.py"
        )

        spec = importlib.util.spec_from_file_location(
            "deployments_router_test", deployments_py
        )
        assert spec is not None
        assert spec.loader is not None

        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        router = getattr(mod, "router")
        self.assertEqual(router.prefix, "/deployments")
