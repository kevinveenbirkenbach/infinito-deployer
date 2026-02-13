# Role Pricing & Variants (Meta-driven, UI-integrated) — Refined Spec (Offerings + Plans + Tiered Usage + Multi-Currency + Enterprise Edge Cases)

## Goal

Enable **provider-specific offerings**, **software editions/versions**, **plan/tier bundles**, **multi-currency pricing**, and key
enterprise edge cases (**setup fees**, **volume pricing**, **minimum commits**, **regional pricing**)
to be declared in Ansible roles, indexed by the backend, and selectable/calculable in the UI.

The system MUST be:

* **data-driven**
* **deterministic**
* **secure**
* **non-executable** (no vendor JS, no dynamic code)
* **backend-calculated** (frontend renders only)

---

## 1. Role-side Metadata (Ansible)

### 1.1 Pricing Metadata File

* [ ] Roles MAY provide pricing metadata via:

  * `roles/*/meta/pricing.yml` (preferred)
  * `roles/*/meta/pricing.json` (optional)

* [ ] `meta/main.yml` MAY reference pricing explicitly:

  ```yaml
  galaxy_info:
    pricing:
      schema: v2
      file: meta/pricing.yml
  ```

* [ ] Roles without pricing metadata default to:

  * one implicit offering
  * one implicit plan: `community`
  * price: `0`
  * no UI inputs

**Acceptance Criteria**

* [ ] Roles without pricing metadata behave exactly like today.
* [ ] Pricing metadata is optional and non-breaking.

---

## 1.2 Schema Core: Offerings → Plans (Tiers) → Pricing

* **Offering** — provider + deployment + optional version + optional region availability
* **Plan/Tier** — selectable tier (Starter/Business/Enterprise)
* **Pricing** — declarative pricing primitives (including new edge cases)

**Acceptance Criteria**

* [ ] A provider can define multiple offerings per role.
* [ ] Each offering can define multiple plans/tiers.
* [ ] A single version line can have multiple tiers.

---

## 1.3 Multi-Currency Pricing (No Conversion)

All numeric price points MUST support a currency map:

```yaml
prices:
  EUR: 169
  USD: 199
```

Rules:

* [ ] At least one currency required per price point.
* [ ] Currency keys MUST be ISO 4217.
* [ ] Backend never auto-converts currencies.

**Acceptance Criteria**

* [ ] Quote API can compute totals for any supported currency.
* [ ] Unsupported currency yields a clear validation error.

---

## 1.4 Regional Pricing (Market Segmentation, Not Currency)

Pricing MAY vary by **region/market** independent of currency (e.g., EU vs US pricing in EUR and USD both existing).

### 1.4.1 Region Keys

Regions use a fixed enum (expandable later):

* `global`
* `eu`
* `us`
* `uk`
* `apac`
* `latam`

### 1.4.2 Region-Aware Price Points

Every place where `prices` exists MAY alternatively be `regional_prices`:

```yaml
regional_prices:
  eu:
    EUR: 169
    USD: 185
  us:
    USD: 199
```

Rules:

* [ ] If `regional_prices` is present, quote requests MUST include `region`.
* [ ] If `regional_prices` missing, region defaults to `global`.
* [ ] No region fallback across markets unless explicitly defined (deterministic).

**Acceptance Criteria**

* [ ] Same offering/plan can return different totals for different regions.
* [ ] UI can select region and currency independently.

---

## 1.5 Supported Pricing Model Primitives (Expanded)

The schema MUST support at least:

* [ ] `fixed`
* [ ] `per_unit`
* [ ] `tiered_per_unit` (progressive tiers)
* [ ] `volume_per_unit` (**NEW**: single-rate bands applied to ALL units)
* [ ] `bundle` (base + included units + overage)
* [ ] `addon`
* [ ] `factor`
* [ ] `custom`

---

## 1.6 Setup Fee (Explicit)

Plans MAY define an additional one-time setup fee.

```yaml
setup_fee:
  interval: once
  prices:
    EUR: 499
    USD: 549
```

Rules:

* [ ] Setup fee is added to the quote only when `include_setup_fee=true` or when the UI indicates “first purchase”.
* [ ] Setup fee never repeats on renewals.

**Acceptance Criteria**

* [ ] Quote response includes setup_fee separately in breakdown.
* [ ] UI shows setup fee clearly as “one-time”.

---

## 1.7 Minimum Commit (Minimum Spend)

Plans MAY define a minimum monthly/yearly spend (total floor), per currency/region.

```yaml
minimum_commit:
  interval: month
  prices:
    EUR: 500
    USD: 600
```

Rules:

* [ ] After calculating total usage/base/addons/factors, enforce:

  * `total = max(total, minimum_commit)`
* [ ] Minimum commit applies per interval and currency/region exactly.

**Acceptance Criteria**

* [ ] Quote output indicates when a minimum commit was applied.
* [ ] Deterministic: same input always triggers same floor.

---

## 1.8 Volume Pricing (Explicit, Non-Progressive)

Add a new primitive for the common “band rate applied to all units” model.

### 1.8.1 `volume_per_unit`

Meaning:

* Determine the matching band by total units.
* Apply that band’s unit price to **all** units.

```yaml
pricing:
  type: volume_per_unit
  unit: user
  interval: month
  bands:
    - up_to: 50
      prices:
        EUR: 8
        USD: 9
    - up_to: 200
      prices:
        EUR: 6
        USD: 7
    - up_to: null
      prices:
        EUR: 4
        USD: 5
```

**Acceptance Criteria**

* [ ] Volume pricing is distinct from tiered/progressive pricing.
* [ ] Engine applies band price to all units deterministically.

---

## 1.9 Bundle Pricing (with Tiered or Volume Overage)

`bundle` remains base + included units + overage, but now overage may be:

* `per_unit`
* `tiered_per_unit`
* `volume_per_unit` (**NEW**)

```yaml
pricing:
  type: bundle
  interval: month
  base:
    prices:
      EUR: 169
      USD: 199
  included_units:
    user: 50
  overage:
    type: tiered_per_unit
    unit: user
    tiers:
      - up_to: 200
        prices:
          EUR: 3
          USD: 4
      - up_to: null
        prices:
          EUR: 2
          USD: 3
```

Tier semantics:

* [ ] Overage tiers apply to **overage units only**.

**Acceptance Criteria**

* [ ] Business plan can use tiered or volume overage.
* [ ] Same inputs always produce same totals.

---

## 2. Backend API (Index + Calculation + Quote)

### 2.1 Indexing

* [ ] Validate `schema: v2`.
* [ ] Normalize pricing blocks (including region + currency structures).
* [ ] Invalid pricing metadata is ignored with warnings.

**Acceptance Criteria**

* [ ] `/api/roles` includes `pricing_summary` including region/currency availability.
* [ ] `/api/roles/{id}` includes full pricing metadata.

---

### 2.2 Quote Endpoint

**POST** `/api/pricing/quote`

Request MUST include:

* `role_id`
* `offering_id`
* `plan_id`
* `inputs`
* `currency`
* optional: `region` (required when regional_prices exist)
* optional: `include_setup_fee` (boolean)

Response includes:

* `total`
* `currency`
* `region`
* `interval`
* `breakdown`:

  * base
  * usage
  * addons
  * factors
  * setup_fee
  * minimum_commit_applied (bool + delta)
* `notes`

**Acceptance Criteria**

* [ ] Unsupported currency/region yields validation error.
* [ ] Minimum commit enforcement is indicated in output.
* [ ] Setup fee is included only when requested/applicable.

---

## 3. Web UI (Offering + Plan + Region + Currency)

UI controls:

* [ ] Offering selector
* [ ] Plan selector
* [ ] Inputs
* [ ] Region selector (only if offering/plan supports regional pricing)
* [ ] Currency selector
* [ ] “Include setup fee” toggle (optional; shown only if setup_fee exists)
* [ ] Pricing preview panel (quote API)

**Acceptance Criteria**

* [ ] UI never calculates pricing client-side.
* [ ] Region/currency switching triggers new quote.
* [ ] Setup fee is visually labeled as one-time.
* [ ] Minimum commit is shown as “minimum spend applied”.

---

## 4. Testing (Required)

### Backend

* [ ] Unit tests:

  * fixed, per_unit
  * tiered_per_unit (progressive)
  * volume_per_unit (band-all-units)
  * bundle with tiered overage
  * bundle with volume overage
  * setup_fee inclusion toggle
  * minimum_commit floor application
  * regional_prices selection
  * invalid currency/region

### Frontend (Playwright)

* [ ] Region selector appears only when required
* [ ] Currency selector changes totals
* [ ] Setup fee toggle changes quote + breakdown
* [ ] Minimum commit scenario displays applied floor
* [ ] Volume pricing threshold changes total correctly

**Acceptance Criteria**

* [ ] Tests pass headless in CI.
* [ ] No real secrets used.

---

## Status

* 🟨 Planned
