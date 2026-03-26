## Purpose

This document defines the recommended implementation plan for replacing the current Meal Production leftover flow with a reusable shared-inventory pattern.

The immediate business goal is to make leftovers faster and safer to use in Meal Production. The broader platform goal is to establish the first configurable shared stock or inventory capability so forms can read from and write to a common table.

This design is grounded in the current codebase as of 2026-03-21, including the cross-form mutation foundation introduced in commit `c87f61c1c54c07760f5bec2be22c8d9f95a44e5a`.

## Executive recommendation

The recommended solution is:

- create a new dedicated `Leftover Inventory` form and response table
- stop asking the next-day cook to manually reconstruct leftovers inside the Meal Production record
- register leftovers at the end of portioning, when the cook still knows what was actually produced
- let the next Meal Production record select from `available` leftover inventory items
- preserve the current Meal Production internal prep rows for summary and report compatibility
- generalize the current cross-form dependency mutation work into a reusable `crossFormSubmitEffects` capability

This is the correct direction because it solves the Meal Production pain point without hard-coding a one-off leftover hack. It also establishes the first reusable common-table pattern for future stock and inventory use cases.

## Current-state assessment

The current leftover solution is embedded inside the Meal Production record itself.

Relevant configuration and code:

- current Meal Production row flow and leftover actions live in `docs/config/exports/staging/config_meal_production.json`
- current overlay-heavy leftover flow is centered on `openLeftoversOverlay`, `editLeftovers`, `clearLeftovers`, `MP_TYPE_LI`, and `MP_INGREDIENTS_LI`
- the frontend still contains leftover-oriented behavior concentrated in `src/web/react/components/FormView.tsx`, `src/web/react/components/form/LineItemGroupQuestion.tsx`, and `src/web/react/app/incompleteOverlayRowGuard.ts`
- summary and report rendering already know how to interpret the current prep rows in `docs/templates/meal_production.summary.html` and `src/services/webform/followup/mealProductionPdfContent.ts`

The current flow has three structural problems:

- the leftover is created too late, by the next cook instead of the cook who produced it
- the user has to reconstruct recipe or ingredients manually, which is slow and error-prone
- the leftover is not a first-class operational record with lifecycle state

The current codebase already contains useful foundations that should be reused:

- cross-form record mutation groundwork in `src/services/WebFormService.ts` and `src/services/webform/updateRecordDependencies.ts`
- read-only external data source lookup support in `src/services/webform/dataSources.ts`
- auto-increment ID support in `src/services/webform/submissions.ts`
- existing line-item, row-flow, overlay, and selection effects infrastructure in the React form engine

The main gaps are:

- current cross-form mutations update existing records but do not create new records in another form
- data sources are read-only and cannot own inventory lifecycle
- auto-increment supports one static prefix, not a conditional `LE-` or `LP-` scheme
- there is no generic concept of shared inventory records, reservation, or lifecycle status

## Design goals

- reduce the number of clicks and the amount of manual reconstruction required from cooks
- register leftovers at the moment the information is freshest
- let forms read from and write to a shared common table
- keep the solution configurable and reusable for future stock or inventory features
- preserve current Meal Production summary and final report outputs
- avoid a broad report-template rewrite

## Design principles

1. Keep inventory as its own record type.
2. Keep Meal Production as a consumer of leftover inventory, not the owner of leftover truth.
3. Reuse current Meal Production prep rows as the internal reporting model.
4. Make the reusable platform change generic, then wire Meal Production to it through config.
5. Keep status and expiry in the inventory table so availability can be resolved centrally.

## Authoritative clarifications

The points below are authoritative for this implementation and override earlier ambiguity in this document.

### 1. The `Leftover` step is inventory-backed, not record-copy-backed

The `Leftover` step must display leftovers directly from the shared `Leftover Inventory` source through a configurable external-record picker or datasource-backed list.

It must not copy the full leftover dataset into the Meal Production record just to render the step.

Allowed data in the Meal Production record at this stage:

- the selected leftover record id
- the selected quantity to use
- the selected usage mode when applicable
- any other minimal selection metadata needed to preserve the user choice

Not allowed as the source of truth for the `Leftover` step:

- a duplicated full leftover inventory payload stored inside the Meal Production record
- a duplicated ingredient list stored only to support display in the selector UI

The inventory record remains the source of truth until the selection is normalized into `MP_TYPE_LI`.

### 2. `MP_TYPE_LI` is generated immediately from selection

The `Leftover` step is only the selection UI.

As soon as the user:

- selects a leftover item
- changes the quantity to use
- changes the usage mode for an entire dish leftover

the Meal Production record must immediately regenerate the affected `MP_TYPE_LI` rows.

This regeneration must remain configuration-driven through generic line-item selection effects. It must not be implemented as a Meal Production-only hard-coded branch.

The purpose of this immediate generation is:

- keep the `Production` step consistent with the latest leftover choices
- keep derived values such as `to cook` synchronized
- preserve the current summary and report logic without waiting for final submit

The corresponding generated `MP_TYPE_LI` row is also the authoritative in-record signal that a leftover item is currently selected.

That means:

- the generated row must retain the leftover source identifier
- the UI may use the presence of that generated row, keyed by leftover id, to reflect that the leftover is selected
- the implementation must not require a second duplicated local ownership model just to know whether a leftover is selected

### 3. Inventory status lifecycle during selection

Inventory status must support a temporary reservation state in addition to the final operational states.

Required states:

- `available`
- `selected`
- `used`
- `expired`

State rules:

- when a leftover item is selected in a Meal Production record, its inventory status becomes `selected`
- when it is deselected before submit, its inventory status becomes `available`
- when the Meal Production record is submitted with that leftover still selected and the full available quantity is consumed, its inventory status becomes `used`
- when the Meal Production record is submitted with that leftover still selected but only part of the available quantity is consumed, its inventory status returns to `available` and its remaining available quantity is reduced by the amount used in Meal Production
- when the expiration date is passed, its inventory status becomes `expired`

This reservation behavior is required so that a leftover cannot be selected by another user in another Meal Production record while it is already being used.

The generic platform feature behind this should not be named for leftovers. It should be a reusable external-record reservation or status-transition capability driven from configuration.

### 4. `Production` step must remain intact

The `Leftover` step replaces only the old leftover selection and reconstruction UX.

It must not replace or degrade the existing `Production` step behavior.

The following must remain in place:

- the `to cook` flow
- the `Ingredients needed` button
- the ingredient evidence upload field
- the existing production-oriented configuration that already works today

The role of the `Leftover` step is only to influence the generated `MP_TYPE_LI` rows that the `Production` step then consumes through the existing logic.

### 4a. `Leftover registration` is a separate final step after Portioning

The registration of newly created leftovers must not happen inside `2. Leftover`.

It is a separate end-of-flow step that comes after `5. Portioning`.

Required guided-step order:

1. `Order`
2. `Leftover`
3. `Production`
4. `Food safety`
5. `Portioning`
6. `Leftover registration`

The purpose split is strict:

- `2. Leftover` consumes existing inventory
- `6. Leftover registration` creates new inventory from what remains after cooking and portioning

### 5. Read-only ingredient inspection

The `Ingredients` action in the `Leftover` step is informational only.

It must open a full-page read-only overlay backed by the selected inventory record's `LEFTOVER_INGREDIENTS_LI`.

The overlay must not expose editing affordances:

- no `Add line` button
- no remove or trash actions
- no editable inputs
- no local duplicated ingredient source used only for display

### 6. Compact-row interaction contract

The `Leftover` step uses a generic compact-row pattern that must stay configuration-driven.

Compact row contract:

- line 1 shows read-only source data from inventory
- line 2 is the user-input sentence row
- controls must size to the entered value so the sentence remains readable
- no leftover-specific JSX branch should be required for the layout semantics

For the Meal Production use case, the compact headline must resolve to:

- entire dish: `LEFTOVER_RECIPE | LEFTOVER_ID • LEFTOVER_QTY portions available`
- part dish: `LEFTOVER_INGREDIENT | LEFTOVER_ID • LEFTOVER_QTY LEFTOVER_UNIT available`

## Target functional model

### 1. Leftover registration

After `5. Portioning`, Meal Production opens a dedicated `Leftover registration` step.

This step is always present.

It must not be skippable by omission, because the user needs to explicitly confirm leftover quantities even when there are none.

Supported leftover types:

- `entireDish`
- `partialDish`

The step contains two sections:

#### A. Entire-dish leftovers by meal row

This section uses the same structural pattern as the Portioning step:

- one row per meal type
- show the meal type
- show a numeric column for leftover portions

Rules:

- the user must enter a value for every meal row
- if there are no leftovers for a meal row, the user enters `0`
- the value represents the number of leftover portions for that meal type

Creation rules:

- if the entered value is `0`, no entire-dish leftover inventory record is created for that meal row
- if the entered value is greater than `0`, create one entire-dish leftover inventory record
- default the recipe and cooked ingredients from the prepared meal row
- assign a unique id with the `LE-` prefix

#### B. Partial leftovers

This section allows the cook to add one or more partial leftover rows manually.

Each row captures:

- ingredient
- quantity
- unit

Rules:

- ingredient comes from the Ingredients shared data source
- unit is restricted to `gr` and `kg`
- quantity must be greater than `0`
- each saved row creates one partial leftover inventory record with an `LP-` id

Each leftover inventory record stores:

- unique leftover id
- type
- recipe
- ingredient rows
- expiration date
- status
- source Meal Production record id
- source meal row id when relevant

### Portioning transition and follow-up behavior

There is an operational caveat:

- the PDF generation and customer email follow-up must still be triggered immediately after Portioning is completed
- the user must still continue to the final `Leftover registration` step before the Meal Production record is finally submitted

Therefore, the current Portioning submit interaction must be split into two distinct concepts:

#### A. Portioning completion action

At the end of `5. Portioning`, the user triggers a `next step` action, not the final record submission.

This action must:

- show the same confirmation dialog currently shown at the end of Portioning
- trigger the same follow-up actions currently tied to that milestone, including PDF generation and customer email
- advance the user to `6. Leftover registration`
- keep the Meal Production record open for final completion

#### B. Final record submission

The actual record submission happens only after `6. Leftover registration` is completed.

This final submission must:

- persist the new leftover inventory records
- finalize inventory consumption updates for selected leftovers
- close the Meal Production record as it does today

### Required reusable platform feature: follow-up actions on `next step`

The current platform model assumes follow-up actions are tied to record submission or button-specific update actions.

The new requirement needs a reusable feature:

- show a dialog on `next step`
- run configured follow-up actions on `next step`
- continue the guided flow without final submission

This must be implemented as a generic guided-step capability, not a Meal Production-specific hack.

Recommended configuration direction:

- step-level or action-level `beforeNextDialog`
- step-level or action-level `nextStepFollowupActions`
- support for the same follow-up primitives already used for submit, PDF generation, email sending, and audit logging

### 2. Leftover usage in Meal Production

The current leftover flow inside the Meal Production record is replaced by a dedicated `Leftovers` step.

The step lists inventory records from the shared `Leftover Inventory` source.

The list is filtered to leftovers whose status is currently usable:

- `available`
- and not expired

Optionally, if the same Meal Production record already owns the reservation, its own `selected` rows may also be shown so the user can continue editing them.

For each selected item:

- the user explicitly chooses whether to use it
- `entireDish` leftovers require the user to choose `reheat` or `combine`
- `partialDish` leftovers only require selection and quantity
- selection immediately regenerates the corresponding `MP_TYPE_LI` rows
- selection immediately reserves the inventory item by moving it to `selected`
- deselection immediately removes the generated `MP_TYPE_LI` rows and returns the inventory item to `available`
- the quantity entered in Meal Production represents the amount to consume from the currently available quantity, not a duplicated standalone leftover quantity

Normalization rules into `MP_TYPE_LI`:

- `entireDish` + `reheat`
  - create one `MP_TYPE_LI` row
  - keep the leftover source id on that row
  - set `PREP_TYPE` to the existing entire-dish prep value
  - set `PREP_QTY` to the quantity used from the leftover
- `entireDish` + `combine`
  - create one `MP_TYPE_LI` row
  - keep the leftover source id on that row
  - set `PREP_TYPE` to the existing entire-dish or combine-compatible prep value already used by the current logic
  - set `PREP_QTY = 0`
  - rely on the current Meal Production summary and PDF logic so the leftover ingredients are combined into the cooked dish without additional report-specific logic
- `partialDish`
  - create one corresponding `Part dish` `MP_TYPE_LI` row
  - keep the leftover source id on that row
  - set `PREP_QTY` to the quantity used from the leftover

Display rules:

- `entireDish`: recipe, leftover id, available portions, reheat or combine selector, quantity to use, read-only ingredients action
- `partialDish`: ingredient, leftover id, available quantity, unit, quantity to use

Business effect:

- if an `entireDish` leftover is marked `reheat`, subtract its portions from the `to cook` quantity
- if an `entireDish` leftover is marked `combine`, keep `to cook` unchanged and merge its ingredients into the chosen recipe ingredients through the existing `MP_TYPE_LI` behavior with `PREP_QTY = 0`
- if a `partialDish` leftover is selected, merge its ingredient rows into the chosen recipe ingredients

On Meal Production submission:

- selected leftover inventory items become `used` only when the full currently available quantity is consumed
- partially consumed leftover inventory items return to `available` with their remaining quantity updated in place
- the Meal Production record stores the normalized internal rows needed by the current summary and report logic
- the inventory table remains the source of truth for the leftover record itself

Consumption rules:

- `entireDish`
  - compare `quantity to use` against `LEFTOVER_PORTIONS`
  - if equal, mark `used`
  - if lower, subtract the used portions from `LEFTOVER_PORTIONS`, keep the same inventory record, and return it to `available`
- `partialDish`
  - compare `quantity to use` against `LEFTOVER_QTY`
  - if equal, mark `used`
  - if lower, subtract the used quantity from `LEFTOVER_QTY`, keep the same inventory record, and return it to `available`

The first iteration should update the same inventory record in place after partial consumption. It should not create residual child records or split one leftover into multiple new inventory rows.

### 3. Expiry lifecycle

Each leftover inventory item has a lifecycle state:

- `available`
- `selected`
- `used`
- `expired`

Expiry handling should work in two ways:

- query-time filtering should exclude expired items from the available leftover picker
- a scheduled recompute job should update status to `expired` for records past their expiration date

## Recommended data model

### New form: `Config: Leftover Inventory`

Recommended top-level fields:

- `LEFTOVER_ID`
- `LEFTOVER_KIND`
- `LEFTOVER_STATUS`
- `LEFTOVER_RECIPE`
- `LEFTOVER_QTY`
- `LEFTOVER_UNIT`
- `LEFTOVER_PORTIONS`
- `LEFTOVER_EXP_DATE`
- `LEFTOVER_SOURCE_FORM_KEY`
- `LEFTOVER_SOURCE_RECORD_ID`
- `LEFTOVER_SOURCE_MEAL_ROW_ID`
- `LEFTOVER_USED_BY_FORM_KEY`
- `LEFTOVER_USED_BY_RECORD_ID`
- `LEFTOVER_NOTES`

Recommended line-item group:

- `LEFTOVER_INGREDIENTS_LI`

Recommended ingredient row fields:

- `ING`
- `QTY`
- `UNIT`
- optional allergen metadata if the source recipe already exposes it

Recommended constrained enums:

- `LEFTOVER_KIND`: `entireDish`, `partialDish`
- `LEFTOVER_STATUS`: `available`, `selected`, `used`, `expired`
- `LEFTOVER_USAGE_MODE`: `reheat`, `combine`

Quantity semantics:

- `entireDish` uses `LEFTOVER_PORTIONS` as the remaining available quantity
- `partialDish` uses `LEFTOVER_QTY` + `LEFTOVER_UNIT` as the remaining available quantity
- when partial consumption happens, the remaining quantity is written back to these same fields on the inventory record

### ID strategy

The business requirement is:

- `LE-1`, `LE-2`, ... for entire dish leftovers
- `LP-1`, `LP-2`, ... for partial dish leftovers

The current auto-increment helper supports a static prefix only. The recommended extension is:

- keep the existing auto-increment mechanism
- add support for `prefixByValue` or an equivalent keyed-prefix configuration
- key it off `LEFTOVER_KIND`

That keeps the feature reusable for other shared-table identifiers later.

## Reusable platform changes

The right platform feature is broader than leftovers. It should be described as shared-table submit effects.

### A. Extend cross-form mutation support

Current support from `c87f61c` is useful, but it is not enough. The platform needs to support:

- `createRecord`
- `updateRecord`
- `setRecord`
- `setLineItemValues`
- later `upsertRecord`

Recommended abstraction:

- evolve the current `updateRecordDependencies` feature into `crossFormSubmitEffects`
- let a form submit create or update records in another form in a controlled, declarative way

This is the core reusable feature that can later support:

- leftovers
- stock movements
- shared master data enrichment
- reservation tables
- common operational ledgers

### B. Add reusable record mapping

Cross-form record creation should support declarative value mapping:

- copy scalar values from source fields
- derive values from expressions
- map source line items into target line-item groups
- support status defaults on creation

Meal Production leftovers will need this to create inventory records without custom hand-written code for every field.

### C. Add reusable external-record picker support

Meal Production needs more than a read-only data source list. It needs a reusable external record selection pattern:

- list available inventory records from another form
- select one or more records
- fetch full record details by id
- map the selected record into current-form internal rows
- support immediate reservation and release of the source record through configurable status transitions
- support a read-only detail overlay sourced directly from the external record
- support configurable submit-time quantity reconciliation back to the source record

This should be implemented as a generic pattern so other forms can consume shared inventory tables later.

### D. Add lifecycle recompute support

The platform should support a scheduled lifecycle recompute for records with date-driven state changes.

For leftovers, that means:

- detect expired available records
- update them to `expired`

This should be implemented as a generic service entrypoint plus a scheduled Apps Script trigger.

## Meal Production-specific design

### 1. New portioning leftover capture

Replace the earlier binary leftover question with a dedicated final guided step:

- `6. Leftover registration`

Recommended behavior:

- reuse the Portioning table pattern for entire-dish leftovers by meal type
- require explicit `0` when no entire-dish leftover exists
- provide a separate partial-leftover row section below
- create inventory records from this final step, not from the earlier consumption step

### 2. New Meal Production `Leftovers` step

Replace the current manual leftover overlay flow with:

- a compact list of inventory-backed leftover rows
- selection checkboxes
- a required usage-mode choice for `entireDish`
- a read-only `view ingredients` action for `entireDish`
- immediate `MP_TYPE_LI` regeneration when the selection changes
- immediate inventory reservation or release when the selection changes
- submit-time reconciliation of used quantity back into the inventory record

This is still compatible with the current UI engine because it can reuse:

- row lists
- overlays
- action handlers
- selection effects

### 3. Preserve internal reporting rows

Do not remove the current internal prep-row representation from the backend domain yet.

Instead:

- treat selected leftovers as input
- normalize them into the existing `MP_TYPE_LI` rows used by summary and final report generation
- keep the `Production` step focused on the existing `to cook` and ingredient-evidence behavior
- use those normalized `MP_TYPE_LI` rows as the in-record source for selected-leftover state

This keeps the current output stable while allowing the user-facing flow to change.

### 4. Replace the current combine workaround

The current logic uses the leftover prep rows directly and already contains special handling around zero-value entire dish leftovers and combined ingredients.

The improved model should be explicit:

- `reheat` means reduce `to cook`
- `combine` means keep `to cook` and merge ingredients

This makes the behavior easier to understand and removes the current implicit workaround logic.

## Proposed implementation phases

### Phase 1. Shared-table foundation

Build the generic backend/config support first.

Scope:

- extend mutation types in `src/types/index.ts`
- extend config parsing in `src/config/ConfigSheet.ts`
- add create-record support in `src/services/WebFormService.ts`
- extend `src/services/webform/updateRecordDependencies.ts` or replace it with a more generic submit-effects executor
- extend auto-increment support in `src/services/webform/submissions.ts`

Deliverable:

- one form can create and update records in another form through configuration

### Phase 2. Leftover Inventory form

Create the shared inventory schema and config.

Scope:

- add a new leftover inventory form configuration
- add status, expiry, and source fields
- add line-item ingredient rows
- add list and detail views suitable for leftover selection and traceability

Deliverable:

- leftover inventory exists as a first-class shared table

### Phase 3. Portioning leftover registration

Add the new leftover registration stage to Meal Production.

Scope:

- add the `6. Leftover registration` step
- add the entire-dish leftover table by meal type with required zero-or-greater values
- add the partial-leftover row section
- add the generic `next step` follow-up capability so Portioning can still run PDF and email actions before final submit
- create inventory records on final submit
- capture source Meal Production references

Deliverable:

- leftovers are registered at the end of production by the cook who knows them best

### Phase 4. Leftover usage in Meal Production

Replace the current manual leftover use flow.

Scope:

- remove the current user-facing leftover overlay flow
- add the new `Leftovers` step
- list `available` leftovers from inventory
- map selected leftovers into Meal Production internal rows
- support `reheat` and `combine`
- mark fully consumed leftovers as `used` on submit
- reduce remaining quantity and return partially consumed leftovers to `available` on submit

Deliverable:

- cooks can consume leftovers from inventory without reconstructing them manually

### Phase 5. Expiry lifecycle and hardening

Add lifecycle automation and operational hardening.

Scope:

- scheduled expiry status update
- guard against double-use races as far as Apps Script allows
- add logs for inventory creation and inventory consumption
- add validation around stale status and already-used items

Deliverable:

- leftover lifecycle is operationally safe enough for daily use

### Phase 6. Guided-step follow-up generalization

Add reusable support for dialogs and follow-up actions on `next step`.

Scope:

- allow a guided step to define a confirmation dialog before advancing
- allow a guided step to trigger follow-up actions without final record submission
- keep the capability generic so other forms can reuse it later

Deliverable:

- Portioning can trigger PDF and email immediately, while the record stays open for `Leftover registration`

## Recommended file areas to change

### Backend and shared platform

- `src/types/index.ts`
- `src/config/ConfigSheet.ts`
- `src/services/WebFormService.ts`
- `src/services/webform/updateRecordDependencies.ts`
- `src/services/webform/submissions.ts`
- `src/services/webform/dataSources.ts`

### Frontend

- `src/web/react/App.tsx`
- `src/web/react/components/FormView.tsx`
- `src/web/react/components/form/LineItemGroupQuestion.tsx`
- new domain helpers under a feature-oriented leftover or inventory folder if introduced

### Configuration and docs

- `docs/config/exports/staging/config_meal_production.json`
- `docs/config/exports/prod/config_meal_production.json`
- new leftover inventory config export under `docs/config/exports/{env}`
- `config_schema.yaml`
- `README.md`
- `SetupInstructions.md`

### Tests

- unit tests for cross-form record creation
- unit tests for keyed auto-increment prefixes
- unit tests for leftover selection and mapping rules
- integration tests for inventory creation on Meal Production submit
- integration tests for inventory consumption and status transitions

## Recommended config shape changes

The reusable configuration direction should be declarative rather than Meal Production-specific.

Recommended additions:

- shared submit effects configuration for create or update operations in another form
- external record picker configuration for selecting records from another form
- keyed auto-increment prefix configuration
- scheduled lifecycle rule configuration for date-based status transitions
- guided-step follow-up actions on `next step`
- guided-step confirmation dialogs before `next step`

This keeps the leftover solution configurable and makes it reusable for future stock use cases.

## Risks and constraints

1. Apps Script and Sheets are not transactional in the database sense.

This means inventory usage status changes must be guarded carefully against stale reads and double updates.

2. Cross-form record creation will widen the platform surface.

That is correct strategically, but it increases the need for:

- validation
- tests
- clear config semantics

3. The current Meal Production config is already complex.

The implementation should remove user-facing leftover complexity while avoiding another layer of overlapping legacy behavior.

In particular, the system must not drift into a hybrid model where:

- the selector UI reads from duplicated local leftover rows
- the inventory form also exists separately
- and both structures try to be the source of truth

The source of truth split must remain strict:

- inventory table for leftover records
- Meal Production record for normalized prep rows and current selection state only

4. Summary and report compatibility should be preserved during the migration.

That is why the design keeps the current internal prep-row model alive for now.

5. Follow-up timing is operationally important.

PDF generation and email sending cannot be delayed until the final leftover-registration completion.

That means the platform must distinguish between:

- milestone follow-up execution
- final record submission

## Non-goals for the first iteration

- a full generic warehouse or stock reservation engine
- FIFO optimization across multiple leftover candidates
- costing or valuation of leftovers
- inventory splitting into multiple residual child records
- report-template redesign

## Recommended implementation order

1. build the generic shared-table submit-effects foundation
2. add the Leftover Inventory form
3. add portioning leftover registration
4. add the new Meal Production leftover-consumption step
5. preserve current summary and report outputs by normalizing into the existing internal rows
6. add the final leftover-registration step plus guided `next step` follow-up support
7. add expiry automation and operational guards

## Assessment of the current implementation state

As of 2026-03-24, the implementation direction has partially diverged from the intended model above.

The main mismatches are:

- the `Leftover` step still carries local record fields and duplicated line-item structures that make it look like the Meal Production record owns the leftover payload
- `MP_TYPE_LI` regeneration exists in parts of the config, but it is not yet reliably behaving as the authoritative immediate output of selection
- the `Ingredients` overlay behavior has been moving toward read-only, but the plan needs to state explicitly that it must read from inventory `LEFTOVER_INGREDIENTS_LI`, not from a Meal Production-owned duplicate
- the current implementation has also affected the `Production` step, while the intended design is to preserve the existing `to cook` and evidence flow

This means the next implementation pass should not be more patching in place. It should be a real alignment pass against this plan.

## Recommended next steps after plan alignment

1. remove the `Leftover` step's duplicated leftover-data ownership
2. make the inventory row the only source for display and read-only ingredient inspection
3. keep only minimal selection state in Meal Production
4. make immediate `MP_TYPE_LI` generation the single authoritative output of selection
5. add immediate inventory reservation transitions: `available -> selected`, `selected -> available`, `selected -> used`
6. restore the `Production` step to its original `to cook` and evidence responsibilities
7. then revalidate the full flow end to end on staging before adding the later leftover-capture step

## Corrective backlog

This backlog defines the required sequence for correcting the current implementation.

The order matters. Items in the first section must be addressed before adding more feature work.

### Must fix before continuing

These items are blockers because the current implementation is not aligned with the intended model.

1. Remove hybrid ownership from the `Leftover` step

- stop treating Meal Production as a secondary source of leftover truth
- keep only minimal selection state in the Meal Production record:
  - leftover record id
  - selected checkbox state
  - quantity to use
  - usage mode
- stop relying on duplicated local payload fields as the operational source for the selector UI
- stop persisting datasource-shaped selector rows as business data inside `MP_LEFTOVER_USAGE_LI`
- replace that persisted selector structure with transient datasource-backed selection rows rendered from inventory at runtime

2. Make inventory the only source for display and ingredient inspection

- the row headline must resolve from the inventory record
- the read-only ingredients overlay must resolve from inventory `LEFTOVER_INGREDIENTS_LI`
- the selector UI must not require a duplicated Meal Production-owned ingredient payload to render correctly

3. Restore `Production` step behavior

- remove the regression introduced by the leftover work
- preserve:
  - `to cook`
  - `Ingredients needed`
  - ingredient evidence upload
- ensure the `Production` step only consumes normalized `MP_TYPE_LI` rows

4. Make `MP_TYPE_LI` generation reliably authoritative

- selection must immediately create the corresponding `MP_TYPE_LI` row
- deselection must immediately remove the corresponding `MP_TYPE_LI` row
- quantity changes must immediately update the corresponding `MP_TYPE_LI` row
- usage-mode changes must immediately update the corresponding `MP_TYPE_LI` row
- the generated row must retain leftover source identity so it can be matched back to the selected inventory item

5. Add the missing inventory reservation state

- extend `LEFTOVER_STATUS` with `selected`
- implement:
  - `available -> selected`
  - `selected -> available`
  - `selected -> used`
- update expiry logic so it is compatible with the reservation model

### Must refactor for alignment

These items are required for the implementation to remain configurable and reusable.

1. Replace leftover-specific UI branches with generic compact-row behavior

- keep the compact row pattern config-driven
- move leftover-specific semantics out of renderer internals where possible
- keep the renderer generic:
  - headline parts
  - sentence-row parts
  - row actions
  - sizing behavior
- keep the transient row model generic as well:
  - datasource-backed rows
  - anchor field
  - immediate selection effects
  - no record-persistence requirement for the selector rows themselves

2. Introduce generic external-record reservation support

- status transitions during selection must be implemented as a reusable external-record capability
- avoid naming the platform feature after leftovers
- keep the mechanism usable for future stock and shared-table workflows

3. Introduce generic submit-time quantity reconciliation

- full consumption: set source record to `used`
- partial consumption: reduce source quantity and return status to `available`
- update the same inventory record in place for the first iteration

4. Separate milestone follow-up from final submission

- add generic guided-step confirmation before `next step`
- add generic guided-step follow-up actions on `next step`
- use that for Portioning so PDF and email happen before final leftover registration

5. Add the `6. Leftover registration` step as a real end-of-flow step

- one required entire-dish leftover quantity field per meal row
- explicit `0` required when no leftovers exist
- separate partial-leftover row section
- final inventory creation happens from this last step

### Can defer

These items are valuable, but they should not block the correction pass above.

1. Further UI polish on compact sentence rows

- typography tuning
- spacing adjustments
- action density refinements

2. Additional diagnostics and telemetry

- reservation transition logs
- partial-consumption reconciliation logs
- next-step follow-up diagnostics

3. Broader generic stock features

- FIFO across multiple candidates
- residual inventory splitting into child rows
- advanced reservation conflict resolution
- cost or valuation logic

## Recommended implementation sequence

To avoid destabilizing the form further, the next implementation pass should follow this sequence exactly:

1. restore `Production` step behavior and remove old leftover-flow regressions
2. simplify the `Leftover` step to minimal selection state only
3. replace persisted `MP_LEFTOVER_USAGE_LI` selector rows with transient datasource-backed rows and remove legacy leftover config blocks
4. make inventory the only display source for the selector and ingredient overlay
5. make immediate `MP_TYPE_LI` generation reliable and observable
6. add inventory reservation state transitions
7. add partial-consumption reconciliation on final submit
8. add guided `next step` follow-up support
9. add the final `Leftover registration` step
10. validate the whole flow end to end on staging

## Final recommendation

The correct solution is not to further patch the current manual leftover overlay flow.

The correct solution is to:

- create leftover inventory as a shared common table
- let Meal Production write to it at the end of portioning
- let later Meal Production records consume from it through a dedicated leftover-selection step
- reuse the existing report-facing Meal Production internal model
- generalize the current cross-form mutation foundation into a reusable platform capability

That gives Community Kitchen the leftover solution it needs now and gives the platform its first reusable stock or inventory building block.
