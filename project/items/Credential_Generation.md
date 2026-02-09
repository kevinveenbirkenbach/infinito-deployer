# Inventory Workspace & Credential Generation – TODO Checklist

## Goal
Interactive creation, editing, and export of a complete inventory including credentials **before** deployment.

---

## 1. Inventory Initialization (UI / Flow)

- [x] Detect when **no inventory exists** (session / workspace / job)
- [x] After app/role selection, **show a “Generate Inventory” button**
- [x] Disable or de-prioritize “Preview Inventory” until an inventory exists
- [x] Display a clear UI hint that an inventory must be generated first

**Acceptance Criteria**
- [x] Without an existing inventory, “Generate Inventory” is visible
- [x] Clicking it creates a valid initial inventory structure

---

## 2. Workspace & File Structure

- [x] Introduce a **workspace concept** (per project or job)
- [x] Workspace directory is created server-side
- [x] The following files are initially generated:
  - [x] `inventory.yml` (or defined main inventory file)
  - [x] Host file (e.g. `host_vars/<host>.yml`)
  - [x] Optional `group_vars/`
  - [x] Optional `vars.json` / `vars.yml`
- [x] Temporary vault password file is prepared (initially empty)

**Acceptance Criteria**
- [x] File structure is consistent and reproducible
- [x] Workspaces are fully isolated from each other

---

## 3. Web File Browser (JS)

- [x] Implement a **file browser (tree view)**
- [x] Display all workspace files
- [x] Selecting a file loads its contents into an editor

**Acceptance Criteria**
- [x] All generated files are visible
- [x] Tree navigation is stable and performant

---

## 4. Editor Functionality (WYSIWYG / Code)

- [x] Integrate a **code editor** (e.g. Monaco / CodeMirror)
- [x] Editor modes:
  - [x] YAML (syntax highlighting + validation)
  - [x] JSON (validation)
  - [x] Code/Text (Shell, Python, INI, etc.)
  - [x] Optional: WYSIWYG for Markdown / notes
- [x] Saving writes changes directly to the workspace

**Acceptance Criteria**
- [x] Changes persist reliably
- [x] YAML/JSON errors are detected before follow-up actions

---

## 5. Credential Generation via `infinito create credentials`

- [x] UI explicitly asks for a **vault password**
- [x] Password is **never logged** and **never stored permanently**
- [x] Password is written to a **temporary vault password file**
- [x] For each relevant file, run `infinito create credentials` with:
  - [x] `--role-path`
  - [x] `--inventory-file`
  - [x] `--vault-password-file`
  - [x] Optional `--set`
  - [x] Optional `--allow-empty-plain`
- [x] Resulting changes are immediately visible in the file browser

**Acceptance Criteria**
- [x] Comments and formatting are preserved
- [x] No secrets appear in logs, SSE streams, or API responses
- [x] Vault password exists only temporarily in the workspace

---

## 6. ZIP Export

- [x] Provide a “Download ZIP” button in the UI
- [x] ZIP contains **all workspace files**
- [x] Temporary vault password file is **excluded by default**
- [x] ZIP is generated server-side

**Acceptance Criteria**
- [x] ZIP exactly matches the visible workspace state
- [x] No sensitive temporary files are included

---

## 7. Backend / API

- [x] `POST /api/workspaces`
- [x] `POST /api/workspaces/{id}/generate-inventory`
- [x] `GET /api/workspaces/{id}/files`
- [x] `GET /api/workspaces/{id}/files/{path}`
- [x] `PUT /api/workspaces/{id}/files/{path}`
- [x] `POST /api/workspaces/{id}/credentials`
- [x] `GET /api/workspaces/{id}/download.zip`
- [x] Masking & input validation enabled everywhere

**Acceptance Criteria**
- [x] UI can operate fully via the API
- [x] Workspace access is strictly isolated

---

## 8. UX & Integration Flow

- [x] Clear step-by-step flow:
  1. Select apps
  2. Generate inventory
  3. Edit files
  4. Generate credentials
  5. Export ZIP **or** deploy
- [x] Dedicated “Files” / “Workspace” tab or section

**Acceptance Criteria**
- [x] Users always understand the current step and state
- [x] No implicit or “magic” steps without explicit user action

---

## Status
- 🟩 Done  
