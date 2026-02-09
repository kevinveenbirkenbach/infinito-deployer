# Multi-Server Inventory Sync & Alias – TODO Checklist

## Goal
Support multiple servers with aliases, per-server role selection, and **bidirectional** sync between UI, `inventory.yml`, and `host_vars/<alias>.yml`.

---

## 1. Deployment Target Rules

- [ ] Remove `universal` from valid deployment targets
- [ ] Only allow `server` and `workstation` in UI and validation

**Acceptance Criteria**
- [ ] The UI never shows `universal`
- [ ] Validation rejects any target other than `server` or `workstation`

---

## 2. Alias Field (Credentials Panel)

- [ ] Add `Alias` input next to Host/User
- [ ] Alias is the host name used inside `inventory.yml`
- [ ] Alias maps to `host_vars/<alias>.yml`

**Acceptance Criteria**
- [ ] Alias is required for multi-server mode
- [ ] Editing alias updates `host_vars/<alias>.yml` mapping

---

## 3. Multi-Server Model

- [ ] Support an arbitrary number of servers
- [ ] Provide UI to add a new server (Alias, Host, User, Auth)
- [ ] Provide a server switcher (active server context)

**Acceptance Criteria**
- [ ] Users can add multiple servers
- [ ] Switching server changes the active role selection context

---

## 4. Inventory Structure (per Server)

- [ ] Inventory stores host aliases under each role:
  - Example:
    - `all.children.role-a.hosts.alias1: {}`
    - `all.children.role-a.hosts.alias2: {}`

**Acceptance Criteria**
- [ ] Each role can contain multiple aliases
- [ ] Each server is represented by its alias under `hosts`

---

## 5. Bidirectional Sync Rules

### UI -> Inventory
- [ ] Selecting a role adds the **active alias** under that role
- [ ] Deselecting a role removes **only that alias** from the role

### Inventory -> UI
- [ ] Removing an alias from a role deselects that role **only for that alias**
- [ ] Other aliases and selections remain unchanged

### host_vars Sync
- [ ] `host_vars/<alias>.yml` values (`ansible_host`, `ansible_user`) update the UI
- [ ] UI edits to Host/User update `host_vars/<alias>.yml`

**Acceptance Criteria**
- [ ] Sync works both directions without clobbering other servers
- [ ] Changes for one alias never impact another alias

---

## 6. Deploy Flow (Per Server)

- [ ] Always show a deploy scope switch: `Active` or `All`
- [ ] If only one server exists, deploy runs directly without extra choices
- [ ] When `Active` is chosen, deploy uses `--limit <alias>`
- [ ] When `All` is chosen, deploy runs without `--limit`

**Acceptance Criteria**
- [ ] Deploy is scoped to the selected alias
- [ ] Multiple servers are supported without mixing role sets

---

## 7. UX & Messaging

- [ ] Make it clear that roles are **per active server**
- [ ] Show active alias in the UI
- [ ] Keep inventory editor available for manual edits

**Acceptance Criteria**
- [ ] Users understand which server they are configuring
- [ ] Manual inventory edits are reflected correctly in the UI

---

## Status
- ⬜ Planned
