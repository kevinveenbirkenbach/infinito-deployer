# Store – Layout, Filters, View Modes

## Goal

Refine the Store layout so controls are compact and consistent, pagination is fixed at the bottom, and view modes are icon-driven with clear behavior for mini/list/detail.

---

## 1. Pagination + Scroll Area

* [ ] Pagination must be **fixed at the bottom** of the Store section, **outside** the scroll area.
* [ ] The apps grid scrolls above it and uses the **full available width**.
* [ ] Target grid density: **4 columns** when space allows.
* [ ] Logos must **never overflow** their card boundaries.

**Acceptance Criteria**

* [ ] Pagination stays visible and fixed while the grid scrolls.
* [ ] App cards fill the full Store width (no narrow column constraint).
* [ ] No logo overlaps or overflows card edges.

---

## 2. Top Control Row Layout

* [ ] Top control row must be **fixed/sticky** while the apps grid scrolls.
* [ ] **Left**: Search input.
* [ ] **Next to search**: view mode toggles shown **only as favicon icons** (detail/list/mini).
* [ ] **Right**: View dropdown (includes Rows selector) and a **Filters dropdown** (deploy target, status, selection).

**Acceptance Criteria**

* [ ] Search is left-aligned; view toggles sit immediately to its right.
* [ ] View dropdown is right-aligned and contains Rows selection.
* [ ] All filter options are in a right-side dropdown (no full-width filter bar).

---

## 3. View Modes Behavior

* [ ] **Mini**: show **only the logo** in the tile.
  * [ ] On hover, show role info (name, status, targets, description) via tooltip/popover.
* [ ] **List**: display **all information** in a **table-like** layout (rows + columns).
* [ ] **Detail**: keep current card-style layout with full content.
* [ ] Icon fallback order:
  * [ ] Prefer **SimpleIcons** derived from the role title.
  * [ ] Else use **Font Awesome** icon from `meta/main.yml`.
  * [ ] Else show the **default initials icon** with higher-contrast styling.

**Acceptance Criteria**

* [ ] Mini view shows only the logo until hover reveals details.
* [ ] List view reads like a table with aligned columns.
* [ ] Detail view keeps rich card layout.

---

## 4. Responsive Sizing Rules

* [ ] Auto-calculate rows to fill the available height.
* [ ] Column count must consider **icon width** to avoid overflow (applies to mini/detail/list).

**Acceptance Criteria**

* [ ] Row/column calculations adapt to the selected view and container size.
* [ ] No card overflows its grid cell.
