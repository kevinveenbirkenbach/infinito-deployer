# Inventory – History (Git), Autosave & Unsaved Changes Guard

## Redefined

This item is redefined from prose-only specification to an executable checklist.

Status legend:

- `[x]` implemented
- `[ ]` open

Execution order:

1. Git foundation
2. Autosave + deterministic commits
3. History API + UI
4. Restore + unsaved changes guard
5. Hardening + tests

---

## 0. Current Baseline

- [x] Workspace file CRUD exists (`list/read/write/rename/delete`)
- [x] Manual file save exists in editor
- [ ] Workspace-local Git repository per workspace
- [ ] History API endpoints
- [ ] History UI entry points (Inventory + Workspace menu)
- [ ] File/folder scoped history in context menu
- [ ] Diff + restore workflow
- [ ] Unsaved changes leave guard
- [ ] Playwright coverage for this feature set

---

## 1. Git Foundation (MVP)

- [ ] Initialize `.git` in workspace root on first write/autosave
- [ ] Add deterministic `.gitignore` rules for non-versioned runtime files
- [ ] Track reproducibility-relevant files (`inventory.yml`, `host_vars/**`, `group_vars/**`, workspace config)
- [ ] Enforce workspace isolation for all git operations
- [ ] Ensure `git status` is clean immediately after each successful commit

Acceptance:

- [ ] First autosave initializes git repository
- [ ] No cross-workspace git access

---

## 2. Autosave & Commit Model (MVP)

- [ ] Editor autosave debounce (800-1500ms idle)
- [ ] Explicit Save triggers immediate flush + commit
- [ ] Non-editor operations commit immediately (create/rename/delete)
- [ ] ZIP upload creates exactly one bulk commit
- [ ] Inventory generation creates exactly one bulk commit
- [ ] Credential generation creates exactly one bulk commit

Deterministic commit messages:

- [ ] `edit: <path>`
- [ ] `create: <path>`
- [ ] `delete: <path>`
- [ ] `rename: <from> -> <to>`
- [ ] `bulk: zip import`
- [ ] `context: <action>`

Optional metadata:

- [ ] `server=<id>`
- [ ] `role=<id>`

Acceptance:

- [ ] No commit spam during typing
- [ ] One logical user action equals one logical commit

---

## 3. Backend History API (MVP)

- [ ] `GET /api/workspaces/{id}/history`
- [ ] `GET /api/workspaces/{id}/history/{sha}`
- [ ] `GET /api/workspaces/{id}/history/{sha}/diff`
- [ ] `POST /api/workspaces/{id}/history/{sha}/restore`
- [ ] `POST /api/workspaces/{id}/history/{sha}/restore-file`

Rules:

- [ ] Invalid SHA returns clear 4xx error
- [ ] Restore operations are atomic
- [ ] Workspace isolation enforced for all endpoints

---

## 4. History UI (MVP)

Global entry points:

- [ ] Inventory bottom menu includes `History`
- [ ] Workspace menu includes `History`
- [ ] Both open the same history component/state

History modal/panel:

- [ ] Commit list
- [ ] Commit detail
- [ ] Diff preview
- [ ] Restore actions

Context menu:

- [ ] File: `History`
- [ ] File: `Diff vs current`
- [ ] File: `Restore this`
- [ ] Folder: `History` (recursive)
- [ ] Folder: `Diff vs current` (recursive)
- [ ] Folder: `Restore this` (recursive)

---

## 5. Diff & Restore Hardening

- [ ] Unified diff preview
- [ ] File-level change list
- [ ] Secret masking in diffs (same masking rules as logs)
- [ ] Restore entire workspace at commit
- [ ] Restore single file from commit
- [ ] Refresh file tree and editor after restore
- [ ] Run YAML/JSON validation after restore
- [ ] Report invalid state explicitly (no silent corruption)

---

## 6. Unsaved Changes Guard

State tracking:

- [ ] Dirty state tracked
- [ ] Saving-in-progress tracked
- [ ] Backend save acknowledgement tracked

Behavior:

- [ ] `beforeunload` prompt when unsaved changes exist
- [ ] No prompt when clean
- [ ] Internal route-change guard with modal
- [ ] Modal action `Save and leave`
- [ ] Modal action `Cancel`
- [ ] `Save and leave` flushes all pending debounced writes before leaving

---

## 7. Security

- [ ] No plaintext secrets in git history
- [ ] Diff output masks sensitive values
- [ ] Restore flow cannot bypass validation
- [ ] No cross-workspace history access

---

## 8. Performance

- [ ] Commit path remains lightweight under normal editing
- [ ] History list warm-load target: <1s
- [ ] Folder history queries are efficient on larger workspaces
- [ ] UI remains responsive during autosave/commit

---

## 9. Tests (Required)

Playwright:

- [ ] History button visible (Inventory + Workspace menu)
- [ ] Editing file creates debounced commit
- [ ] File context history filter works
- [ ] Folder context recursive history works
- [ ] Diff modal shows masked output
- [ ] Restore updates workspace state
- [ ] Unsaved changes guard triggers correctly
- [ ] Save-and-leave flushes pending changes

Backend/unit:

- [ ] Invalid SHA handling
- [ ] Restore atomicity
- [ ] Workspace isolation
- [ ] Secret masking behavior

CI acceptance:

- [ ] Tests pass headless in CI
- [ ] No real secrets used in fixtures

---

## Status

- Overall: 🟨 Redefined
- Completion: 0% (feature scope), baseline exists but core history/autosave guard is open
