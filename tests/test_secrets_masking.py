import unittest

from api.schemas.deployment import DeploymentRequest
from services.job_runner.secrets import MASK, collect_secrets, mask_secrets


class TestSecretsMasking(unittest.TestCase):
    def _password_request(self) -> DeploymentRequest:
        return DeploymentRequest(
            deploy_target="server",
            host="localhost",
            user="root",
            auth={"method": "password", "password": "hunter2"},
            selected_roles=["base-role"],
            inventory_vars={
                "db_password": "db-pass",
                "nested": {"api_token": "tok-123"},
            },
        )

    def test_collect_secrets_from_auth_and_inventory(self) -> None:
        req = self._password_request()
        secrets = collect_secrets(req)

        self.assertIn("hunter2", secrets)
        self.assertIn("db-pass", secrets)
        self.assertIn("tok-123", secrets)

    def test_mask_secrets_replaces_values_and_patterns(self) -> None:
        text = "password=hunter2 token=tok-123 sshpass -p secret"
        masked = mask_secrets(text, secrets=["hunter2", "tok-123"])

        self.assertNotIn("hunter2", masked)
        self.assertNotIn("tok-123", masked)
        self.assertIn(MASK, masked)

        # Pattern-only masking should still work without explicit secrets
        masked_inline = mask_secrets("password=abc", secrets=[])
        self.assertEqual(masked_inline, "password=********")

    def test_private_key_block_is_masked(self) -> None:
        block = (
            "-----BEGIN PRIVATE KEY-----\n"
            "ABCDEF\n"
            "-----END PRIVATE KEY-----"
        )
        masked = mask_secrets(block, secrets=[])
        self.assertEqual(masked, MASK)
