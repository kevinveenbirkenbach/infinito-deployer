import os
import time
import unittest
from tempfile import TemporaryDirectory
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
            ssh_user="root",
            auth={"method": "password", "password": "x"},
            selected_roles=["example-role"],
            inventory_vars={},
        )

    @patch("services.job_runner.service.build_inventory_preview")
    def test_create_job_creates_files_and_finishes(self, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        from services.job_runner import JobRunnerService  # noqa: WPS433

        svc = JobRunnerService()
        job = svc.create(req=self._minimal_request())

        # Wait for completion
        for _ in range(200):
            cur = svc.get(job.job_id)
            if cur.status in {"succeeded", "failed", "canceled"}:
                break
            time.sleep(0.01)

        cur = svc.get(job.job_id)
        self.assertIn(cur.status, {"succeeded", "failed"})
        self.assertTrue(os.path.isfile(cur.log_path))
        self.assertTrue(os.path.isfile(cur.inventory_path))
        self.assertTrue(os.path.isfile(cur.request_path))

        # Give background thread a tiny window to flush metadata safely
        time.sleep(0.05)

    @patch("services.job_runner.service.build_inventory_preview")
    @patch("services.job_runner.service.start_process")
    def test_cancel_marks_job_as_canceled(self, m_start_process, m_preview) -> None:
        m_preview.return_value = (
            "all:\n  hosts:\n    localhost:\n      vars: {}\n",
            [],
        )

        import subprocess

        started = {"proc": None, "log_fh": None}

        def _start_process(*, run_path, cwd, log_path):
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
            return proc, log_fh

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
