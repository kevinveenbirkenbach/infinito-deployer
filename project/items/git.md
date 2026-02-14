# Inventory – History (Git), Autosave & Unsaved Changes Guard

## Goal

Add a full **History system** to the Inventory workspace based on a local Git repository.

The system must:

- Automatically create commits on meaningful changes
- Provide history access from multiple UI entry points
- Allow file- and folder-scoped history inspection
- Allow deterministic restore of files or entire workspace states
- Prevent accidental data loss when leaving the page

The solution must remain:

- deterministic
- secure (no plaintext secret leakage)
- performant (no excessive commit spam)
- workspace-isolated

---

# 1. Local Git Repository Per Workspace

## 1.1 Repository Location

Each workspace must contain its own Git repository:

- `.git/` lives in the workspace root (or inventory root)
- Repository is initialized automatically on first autosave

## 1.2 What Is Versioned

The repository must track:

- `inventory.yml`
- `host_vars/**`
- `group_vars/**`
- workspace configuration files
- other reproducibility-relevant files

Secrets policy:

- Vault-encrypted values are versioned
- Plaintext secrets must never be committed
- `secrets/credentials.kdbx` may be versioned (configurable), but no plaintext passwords ever stored

**Acceptance Criteria**

- First autosave initializes a Git repository
- After each commit, `git status` is clean
- No plaintext secrets appear in history

---

# 2. Autosave & Commit Model

## 2.1 Autosave Triggers

Autosave must occur after:

- File save in editor (PUT file)
- File create / rename / delete
- ZIP upload (single bulk commit)
- Context actions (vault value change, key passphrase change, etc.)

## 2.2 Debounce Strategy (Editor)

Editor changes must be debounced:

- No commit per keystroke
- Commit after 800–1500ms idle
- Explicit Save triggers immediate commit

Non-editor file operations commit immediately.

## 2.3 Bulk Operations

Certain operations produce exactly one commit:

- ZIP upload
- Inventory generation
- Credential generation (single combined commit)

## 2.4 Commit Message Convention

Commit messages must follow a deterministic format:

Examples:

- `edit: host_vars/main.yml`
- `create: group_vars/app.yml`
- `delete: host_vars/old.yml`
- `rename: a.yml -> b.yml`
- `bulk: zip import`
- `context: change vault value (HOST_ADMIN_PASSWORD)`

Optional metadata:

- server=<id>
- role=<id>

**Acceptance Criteria**

- Editor typing does not create excessive commits
- Each user-visible operation creates exactly one logical commit
- Commit list is readable and meaningful

---

# 3. History UI Access Points

## 3.1 Inventory Bottom Menu

- Add a bottom menu entry: **History**
- Opens History modal/panel
- Shows commit list
- Supports diff preview
- Supports restore actions

## 3.2 Workspace Menu Integration

History must also be accessible from the **Workspace menu**:

- Global entry: **History**
- Opens the same History modal
- Uses the same component/state

**Acceptance Criteria**

- History accessible from Inventory bottom menu AND Workspace menu
- Both open identical History interface

---

# 4. Context Menu: Per File / Folder History

Right-click context actions must exist for:

- Any file
- Any folder

## 4.1 Context Entries

- **History**
  - Opens History modal filtered to selected path
- **Diff vs current**
  - Shows changes between selected commit and current state for that path
- **Restore this**
  - Restores file or folder from selected commit

## 4.2 Folder Semantics

- Folder history aggregates commits affecting any file in subtree
- Folder restore restores recursively

**Acceptance Criteria**

- File history shows only commits affecting that file
- Folder history shows recursive changes
- Restore is deterministic and safe

---

# 5. Diff & Restore

## 5.1 Diff View

History modal must support:

- File-level change list
- Unified diff preview
- Masking of secrets in diffs

Masking rules identical to log masking rules.

## 5.2 Restore Entire Workspace

- Restore commit replaces entire workspace state
- After restore:
  - File tree refreshes
  - Editor updates
  - Validation runs (YAML/JSON)

## 5.3 Restore Single File

- Restore only selected file
- Does not affect other files

**Acceptance Criteria**

- Restore is atomic
- Invalid states are detected and reported
- No silent corruption

---

# 6. Unsaved Changes Guard (Before Leave / Close)

The system must prevent accidental data loss.

## 6.1 Dirty State Tracking

The frontend must track:

- Dirty state (unsaved changes)
- Saving in progress state
- Successful backend acknowledgement

## 6.2 Behavior

If user attempts:

- Tab close
- Reload
- Navigation away
- Route change

Then:

If clean → no prompt.

If unsaved changes exist:

- Show warning dialog
- Provide:
  - **Save and leave**
  - **Cancel**

## 6.3 Browser Constraints

Due to browser security limitations:

- For tab close / hard reload:
  - Use native `beforeunload` prompt
  - No custom buttons possible
- For internal navigation (router changes):
  - Use custom modal with:
    - Save and leave
    - Cancel

## 6.4 Save Behavior

If user selects "Save and leave":

- Flush all debounced saves immediately
- Wait for backend confirmation (best-effort)
- Then allow navigation

If "Cancel":

- Stay on page
- No data loss

**Acceptance Criteria**

- No warning when state is clean
- Warning appears when unsaved changes exist
- Save-and-leave flushes pending operations
- Cancel prevents leaving

---

# 7. Backend API

Required endpoints:

- `GET /api/workspaces/{id}/history`
- `GET /api/workspaces/{id}/history/{sha}`
- `GET /api/workspaces/{id}/history/{sha}/diff`
- `POST /api/workspaces/{id}/history/{sha}/restore`
- `POST /api/workspaces/{id}/history/{sha}/restore-file`

Rules:

- Workspace isolation enforced
- Invalid SHA returns clear error
- Restore operations are atomic

---

# 8. Security Requirements

- No plaintext secrets in Git history
- Diff view applies secret masking
- Workspace isolation enforced
- No cross-workspace history access
- Restore never bypasses validation

---

# 9. Performance Requirements

- Commit operations lightweight (debounced)
- History list loads <1s on warm cache
- Folder history queries efficient
- No UI blocking during autosave

---

# 10. UI Tests (Playwright – Required)

- History button visible (Inventory + Workspace menu)
- Editing file creates debounced commit
- File context → history filtered correctly
- Folder context → recursive history
- Diff modal shows masked diff
- Restore updates workspace state
- Unsaved changes guard triggers correctly
- Save-and-leave flushes pending changes

**Acceptance Criteria**

- Tests pass headless in CI
- No real secrets used
