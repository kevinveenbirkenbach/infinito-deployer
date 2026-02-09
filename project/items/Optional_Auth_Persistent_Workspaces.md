# Optional Login & Persistente Workspaces (OAuth2 Proxy)

## Goal

Allow **optional authentication via OAuth2 Proxy** to enable **persistent, user-bound workspaces**
(workdirs) that can be **saved, listed, and reloaded across sessions**.

The system MUST continue to work **fully anonymous** when authentication is disabled.

---

## 1. Authentication Model (Optional)

* [ ] Support **optional login** via OAuth2 Proxy
  * [ ] OAuth2 Proxy runs in front of the Web UI / API
  * [ ] Authentication is handled **externally** (OIDC, SSO, IdP)
* [ ] When disabled:
  * [ ] Application works exactly as today (anonymous, session-bound)

**Acceptance Criteria**

* [ ] No login is required for basic usage
* [ ] Enabling OAuth2 Proxy does not break anonymous mode
* [ ] Backend never implements its own auth logic

---

## 2. User Identification (Backend)

* [ ] When authenticated, extract user identity from trusted headers:
  * [ ] `X-Auth-Request-User` (or equivalent)
  * [ ] Optional: `X-Auth-Request-Email`
* [ ] User identity is treated as **opaque string**
  * [ ] No assumptions about format
  * [ ] No authorization logic beyond workspace ownership

**Acceptance Criteria**

* [ ] Backend trusts headers only when OAuth2 Proxy is enabled
* [ ] Identity is never user-controlled input

---

## 3. Workspace Persistence Model

* [ ] Introduce **persistent workspaces** for authenticated users:
  * [ ] Workspace is bound to a user ID
  * [ ] Workspace survives browser reloads and sessions
* [ ] Anonymous users continue to use:
  * [ ] Ephemeral / session-bound workspaces

**Acceptance Criteria**

* [ ] Authenticated users can return and continue previous work
* [ ] Anonymous users do not see or persist old workspaces

---

## 4. Workspace Listing & Reloading (UI)

* [ ] When authenticated:
  * [ ] Show a **“My Workspaces”** section
  * [ ] List existing workspaces:
    * [ ] ID / name
    * [ ] Last modified timestamp
    * [ ] Current state (draft / deployed / finished)
* [ ] Allow:
  * [ ] Load workspace
  * [ ] Delete workspace (with confirmation)

**Acceptance Criteria**

* [ ] Loading a workspace restores:
  * [ ] Inventory files
  * [ ] Vars
  * [ ] UI state (selected roles, step)
* [ ] Deleting a workspace fully removes server-side data

---

## 5. Workspace Lifecycle Rules

* [ ] Workspace states:
  * [ ] draft
  * [ ] deployed
  * [ ] finished
* [ ] Deployments reference a workspace but do not own it
* [ ] Finished deployments do NOT auto-delete workspaces

**Acceptance Criteria**

* [ ] Users can redeploy from the same workspace
* [ ] Deploy history is preserved independently

---

## 6. Security & Isolation

* [ ] Users can only access **their own workspaces**
* [ ] No workspace ID guessing possible
* [ ] Workspace paths are never user-controlled

**Acceptance Criteria**

* [ ] Cross-user access is impossible
* [ ] Authenticated users cannot access anonymous workspaces and vice versa

---

## 7. API Extensions

* [ ] `GET /api/workspaces`
  * [ ] Returns only workspaces of the authenticated user
* [ ] Existing workspace APIs remain unchanged
* [ ] When unauthenticated:
  * [ ] Workspace listing endpoint returns empty or 401 (configurable)

**Acceptance Criteria**

* [ ] UI can fully manage workspaces via API
* [ ] No breaking changes for existing flows

---

## 8. UI Tests (Playwright – Required)

* [ ] Anonymous mode:
  * [ ] No workspace list is shown
  * [ ] Workspace is lost on reload
* [ ] Authenticated mode:
  * [ ] Workspace list is rendered
  * [ ] Loading restores files and UI state
  * [ ] Deleting removes workspace from list

**Acceptance Criteria**

* [ ] Tests cover both anonymous and authenticated flows
* [ ] No real OAuth provider is used (headers are mocked)

---

## Status

* 🟨 Planned
