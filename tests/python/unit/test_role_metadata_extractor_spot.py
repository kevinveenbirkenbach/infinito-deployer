from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from roles import role_metadata_extractor as rme


class TestRoleMetadataExtractorSpot(unittest.TestCase):
    def setUp(self) -> None:
        self._old_repo_path = os.environ.get("INFINITO_REPO_PATH")
        rme._load_nexus_types_from_group_names.cache_clear()

    def tearDown(self) -> None:
        if self._old_repo_path is None:
            os.environ.pop("INFINITO_REPO_PATH", None)
        else:
            os.environ["INFINITO_REPO_PATH"] = self._old_repo_path
        rme._load_nexus_types_from_group_names.cache_clear()

    def _make_fake_nexus_repo(self) -> Path:
        tmp = Path(tempfile.mkdtemp(prefix="nexus_spot_test_"))
        (tmp / "module_utils").mkdir(parents=True, exist_ok=True)
        (tmp / "module_utils" / "invokable.py").write_text(
            "\n".join(
                [
                    "def types_from_group_names(group_names):",
                    "    name = (group_names or [''])[0]",
                    "    if name == 'web-app-dashboard':",
                    "        return ['server', 'universal']",
                    "    if name.startswith('desk-'):",
                    "        return ['workstation']",
                    "    return []",
                ]
            ),
            encoding="utf-8",
        )
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        return tmp

    def test_uses_nexus_spot_as_source_of_truth(self) -> None:
        fake_repo = self._make_fake_nexus_repo()
        os.environ["INFINITO_REPO_PATH"] = str(fake_repo)
        rme._load_nexus_types_from_group_names.cache_clear()

        self.assertEqual(
            rme._derive_deployment_targets("web-app-dashboard", []),
            ["universal", "server"],
        )
        self.assertEqual(
            rme._derive_deployment_targets("desk-firefox", []), ["workstation"]
        )
        self.assertEqual(rme._derive_deployment_targets("dev-core", []), [])

    def test_falls_back_when_spot_is_unavailable(self) -> None:
        os.environ["INFINITO_REPO_PATH"] = "/definitely/missing/nexus/repo"
        rme._load_nexus_types_from_group_names.cache_clear()

        self.assertEqual(
            rme._derive_deployment_targets("web-app-nextcloud", []), ["universal"]
        )
        self.assertEqual(
            rme._derive_deployment_targets("unknown-role", [{"name": "Docker"}]),
            ["server"],
        )


if __name__ == "__main__":
    unittest.main()
