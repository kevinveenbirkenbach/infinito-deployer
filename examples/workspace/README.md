# Example Workspace (Test Container)

This workspace baseline is optimized for the local compose test target.

Build an import ZIP:

```bash
make example-workspace-zip
```

Import the generated file `examples/workspace-import.zip` in the Web UI:
`Workspace -> Import`.

Included baseline:

- `inventory.yml`: starts empty so apps can be selected in the UI
- `host_vars/test-arch.yml`: host/user/port preset for `test-arch`
- `group_vars/all.yml`: disables SSH host key checks for local test runs

Credentials are intentionally not stored in this workspace.
Use test credentials in UI:

- auth method: `password`
- password: `deploy`
