# Data identifiers & data sources redesign (decouple stable IDs from labels)

## Status (implemented)

As of this rollout we implemented:

- **Option 1b**: destination “Responses” sheet headers use **`Label [ID]`** and column resolution prefers IDs.
- **DS-A**: sheet-backed data sources understand **bracketed header keys** (`Label [KEY]`).
- **Phase 3 (Option A)**: line-item `subGroups[]` **must** define `id` (label-based subgroup keys are not supported).
- **Template migration**: added an endpoint to migrate legacy label-slug placeholders to ID placeholders:
  - `migrateFormTemplatesToIdPlaceholders(formKey)`
- **Canonical schema helpers**: centralized header parsing/formatting in `src/services/webform/recordSchema.ts`.

## Context / problem

Historically we **used human-facing labels as identifiers** in a few critical places, which made the system brittle when labels were duplicated or renamed.

Key historical problem areas (now addressed):

- **Saved “Responses” sheet header keys** used label headers by default.
  - Now implemented as `Label [ID]` via `src/services/webform/recordSchema.ts` + `src/services/webform/submissions.ts` / `src/services/FormGenerator.ts`.
- **Sheet-backed data sources** used header text identity only.
  - Now implemented as DS‑A in `src/services/webform/dataSources.ts` by indexing both raw header text and bracket keys.
- **LINE_ITEM_GROUP subGroups** could fall back to label keys.
  - Now blocked: subgroup IDs are required; label fallback removed in `src/services/webform/submissions.ts` and `src/services/webform/followup/utils.ts` and enforced in `src/config/ConfigValidator.ts`.
- **Doc template placeholders** supported label-slug aliases (collision-prone).
  - Still supported for backward compatibility, but we provide a migration endpoint (see above) and docs now recommend ID placeholders only.
Additionally, configuration validation previously enforced unique EN/FR/NL labels. This is now removed: **duplicate labels are allowed**, while **duplicate IDs are rejected**.

## Goal

Make the system robust when:

- display labels are not unique (by design),
- display labels are renamed over time,
- we reuse the “Responses” sheet as a source for lookups/prefills,
- external data sources have non-unique or user-edited headers.

In short: **IDs should be stable keys; labels should be presentation only**.

## Non-goals (for the first rollout)

- Not changing the core config sheet structure (it already has an `ID` column).
- Not removing support for existing label-based Google Doc placeholders (we can deprecate later).
- Not redesigning every downstream spreadsheet workflow in one go (we’ll provide migration paths).

## Current-state assessment: do we support unique field IDs everywhere?

### What is already ID-based (good)

- **Form submission payload and record values** are keyed by `QuestionConfig.id` (and line-item `field.id` inside arrays).
- **Web UI** uses `question.id` (and `groupId__fieldId` for line items) as the form control names/keys.
- **Rules/visibility/validation/derived values/selection effects** reference `fieldId` / `groupId` / `field.id` (not display labels).
- **Doc templates** already support ID-based placeholders (e.g., `{{FIELD_ID}}`, `{{GROUP.FIELD_ID}}`).

### Where we still rely on labels as identifiers (remaining risk)

1. **Doc placeholder label-slug aliases** are still supported for backward compatibility and can collide when labels repeat.
   - Mitigation: migrate templates to IDs with `migrateFormTemplatesToIdPlaceholders(formKey)` and document IDs as the only supported convention moving forward.

## Design options

### Option 0 — Keep status quo, enforce unique labels everywhere (baseline)

Keep using `q.qEn` (and localized labels) as identifiers for sheets and keep `ConfigValidator` enforcing uniqueness.

- Pros:
  - Lowest implementation effort.
  - No migrations.
- Cons:
  - Directly conflicts with the product goal (labels should not need to be unique).
  - Fragile: label renames create new columns and/or break lookups.
  - Hard to scale: repeated concepts (Quantity, Name, Notes) are common.

### Option 1 — Responses sheet headers become **Field IDs** (ID-only)

Change saved “Responses” sheet so the header row uses `QuestionConfig.id` for each field column.

- Pros:
  - Very robust and simple.
  - No collisions when labels repeat.
  - Label renames are harmless.
- Cons:
  - Less human-readable spreadsheets.
  - Existing manual workflows that expect labels as headers must adapt.

### Option 1b (recommended) — Responses sheet headers become **Label [FIELD_ID]** (single row)

Store **both** in the same header cell, but make the ID the canonical key.

Example header cell:

`Quantity [QTY]`

Rules:

- the bracketed token (`[QTY]`) is the **column key**,
- the prefix (`Quantity`) is presentation only.

- Pros:
  - Human-readable + stable.
  - Allows duplicate labels (IDs disambiguate).
  - Does not shift data rows (still header row 1, data starts row 2).
  - Can be used consistently across destination sheets and data source sheets.
- Cons:
  - Requires new header parsing logic.
  - Users could edit headers and remove the bracket key (we can detect + warn).

### Option 2 — Two header rows (Row 1 labels, Row 2 IDs; data starts at Row 3)

Keep labels in the visible header row for humans, and store IDs in a hidden header row underneath.

- Pros:
  - Clean separation of concerns (labels vs IDs).
  - Best human UX for spreadsheets.
- Cons:
  - Invasive: all code assumes data starts at row 2 today (`appendRow`, `getRange(2, ...)`).
  - Requires migrating every reader/writer/query and any formulas.

### Option 3 — Store records as JSON blob + generated views

Store one JSON record column keyed by field IDs, plus optional “view sheets” for human readability.

- Pros:
  - Extremely flexible for schema evolution.
  - No column-per-field scaling issues.
- Cons:
  - Harder to do ad-hoc spreadsheet analysis/filtering.
  - Requires new tooling for list sorting, formulas, and exports.

## Data source options (sheet-backed)

Today `DataSourceConfig.projection` and `mapping` keys assume **header text identity**.

We can improve this independently of the Responses sheet:

### DS-A (recommended first) — Support bracketed header keys (`Label [KEY]`) in data source tables

Teach the data source reader to parse header keys:

- If a header cell contains `[...]`, treat the bracket token as the canonical column key.
- Add those keys into the header index map in addition to the raw header string.

Backwards compatible:

- Existing tables without bracket keys keep working (header-text matching still works).

### DS-B — Add explicit column references (index/letter) to `DataSourceConfig`

Extend config so you can reference columns without headers:

- by index (1-based),
- by letter (`"A"`),
- or by header key.

This could reuse the existing `SheetColumnRef` style used in other features, but would require a new `DataSourceConfig` shape or explicit prefixes to avoid ambiguity.

### DS-C — “Data source schema registry”

Define a schema for each data source (column keys, types, required columns) and validate at runtime.

- Useful for enterprise-scale configurations.
- Highest effort.

## Recommended approach

**Start with Option 1b + DS-A**:

- Use **field IDs as stable column keys** everywhere we control.
- Keep spreadsheets readable by embedding IDs into headers as `Label [FIELD_ID]`.
- Parse `[FIELD_ID]` consistently for:
  - destination responses sheets,
  - data source sheets.

In parallel:

- Require or generate stable IDs for nested line-item subGroups.
- Relax config validation that requires unique labels.

## Implementation plan (phased)

### Phase 1 — Introduce column key parsing + migrate destination headers (Option 1b)

**Code changes (core):**

1. Add a small utility to parse header keys:
   - `parseHeaderKey("Quantity [QTY]") -> { key: "QTY", label: "Quantity" }`
   - Support whitespace and case insensitivity.
2. Update destination sheet header generation:
   - When writing headers, generate `"<q.qEn> [<q.id>]"` (or fall back to `<q.id> [<q.id>]` if label missing).
3. Update column resolution (`findHeader` / header indexing):
   - Prefer exact ID matches (raw header equals ID or parsed bracket key equals ID).
   - Fall back to label match only for legacy sheets.
4. Add migration behavior in `ensureDestination()`:
   - When a legacy label-based column is uniquely associated with a field, rename the header cell in-place to include `[FIELD_ID]` (no data move).
   - If ambiguous (duplicate labels), emit a clear diagnostic and **do not** guess. Provide manual steps.

**Backward compatibility:**

- Existing sheets without bracket keys still map via label fallback.
- New columns created will include bracket keys, enabling future stability.

**Testing:**

- Unit tests around header parsing and mapping, including duplicates and rename scenarios.

### Phase 2 — Data sources: add DS-A bracket-key support

1. Update `DataSourceService.buildHeaderIndex()` so that each header contributes:
   - the raw header string key, and
   - the parsed bracket key (if present).
2. Document recommended data source table header convention:
   - `"Supplier [SUPPLIER_ID]"`, `"Email [EMAIL]"`, etc.
3. Ensure `projection` and `mapping` can use either raw headers or bracket keys.

### Phase 3 — Line item subGroups: make subgroup keys stable

1. Update schema/docs to recommend `LineItemGroupConfig.id` for any `subGroups` entry.
2. Decide on the behavior when `id` is omitted:
   - **Option A:** Treat it as an error (safe but potentially breaking).
   - **Option B:** Auto-generate a stable key at runtime (e.g., `SUBGROUP_1`, derived from config position), and use that key consistently in storage and templates.
3. Add diagnostics so we can identify existing configs relying on label-based subgroup keys.

### Phase 4 — Relax label uniqueness constraints

1. Update `ConfigValidator` to stop treating duplicate EN/FR/NL labels as a hard error once Phase 1 is enabled.
2. Replace with warnings where appropriate:
   - duplicate labels are allowed,
   - duplicate IDs remain forbidden,
   - duplicate bracket keys in destination sheets remain forbidden.

### Phase 5 — Template placeholder guidance + optional linting

1. Update docs to recommend ID-based placeholders as the default:
   - `{{FIELD_ID}}`, `{{GROUP.FIELD_ID}}`, `{{GROUP.SUBGROUP_ID.FIELD_ID}}`.
2. Keep label-slug aliases for backward compatibility, but add an optional validator that flags collisions.

## Migration / rollout strategy

- Destination headers are migrated in-place opportunistically (when safe) by `SubmissionService.ensureDestination()`:
  - legacy `ID` headers are rewritten to `Label [ID]`,
  - legacy label-only headers are rewritten to `Label [ID]` only when unambiguous.
- Doc templates can be migrated in-place with `migrateFormTemplatesToIdPlaceholders(formKey)`.

## Risks & mitigations

- **Ambiguous legacy columns** (duplicate labels already exist):
  - Mitigation: refuse to auto-migrate; require manual mapping.
- **Users editing headers** and breaking the bracket token:
  - Mitigation: detect missing bracket keys and log a visible warning; optionally re-write headers automatically.
- **External data sources with poor hygiene** (duplicate headers):
  - Mitigation: DS-A bracket keys; DS-B explicit column refs if needed.

## Open questions

- (Resolved) Header convention: **`Label [ID]`**
- (Resolved) Template migration: **implemented**
- (Resolved) Canonical record schema helpers: **implemented** (`src/services/webform/recordSchema.ts`)


