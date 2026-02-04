# Ingredients Management – Implementation Plan & Feasibility Assessment

## 1) Scope / Goal

Implement an **Ingredients Management** solution to maintain a **master list of ingredients** (and attributes) used by **Recipe Management** and **Meal Production**, following `docs/requirements/ingredients_mgmt_design.md`.

Key constraints from requirements:
- **Effective date = “today” only** (no past dates; no retroactive impact on historical data).
- **Traceability / auditability** over time.
- **Draft / Active / Disabled** status model with **strictly allowed actions** per status.
- **Versioning behavior** for edits to Active ingredients (disable old version + create a new version effective today).

The requirements reference **go-live = 05-Feb-2026** (note: relative to today, **2026-02-04**, this is **tomorrow**).

## 2) Feasibility Summary

This feature is **feasible** on the current Community Kitchen platform, but **not achievable by configuration alone**.

**What can be done mostly via configuration (high confidence):**
- Ingredients form fields (name/category/supplier/allergen/unit/dietary, etc.), list view columns, list legend.
- Status-aware list view columns that open **Summary (👁️)** / **Form (✏️)** / **Copy (⧉)**.
- Filtering of ingredient options in other forms by status (e.g., only `Active`) using `dataSource.statusAllowList`.

**What requires code changes (high confidence):**
- **Exact-match-only** search by ingredient name on Home (list) page.
- **Autosave gating** rules (“autosave disabled until Created by + valid non-duplicate Ingredient Name”).
- **Permanent deletion** of Draft ingredients (physical row delete + index maintenance).
- **Activate** workflow (Draft → Active with effective dates, confirmations, and eligibility checks).
- **Active edit versioning** workflow (disable old ingredient + create new ingredient ID, effective today).
- **Impact analysis** on recipes (find recipes that use a given ingredient ID) and **auto-disable impacted recipes**.
- “View & download into Google sheet” for the predefined lists (category/supplier/allergen/dietary/unused).
- **Storing Ingredient ID in other apps while displaying the Ingredient Name** (label/value separation for options).

**Major red-flag / schedule risk:**
- The requirement “Recipes and Meal Production reference Ingredient ID” implies a **data model change** for existing forms and (likely) existing data. If you have existing recipe/meal production records storing ingredient **names**, moving to **IDs** safely without retroactive impact requires a careful strategy (see §5 “Open Questions” + §7 “Integration/Migration”).

## 3) Mapping Requirements → Existing Capabilities (Config vs Code)

| Requirement area | Config-only? | Notes |
|---|---:|---|
| Statuses (Draft/Active/Disabled) and allowed actions | Partial | Status values can live in the standard Status column, and action visibility can be driven by `actionBars.system.gates` + list view computed columns; however **Delete** and **Activate** aren’t existing system actions. |
| Home page search: exact match on name only (case-insensitive, trim) | No | Current list view search is a **contains** match across searchable columns. Needs a new “exact” search mode (or per-form override). |
| View screen (👁️) with bottom action buttons | Partial | Can map “View” to Summary view, but the **exact icon set / bottom-bar actions** (👁️/✏️/⧉/🗑️/Activate) cannot be expressed purely with existing system actions. |
| Create / Copy: autosave disabled until Created by + valid, non-duplicate name | No | Autosave is currently a form-level boolean; there is no config-driven “autosave enable criteria”. |
| Duplicate check with specific dialog branches (Cancel / Change name, etc.) | Partial | Dedup exists, and `changeDialog` can confirm/revert changes; but the exact branching behavior (including navigation side effects) needs custom logic. |
| Delete Draft ingredient permanently | No | No record-level delete action exists today. Requires server + UI changes and index maintenance. |
| Activate Draft ingredient (set effective dates, status, confirm) | No | Requires a new action that writes multiple fields based on **today** and performs validations. |
| Edit Draft = “continue creation” | Partial | Can be represented as editing the same record, but must respect the create gating rules and duplicate checks. |
| Edit Active = versioning (disable old + create new ingredient ID) | No | Requires custom save semantics (two record writes, new ID, effective dates) and UX confirmations. |
| Impact analysis: find recipes using ingredient ID | No | Cross-form queries + presenting impacted recipe list requires custom backend + UI. |
| Auto-disable impacted recipes | No | Cross-form bulk update is not supported via config today. |
| Predefined filtered lists + “download into Google sheet” | No | Filtering can be done in list view; generating a downloadable Google Sheet requires new server functionality. |

## 4) Key Concerns / Red Flags

1) **Ingredient ID vs displayed name (and history)**
- Requirements state: “Recipes and Meal Production reference ‘Ingredient ID’” and “Ingredient ID … not visible to end users.”
- Today, many CHOICE options in the system store the displayed option value (commonly an EN string). Supporting **hidden IDs** while showing localized labels requires enhancing the option model to support **value ≠ label** (or a ref/dataSource option “valueColumn” concept).
- Without this, either:
  - other forms will store **ingredient names** (violates requirement), or
  - users will see IDs in dropdowns (also violates requirement).

2) **“No retroactive impact” requires deliberate denormalization strategy**
- If Meal Production / Recipe outputs look up ingredient attributes “live” by ingredient ID, then changing an ingredient would change historical reporting unless the record stores a **snapshot** of the needed attributes.
- The requirements rely on **versioning** (new ingredient ID) to keep historical data stable, but only if downstream records reference the correct version ID and templates don’t “join” to the latest version.

3) **Definition of “today” / timezone**
- Client-side “today” is user-local; server-side “today” is spreadsheet/script timezone. The feature needs a single authoritative definition to avoid off-by-one behavior around midnight and cross-timezone usage.

4) **Go-live date hardcoded in requirements (05-Feb-2026)**
- The view text references go-live explicitly. It should be treated as **configurable** (or derived from initial import), not hard-coded in code.

5) **Record deletion + indexing**
- The platform maintains indexes (`__CK_INDEX__...`) for fast lookup/dedup. Physical deletion must update:
  - destination sheet row,
  - index sheet(s),
  - cached etags / data versions.

## 5) Open Questions / Clarifications Needed (Stop Points)

These answers affect data model and implementation effort materially:

1) **Ingredient ID scope**
- Is the Ingredient ID the system record `id` (UUID), or a human-readable code, or an integer sequence?

2) **Migration expectation**
- At go-live, do we:
  - (A) migrate existing Recipes / Meal Production records to store Ingredient IDs, or
  - (B) store Ingredient IDs only for new records going forward, or
  - (C) support both (dual-read), keeping historical name-based records unchanged?

3) **What counts as “used before” for impact analysis?**
- The edit flow mentions “Recipe management or Meal production”, but later specifies searching in Recipe Management only. Should the system also search Meal Production history for ingredient usage?

4) **Recipe disable semantics**
- What is the exact status model on Recipes (values, fields, and where stored)? The plan assumes a `status` column with values including `Active`/`Disabled`.

5) **Ingredient Name formatting**
- “Auto-transform if all caps was used” → transform to what (Title Case? Sentence case?) and how to handle acronyms?
- “No special characters except dash” → are spaces allowed (implied yes), what about apostrophes, accents, parentheses?

6) **Exported Google Sheets behavior**
- Where is the generated sheet stored (folder), naming convention, who has access, and should it be overwritten or generated per request?

## 6) Proposed Technical Design (High Level)

### Data model (Ingredients)
Create a destination tab for ingredient records (e.g., `Ingredients Data`) with fields matching the requirements:
- `Ingredient Name`
- `Category`
- `Supplier` (multi)
- `Allergen` (multi, with `None` exclusive)
- `Allowed unit` (multi)
- `Dietary applicability` (multi)
- `Effective start date` (set on Activate)
- `Effective end date` (31-Dec-9999 for Active; today when Disabled)
- `Status` (Draft/Active/Disabled)
- `Created by`
- `Last changed on`
- `Last changed by`

Use the platform’s existing record `id` as the hidden **Ingredient ID** (one per version).

### Status + effective dating rules
- Draft:
  - Status = `Draft`
  - Effective start/end dates empty (or end date empty; must not appear as “active”)
- Activate:
  - Status becomes `Active` effective **today**
  - Effective start date = today
  - Effective end date = `31-Dec-9999`
- Disable:
  - Status becomes `Disabled` effective **today**
  - Effective end date = today

### Edit Active = versioning
On editing an Active ingredient (excluding “effective end date” disable flow):
- Create a **new ingredient record** (new ID) with updated attributes and `Status=Active`, effective start = today, end = 31-Dec-9999.
- Update the **old ingredient record**: effective end = today, `Status=Disabled`, last changed fields.
- If “used before” (per clarified definition), compute impacted recipes and disable them effective today.

### Downstream integration
Ingredients must be selectable in Recipe Management / Meal Production by **Ingredient ID** while displaying ingredient name:
- Provide a data source (options mode) over `Ingredients Data` with `statusAllowList=["Active"]`.
- Enhance the option system to support **value = ingredient id** + **label = ingredient name** (and localization), without exposing the ID to end users.

## 7) Implementation Plan (Development Activities)

### Phase 0 — Requirements closure (1–2 days)
- Resolve §5 “Open Questions” (ID, migration approach, “used before” scope, recipe status model, export behavior).
- Confirm go-live date behavior and timezone definition of “today”.

### Phase 1 — Ingredients form configuration (mostly config)
- Add new form config (target per requirements tip): `docs/config/staging/config_ingredients_management.json`.
- Define the Ingredients fields + validation rules (required fields, allergen None exclusivity, name constraints).
- Configure list view:
  - Columns: Ingredient Name (alpha sort), Status, plus computed icon columns for View/Edit/Copy.
  - Legend explaining statuses and icons.
- Configure Summary (View) experience:
  - Ensure the Summary view renders as the dedicated View screen (or provide a custom summary HTML template if required for the exact layout).

### Phase 2 — Core platform enhancements (code)
Deliver the missing primitives needed by the requirements:
- **List view exact search** mode: case-insensitive, trimmed, exact match on a single configured field.
- **Autosave gating**: per-form rules for when autosave is enabled (Created by + valid non-duplicate Ingredient Name).
- **Record delete (Draft-only)**: server endpoint + UI trigger + index/etag maintenance.
- **Activate action**: server endpoint + UI trigger + confirmation + writes of status + effective dates + audit fields.
- **Active edit versioning**: server-side save hook/endpoint that performs “disable old + create new” and returns the new record id.
- **Impact analysis UI + backend**:
  - query recipes that reference the ingredient ID,
  - show the list in the confirmation dialog.
- **Disable impacted recipes**: bulk status update for the affected recipe records.
- **Export-to-Google-Sheet** actions for the predefined lists (category/supplier/allergen/dietary/unused).
- **Option label/value separation** so downstream forms can store Ingredient ID while showing Ingredient Name (localized).

### Phase 3 — Integrations + migration
- Update Recipe Management config to select ingredients by Ingredient ID (not name), and store any required snapshots to avoid retroactive impact.
- Update Meal Production config similarly (including selection effects that currently use `REF:IngredientsOptions`).
- Implement the chosen migration strategy (from §5.2):
  - dry-run scripts for converting stored ingredient references,
  - dual-read compatibility if historical data must remain name-based.

### Phase 4 — Testing, rollout, and verification
- Unit tests:
  - exact search matching,
  - autosave gating transitions,
  - delete/activate/versioning flows.
- Integration tests (or scripted smoke tests) for:
  - impact analysis results,
  - recipe disabling behavior,
  - option label/value behavior across languages.
- Rollout checklist:
  - seed initial ingredients with `Created by = System Administrator` and `effective start = go-live`,
  - verify status allow-lists in downstream data sources,
  - verify that historical Meal Production outputs remain unchanged.

## 8) Requirements Not Met by Configuration Alone (Explicit List)

The following requirements require code changes (not just JSON config):
- Exact-match ingredient search by name only (case-insensitive, trim).
- Autosave disabled until Created by + valid non-duplicate name, then enabled.
- Permanent deletion of Draft ingredients (and only Draft; with index maintenance).
- Activate action with effective date writes and confirmations.
- Active ingredient edit versioning (disable old + create new ingredient ID).
- Impact analysis against Recipe Management and automatic disabling of impacted recipes.
- Generating downloadable Google Sheets for predefined filtered lists, including “unused ingredients”.
- Storing Ingredient ID (hidden) in other forms while displaying Ingredient Name (label/value option separation).

