# Role Pricing & Variants (Meta-driven, UI-integrated)

## Goal

Enable **provider-specific software variants and pricing models** (e.g. Community, Enterprise, Tier-based)
to be **declared in Ansible roles**, automatically **indexed by the backend**, and **selectable & calculable in the UI**.

The system must be **data-driven, deterministic, secure**, and **not execute arbitrary vendor JavaScript**.

---

## 1. Role-side Metadata (Ansible)

### 1.1 Pricing Metadata File

* [ ] Roles MAY provide pricing metadata via a dedicated file:

  * `roles/*/meta/pricing.yml` (preferred)
  * or `pricing.json`

* [ ] `meta/main.yml` MAY reference pricing explicitly:

  ```yaml
  galaxy_info:
    pricing:
      schema: v1
      file: meta/pricing.yml
````

* [ ] Roles without pricing metadata default to:

  * Single implicit variant: `community`
  * Price: `0`
  * No UI inputs

**Acceptance Criteria**

* [ ] Roles without pricing metadata continue to work unchanged
* [ ] Pricing metadata is optional and non-breaking

---

### 1.2 Supported Pricing Model Primitives

The pricing schema MUST support at least:

* [ ] `fixed` (free or flat price)
* [ ] `per_unit` (e.g. per user)
* [ ] `tiered_per_unit`
* [ ] `bundle` (base fee + usage)
* [ ] `addon`
* [ ] `factor` (support level multipliers)
* [ ] `custom` (contact sales / external pricing)

**Acceptance Criteria**

* [ ] All primitives are declarative (no executable code)
* [ ] All primitives are versioned under a schema (`schema: v1`)

---

### 1.3 Inputs & Applicability

* [ ] Pricing metadata MAY define user inputs:

  * number
  * enum
  * boolean

* [ ] Inputs can be scoped via `applies_to` to specific variants

* [ ] Defaults are mandatory for all inputs

**Acceptance Criteria**

* [ ] UI never renders an input without a default
* [ ] Inputs are only shown when relevant to the selected variant

---

## 2. Backend API (Pricing Index & Calculation)

### 2.1 Pricing Metadata Indexing

* [ ] Extend role indexing to detect and parse pricing metadata
* [ ] Validate pricing files against a strict schema
* [ ] Invalid pricing metadata:

  * is ignored
  * emits a warning
  * does NOT break role indexing

**Acceptance Criteria**

* [ ] `/api/roles` includes `pricing_summary` when available
* [ ] `/api/roles/{id}` includes full `pricing` block when present

---

### 2.2 Pricing Calculation Engine

* [ ] Implement a deterministic **PricingEngine** (backend-side)

* [ ] Engine accepts:

  * role_id
  * selected variant
  * input values

* [ ] Engine returns:

  * total price
  * breakdown (base, addons, factors)
  * unit price (if applicable)
  * interval (month/year/once)

**Acceptance Criteria**

* [ ] Same input always produces same output
* [ ] No pricing logic exists in the frontend
* [ ] Engine is fully unit-tested

---

## 3. Web UI (Variant Selection & Pricing Preview)

### 3.1 Variant Selection

* [ ] Replace simple “Select” button with:

  * Variant selector (radio / dropdown)
  * Default: `community`

* [ ] Variant label + description are shown inline

**Acceptance Criteria**

* [ ] Roles with one variant behave exactly like today
* [ ] Variant switching does not reset unrelated UI state

---

### 3.2 Dynamic Inputs

* [ ] Render pricing inputs dynamically based on metadata
* [ ] Inputs update pricing preview live
* [ ] Inputs are validated client-side (type, min/max)

**Acceptance Criteria**

* [ ] Invalid input never reaches the backend
* [ ] UI always reflects the currently selected variant

---

### 3.3 Pricing Preview

* [ ] Show pricing preview panel:

  * Total price
  * Interval (monthly/yearly/once)
  * Optional breakdown (toggleable)

* [ ] Support “Contact sales” state for custom pricing

**Acceptance Criteria**

* [ ] Pricing preview is clearly marked as *estimate*
* [ ] Zero-price variants explicitly show “Free”

---

## 4. Security & Trust Model

* [ ] No arbitrary JavaScript is executed from roles
* [ ] Pricing metadata is treated as untrusted input
* [ ] Strict schema validation is mandatory

**Acceptance Criteria**

* [ ] Pricing metadata cannot inject scripts or HTML
* [ ] CSP does not require relaxation for pricing features

---

## 5. Testing (Required)

### Backend

* [ ] Unit tests for PricingEngine:

  * fixed
  * per_unit
  * tiered
  * addons
  * factors
  * edge cases (0, min, max)

### Frontend (Playwright)

* [ ] Variant selector renders correctly
* [ ] Inputs appear/disappear on variant change
* [ ] Pricing preview updates on input change
* [ ] “Contact sales” variant disables calculation

**Acceptance Criteria**

* [ ] All pricing logic is covered by automated tests
* [ ] Tests pass headless in CI

---

## 6. UX Principles

* [ ] Community / Free is always the least prominent upsell
* [ ] Enterprise pricing never blocks deployment
* [ ] Pricing UI never forces a purchase flow

**Acceptance Criteria**

* [ ] Users can deploy Community without friction
* [ ] Pricing is informative, not coercive

---

## Status

* 🟨 Planned
  << END >>
