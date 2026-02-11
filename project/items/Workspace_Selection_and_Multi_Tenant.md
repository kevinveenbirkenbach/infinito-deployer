# Workspace Selection & Multi-Tenant Workspaces

## Goal

Allow selecting workspaces via URL, support multiple workspaces per user, and clearly separate inventories per workspace. Logged-out users see the default interface, while logged-in users see a workspace overview on the start page.

---

## 1. Core Model

* [ ] A user can have **multiple workspaces**.
* [ ] Each workspace has **exactly one inventory**.
* [ ] Each inventory can manage **multiple servers**.

**Acceptance Criteria**

* [ ] Workspaces and inventories are strictly scoped (no cross-workspace leakage).
* [ ] Inventory operations affect only the selected workspace.

---

## 2. URL-Based Workspace Selection

* [ ] Support selecting a workspace via URL (e.g., route or query).
* [ ] Unknown/invalid workspace in URL should show a clear error or fallback.

**Acceptance Criteria**

* [ ] Navigating directly to a workspace URL loads that workspace context.
* [ ] Invalid workspace identifiers are handled gracefully.

---

## 3. Logged-Out Behavior

* [ ] Non‑logged users see the **default interface** (current behavior).
* [ ] No workspace switching or user-specific data should be visible.

**Acceptance Criteria**

* [ ] Logged-out users can use the app without workspace selection.
* [ ] No user workspace data is exposed when not authenticated.

---

## 4. Logged-In Start Page

* [ ] Logged‑in users see a **workspace overview** on the start page.
* [ ] Overview lists all workspaces and allows selecting one.
* [ ] In the header, **below the right logo**, show the **current workspace** with a dropdown of all user workspaces.
  * [ ] Dropdown allows switching workspaces.
  * [ ] When logged out, **nothing is shown** in that spot.

**Acceptance Criteria**

* [ ] Start page changes based on auth state.
* [ ] User can select a workspace from the overview and is routed accordingly.
* [ ] Workspace dropdown appears only for authenticated users and switches context.
