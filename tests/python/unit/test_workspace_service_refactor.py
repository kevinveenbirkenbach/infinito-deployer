from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from services.workspaces import WorkspaceService


class TestWorkspaceServiceRefactor(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._old_state_dir = os.environ.get("STATE_DIR")
        os.environ["STATE_DIR"] = self._tmp.name

    def tearDown(self) -> None:
        if self._old_state_dir is None:
            os.environ.pop("STATE_DIR", None)
        else:
            os.environ["STATE_DIR"] = self._old_state_dir

    def test_create_initializes_expected_workspace_layout(self) -> None:
        service = WorkspaceService()
        created = service.create(owner_id="user-1", owner_email="user@example.com")
        workspace_id = str(created["workspace_id"])
        root = Path(self._tmp.name) / "workspaces" / workspace_id

        self.assertTrue(root.is_dir())
        self.assertTrue((root / "host_vars").is_dir())
        self.assertTrue((root / "group_vars").is_dir())
        self.assertTrue((root / "secrets").is_dir())
        self.assertTrue((root / "secrets" / "keys").is_dir())
        self.assertEqual(created["state"], "draft")
        self.assertEqual(created["owner_id"], "user-1")

    def test_list_files_does_not_include_workspace_metadata_file(self) -> None:
        service = WorkspaceService()
        created = service.create(owner_id="user-1")
        workspace_id = str(created["workspace_id"])

        service.write_file(workspace_id, "inventory.yml", "all:\n  hosts: {}\n")
        entries = service.list_files(workspace_id)
        paths = {str(item.get("path") or "") for item in entries}

        self.assertIn("host_vars", paths)
        self.assertIn("group_vars", paths)
        self.assertIn("secrets", paths)
        self.assertIn("secrets/keys", paths)
        self.assertIn("inventory.yml", paths)
        self.assertNotIn("workspace.json", paths)

    def test_write_and_read_file_roundtrip(self) -> None:
        service = WorkspaceService()
        created = service.create(owner_id="user-1")
        workspace_id = str(created["workspace_id"])

        content = "line-a\nline-b\n"
        service.write_file(workspace_id, "group_vars/all.yml", content)
        loaded = service.read_file(workspace_id, "group_vars/all.yml")

        self.assertEqual(loaded, content)


if __name__ == "__main__":
    unittest.main()
