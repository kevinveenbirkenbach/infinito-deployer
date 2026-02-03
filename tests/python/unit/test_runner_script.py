import os
import subprocess
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from services.job_runner.runner import write_runner_script


class TestRunnerScript(unittest.TestCase):
    def test_runner_cmd_propagates_exit_and_output(self) -> None:
        with TemporaryDirectory() as tmp:
            run_path = Path(tmp) / "run.sh"
            write_runner_script(run_path)

            env = dict(os.environ)
            env["RUNNER_CMD"] = "printf 'out1\\n'; printf 'err1\\n' 1>&2; exit 7"

            proc = subprocess.run(
                [str(run_path)],
                cwd=str(tmp),
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(proc.returncode, 7)
            self.assertIn("+ /bin/bash -lc", proc.stdout)
            self.assertIn("out1", proc.stdout)
            self.assertIn("err1", proc.stderr)

    def test_runner_args_override_env(self) -> None:
        with TemporaryDirectory() as tmp:
            run_path = Path(tmp) / "run.sh"
            write_runner_script(run_path)

            env = dict(os.environ)
            env["RUNNER_CMD"] = "echo should-not-run"

            proc = subprocess.run(
                [str(run_path), "bash", "-lc", "echo cli-command"],
                cwd=str(tmp),
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(proc.returncode, 0)
            self.assertIn("+ bash -lc echo\\ cli-command", proc.stdout)
            self.assertIn("cli-command", proc.stdout)
            self.assertNotIn("should-not-run", proc.stdout)
