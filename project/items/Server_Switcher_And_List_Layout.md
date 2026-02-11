# Server Switcher & Server List Layout

## Goal

Move the active-server control into the top navigation, add a server switcher dropdown with "New", and align the server list layout with the Store layout (fixed pagination, top controls, view modes).

---

## 1. Remove Active Button From Server Cards

* [ ] Remove the **"active" button** from server cards/rows.

**Acceptance Criteria**

* [ ] Server cards/rows no longer show an "active" button.

---

## 2. Top Navigation Server Switcher

* [ ] **Under the logo in the top navigation**, show the **current server** as an **active button**.
* [ ] Clicking the button opens a **dropdown**.
* [ ] Dropdown lists **all servers** plus a **"New"** option.
* [ ] Clicking **"New"** opens the **Server tab** and **creates a new server**.

**Acceptance Criteria**

* [ ] Current server is visible in the top nav as an active button.
* [ ] Dropdown contains all servers and a "New" entry.
* [ ] Selecting a server switches the active server.
* [ ] Selecting "New" opens the Server tab and creates a new server.

---

## 3. Active Server Highlight In Server Tab

* [ ] In the Server tab, the **currently active server** is **always marked green**.

**Acceptance Criteria**

* [ ] Exactly one server is highlighted as active (green).
* [ ] Highlight updates immediately when switching servers.

---

## 4. Server Block Layout (Like Store)

* [ ] Server block uses **fixed pagination at the bottom**, outside the scroll area.
* [ ] **Top-left**: search field.
* [ ] **Next to search**: **Add** button.
* [ ] **Top-right**: view mode selection with **Selection / Detail / List**.
* [ ] **List view** shows servers in a **table-like layout** (rows + columns).

**Acceptance Criteria**

* [ ] Pagination stays fixed while the server list scrolls.
* [ ] Search and Add are left-aligned in the top control row.
* [ ] View mode selector is right-aligned and includes Selection/Detail/List.
* [ ] List view renders servers in a table-like layout with aligned columns.
