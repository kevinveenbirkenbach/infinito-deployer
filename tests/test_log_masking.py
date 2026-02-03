import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from services.job_runner.runner import start_process, write_runner_script


class TestLogMasking(unittest.TestCase):
    def test_log_file_masks_secrets(self) -> None:
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            run_path = tmp_path / "run.sh"
            log_path = tmp_path / "job.log"

            write_runner_script(run_path)

            secret = "supersecret-token-1234567890"
            old_runner_cmd = os.environ.get("RUNNER_CMD")
            os.environ["RUNNER_CMD"] = f"echo {secret}"
            try:
                proc, log_fh, reader = start_process(
                    run_path=run_path,
                    cwd=tmp_path,
                    log_path=log_path,
                    secrets=[secret],
                )
                proc.wait(timeout=5)
                if reader is not None:
                    reader.join(timeout=2)
                log_fh.close()
            finally:
                if old_runner_cmd is None:
                    os.environ.pop("RUNNER_CMD", None)
                else:
                    os.environ["RUNNER_CMD"] = old_runner_cmd

            log_text = log_path.read_text(encoding="utf-8")
            self.assertNotIn(secret, log_text)
            self.assertIn("********", log_text)
