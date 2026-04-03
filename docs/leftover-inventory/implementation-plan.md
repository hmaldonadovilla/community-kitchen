## Purpose

This document defines the recommended implementation plan for replacing the current Meal Production leftover flow with a reusable shared-inventory pattern.

The immediate business goal is to make leftovers faster and safer to use in Meal Production. The broader platform goal is to establish the first configurable shared stock or inventory capability so forms can read from and write to a common table.

This design is grounded in the current codebase as of 2026-03-21, including the cross-form mutation foundation introduced in commit `c87f61c1c54c07760f5bec2be22c8d9f95a44e5a`.

This plan is the top-level implementation guide.

Detailed design for the reservation-aware inventory lifecycle now lives in:

- `docs/leftover-inventory/design/reservation-lifecycle-design.md`

Detailed design for the next source-first `Leftover bank` and sentence-based `Leftovers` layout now lives in:

- `docs/leftover-inventory/design/source-first-leftover-bank-and-leftovers-layout.md`

Detailed design for the closeout execution model and background follow-up sequencing now lives in:

- `docs/leftover-inventory/design/finalization-and-background-followups.md`

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

### 1. The `Leftover bank` step is inventory-backed, not record-copy-backed

The `Leftover bank` step must display leftovers directly from the shared `Leftover Inventory` source through a configurable external-record picker or datasource-backed list.

It must not copy the full leftover dataset into the Meal Production record just to render the step.

Allowed data in the Meal Production record at this stage:

- the selected leftover record id
- the selected quantity to use
- the selected usage mode when applicable
- any other minimal selection metadata needed to preserve the user choice

Not allowed as the source of truth for the `Leftover bank` step:

- a duplicated full leftover inventory payload stored inside the Meal Production record
- a duplicated ingredient list stored only to support display in the selector UI

The inventory record remains the source of truth until the selection is normalized into `MP_TYPE_LI`.

### 2. `MP_TYPE_LI` is generated immediately from selection

The `Leftover bank` step is only the selection UI.

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

Inventory status no longer carries reservation semantics.

Required states:

- `available`
- `used`
- `expired`

State rules:

- selecting a leftover does not change `LEFTOVER_STATUS`
- quantity reservations are modeled through the reservation ledger plus aggregate reserved fields on the inventory record
- when the Meal Production record is submitted and the full remaining quantity is consumed, the inventory status becomes `used`
- when the Meal Production record is submitted and only part of the remaining quantity is consumed, the inventory status stays `available` and its remaining quantity is reduced in place
- when the expiration date is passed, its inventory status becomes `expired`

This is required because a single leftover item may be partially reserved by multiple rows and multiple records at the same time.

The generic platform feature behind this should therefore be a reusable quantity-reservation capability, not a leftover-specific status toggle.

### 3a. Reservation is quantity-based, not item-based

Reservation must be tracked as a quantity, not as a whole-item lock.

This is now an authoritative rule.

What this means:

- the same leftover item may be selected under multiple Meal Production dish rows in the same record
- the same leftover item may also be selected by multiple Meal Production records at the same time
- this is allowed only while the item still has free quantity available after subtracting active reservations

Examples:

- if `LE-12` has `10` portions remaining, one Meal Production dish may reserve `3` portions and another dish may reserve `2` portions
- after that, `5` portions remain free
- those remaining `5` portions may still be reserved by another dish in the same record or by a different Meal Production record

This rule applies to both leftover kinds:

- `entireDish` uses portions as the reservable quantity
- `partialDish` uses quantity plus unit as the reservable quantity

The reservation model must therefore support:

- multiple active reservations against the same inventory record
- immediate recalculation of free quantity after each reservation change
- reconciliation on final submit so reserved quantity becomes either consumed quantity or released quantity

Selection in the `Leftover bank` step must not reserve the entire item by status alone.

Instead:

- status expresses whether the item is operationally usable
- reservation quantity expresses how much of the item is currently held by active records

The design implication is that inventory status and reservation state must be separated.

The detailed design in `docs/leftover-inventory/design/reservation-lifecycle-design.md` defines the quantity-based reservation model that must be used for implementation.

### 4. `Production` step must remain intact

The `Leftover bank` step replaces only the old leftover selection and reconstruction UX.

It must not replace or degrade the existing `Production` step behavior.

The following must remain in place:

- the `to cook` flow
- the `Ingredients needed` button
- the ingredient evidence upload field
- the existing production-oriented configuration that already works today

The role of the `Leftover bank` step is only to influence the generated `MP_TYPE_LI` rows that the `Production` step then consumes through the existing logic.

### 4a. `Leftovers` is a separate final step after Portioning

The registration of newly created leftovers must not happen inside `2. Leftover bank`.

It is a separate end-of-flow step that comes after `5. Portioning`.

Required guided-step order:

1. `Order`
2. `Leftover bank`
3. `Production`
4. `Food safety`
5. `Portioning`
6. `Leftovers`

The purpose split is strict:

- `2. Leftover bank` consumes existing inventory
- `6. Leftovers` creates new inventory from what remains after cooking and portioning

### 4b. Freshly registered leftovers must be immediately reusable

After `6. Leftovers` creates new inventory records:

- the frontend must invalidate and refresh the leftover datasource automatically
- local persisted datasource state must be updated
- the user must not need a hard refresh to see or use the leftovers that were just created

This should remain generic and datasource-driven.

Preferred implementation direction:

- invalidate `Leftover Inventory Data`
- refetch it automatically
- replace persisted local cache with the refreshed authoritative dataset

This should be implemented through the generic datasource refresh path, not through a Meal Production-only local patch.

### 4c. Leftover dietary applicability must be stored and used

Each leftover inventory record must carry the dietary applicability it supports.

This is required so `2. Leftover bank` can show only compatible dishes for each leftover item.

For newly created entire-dish leftovers in `6. Leftovers`:

- dietary applicability must be derived from the cooked dish ingredients
- the derived values must be saved to the inventory record
- the same values must be exposed through datasource responses and persisted client cache

For newly created partial-dish leftovers in `6. Leftovers`:

- dietary applicability must also be captured and saved to the inventory record
- it should be derived using the same generic ingredient classification rules where possible
- if derivation alone is not sufficient, the registration flow must still ensure explicit dietary applicability is captured before the leftover is saved

For selection in `2. Leftover bank`:

- the UI must filter out incompatible dishes using that saved applicability
- filtering must happen before rendering allocation controls where possible
- if only one compatible dish remains, the UI should collapse to the simplified single-dish presentation
- this filtering rule applies to both `LE` and `LP`

### 5. Read-only ingredient inspection

The `Ingredients` action in the `Leftover bank` step is informational only.

This requirement is now superseded by the source-first layout design.

The preferred primary behavior is:

- show ingredient information inline as a compact summary sentence
- use the same readable style in both `Leftover bank` and `Leftovers`

If an expanded detail view is still retained as a secondary fallback, it must remain read-only:

- no `Add line` button
- no remove or trash actions
- no editable inputs
- no local duplicated ingredient source used only for display

### 6. Compact-row interaction contract

The `Leftover bank` step uses a generic compact-row pattern that must stay configuration-driven.

Compact row contract:

- line 1 shows read-only source data from inventory
- line 2 is the user-input sentence row
- controls must size to the entered value so the sentence remains readable
- no leftover-specific JSX branch should be required for the layout semantics

For the Meal Production use case, the compact headline must resolve to:

- entire dish: `LEFTOVER_RECIPE | LEFTOVER_ID • LEFTOVER_QTY portions available`
- part dish: `LEFTOVER_INGREDIENT | LEFTOVER_ID • LEFTOVER_QTY LEFTOVER_UNIT available`

## Target functional model

### 1. Leftovers

After `5. Portioning`, Meal Production opens a dedicated `Leftovers` step.

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
- the user must still continue to the final `Leftovers` step before the Meal Production record is finally submitted
- the user should not be left waiting on background PDF or email work just to continue the guided flow

Therefore, the current Portioning submit interaction must be split into two distinct concepts:

#### A. Portioning completion action

At the end of `5. Portioning`, the user triggers a `next step` action, not the final record submission.

This action must:

- show the same confirmation dialog currently shown at the end of Portioning
- persist whatever milestone state is required for the follow-up actions to run correctly
- trigger the same follow-up actions currently tied to that milestone, including PDF generation and customer email
- advance the user to `6. Leftovers`
- keep the Meal Production record open for final completion
- immediately show a configurable dialog explaining that background actions are running and the user can continue

#### B. Final record submission

The actual record submission happens only after `6. Leftovers` is completed.

This final submission must:

- persist the new leftover inventory records
- finalize inventory consumption updates for selected leftovers
- close the Meal Production record as it does today
- start inventory consumption or reconciliation before follow-up actions, or in parallel when safe, so the user is not blocked by later PDF or email work
- redirect the user immediately to the appropriate post-submit screen and show a configurable success dialog explaining that background actions are still running

Post-submit screen requirements:

- if the user lands on the summary view, the preview button that depends on the PDF URL must stay disabled until that URL has been returned
- if the user lands on `6. Leftovers` after the Portioning milestone action, the same configurable background-processing dialog must explain that PDF and email work is already running while the user continues registering new leftovers

### Required reusable platform feature: follow-up actions on `next step`

The current platform model assumes follow-up actions are tied to record submission or button-specific update actions.

The new requirement needs a reusable feature:

- show a dialog on `next step`
- run configured follow-up actions on `next step`
- continue the guided flow without final submission
- show a dialog after submit while background follow-up actions continue
- let post-submit views expose partially ready state, such as a disabled PDF-preview action until the PDF URL is available

This must be implemented as a generic guided-step capability, not a Meal Production-specific hack.

Recommended configuration direction:

- step-level or action-level `beforeNextDialog`
- step-level or action-level `nextStepFollowupActions`
- step-level or action-level `afterActionDialog`
- submit-level `postSubmitBackgroundDialog`
- support for the same follow-up primitives already used for submit, PDF generation, email sending, and audit logging
- support disabling or deferring UI actions that depend on asynchronous follow-up results, such as a PDF-preview link

### 2. Leftover bank in Meal Production

The current leftover flow inside the Meal Production record is replaced by a dedicated `Leftover bank` step.

The step lists inventory records from the shared `Leftover Inventory` source.

The list is filtered to leftovers whose status is currently usable:

- `available`
- and not expired
- and whose free quantity is greater than `0`

Optionally, if the same Meal Production record already owns the reservation, its own `selected` rows may also be shown so the user can continue editing them.

For each selected item:

- the user explicitly chooses whether to use it
- `entireDish` leftovers require the user to choose `reheat` or `combine`
- `partialDish` leftovers only require selection and quantity
- selection immediately regenerates the corresponding `MP_TYPE_LI` rows
- selection immediately reserves only the chosen quantity
- deselection immediately removes the generated `MP_TYPE_LI` rows and releases the reserved quantity
- the quantity entered in Meal Production represents the amount to consume from the currently available quantity, not a duplicated standalone leftover quantity

Reservation rules:

- selecting a leftover row does not reserve the full leftover item
- reservation happens only when the row has enough information to define a valid reservation
- for `entireDish`, a valid reservation requires:
  - selected item id
  - usage mode
  - quantity to use
- for `partialDish`, a valid reservation requires:
  - selected item id
  - quantity to use
- changing the quantity updates the reservation delta on the server
- changing usage mode on `entireDish` keeps the same reservation quantity but regenerates the corresponding `MP_TYPE_LI` normalization
- deselecting the row releases the reservation quantity entirely

Server-side free quantity must be defined as:

- `remaining quantity - sum(active reservations across all records except the current reservation row being edited)`

The UI may show the user:

- the current free quantity
- the quantity already reserved by the current record when applicable

but the source of truth for availability must remain server-side.

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

When reservations are in use, the submit behavior becomes:

- active reservation quantity belonging to the submitting Meal Production record is reconciled into actual consumption
- if the submitted usage equals the item's remaining quantity, the item becomes fully consumed
- if the submitted usage is lower than the remaining quantity, only that quantity is deducted from the inventory record and the residual quantity remains available
- all active reservation rows belonging to the submitted record must be closed as part of final reconciliation

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
- `LEFTOVER_RESERVED_QTY`
- `LEFTOVER_RESERVED_PORTIONS`
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
- `LEFTOVER_STATUS`: `available`, `used`, `expired`
- `LEFTOVER_USAGE_MODE`: `reheat`, `combine`

Quantity semantics:

- `entireDish` uses `LEFTOVER_PORTIONS` as the remaining available quantity
- `partialDish` uses `LEFTOVER_QTY` + `LEFTOVER_UNIT` as the remaining available quantity
- when partial consumption happens, the remaining quantity is written back to these same fields on the inventory record
- `LEFTOVER_RESERVED_PORTIONS` and `LEFTOVER_RESERVED_QTY` track the total active reserved quantity currently held by open Meal Production records

### Reservation ledger

To support quantity-based reservations across multiple records and multiple dish rows, the implementation should introduce a reusable reservation ledger instead of overloading the inventory record alone.

Recommended new form:

- `Config: Inventory Reservation Ledger`

Recommended top-level fields:

- `RESERVATION_ID`
- `RESOURCE_FORM_KEY`
- `RESOURCE_RECORD_ID`
- `RESOURCE_ITEM_ID`
- `RESOURCE_KIND`
- `RESERVED_QTY`
- `RESERVED_UNIT`
- `STATUS`
- `SOURCE_FORM_KEY`
- `SOURCE_RECORD_ID`
- `SOURCE_PARENT_GROUP_ID`
- `SOURCE_PARENT_ROW_ID`
- `SOURCE_OUTPUT_GROUP_ID`
- `SOURCE_OUTPUT_ROW_ID`
- `CREATED_AT`
- `UPDATED_AT`

Recommended enums:

- `STATUS`: `active`, `released`, `consumed`

This ledger is the authoritative row-level reservation model.

The aggregate fields on the inventory record exist only to make availability queries fast and easy to configure.

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

- `6. Leftovers`

Recommended behavior:

- reuse the Portioning table pattern for entire-dish leftovers by meal type
- require explicit `0` when no entire-dish leftover exists
- provide a separate partial-leftover row section below
- create inventory records from this final step, not from the earlier consumption step

### 2. New Meal Production `Leftover bank` step

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

- add the `6. Leftovers` step
- add the entire-dish leftover table by meal type with required zero-or-greater values
- add the partial-leftover row section
- add the generic `next step` and post-submit follow-up capability so Portioning can still run PDF and email actions before final submit and final submit can return the user immediately while background actions continue
- create inventory records on final submit
- capture source Meal Production references

Deliverable:

- leftovers are registered at the end of production by the cook who knows them best

### Phase 4. Leftover bank in Meal Production

Replace the current manual leftover use flow.

Scope:

- remove the current user-facing leftover overlay flow
- add the new `Leftover bank` step
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

- Portioning can trigger PDF and email immediately, while the record stays open for `Leftovers`, and final submit can return the user immediately while background actions continue

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

PDF generation and email sending cannot be delayed until the final `Leftovers` completion.

That means the platform must distinguish between:

- milestone follow-up execution
- final record submission
- post-submit background follow-up completion

## Non-goals for the first iteration

- a full generic warehouse or stock reservation engine
- FIFO optimization across multiple leftover candidates
- costing or valuation of leftovers
- inventory splitting into multiple residual child records
- report-template redesign

## Recommended implementation order

1. build the generic shared-table submit-effects foundation
2. add the Leftover Inventory form
3. add reservation ledger and reservation-aware `2. Leftover bank`
4. preserve current summary and report outputs by normalizing into the existing internal rows
5. add submit-time reservation reconciliation and lifecycle closeout
6. add the final `6. Leftovers` step plus guided `next step` and post-submit follow-up support
7. validate the complete post-production flow end to end on staging

## Assessment of the current implementation state

As of 2026-03-31, the reservation-driven inventory lifecycle is largely implemented and behaving correctly in staging.

Implemented foundations:

- `2. Leftover bank` is inventory-backed and no longer relies on Meal Production-owned duplicated selector data as the source of truth
- immediate `MP_TYPE_LI` generation from selection is working and remains config-driven
- reservation ledger creation, conflict reconciliation, release-on-delete, stale-release, and final submit reconciliation are implemented
- `Production` is restored and consumes the normalized `MP_TYPE_LI` rows
- the read-only ingredients overlay is sourced from inventory
- conflict dialogs and submit-time reconciliation feedback are configurable
- `6. Leftovers` now exists as a real guided step in staging with:
  - one required per-meal leftover portions field on `MP_MEALS_REQUEST`
  - explicit `0` support when no leftovers exist
  - a separate partial-leftovers section
  - staged cross-form creation of new leftover inventory rows on final close
- guided-step milestone follow-up is now generic and configurable:
  - `navigation.milestoneAction` can ensure a draft record id exists
  - configured follow-up batches can run in background
  - milestone steps can show configurable confirmation and acknowledgement dialogs
  - `5. Portioning` now uses this path to start PDF/email work before advancing to `6. Leftovers`
- the current `Leftover bank` is still meal-first, not source-first
- newly created leftovers are saved on the server, but immediate datasource refresh after `6. Leftovers` is not implemented yet
- dietary applicability derivation and filtering in `Leftover bank` are not implemented yet

The reservation platform and the generic milestone or post-submit follow-up UX are no longer the main blockers. The remaining work is now concentrated on hardening and validating the full post-production flow end to end, especially the creation of new leftover inventory records from `6. Leftovers`.

## Remaining implementation backlog

### Must complete for end-to-end feature closure

1. Validate and harden new leftover inventory record creation from `6. Leftovers`

- entire-dish rows must create `LE-*` records
- partial rows must create `LP-*` records
- preserve source traceability back to the Meal Production record and meal row
- dedicated service coverage now exists for final-close creation of:
  - entire-dish leftovers from cooked `MP_MEALS_REQUEST` rows
  - partial leftovers from `MP_LEFTOVER_CAPTURE_LI`
- still confirm end-to-end behavior live on staging

2. Harden Portioning milestone and final submit into the new step flow

- `5. Portioning` completion should open `6. Leftovers` after the milestone follow-up batch is started
- final record close happens only after `6. Leftovers`
- milestone follow-up should reconcile record/cache state cleanly when background actions finish
- inventory consumption must already be safe before or during the background follow-up path
- generic background follow-up support is now implemented, including:
  - configurable milestone dialogs
  - configurable submit-time background follow-up dialogs
  - immediate redirect after final submit
  - disabled `openUrlField` actions while required URLs are missing
- the remaining work is live end-to-end verification of this flow on staging

3. Add immediate datasource refresh after `6. Leftovers`

- newly created leftovers must become visible and usable without a hard refresh
- invalidate and refetch `Leftover Inventory Data`
- refresh persisted datasource cache with the authoritative server result

4. Add dietary applicability capture, derivation, and filtering

- derive dietary applicability when registering new `LE` records
- capture or derive dietary applicability when registering new `LP` records
- persist it on the inventory record
- expose it in datasource responses and local cache
- filter dish allocations in `2. Leftover bank` by compatibility for both `LE` and `LP`

5. Add end-to-end regression coverage for the full post-production flow

- Portioning milestone triggers background follow-up and advances to `6. Leftovers`
- `6. Leftovers` creates new inventory records correctly
- final submit reconciles consumed reservations and new leftovers together
- summary or home view behaves correctly while the PDF URL is still pending
- freshly registered leftovers appear without hard refresh
- dietary filtering only shows compatible dishes

### Can defer

1. Additional UI polish on compact sentence rows

- typography tuning
- spacing adjustments
- action density refinements

2. Additional diagnostics and telemetry

- follow-up timing instrumentation
- background-action completion diagnostics
- leftover-capture diagnostics for `6. Leftovers`

3. Broader generic stock features

- FIFO across multiple candidates
- residual inventory splitting into child rows
- advanced reservation conflict resolution
- cost or valuation logic

## Recommended implementation sequence

1. add the generic source-first allocation renderer for `2. Leftover bank`
2. add reusable inline ingredient summary rendering for both `Leftover bank` and `Leftovers`
3. validate and harden new leftover inventory record creation from `6. Leftovers`
4. add immediate datasource refresh after `6. Leftovers`
5. add dietary applicability capture, derivation, and persistence for newly created leftovers
6. filter `2. Leftover bank` dish allocations by leftover dietary applicability for both `LE` and `LP`
7. validate the full flow end to end on staging:
   - select from `2. Leftover bank`
   - run Portioning milestone follow-up
   - complete `6. Leftovers`
   - final submit
   - verify summary, PDF, email, pending-result behavior, immediate leftover refresh, and dietary filtering
8. add broader end-to-end regression coverage for the full post-production flow

## Final recommendation

The correct solution is not to further patch the current manual leftover overlay flow.

The correct solution is to:

- create leftover inventory as a shared common table
- let Meal Production write to it at the end of portioning
- let later Meal Production records consume from it through a dedicated leftover-selection step
- reuse the existing report-facing Meal Production internal model
- generalize the current cross-form mutation foundation into a reusable platform capability

That gives Community Kitchen the leftover solution it needs now and gives the platform its first reusable stock or inventory building block.
