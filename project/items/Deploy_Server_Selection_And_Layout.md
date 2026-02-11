# Deploy – Server Selection & Layout

## Goal

Make the deploy screen show a tabular server selection with clear deployed status, correct `--limit` behavior, and a layout where the server list shares space with the terminal cleanly.

---

## 1. Server Table & Selection Rules

* [ ] List **all servers** in a **table-like layout** (rows + columns).
* [ ] Servers already **deployed** show a **checkmark** and are **not selectable**.
* [ ] Provide **Select All** and **Deselect All** actions (only for selectable servers).

**Acceptance Criteria**

* [ ] Server list is tabular with aligned columns.
* [ ] Deployed servers are visibly marked and cannot be selected.
* [ ] Select All / Deselect All operate on selectable servers only.

---

## 2. `--limit` Behavior

* [ ] If **all selectable servers** are selected, **do not** pass `--limit`.
* [ ] Otherwise, pass the **selected server aliases** via `--limit`.
* [ ] Deployment should **run the inventory** directly (no extra selection UI needed).

**Acceptance Criteria**

* [ ] `--limit` is omitted when all selectable servers are selected.
* [ ] `--limit` receives the correct server aliases when not all are selected.

---

## 3. Deploy Screen Cleanup & Button Order

* [ ] Remove the labels **"Selected roles: none"** and **"Active server: main"**.
* [ ] **Start deployment** button appears **before** **Connect** and **Cancel**.

**Acceptance Criteria**

* [ ] Removed labels are no longer visible.
* [ ] Button order is Start deployment, then Connect, then Cancel.

---

## 4. Layout: Server List + Terminal

* [ ] Server list lives in an **auto-scroll container**.
* [ ] Server list uses **max 50%** of the available tab height.
* [ ] Terminal uses **all remaining space**.
* [ ] When the server list is **minimized/collapsed**, terminal expands to fill the rest.
* [ ] Terminal corners are **square** (no rounding).

**Acceptance Criteria**

* [ ] Server list never exceeds half of the free tab height.
* [ ] Terminal always fills the remaining space and expands when the list is minimized.
* [ ] Terminal has no rounded corners.
