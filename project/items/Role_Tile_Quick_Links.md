# Role Tile – Quick Links Icons (Meta-driven)

## Goal

Extend each role tile with a bottom “quick links” icon row, fully driven by `roles/*/meta/main.yml` (`galaxy_info.*`).

---

## 1. Metadata Extraction (Backend)

* [ ] Extend meta parser to extract these optional URLs from `galaxy_info`:

  * [ ] `documentation`
  * [ ] `video`
  * [ ] `forum` (fallback: global Infinito.Nexus forum URL if not set per role)
  * [ ] `homepage`
  * [ ] `issue_tracker_url`
  * [ ] `license_url`
* [ ] Normalize/validate:

  * [ ] Accept only `http://` / `https://` URLs
  * [ ] Empty/invalid values are ignored (do not break rendering)

**Acceptance Criteria**

* [ ] Role JSON contains these fields when present, otherwise omits them or sets `null`
* [ ] Malformed URLs do not crash indexing; they are skipped with a warning

---

## 2. Tile UI – Icon Row (Frontend)

* [ ] Render a compact icon row at the **bottom of each tile**.
* [ ] Show icons only for links that exist in role metadata.
* [ ] Provide tooltip/aria-label per icon:

  * [ ] Documentation
  * [ ] Video
  * [ ] Forum
  * [ ] Homepage
  * [ ] Issues
  * [ ] License

**Acceptance Criteria**

* [ ] Tiles with no links show no icon row (no empty placeholders)
* [ ] Icons are visually consistent across tiles and do not shift layout unexpectedly

---

## 3. Link Behaviors

* [ ] `documentation` → open in **new tab**
* [ ] `forum` → open Infinito.Nexus forum in **new tab**
* [ ] `homepage` → open manufacturer/provider homepage in **new tab**
* [ ] `issue_tracker_url` → open bug reporting page in **new tab**
* [ ] `license_url` → open license page in **new tab**
* [ ] `video` → open **smooth JS foreground overlay** (modal)

  * [ ] Video is loaded as an `<iframe>` (supports common link formats, incl. youtu.be / youtube.com, etc.)
  * [ ] Modal has close button + ESC to close + click-backdrop to close
  * [ ] On close: stop playback by clearing/unmounting the iframe src

**Acceptance Criteria**

* [ ] All non-video links open in a new tab with safe attributes (`rel="noopener noreferrer"`)
* [ ] Video opens in a modal with smooth transition and works with typical video URL formats
* [ ] Closing the modal reliably stops the video audio

---

## 4. UI Tests (Playwright – Required)

* [ ] Tile with all links renders all corresponding icons
* [ ] Tile with partial links renders only those icons
* [ ] Clicking non-video icons opens a new tab (assert `target=_blank` behavior)
* [ ] Clicking video icon opens modal; iframe is present; closing removes iframe

**Acceptance Criteria**

* [ ] Tests cover DOM state + modal open/close transitions
* [ ] Tests run headless and pass in CI
