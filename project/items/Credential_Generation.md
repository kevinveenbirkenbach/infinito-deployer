# Inventory Workspace & Credential Generation – TODO Checklist

## Goal
Interactive creation, editing, and export of a complete inventory including credentials **before** deployment.

---

## 1. Inventory Initialization (UI / Flow)

- [ ] Detect when **no inventory exists** (session / workspace / job)
- [ ] After app/role selection, **show a “Generate Inventory” button**
- [ ] Disable or de-prioritize “Preview Inventory” until an inventory exists
- [ ] Display a clear UI hint that an inventory must be generated first

**Acceptance Criteria**
- [ ] Without an existing inventory, “Generate Inventory” is visible
- [ ] Clicking it creates a valid initial inventory structure

---

## 2. Workspace & File Structure

- [ ] Introduce a **workspace concept** (per project or job)
- [ ] Workspace directory is created server-side
- [ ] The following files are initially generated:
  - [ ] `inventory.yml` (or defined main inventory file)
  - [ ] Host file (e.g. `host_vars/<host>.yml`)
  - [ ] Optional `group_vars/`
  - [ ] Optional `vars.json` / `vars.yml`
- [ ] Temporary vault password file is prepared (initially empty)

**Acceptance Criteria**
- [ ] File structure is consistent and reproducible
- [ ] Workspaces are fully isolated from each other

---

## 3. Web File Browser (JS)

- [ ] Implement a **file browser (tree view)**
- [ ] Display all workspace files
- [ ] Selecting a file loads its contents into an editor

**Acceptance Criteria**
- [ ] All generated files are visible
- [ ] Tree navigation is stable and performant

---

## 4. Editor Functionality (WYSIWYG / Code)

- [ ] Integrate a **code editor** (e.g. Monaco / CodeMirror)
- [ ] Editor modes:
  - [ ] YAML (syntax highlighting + validation)
  - [ ] JSON (validation)
  - [ ] Code/Text (Shell, Python, INI, etc.)
  - [ ] Optional: WYSIWYG for Markdown / notes
- [ ] Saving writes changes directly to the workspace

**Acceptance Criteria**
- [ ] Changes persist reliably
- [ ] YAML/JSON errors are detected before follow-up actions

---

## 5. Credential Generation via `infinito create credentials`

- [ ] UI explicitly asks for a **vault password**
- [ ] Password is **never logged** and **never stored permanently**
- [ ] Password is written to a **temporary vault password file**
- [ ] For each relevant file, run `infinito create credentials` with:
  - [ ] `--role-path`
  - [ ] `--inventory-file`
  - [ ] `--vault-password-file`
  - [ ] Optional `--set`
  - [ ] Optional `--allow-empty-plain`
- [ ] Resulting changes are immediately visible in the file browser

**Acceptance Criteria**
- [ ] Comments and formatting are preserved
- [ ] No secrets appear in logs, SSE streams, or API responses
- [ ] Vault password exists only temporarily in the workspace

---

## 6. ZIP Export

- [ ] Provide a “Download ZIP” button in the UI
- [ ] ZIP contains **all workspace files**
- [ ] Temporary vault password file is **excluded by default**
- [ ] ZIP is generated server-side

**Acceptance Criteria**
- [ ] ZIP exactly matches the visible workspace state
- [ ] No sensitive temporary files are included

---

## 7. Backend / API

- [ ] `POST /api/workspaces`
- [ ] `POST /api/workspaces/{id}/generate-inventory`
- [ ] `GET /api/workspaces/{id}/files`
- [ ] `GET /api/workspaces/{id}/files/{path}`
- [ ] `PUT /api/workspaces/{id}/files/{path}`
- [ ] `POST /api/workspaces/{id}/credentials`
- [ ] `GET /api/workspaces/{id}/download.zip`
- [ ] Masking & input validation enabled everywhere

**Acceptance Criteria**
- [ ] UI can operate fully via the API
- [ ] Workspace access is strictly isolated

---

## 8. UX & Integration Flow

- [ ] Clear step-by-step flow:
  1. Select apps
  2. Generate inventory
  3. Edit files
  4. Generate credentials
  5. Export ZIP **or** deploy
- [ ] Dedicated “Files” / “Workspace” tab or section

**Acceptance Criteria**
- [ ] Users always understand the current step and state
- [ ] No implicit or “magic” steps without explicit user action

---

## Status
- ⬜ Not started  
- 🟨 In progress  
- 🟩 Done  
