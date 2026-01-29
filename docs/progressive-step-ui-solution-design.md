# Progressive Step UI - Solution Design and Implementation Plan

## Summary
This document describes a generic, step-scoped "row flow" capability for guided steps. It enables a two-row layout per line item row:
- Output row: plain text values separated by a pipe.
- Input row: a single prompt (question) at a time.

The design is configuration-driven, reusable across forms, and does not hardcode any kitchen-specific logic.

## Goals
- Allow guided steps to drive a row-by-row, one-question-at-a-time flow for line item rows.
- Render output as pipe-separated text with no box styling.
- Support prompts that come from parent rows, child rows, or embedded selector inputs.
- Support edit actions that can confirm, change values, delete rows, and jump back in the flow.
- Preserve existing guided steps behavior when rowFlow is not configured.
- Use existing UI components and typography rules (no new visual patterns).

## Non-goals
- Change core line item data model or add non-step usage of rowFlow.
- Redesign overlays or typography.
- Add new global navigation patterns.
- Recreate existing selection effects, derived values, overlay opens, or selector overlays.

## Reuse Existing Functionality (No Rebuilds)
Row flow must compose existing mechanisms instead of re-implementing them:
- Selection effects: use existing `selectionEffects` for row generation, deletes, and presets.
- Derived values: keep all computed values in `derivedValue` config; rowFlow only triggers recalculation.
- Overlay entry points: use `overlayOpenActions` and `openLineItemGroupOverlay` instead of new overlay logic.
- Selector overlay: reuse `LineItemMultiAddSelect` and existing selector overlay logic for embedded multi-select prompts.
- Visibility and gating: reuse `WhenClause`, `visibility`, and guided step row filters.
- Confirm dialogs: reuse existing confirm dialog mechanism (no new modal type).

Row flow only orchestrates these primitives and determines which prompt is active.

## Configuration Location
Row flow is step-scoped only:

```
steps.items[].include[]  // StepLineGroupTargetConfig
  .rowFlow
```

## Configuration Design (Generic)

### Row Flow Root
```
rowFlow:
  mode: progressive
  output:
    separator: " | "
    hideEmpty: true
    segments: [ ... ]
  prompts: [ ... ]
  actions: [ ... ]
  overlayContextHeader:
    fields: [ ... ]
```

### Output Segments
Each segment describes what appears in the output row.

```
output:
  segments:
    - fieldRef: "MEAL_TYPE"
    - fieldRef: "QTY"
    - fieldRef: "LEFTOVER_INFO"
      editActions: ["editLeftovers", "removeRow"]
    - fieldRef: "MP_TO_COOK"
      label:
        en: "To cook"
```

Segment options:
- fieldRef: string
  - Parent field: "QTY"
  - Child field: "childRef.RECIPE" (see references)
- label: LocalizedString, optional prefix before value.
- showWhen: WhenClause, optional visibility per segment.
- format:
  - type: "text" | "list"
  - listDelimiter: ", "
- editAction: action id (see actions)
- editActions: list of action ids (renders icons next to the segment)

### Prompts (Input Row)
Prompts define the current input question. The first prompt whose conditions are met and not completed is shown.

```
prompts:
  - id: "leftovers"
    fieldRef: "MP_IS_REHEAT"
    hideWhenFilled: true
  - id: "recipe"
    fieldRef: "childRef.RECIPE"
    keepVisibleWhenFilled: true
    input:
      kind: "field"
  - id: "ingredients"
    input:
      kind: "selectorOverlay"
      targetRef: "ingredientsRef"
      listField: "ING"
```

Prompt options:
- fieldRef: string, optional when `input.kind` is "field".
- input.kind:
  - "field": uses the standard field renderer.
  - "selectorOverlay": embeds a multi-select search input; selections create child rows.
- showWhen: WhenClause, optional.
- completedWhen: WhenClause, optional; default is field value non-empty.
- hideWhenFilled: boolean (default false).
- keepVisibleWhenFilled: boolean (default false).

### Row References (Child Paths)
References provide a stable mapping to child rows used by segments/prompts.

```
rowFlow:
  references:
    childRef:
      groupId: "MP_TYPE_LI"
      match: "first"
      rowFilter:
        includeWhen: { fieldId: "PREP_TYPE", equals: ["Cook"] }
    ingredientsRef:
      groupId: "MP_INGREDIENTS_LI"
      parentRef: "childRef"
```

Reference options:
- groupId: target line item group id.
- parentRef: optional parent reference for subgroup paths.
- match: "first" | "any" | "all" (default "first").
- rowFilter: StepRowFilterConfig, optional.

### Actions
Actions can be attached to output segments or row controls.

```
actions:
  - id: "editLeftovers"
    confirm:
      title: { en: "Confirm" }
      body: { en: "Changing this will clear related values. Continue?" }
      confirmLabel: { en: "OK" }
    effects:
      - type: "setValue"
        target: "MP_IS_REHEAT"
        value: ""
      - type: "deleteLineItems"
        targetRef: "childRef"
```

Effect types:
- setValue: set a parent or referenced row field.
- deleteLineItems: delete rows by reference and optional rowFilter.
- openOverlay: optional action to open a group overlay.

Jumping back in the flow is achieved by clearing the field that marks completion (setValue to empty), which causes the prompt resolver to return to the earlier prompt.

### Overlay Context Header (Risk Mitigation)
To reduce context loss when opening overlays, allow a header line composed from parent fields.

```
overlayContextHeader:
  fields:
    - fieldRef: "MEAL_TYPE"
    - fieldRef: "QTY"
      label: { en: "Requested" }
```

The overlay header uses existing header layout; no new typography.

### Transition Dialog (Risk Mitigation)
Some actions return the user to the main flow. Provide an informational dialog with a single OK action.

```
actions:
  - id: "returnToMain"
    confirm:
      style: "info"
      title: { en: "Returning" }
      body: { en: "You are returning to the main flow." }
      confirmLabel: { en: "OK" }
    effects: [ ... ]
```

## Row Flow Resolution (Domain Logic)
Create a pure resolver that returns:
- outputSegments (with display values)
- activePrompt
- rowActions

Resolution uses a row-scoped visibility context:
- Parent row values
- Top-level values (no cross-row scan)
- Line items for reference resolution

Algorithm:
1. Resolve references (child rows) using rowFilter and match.
2. Build output segments; skip empty if `output.hideEmpty`.
3. Determine prompt order; select the first prompt where:
   - showWhen matches
   - completedWhen is false
4. If no prompt is active, optionally show the last prompt if `keepVisibleWhenFilled` is true.

## UI Rendering
- Output row: text-only, pipe separator, no boxes or extra padding.
- Input row: existing field renderer, with label and control aligned.
- Selector prompt: embed existing multi-select search input; selections create child rows.
- Actions: use existing icon buttons (pencil, trash) with neutral styling.

No new typography or decorative styling is introduced.

## Overlay Detail Adjustments
Allow overlay detail view to customize:
- header context fields (overlayContextHeader)
- edit button placement (body vs header)
- hidden tabs for view mode (e.g., hide "Instructions")

Body actions in HTML templates:
- When `rowActions.editPlacement` is set to `"body"`, templates can add a button with `data-ck-action="edit"` to trigger edit mode from inside the HTML (e.g., on the Ingredients tab).
- `body.view.hideTabTargets` hides tab targets in bundled HTML templates that use `data-tab-target` / `data-tab-panel` attributes.

These options are configuration-driven and not tied to a specific form.

## Diagnostics
Add logs at two levels:
- Web form level: feature enabled, flow mode active.
- Feature logs: prompt changes, action triggered, overlay open, selection embedded.

Suggested events:
- lineItems.rowFlow.enabled
- lineItems.rowFlow.prompt.active
- lineItems.rowFlow.action.run
- lineItems.rowFlow.selector.add
- lineItems.rowFlow.overlay.open

## Risks and Mitigations
1) Overlay jump breaks context
- Mitigation: overlayContextHeader fields render a context line in the overlay header.

2) Transition back to main flow is unclear
- Mitigation: an informational confirm dialog with a single OK action before returning.

## Backward Compatibility
- rowFlow is optional and step-scoped. Existing steps render unchanged when rowFlow is not set.
- No changes to stored data schema.

## Implementation Plan

0) Feature reuse audit
- Map each requirement to existing primitives (selectionEffects, derivedValue, overlayOpenActions, selector overlay, confirm dialog).
- Document any gaps before adding new code.

1) Config schema updates
- Add `rowFlow` to StepLineGroupTargetConfig.
- Add `overlayContextHeader` and overlay detail view options.
- Update config_schema.yaml.

2) Domain logic
- Add resolver in `src/web/react/features/steps/domain/rowFlow.ts`.
- Unit tests for prompt selection, output segment formatting, references, selector summary.

3) UI integration
- Wire rowFlow into `FormView` step targets and `LineItemGroupQuestion` rendering.
- Render output row + input row with existing components.
- Embed selector multi-select as a prompt input.

4) Action handling
- Implement rowFlow action runner with:
  - confirmation dialog
  - setValue
  - deleteLineItems
  - openOverlay
- Ensure actions update visibility and prompt selection immediately.

5) Overlay detail enhancements
- Add overlay context header rendering.
- Add edit button placement control and tab visibility control.

6) Diagnostics
- Add web form and feature-level logs as required by dev_rules.mdc.

7) Documentation updates
- Update SetupInstructions.md, README.md, docs/requirements/change_log.md.

8) Tests and build
- Add tests for rowFlow resolver and UI smoke tests.
- Run `npm test` and `npm run build`.
