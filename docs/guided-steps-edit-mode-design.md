# Guided Steps Edit Mode (Reusable UI Mode) — Design & Implementation Plan

## Context
We want a fully reusable “guided steps” UI mode for the **Edit (form) view** that can be enabled **per form** via configuration, while keeping the existing edit mode intact.

This guided mode supports:
- A **multi-step guide** (stepper) at the top of the edit experience
- **Step-scoped progressive disclosure** (only show the fields relevant to the current step)
- Configurable navigation:
  - moving forward can be free or gated
  - can **auto-advance** when the required information is set (reduce clicks)
  - users can go back and correct earlier data
- **Virtual step fields** that integrate with existing `visibility` rules so buttons (and fields) can be shown only after certain steps are completed/valid.

Key agreed defaults:
- **Step state is virtual/computed** (not persisted by default). On load (after autosave restore / record fetch), guided state is recomputed and the appropriate step is shown.
- Default forward navigation gate is **`whenValid`** (avoid users advancing with broken rules).

---

## Goals
- **Reusable**: the stepper and step engine are generic, configurable, and can be enabled for any form.
- **Detached from groups**: steps define what is rendered; groups remain optional for layout only.
- **Configurable step progression**: per-step control of forward/back gating + auto-advance.
- **Visibility integration**: step state is visible to existing `visibility.showWhen/hideWhen` logic (especially for BUTTONs).
- **Works with autosave**: returning to a record recomputes step state and restores the correct step.
- **Diagnostics**: emit `onDiagnostic` events for guided flow to surface clearly in DevTools console.

## Non-goals (for initial implementation)
- List view ordering changes / service ordering nuances
- Procedure button/OneDrive link details
- Summary/Final report template changes (beyond enabling step-state gating via visibility)

---

## Current architecture touchpoints (existing code)
- Edit view rendering: `src/web/react/components/FormView.tsx`
- Line item rendering: `src/web/react/components/form/LineItemGroupQuestion.tsx`
- Visibility logic: `src/web/rules/visibility.ts` (`shouldHideField`)
- Validation rules eval: `src/web/rules/validation.ts` (`validateRules`, `evaluateRules`)
- Custom button collection + visibility filtering:
  - `src/web/react/App.tsx` builds `customButtons` and uses `shouldHideField` with a `getValue` resolver
- Dashboard config parse pipeline:
  - dashboard JSON parsing: `src/config/Dashboard.ts`
  - web definition build: `src/services/webform/definitionBuilder.ts`
- JSON schema for config: `config_schema.yaml`

---

## Proposed configuration model
Add a new dashboard-level object called **`steps`** (sibling to `listView`, `actionBars`, `groupBehavior`, etc).

### 1) Top-level `steps` config
```json
{
  "steps": {
    "mode": "guided",
    "stateFields": { "prefix": "__ckStep" },
    "defaultForwardGate": "whenValid",
    "defaultAutoAdvance": "onValid",
    "header": {
      "include": [
        { "kind": "question", "id": "CUSTOMER" },
        { "kind": "question", "id": "SERVICE" },
        { "kind": "question", "id": "PRODUCTION_DATE" }
      ]
    },
    "items": [
      {
        "id": "order",
        "label": { "en": "Order form" },
        "helpText": { "en": "Enter requested portions." },
        "render": {
          "lineGroups": { "mode": "inline" },
          "subGroups": { "mode": "overlay" }
        },
        "include": [
          {
            "kind": "lineGroup",
            "id": "MEAL_TYPES",
            "presentation": "liftedRowFields",
            "fields": ["DIETARY_TYPE", "REQUESTED_PORTIONS"]
          }
        ],
        "navigation": {
          "forwardGate": "whenValid",
          "autoAdvance": "onValid",
          "allowBack": true
        }
      }
    ]
  }
}
```

### 2) Step “include” targets
Each step declares what it renders via `include[]` targets, and can mix **top-level questions** and **line item groups** in the same step. Targets are **detached from groups** (the author does not need to restructure the underlying definition to match steps).

Proposed target types:
- `question`: top-level question id (any `WebQuestionDefinition` except header groups)
- `lineGroup`: a `LINE_ITEM_GROUP` question id with:
  - `presentation`: how row fields are shown inside the step:
    - `groupEditor`: render using the current line-item group editor UI (table/progressive), but scoped to this step
    - `liftedRowFields`: render the selected row fields as “top-level” step content (repeat per row), even though they are nested in the record model
  - `fields`: allowlist of row field ids visible for this step
  - optional `rows` filter rules (see below)
  - optional `subGroups`: subgroup rendering rules (see below)

### 3) Line item groups + subgroups in steps (hierarchy-aware rendering)
Steps must render nested structures **as a hierarchy**, not as a flat list.

For a `lineGroup` include target, the step view builds a render tree like:
- **Line group** (`LINE_ITEM_GROUP` question)
  - **Rows** (filtered per `rows.includeWhen/excludeWhen`)
    - **Row fields** (allowlisted by `fields`)
    - **Subgroups** (nested line item groups created by `selectionEffects`, keyed by `parentGroupId::rowId::subGroupId`)
      - **Subgroup rows**
        - **Subgroup row fields**

This is what enables flows like Meal Production:
- Step 1: select customer + service → `selectionEffects` auto-create parent rows
- Step 2: edit only some parent-row fields (e.g., meal type + quantity) directly in the step
- Step 3: filter rows (`quantity > 0`), then selecting recipe triggers `addLineItemsFromDataSource` to populate subgroup rows, which then appear inline or open via overlay

#### Display mode: inline vs overlay (line groups and subgroups)
The app already supports:
- **Line item group full-page overlay** via `lineItemConfig.ui.openInOverlay` (main form shows a compact “Open” card / pill).
- **Subgroup full-page overlay** via subgroup “open” pills that call `openSubgroupOverlay(subKey)`.

Guided steps need a **step-level rendering choice** that can override the underlying group defaults:
- Step-level defaults:
  - `step.render.lineGroups.mode`: `inline | overlay`
  - `step.render.subGroups.mode`: `inline | overlay`
- Per-target overrides (optional, for advanced cases):
  - `lineGroup.displayMode`: `inline | overlay | inherit`
  - `lineGroup.subGroups.displayMode`: `inline | overlay | inherit`

Semantics:
- `inline`: render the editor directly in the step (no extra click)
- `overlay`: render a compact open-card/pill; tap opens the full-page overlay editor
- `inherit`: follow the group’s own config (`lineItemConfig.ui.openInOverlay` for groups; subgroup behavior defaults to current UI patterns)

#### Subgroup scoping and allowlists
`lineGroup.subGroups` is optional; when present it defines what subgroups are visible in this step and how:
```json
{
  "subGroups": {
    "displayMode": "inline",
    "include": [
      {
        "id": "MP_INGREDIENTS",
        "fields": ["INGREDIENT", "QUANTITY", "UNIT"],
        "rows": { "excludeWhen": { "fieldId": "QUANTITY", "equals": 0 } }
      }
    ]
  }
}
```

Important: for stable addressing, subgroups should have an explicit `id` in config (do not rely on labels).

### 4) Row filtering (line items)
Needed for common patterns like “ignore requested=0 rows”.

Proposed row filter config:
```json
{
  "rows": {
    "includeWhen": { "fieldId": "REQUESTED_PORTIONS", "greaterThan": 0 },
    "excludeWhen": { "fieldId": "REQUESTED_PORTIONS", "equals": 0 }
  }
}
```

Semantics:
- `includeWhen` and `excludeWhen` are evaluated using the existing visibility-condition matcher semantics on row values.
- If both are present: row is included iff it matches includeWhen AND does NOT match excludeWhen.
- Filtering affects **rendering + step validity/completion scope**, not the underlying stored rows (so users can go back and re-edit previous steps without losing data).

---

## Virtual “step fields” (visibility + derived state)
We expose step state as computed fields accessible via the existing `VisibilityContext.getValue(fieldId)` mechanism.

### Virtual field ids
All are returned as scalar strings/numbers so they work with existing `VisibilityCondition` (equals/notEmpty/greaterThan/lessThan):
- `__ckStep`: current step id (string)
- `__ckStepIndex`: current step index (number)
- `__ckStepMaxValidIndex`: max index that is valid (number)
- `__ckStepMaxCompleteIndex`: max index that is complete (number)
- `__ckStepComplete_<stepId>`: `"true"` or `"false"`
- `__ckStepValid_<stepId>`: `"true"` or `"false"`

Prefix is configurable via `steps.stateFields.prefix` (default: `__ckStep`).

### Why virtual (vs persisted) — agreed approach
- No extra hidden fields required in sheets
- Always consistent with the current record values
- Works with autosave: on load we recompute and resolve the correct step

### Where they are used
1) Field-level visibility in the form (existing `shouldHideField`)
2) Custom BUTTON visibility in `App.tsx` (already uses `shouldHideField`)
3) (later) HTML templates can optionally be extended to accept step fields (if needed)

---

## Navigation and auto-advance behavior

### Gates
Each step supports:
- `forwardGate: "free" | "whenComplete" | "whenValid"`
- `autoAdvance: "off" | "onComplete" | "onValid"`
- `allowBack: boolean` (default true)

Defaults (agreed):
- `defaultForwardGate = "whenValid"`
- `defaultAutoAdvance = "onValid"`

### Definitions
- **Complete**: all step-visible required fields are filled (per field required + visibility + row filters).
- **Valid**: `validateRules(...)` has **no error-level issues** for fields in the step scope.

Notes:
- Rules system supports `phase` and `level`. For step gating, we treat `phase="submit"` (or "both") + `level="error"` as blocking.
- Warning-level rules should not block step progression unless explicitly required later (future extension).

### Auto-advance safety
Auto-advance should be deferred when:
- the user is currently editing an input inside the step (focused element is within the step container)
- there is rapid churn (debounce ~250–400ms)

This mirrors the existing “defer collapse while typing” behavior in `FormView`.

### Back navigation
Users can always go back when `allowBack=true`.
When a user goes back and edits values:
- step validity/completion is recomputed continuously
- the stepper UI reflects status changes (e.g., a later step may turn invalid again)
- forward navigation remains gated by configured gates (default `whenValid`)

---

## Rendering model (detached from group cards)
Guided mode is implemented as a separate view component, e.g. `GuidedFormView`, which:
- Renders the header fields (`steps.header.include`) consistently across steps
- Renders only the field targets for the active step
- Renders a stepper UI at the top (preferably via the existing ActionBar `notice` slot)

Importantly:
- We do **not** require each step to map to group cards.
- Existing grouping/pairing config remains usable inside a step (layout), but the set of rendered fields is controlled by steps.

### Approach for line item groups
Guided steps must support **both**:
- Rendering line item groups “as-is” (inline table/progressive), and
- Rendering selected nested row fields “lifted” into the step as top-level content.

To stay consistent with the current app, guided mode reuses the existing overlay + editor primitives:
- For **group overlay** behavior, reuse the `ui.openInOverlay` pattern from `FormView` (compact open-card → full-page overlay).
- For **subgroup overlay** behavior, reuse the existing `openSubgroupOverlay(subKey)` path (pill → full-page overlay).

Implementation direction:
- Add a small adapter layer in guided view that can:
  - **Filter** which row fields/subgroups are visible for this step (allowlists + row filters)
  - **Choose** inline vs overlay per step (with optional per-target override)
  - **Switch presentation** between `groupEditor` vs `liftedRowFields`

This keeps steps reusable and lets Meal Production implement the “Step 2 shows only meal_type + quantity” requirement without changing how the record is stored.

---

## Meal Production example (line items + subgroups)
This example matches the intended flow:
- Step 1: choose customer/date/service (selectionEffects auto-create parent rows)
- Step 2: edit only meal type + quantity for each parent row (shown directly in the step)
- Step 3: show only rows with quantity > 0; pick recipe; ingredients subgroup auto-appears and is rendered inline (or overlay)

```json
{
  "steps": {
    "mode": "guided",
    "defaultForwardGate": "whenValid",
    "defaultAutoAdvance": "onValid",
    "items": [
      {
        "id": "context",
        "label": { "en": "Order info" },
        "include": [
          { "kind": "question", "id": "MP_CUSTOMER" },
          { "kind": "question", "id": "MP_PRODUCTION_DATE" },
          { "kind": "question", "id": "MP_SERVICE" }
        ]
      },
      {
        "id": "order",
        "label": { "en": "Order form" },
        "render": { "lineGroups": { "mode": "inline" } },
        "include": [
          {
            "kind": "lineGroup",
            "id": "MP_MEALS_REQUEST",
            "presentation": "liftedRowFields",
            "fields": ["MEAL_TYPE", "QUANTITY"]
          }
        ]
      },
      {
        "id": "recipes",
        "label": { "en": "Production / Recipes" },
        "render": { "subGroups": { "mode": "inline" } },
        "include": [
          {
            "kind": "lineGroup",
            "id": "MP_MEALS_REQUEST",
            "presentation": "liftedRowFields",
            "rows": { "includeWhen": { "fieldId": "QUANTITY", "greaterThan": 0 } },
            "fields": ["MEAL_TYPE", "QUANTITY", "RECIPE"],
            "subGroups": {
              "displayMode": "inline",
              "include": [
                {
                  "id": "MP_INGREDIENTS",
                  "fields": ["INGREDIENT", "UNIT", "AMOUNT"]
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

---

## Diagnostics (required)
Emit both high-level and step-specific logs via the existing `onDiagnostic` handlers.

Events (suggested):
- `steps.enabled`: `{ mode, stepCount }`
- `steps.step.change`: `{ from, to, reason: "user" | "auto" | "load" }`
- `steps.step.autoAdvance`: `{ from, to, gate: "whenValid" | ... }`
- `steps.step.blocked`: `{ from, to, gate, errorsCount, missingCount }`
- `steps.virtualField.resolve`: (debug-only) `{ fieldId }`

Additionally, keep existing autosave logs unchanged.

---

## Implementation plan (concrete file-by-file)

### Phase 0 — Design-only (this doc)
Completed.

### Phase 1 — Schema + types + plumbing (no UI yet)
1) **Types**
   - Update `src/types/index.ts`:
     - add `StepsConfig`, `StepConfig`, `StepTargetConfig`, `StepNavigationConfig`, `StepRowFilterConfig`
     - add optional `steps?: StepsConfig` to `WebFormDefinition`
     - add optional `steps?: StepsConfig` to `FormConfig` (dashboard-parsed)

2) **Dashboard config schema**
   - Update `config_schema.yaml`:
     - add `DashboardConfig.properties.steps`
     - add schemas for the new structures with examples

3) **Dashboard parsing**
   - Update `src/config/Dashboard.ts`:
     - parse `steps` from the dashboard JSON
     - normalize `mode`, defaults, and validate structure defensively

4) **Definition builder**
   - Update `src/services/webform/definitionBuilder.ts`:
     - attach `steps` into the built `WebFormDefinition`

### Phase 2 — Step engine (pure domain + tests)
Create `src/web/react/features/steps/domain/`:
- `computeStepStatus.ts`: computes complete/valid per step
- `resolveVirtualStepField.ts`: resolves `__ckStep*` fields from step state
- Unit tests under `tests/web/react/...` for:
  - virtual field resolution
  - gating defaults
  - row filter behavior

### Phase 3 — Guided UI mode in React
1) Add `GuidedFormView` component:
   - `src/web/react/components/GuidedFormView.tsx` (or `src/web/react/features/steps/components/GuidedFormView.tsx`)
2) Add `StepsBar` (stepper) component:
   - shows current step, completion/valid state, allows back/jump (if allowed)
3) Wire it in `src/web/react/App.tsx`:
   - if `definition.steps?.mode === "guided"`, render `GuidedFormView` instead of `FormView`
   - ensure `customButtons` visibility resolver can see virtual step fields:
     - wrap `resolveButtonVisibilityValue` so `__ckStep*` is intercepted and resolved from computed step state

### Phase 4 — Field visibility integration
Ensure guided virtual fields are visible to:
- field-level `shouldHideField` evaluation (inside guided view)
- button-level `shouldHideField` evaluation (`App.tsx` customButtons)

### Phase 5 — Rollout example (Meal Production)
Provide a sample `steps` config for Meal Production and validate:
- step gating by validity works
- auto-advance triggers when valid
- “Ingredients needed” / other buttons can be gated by `__ckStepComplete_*` / `__ckStepValid_*`

---

## Migration & backward compatibility
- Forms without `steps` config continue using the existing `FormView` (no behavior change).
- Guided mode is opt-in per form via `steps.mode="guided"`.
- Groups remain supported; guided mode simply controls which fields are rendered.

---

## Example: Button gated after a step
To display a custom BUTTON only after the “foodSafety” step becomes valid:
```json
{
  "visibility": {
    "showWhen": { "fieldId": "__ckStepValid_foodSafety", "equals": "true" }
  }
}
```

This works because `App.tsx` uses `shouldHideField` for custom buttons; we will extend its value resolver to understand `__ckStep*`.

---

## Testing & verification checklist
- Unit tests for:
  - step state computation (complete/valid) using existing validation rules
  - virtual field resolution correctness
  - row filtering by `includeWhen/excludeWhen`
- Manual QA:
  - Create record → guided steps show step 1
  - Autosave → reload → step recomputed correctly
  - Auto-advance behavior does not jump while typing
  - Back navigation updates subsequent step statuses
  - Button visibility responds to `__ckStep*` fields

