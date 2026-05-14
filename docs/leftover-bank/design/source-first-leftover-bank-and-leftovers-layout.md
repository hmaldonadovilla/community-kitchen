# Source-First Leftover Bank And Leftovers Layout

## Purpose

This document defines the UX and implementation direction for the next major layout change in Meal Production:

- `2. Leftover bank` becomes leftover-first instead of dish-first
- `6. Leftovers` becomes sentence-based and consistent with the way leftovers are selected earlier in the flow

This is a UI and interaction design companion to:

- `docs/leftover-bank/implementation-plan.md`
- `docs/leftover-bank/design/utilisation-lifecycle-design.md`

## Requirement summary

The current `Leftover bank` step renders:

- one meal row at the top level
- a repeated leftover list inside each meal row

The desired behavior is the inverse:

- one leftover row at the top level
- one or many dish allocations inside each leftover row

This should support two modes:

1. Single-dish mode

- if only one dish is relevant for the record, show the leftover list once
- the user only needs to select the leftover and define its usage

2. Multi-dish mode

- if multiple dishes are relevant, show the leftover list once
- each leftover row contains one allocation row per eligible dish
- the user can allocate the same leftover to several dishes while stock remains available

Additionally:

- the `Ingredients` information should not open as a full-page overlay
- the ingredient information should be shown inline, in the same compact readable way as summary/report views
- `6. Leftovers` should use the same sentence-style presentation pattern for registering newly produced leftovers
- newly registered leftovers must become immediately usable in the frontend without a hard refresh
- leftovers must be filtered by dietary applicability in `2. Leftover bank`

## Current state

Today the active staging implementation is structurally meal-first:

- top-level group: `MP_MEALS_REQUEST`
- nested bank rendering: `dataSourceRows` under each meal row
- local row state per copied bank row:
  - `LEFTOVER_SELECTED`
  - `LEFTOVER_USE_QTY`
  - `LEFTOVER_USAGE_MODE`
- generated output rows:
  - `MP_TYPE_LI` under the current meal row

This model works for utilisation-aware selection, but it duplicates the same leftover record across several meal rows and makes the UI less intuitive when the same leftover is split across dishes.

Two additional gaps are now also in scope:

- after `6. Leftovers`, newly created bank rows are saved on the server but the local datasource cache is not refreshed immediately, so the user cannot reuse those leftovers without a hard refresh
- leftover bank does not yet carry dietary applicability metadata, so `2. Leftover bank` cannot restrict leftovers to compatible dishes

## Can this be done with configuration only?

### Short answer

No, not cleanly.

### Why not

The current `dataSourceRows` feature assumes:

- one datasource row is rendered inside one parent row
- local selection state belongs to that copied row
- generated output belongs back to that same parent row

The desired layout requires a different generic relationship:

- one datasource row rendered once
- many target rows from another group rendered beneath it
- allocation state tracked per `source row x target row`
- generated output written to the corresponding target row's output subgroup

That is not just a config inversion. It is a different rendering and state model.

### What configuration can still do

Configuration can still define:

- the source datasource
- the target group to allocate into
- which fields define quantity, mode, labels, and availability
- how outputs are generated into `MP_TYPE_LI`
- how ingredient summaries are displayed

But the UI pattern itself needs a new generic feature.

## Proposed generic feature

Introduce a new generic renderer pattern, for example:

- `dataSourceAllocations`

or

- `dataSourceRows.presentation = "sourceFirstAllocations"`

### Generic behavior

The feature should support:

- one source row set from a datasource
- one target row set from another line item group
- one allocation editor per `source row x target row`
- per-allocation local fields such as:
  - selected
  - quantity
  - mode
- output generation into a target row subgroup, such as `MP_TYPE_LI`
- shared optimistic availability updates across all allocations in the current record

### Why this is reusable

This is not specific to leftovers. It is a reusable "bank allocation matrix" pattern:

- one resource row
- many consumer rows
- per-consumer allocation state
- shared availability constraint

Other future use cases could include:

- ingredient allocation
- transport slot allocation
- shared equipment utilisation

## Functional model

### Source rows

Source rows come from the bank datasource:

- one row per leftover item
- rendered once
- show source-level availability
- show source-level ingredient summary inline

### Target rows

Target rows come from `MP_MEALS_REQUEST`:

- one row per eligible meal type
- rendered under each leftover row
- eligibility can be filtered by quantity, meal type, or other rules

### Allocation rows

Each allocation row represents:

- one leftover item
- one meal row

Allocation state should be keyed by:

- source leftover id
- target parent row id

This allocation state must drive:

- utilisation updates
- `MP_TYPE_LI` generation
- `MP_TO_COOK` recalculation

### Dietary applicability

Each leftover bank record should expose the dietary applicability it supports.

This is required so `2. Leftover bank` can filter the dish allocation rows that appear under each leftover.

For `entireDish` leftovers created in `6. Leftovers`:

- dietary applicability should be derived from the cooked dish ingredients
- the derived dietary values must be saved on the bank record

For `partialDish` leftovers:

- dietary applicability must also be captured and saved on the bank record
- it should be derived using the same generic ingredient classification rules wherever possible
- if the ingredient-based derivation is not sufficient for a given partial leftover, the capture flow must still require or allow explicit dietary applicability input so the saved bank record is complete

Recommended bank field:

- `LEFTOVER_DIETARY_APPLICABILITY`

Recommended shape:

- multi-value text field, stored in a deterministic normalized format
- examples:
  - `Vegan`
  - `Vegetarian`
  - `Standard`
  - `Diabetic`

The same field should be projected into the datasource cache and used by the allocation renderer.

## UX design

## `2. Leftover bank`

### Single-dish mode

If only one target dish is relevant:

```text
2. Leftover bank

[ ] Greek stew | LE-1 • 10 portions available
    Olive oil, Garlic paste, Tomato paste, Tomato pulp, Black pepper, Paprika,
    Salt, Green beans - frozen, Potato, Onion, Oregano - dried
    [Reheat|Combine] [ 5 ] portions

[ ] Salt | LP-1 • 250 gr available
    Salt
    Use [ 250 ] gr
```

### Multi-dish mode

If multiple target dishes are relevant:

```text
2. Leftover bank

Greek stew | LE-1 • 10 portions available
Olive oil, Garlic paste, Tomato paste, Tomato pulp, Black pepper, Paprika, Salt,
Green beans - frozen, Potato, Onion, Oregano - dried
    Vegetarian   [ ] [Reheat|Combine] [ 3 ] portions
    Vegan        [ ] [Reheat|Combine] [ 2 ] portions
    Standard     [ ] [Select mode....] [   ] portions

Bulgur & vegetable warm salad | LE-2 • 6 portions available
Salt, Turmeric, Paprika, Cumin, Ginger paste, Onion, Broccoli, Bulgur,
Chickpeas - dry
    Vegetarian   [ ] [Reheat|Combine] [ 2 ] portions
    Vegan        [ ] [Reheat|Combine] [ 1 ] portions
    Standard     [ ] [Select mode....] [   ] portions

Salt | LP-1 • 250 gr available
Salt
    Vegetarian   [ ] Use [ 50 ] gr
    Vegan        [ ] Use [100 ] gr
    Standard     [ ] Use [   ] gr
```

### Design notes

- the ingredient summary replaces the full-page overlay for the common path
- a secondary detail affordance can still exist if long ingredient lists need expansion
- the top line should remain concise and scan-friendly
- the per-dish allocation rows should stay sentence-based, not table-heavy
- each leftover row should only show compatible dishes
- incompatibility should be resolved before rendering, not by showing disabled rows where possible

### Source-first filtering behavior

The source-first allocation renderer should support target filtering based on source row metadata.

For Meal Production:

- each target meal row already has a dish type, such as `Vegetarian`, `Vegan`, `Standard`, or `Diabetic`
- each leftover source row should expose `LEFTOVER_DIETARY_APPLICABILITY`
- the allocation row is shown only when the target meal type is included in that applicability set
- this filtering rule applies to both:
  - `LE` entire-dish leftovers
  - `LP` part-dish leftovers

If a leftover is compatible with exactly one dish:

- render the simplified single-dish mode
- no redundant dish matrix is needed

## `6. Leftovers`

`6. Leftovers` should follow the same readable sentence pattern.

### Entire-dish leftovers

```text
6. Leftovers

Vegetarian | Greek stew | Olive oil, Garlic paste, Tomato paste, Tomato pulp,
Black pepper, Paprika, Salt, Green beans - frozen, Potato, Onion,
Oregano - dried | [ 5 ] portions

Vegan | Bulgur & vegetable warm salad | Salt, Turmeric, Paprika, Cumin,
Ginger paste, Onion, Broccoli, Broccoli - frozen, Bulgur,
Chickpeas - dry | [ 3 ] portions
```

### Partial leftovers

Partial leftovers should remain a separate section because their shape is different:

```text
Part dish leftovers

[ Add leftover ]

Ingredient [ Chicken wings ]  Category [ Animal protein Halal ]
Allergen [ None ]  Qty [ 250 ]  Unit [ gr ]
```

### Design notes

- for `LE`, the row should show:
  - meal type
  - recipe
  - ingredient summary
  - leftover portions input
- the input should be blank by default, not prefilled with `0`
- the interaction should stay sentence-like and compact

### Freshly registered leftovers

After the user saves `6. Leftovers`:

- newly created bank records must be pushed into the client datasource state immediately
- or the leftover datasource must be invalidated and refetched automatically

This is required so the user can:

- continue using the flow without a hard refresh
- immediately see and use the leftovers that were just registered

Recommended behavior:

- after successful leftover creation, invalidate `Leftover Bank Data`
- refetch it in the background
- update persisted local cache with the refreshed authoritative dataset

This should stay generic and datasource-driven, not Meal Production specific.

## Ingredient summary behavior

The current full-page `Ingredients` overlay is not the right primary interaction for this flow.

### Recommended behavior

- inline ingredient summary in the row by default
- truncate visually after a configurable length if needed
- provide optional expand/collapse inline when the list is long
- keep the existing full overlay capability only as a secondary fallback if truly needed

### Generic implementation direction

Introduce a reusable "inline ingredients summary" presentation for subgroup-backed ingredient rows:

- input:
  - subgroup path or source array
  - fields to display, usually `ING`
- output:
  - comma-separated sentence
  - configurable max items / max characters
  - optional `Show more` toggle

This should be usable in:

- `Leftover bank`
- `Leftovers`
- summary screens
- report previews

For the `Leftovers` step, the summary should come from the cooked row's `MP_INGREDIENTS_LI`.

For the `Leftover bank` step, the summary should come from the bank row:

- `LEFTOVER_INGREDIENTS_LI` for entire-dish leftovers
- fallback ingredient fields for part-dish leftovers

## Proposed configuration shape

The exact schema may evolve, but the generic config should roughly express:

```json
{
  "dataSourceAllocations": [
    {
      "id": "leftoverBank",
      "source": {
        "dataSourceId": "Leftover Bank Data",
        "keyFieldId": "LEFTOVER_ID",
        "dietaryFieldId": "LEFTOVER_DIETARY_APPLICABILITY"
      },
      "targets": {
        "groupId": "MP_MEALS_REQUEST",
        "rowKeyFieldId": "__ckRowId",
        "labelFieldId": "MEAL_TYPE",
        "dietaryFieldId": "MEAL_TYPE"
      },
      "allocation": {
        "selectedFieldId": "LEFTOVER_SELECTED",
        "quantityFieldId": "LEFTOVER_USE_QTY",
        "modeFieldId": "LEFTOVER_USAGE_MODE"
      },
      "availability": {
        "sourceQuantityFieldId": "LEFTOVER_QTY",
        "sourcePortionsFieldId": "LEFTOVER_PORTIONS"
      },
      "output": {
        "targetGroupId": "MP_TYPE_LI",
        "targetKeyFieldId": "LEFTOVER_ID"
      },
      "presentation": {
        "mode": "sourceFirst",
        "singleTargetMode": "compactSelection",
        "multiTargetMode": "allocationRows",
        "ingredientSummary": {
          "sourcePath": "LEFTOVER_INGREDIENTS_LI",
          "fallbackFields": ["LEFTOVER_INGREDIENT"],
          "displayFieldId": "ING"
        }
      },
      "targetFilter": {
        "type": "intersects",
        "sourceFieldId": "LEFTOVER_DIETARY_APPLICABILITY",
        "targetFieldId": "MEAL_TYPE"
      },
      "postMutation": {
        "invalidateDataSources": ["Leftover Bank Data"],
        "refreshDataSources": ["Leftover Bank Data"]
      }
    }
  ]
}
```

## Implementation sequence

1. Add the new generic source-first allocation renderer.

- do not hardcode it for Meal Production
- make source rows, target rows, and allocation fields configurable

2. Reuse the existing utilisation service.

- keep the current bank utilisation sync model
- keep optimistic cross-row availability logic

3. Reuse the existing output generation model.

- allocations should still generate `MP_TYPE_LI` in the target meal row

4. Add reusable inline ingredient summary rendering.

- use it in both `Leftover bank` and `Leftovers`

5. Add immediate datasource refresh after `6. Leftovers`.

- invalidate and refresh `Leftover Bank Data`
- update local persisted cache without requiring hard refresh

6. Add dietary applicability capture, derivation, and filtering.

- derive dietary applicability from cooked dish ingredients when creating `LE` bank
- capture or derive dietary applicability when creating `LP` bank
- persist `LEFTOVER_DIETARY_APPLICABILITY`
- expose it through datasource projection
- filter target dishes in `Leftover bank` by compatibility for both `LE` and `LP`

7. Refactor `6. Leftovers`.

- keep `LE` sentence rows
- keep `LP` in its own capture section
- avoid preloading `0`

8. Validate the full flow.

- single-dish records
- multi-dish records
- concurrent utilisations
- final leftover creation
- immediate reuse of newly registered leftovers
- dietary filtering correctness

## Recommendation

Proceed with a new generic feature, not a config-only inversion.

That feature should be:

- source-first
- target-aware
- utilisation-aware
- output-generating
- reusable outside Meal Production

Trying to force this through the existing meal-first `dataSourceRows` shape would produce a fragile implementation and increase future maintenance cost.
