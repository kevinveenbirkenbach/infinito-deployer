import os
import time
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch


class TestJobRunnerService(unittest.TestCase):
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

    def _minimal_request(self):
        from api.schemas.deployment import DeploymentRequest  # noqa: WPS433

        # Adjust fields if your schema differs, but keep it valid.
        return DeploymentRequest(
            deploy_target="server",
            host="localhost",
            user="tester",
            auth={"method": "password", "password": "x"},
            selected_roles=["example-role"],
            inventory_vars={},
        )

    def _secret_request(self):
        from api.schemas.deployment import DeploymentRequest  # noqa: WPS433

        return DeploymentRequest(
            deploy_target="server",
            host="localhost",
            user="tester",
            auth={"method": "password", "password": "supersecret"},
            selected_roles=["example-role"],
            inventory_vars={
                "DB_PASSWORD": "db-pass",
                "api_secret": "secret-123",
                "token": "tok-abcdefghijklmnopqrstuvwxyz1234",
            },
        )

    def _key_request(self):
        from api.schemas.deployment import DeploymentRequest  # noqa: WPS433

        return DeploymentRequest(
            deploy_target="server",
            host="localhost",
            user="tester",
            auth={"method": "private_key", "private_key": "KEYDATA"},
            selected_roles=["example-role"],
            inventory_vars={},
        )

    def _wait_for_terminal(self, svc, job_id: str) -> None:
        for _ in range(200):
            cur = svc.get(job_id)
            if cur.status in {"succeeded", "failed", "canceled"}:
                return
            time.sleep(0.01)

        time.sleep(0.05)

    @patch("services.job_runner.service.build_inventory_preview")
    def test_create_job_creates_files_and_finishes(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job = svc.create(req=self._minimal_request())

        self._wait_for_terminal(svc, job.job_id)

        cur = svc.get(job.job_id)
        self.assertIn(cur.status, {"succeeded", "failed"})
        self.assertTrue(os.path.isfile(cur.log_path))
        self.assertTrue(os.path.isfile(cur.inventory_path))
        self.assertTrue(os.path.isfile(cur.request_path))
        self.assertTrue(os.path.isfile(os.path.join(cur.workspace_dir, "vars.json")))
        self.assertTrue(os.path.isfile(os.path.join(cur.workspace_dir, "vars.yml")))

        # Give background thread a tiny window to flush metadata safely
        time.sleep(0.05)

    @patch("services.job_runner.service.build_inventory_preview")
    def test_private_key_writes_key_file(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        old_runner_cmd = os.environ.get("RUNNER_CMD")
        os.environ["RUNNER_CMD"] = "sleep 0.2"
        self.addCleanup(
            lambda: os.environ.pop("RUNNER_CMD", None)
            if old_runner_cmd is None
            else os.environ.__setitem__("RUNNER_CMD", old_runner_cmd)
        )

        svc = JobRunnerService()
        job = svc.create(req=self._key_request())

        key_path = os.path.join(job.workspace_dir, "id_rsa")
        self.assertTrue(os.path.isfile(key_path))

        mode = os.stat(key_path).st_mode & 0o777
        self.assertEqual(mode, 0o600)

        self._wait_for_terminal(svc, job.job_id)

    @patch("services.job_runner.service.build_inventory_preview")
    def test_private_key_removed_after_completion(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        old_runner_cmd = os.environ.get("RUNNER_CMD")
        os.environ["RUNNER_CMD"] = "true"
        self.addCleanup(
            lambda: os.environ.pop("RUNNER_CMD", None)
            if old_runner_cmd is None
            else os.environ.__setitem__("RUNNER_CMD", old_runner_cmd)
        )

        svc = JobRunnerService()
        job = svc.create(req=self._key_request())

        self._wait_for_terminal(svc, job.job_id)

        key_path = os.path.join(job.workspace_dir, "id_rsa")
        self.assertFalse(os.path.exists(key_path))

    @patch("services.job_runner.service.build_inventory_preview")
    def test_jobs_are_isolated(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job_a = svc.create(req=self._minimal_request())
        job_b = svc.create(req=self._minimal_request())

        self.assertNotEqual(job_a.job_id, job_b.job_id)
        self.assertNotEqual(job_a.workspace_dir, job_b.workspace_dir)
        self.assertTrue(os.path.isdir(job_a.workspace_dir))
        self.assertTrue(os.path.isdir(job_b.workspace_dir))
        self.assertNotEqual(
            os.path.realpath(job_a.workspace_dir),
            os.path.realpath(job_b.workspace_dir),
        )

        self._wait_for_terminal(svc, job_a.job_id)
        self._wait_for_terminal(svc, job_b.job_id)

    @patch("services.job_runner.service.build_inventory_preview")
    def test_restart_does_not_corrupt_jobs(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job = svc.create(req=self._minimal_request())

        # Simulate API restart by creating a fresh service instance.
        svc_restart = JobRunnerService()
        loaded = svc_restart.get(job.job_id)

        self.assertEqual(loaded.job_id, job.job_id)
        self.assertTrue(os.path.isfile(loaded.request_path))
        self.assertTrue(os.path.isfile(loaded.inventory_path))
        self.assertTrue(os.path.isfile(os.path.join(loaded.workspace_dir, "vars.json")))
        self.assertTrue(os.path.isfile(os.path.join(loaded.workspace_dir, "vars.yml")))

        self._wait_for_terminal(svc, job.job_id)

    @patch("services.job_runner.service.build_inventory_preview")
    @patch("services.job_runner.service.start_process")
    def test_cancel_marks_job_as_canceled(self, m_start_process, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        import subprocess

        started = {"proc": None, "log_fh": None}

        def _start_process(*, run_path, cwd, log_path, secrets=None, on_line=None):
            # Long enough that cancel has something to kill, short enough to finish fast.
            log_fh = open(log_path, "ab", buffering=0)
            proc = subprocess.Popen(
                ["/bin/bash", "-lc", "sleep 5"],
                cwd=str(cwd),
                stdout=log_fh,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                env=dict(os.environ),
            )
            started["proc"] = proc
            started["log_fh"] = log_fh
            return proc, log_fh, None

        m_start_process.side_effect = _start_process

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job = svc.create(req=self._minimal_request())

        ok = svc.cancel(job.job_id)
        self.assertTrue(ok)

        # Ensure the subprocess is actually gone BEFORE tempdir cleanup.
        proc = started["proc"]
        if proc is not None:
            try:
                proc.wait(timeout=2)
            except Exception:
                # Best-effort: if it didn't die quickly, still proceed.
                pass

        # Wait until job status reflects cancellation
        for _ in range(200):
            cur = svc.get(job.job_id)
            if cur.status == "canceled":
                break
            time.sleep(0.01)

        cur = svc.get(job.job_id)
        self.assertEqual(cur.status, "canceled")

        # Give background thread time to write final metadata before tempdir cleanup.
        time.sleep(0.05)

    @patch("services.job_runner.service.build_inventory_preview")
    def test_persisted_files_mask_secrets(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job = svc.create(req=self._secret_request())

        request_text = Path(job.request_path).read_text(encoding="utf-8")
        vars_json = (Path(job.workspace_dir) / "vars.json").read_text(encoding="utf-8")
        vars_yaml = (Path(job.workspace_dir) / "vars.yml").read_text(encoding="utf-8")

        for secret in ("supersecret", "db-pass", "secret-123", "tok-"):
            self.assertNotIn(secret, request_text)
            self.assertNotIn(secret, vars_json)
            self.assertNotIn(secret, vars_yaml)

        self.assertIn("********", request_text)
        self.assertIn("********", vars_json)
        self.assertIn("********", vars_yaml)

        self._wait_for_terminal(svc, job.job_id)
