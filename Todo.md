# Infinito Deployer – Master TODO List (with Acceptance Criteria)

## 0. Project Foundation

### 0.1 Repository & Bootstrap

* [x] Repository initialized (`infinito-deployer`)
* [x] Monorepo structure created
  * [x] `apps/web` (Next.js)
  * [x] `apps/api` (FastAPI)
  * [x] `state/` (jobs, logs, sqlite)
* [x] `.gitignore` includes `state/`, `.env`
* [x] `docker-compose.yml` is fully env-driven
* [x] `env.example` exists and is complete
* [x] `Makefile` includes `setup` and `up`

**A/C**
* [x] `make setup` works on a clean checkout
* [x] No secrets or state files are committed
* [x] Stack starts successfully via Docker Compose

---

## 1. Role Catalog & Metadata Indexing

### 1.1 Canonical Role Source

* [x] Load role list from canonical source:

  * [x] `roles/list.json` (primary)
  * [ ] `roles/categories.yml` (optional)
* [x] Validate uniqueness of role IDs
* [x] Ignore disabled/hidden roles if marked

**A/C**

* [x] API can return a complete list of deployable roles
* [x] No role duplication
* [x] Missing or malformed entries are skipped with warnings (not fatal)

---

### 1.2 Role Metadata Extraction

For each role:

* [x] Parse `meta/main.yml`

  * [x] `galaxy_tags`
  * [x] `dependencies`
  * [x] `logo` / `icon` (if present)
  * [x] **status** (`pre-alpha`, `alpha`, `beta`, `stable`, `deprecated`)
* [x] Derive **deployment targets**
  k

  * [x] `universal`
  * [x] `server`
  * [x] `workstation`
* [x] Extract description

  * [x] From `meta/main.yml` or README fallbac

**A/C**

* [x] Every role has:

  * [x] ID
  * [x] Display name
  * [x] Status
  * [x] At least one deploy target
* [x] Roles without optional metadata still render correctly

---

### 1.3 Role Logo Resolution

* [x] **Primary:** use logo/icon defined in `meta/main.yml`
  → `md.logo.css_class` wird bevorzugt genutzt (`source="meta"`)

* [x] **Fallback:** resolve icon via **simpleicons**

  * [x] Normalize role ID → entity name
    → `_normalize_role_to_candidates()` mit Prefix-Stripping & Heuristiken
  * [x] Apply manual overrides for known mismatches
    → `self._overrides` Mapping vorhanden

* [x] **Final fallback:** generic placeholder icon
  → Inline SVG als `data:image/svg+xml` (niemals broken)

---

### Acceptance Criteria

* [x] **Every role tile has a visible icon**
  → `meta` → `simpleicons` → `placeholder` (garantiert)

* [x] **No broken image URLs**
  → Simpleicons URLs werden vor Nutzung validiert, sonst Placeholder

* [x] **simpleicons lookup is cached**
  → Persistenter Cache unter `${STATE_DIR}/cache/simpleicons.json`
  → inkl. **negative caching** (404 wird gemerkt)


---

## 2. Backend API (FastAPI)

### 2.1 Roles API

* [x] `GET /api/roles`

  * [x] Filters:

    * [x] **status**
      → CSV query parameter, validated against allowed lifecycle values
    * [x] **deploy_target**
      → CSV query parameter, validated against allowed deployment targets
    * [x] **category**
      → CSV query parameter, matched against `roles/categories.yml` (optional source)
    * [x] **tags**
      → CSV query parameter, matched against `galaxy_tags`
    * [x] **text search**
      → Implemented as `q`, case-insensitive substring search over
      `id`, `display_name`, and `description`

* [x] `GET /api/roles/{role_id}`
  → Returns full role metadata or `404` if the role does not exist

---

### Acceptance Criteria

* [x] **Filters are combinable**
  → Logical **AND** across filter groups, **OR** within each filter (CSV semantics)

* [~] **API response time < 200ms for cached index**
  → In-memory cache with TTL and mtime-based invalidation is implemented
  → Response time is expected to be <200ms on a warm cache
  → Not strictly guaranteed without runtime measurement or prewarming

* [x] **Invalid filters return empty results, not errors**
  → Invalid `status` or `deploy_target` values return `[]`
  → Non-matching `category`, `tags`, or `q` return `[]`
  → No 4xx/5xx errors for invalid filter values

---

### 2.2 Inventory & Configuration API

* [x] Define `DeploymentRequest` schema:

  * [x] deploy_target
  * [x] host (localhost / IP / domain)
  * [x] ssh user
  * [x] authentication:

    * [x] password OR
    * [x] private key
  * [x] selected_roles[]
  * [x] inventory_vars (JSON)

* [x] `POST /api/inventories/preview`

  * [x] Generate inventory YAML
  * [x] Validate required fields
  * [x] Return warnings (missing vars, unsafe defaults)

**A/C**

* [x] Preview matches the inventory used during deployment
* [x] No secrets are logged or returned unmasked
* [x] Invalid input returns clear validation errors

---

### 2.3 Deployment Jobs API

* [x] `POST /api/deployments`

  * [x] Create job ID
  * [x] Create job workspace
  * [x] Persist job metadata
  * [x] Start runner subprocess
* [x] `GET /api/deployments/{job_id}`
* [x] `POST /api/deployments/{job_id}/cancel`

**A/C**

* [x] Each deployment has a unique, traceable job ID
* [x] Job state transitions are consistent
* [x] Cancel reliably stops the deployment

---

### 2.4 Live Logs (SSE)

* [x] `GET /api/deployments/{job_id}/logs`
* [x] Stream events:

  * `log`
  * `status`
  * `done`
* [x] Mask secrets before streaming

**A/C**

* [x] Logs appear in the UI within < 1 second
* [x] ANSI output is readable
* [x] Secrets are never visible

---

## 3. Deployment Runner

### 3.1 Job Workspace

For each job:

* [x] Create directory: `state/jobs/{job_id}/`
* [x] Store:

  * inventory.yml
  * vars.json / vars.yml
  * ssh key (if provided, chmod 600)
  * job.log (append-only)

**A/C**

* [x] Jobs are isolated from each other
* [x] Restarting the API does not corrupt jobs

---

### 3.2 CLI / Ansible Integration

* [ ] Introduce wrapper script: `run.sh`
* [ ] Wrapper:

  * echoes executed commands (docker-like)
  * calls existing CLI / ansible-playbook
* [ ] Capture stdout + stderr line-by-line

**A/C**

* [ ] Output matches CLI behavior when run manually
* [ ] Exit codes propagate correctly
* [ ] Wrapper can be reused outside the web UI

---

### 3.3 Security & Masking

* [ ] Regex-based masking:

  * `*_PASSWORD`
  * `*_SECRET`
  * tokens
* [ ] Masking applies to:

  * logs
  * SSE stream
  * persisted files

**A/C**

* [ ] No secret value is ever retrievable after submission
* [ ] Masking does not break readability

---

## 4. Web UI (Next.js)

### 4.1 Dashboard – App Tiles

* [ ] Grid layout (tiles)
* [ ] Each tile shows:

  * logo
  * app name
  * status badge
  * deploy targets
* [ ] Filters:

  * status (multi-select)
  * deploy target
  * search

**A/C**

* [ ] UI remains responsive with 100+ roles
* [ ] Filtering is client-side fast
* [ ] Selection state is preserved during filtering

---

### 4.2 Deployment Target & Credentials

* [ ] Form fields:

  * deploy target
  * host
  * user
  * auth method selector
* [ ] Private key textarea (never echoed back)
* [ ] Password field

**A/C**

* [ ] Form prevents invalid combinations
* [ ] Secrets are cleared on page reload
* [ ] UI explains where credentials are used

---

### 4.3 Inventory Variables

* [ ] JSON editor for vars
* [ ] Optional key/value UI
* [ ] “Preview Inventory” button

**A/C**

* [ ] Invalid JSON is detected before submit
* [ ] Preview matches deployment behavior exactly

---

### 4.4 Live Deployment View

* [ ] xterm.js embedded terminal
* [ ] SSE client implementation
* [ ] Status indicator + cancel button

**A/C**

* [ ] Terminal output feels “docker-like”
* [ ] User can follow deployment in real time
* [ ] Final status is clearly visible

---

## 5. Non-Functional Requirements

### 5.1 Performance

* [ ] Role index cached
* [ ] Logo resolution cached
* [ ] SSE scalable to multiple viewers

**A/C**

* [ ] Dashboard loads < 1s on warm cache
* [ ] Multiple concurrent viewers do not crash API

---

### 5.2 Security

* [ ] No secrets stored long-term
* [ ] CORS restricted to UI origin
* [ ] Input validation everywhere

**A/C**

* [ ] Secrets never appear in logs or browser devtools
* [ ] API rejects malformed or malicious input

---

## 6. Milestones (for reuse)

### Milestone 1 – Read-only Dashboard

**A/C**

* [ ] Roles are visible as tiles
* [ ] Filtering works
* [ ] Logos render correctly

### Milestone 2 – Inventory Preview

**A/C**

* [ ] User can configure target + vars
* [ ] Inventory preview is accurate

### Milestone 3 – Live Deployment

**A/C**

* [ ] Deployment runs from UI
* [ ] Logs stream live
* [ ] Cancel works

### Milestone 4 – Harden & Polish

**A/C**

* [ ] Caching enabled
* [ ] Masking verified
* [ ] UX refinements complete
Below is a **very detailed, checklist-style TODO list with explicit Acceptance Criteria (A/C)**, written in **English**, designed so you can **reuse individual sections verbatim in future AI conversations, GitHub issues, or project planning**.

Scope matches your stated goal exactly: **Deployment dashboard → app tiles → filtering → target selection → credentials → inventory vars → deployment → live web terminal**.

---

# Infinito Deployer – Master TODO List (with Acceptance Criteria)

## 0. Project Foundation

### 0.1 Repository & Bootstrap

* [ ] Repository initialized (`infinito-deployer`)
* [ ] Monorepo structure created

  * [ ] `apps/web` (Next.js)
  * [ ] `apps/api` (FastAPI)
  * [ ] `state/` (jobs, logs, sqlite)
* [ ] `.gitignore` includes `state/`, `.env`
* [ ] `docker-compose.yml` is fully env-driven
* [ ] `env.example` exists and is complete
* [ ] `Makefile` includes `setup` and `up`

**A/C**

* `make setup` works on a clean checkout
* No secrets or state files are committed
* Stack starts successfully via Docker Compose

---

## 1. Role Catalog & Metadata Indexing

### 1.1 Canonical Role Source

* [x] Load role list from canonical source:

  * [x] `roles/list.json` (primary)
  * [ ] `roles/categories.yml` (optional)
* [x] Validate uniqueness of role IDs
* [x] Ignore disabled/hidden roles if marked

**A/C**

* [x] API can return a complete list of deployable roles
* [x] No role duplication
* [x] Missing or malformed entries are skipped with warnings (not fatal)

---

### 1.2 Role Metadata Extraction

For each role:

* [ ] Parse `meta/main.yml`

  * [ ] `galaxy_tags`
  * [ ] `dependencies`
  * [ ] `logo` / `icon` (if present)
  * [ ] **status** (`pre-alpha`, `alpha`, `beta`, `stable`, `deprecated`)
* [ ] Derive **deployment targets**

  * [ ] `universal`
  * [ ] `server`
  * [ ] `workstation`
* [ ] Extract description

  * [ ] From `meta/main.yml` or README fallback

**A/C**

* [ ] Every role has:

  * ID
  * Display name
  * Status
  * At least one deploy target
* [ ] Roles without optional metadata still render correctly

---

### 1.3 Role Logo Resolution

* [ ] Primary: use logo/icon defined in `meta/main.yml`
* [ ] Fallback: resolve icon via **simpleicons**

  * [ ] Normalize role ID → entity name
  * [ ] Apply manual overrides for known mismatches
* [ ] Final fallback: generic placeholder icon

**A/C**

* [ ] Every role tile has a visible icon
* [ ] No broken image URLs
* [ ] simpleicons lookup is cached

---

## 2. Backend API (FastAPI)

### 2.1 Roles API

* [ ] `GET /api/roles`

  * [ ] Filters:

    * status
    * deploy_target
    * category
    * tags
    * text search
* [ ] `GET /api/roles/{role_id}`

**A/C**

* [ ] Filters are combinable
* [ ] API response time < 200ms for cached index
* [ ] Invalid filters return empty results, not errors

---

### 2.2 Inventory & Configuration API

* [ ] Define `DeploymentRequest` schema:

  * deploy_target
  * host (localhost / IP / domain)
  * ssh user
  * authentication:

    * password OR
    * private key
  * selected_roles[]
  * inventory_vars (JSON)

* [ ] `POST /api/inventories/preview`

  * [ ] Generate inventory YAML
  * [ ] Validate required fields
  * [ ] Return warnings (missing vars, unsafe defaults)

**A/C**

* [ ] Preview matches the inventory used during deployment
* [ ] No secrets are logged or returned unmasked
* [ ] Invalid input returns clear validation errors

---

### 2.3 Deployment Jobs API

* [ ] `POST /api/deployments`

  * [ ] Create job ID
  * [ ] Create job workspace
  * [ ] Persist job metadata
  * [ ] Start runner subprocess
* [ ] `GET /api/deployments/{job_id}`
* [ ] `POST /api/deployments/{job_id}/cancel`

**A/C**

* [ ] Each deployment has a unique, traceable job ID
* [ ] Job state transitions are consistent
* [ ] Cancel reliably stops the deployment

---

### 2.4 Live Logs (SSE)

* [x] `GET /api/deployments/{job_id}/logs`
* [x] Stream events:

  * `log`
  * `status`
  * `done`
* [x] Mask secrets before streaming

**A/C**

* [x] Logs appear in the UI within < 1 second
* [x] ANSI output is readable
* [x] Secrets are never visible

---

## 3. Deployment Runner

### 3.1 Job Workspace

For each job:

* [x] Create directory: `state/jobs/{job_id}/`
* [x] Store:

  * inventory.yml
  * vars.json / vars.yml
  * ssh key (if provided, chmod 600)
  * job.log (append-only)

**A/C**

* [x] Jobs are isolated from each other
* [x] Restarting the API does not corrupt jobs

---

### 3.2 CLI / Ansible Integration

* [ ] Introduce wrapper script: `run.sh`
* [ ] Wrapper:

  * echoes executed commands (docker-like)
  * calls existing CLI / ansible-playbook
* [ ] Capture stdout + stderr line-by-line

**A/C**

* [ ] Output matches CLI behavior when run manually
* [ ] Exit codes propagate correctly
* [ ] Wrapper can be reused outside the web UI

---

### 3.3 Security & Masking

* [ ] Regex-based masking:

  * `*_PASSWORD`
  * `*_SECRET`
  * tokens
* [ ] Masking applies to:

  * logs
  * SSE stream
  * persisted files

**A/C**

* [ ] No secret value is ever retrievable after submission
* [ ] Masking does not break readability

---

## 4. Web UI (Next.js)

### 4.1 Dashboard – App Tiles

* [ ] Grid layout (tiles)
* [ ] Each tile shows:

  * logo
  * app name
  * status badge
  * deploy targets
* [ ] Filters:

  * status (multi-select)
  * deploy target
  * search

**A/C**

* [ ] UI remains responsive with 100+ roles
* [ ] Filtering is client-side fast
* [ ] Selection state is preserved during filtering

---

### 4.2 Deployment Target & Credentials

* [ ] Form fields:

  * deploy target
  * host
  * user
  * auth method selector
* [ ] Private key textarea (never echoed back)
* [ ] Password field

**A/C**

* [ ] Form prevents invalid combinations
* [ ] Secrets are cleared on page reload
* [ ] UI explains where credentials are used

---

### 4.3 Inventory Variables

* [ ] JSON editor for vars
* [ ] Optional key/value UI
* [ ] “Preview Inventory” button

**A/C**

* [ ] Invalid JSON is detected before submit
* [ ] Preview matches deployment behavior exactly

---

### 4.4 Live Deployment View

* [ ] xterm.js embedded terminal
* [ ] SSE client implementation
* [ ] Status indicator + cancel button

**A/C**

* [ ] Terminal output feels “docker-like”
* [ ] User can follow deployment in real time
* [ ] Final status is clearly visible

---

## 5. Non-Functional Requirements

### 5.1 Performance

* [ ] Role index cached
* [ ] Logo resolution cached
* [ ] SSE scalable to multiple viewers

**A/C**

* [ ] Dashboard loads < 1s on warm cache
* [ ] Multiple concurrent viewers do not crash API

---

### 5.2 Security

* [ ] No secrets stored long-term
* [ ] CORS restricted to UI origin
* [ ] Input validation everywhere

**A/C**

* [ ] Secrets never appear in logs or browser devtools
* [ ] API rejects malformed or malicious input

---

## 6. Milestones (for reuse)

### Milestone 1 – Read-only Dashboard

**A/C**

* [ ] Roles are visible as tiles
* [ ] Filtering works
* [ ] Logos render correctly

### Milestone 2 – Inventory Preview

**A/C**

* [ ] User can configure target + vars
* [ ] Inventory preview is accurate

### Milestone 3 – Live Deployment

**A/C**

* [ ] Deployment runs from UI
* [ ] Logs stream live
* [ ] Cancel works

### Milestone 4 – Harden & Polish

**A/C**

* [ ] Caching enabled
* [ ] Masking verified
* [ ] UX refinements complete
