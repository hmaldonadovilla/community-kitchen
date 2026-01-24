# True nesting for line item groups

## Status

Proposed design.

## Summary

Enable line item groups to nest to any depth and allow full-page overlays for any nested group. This requires a path-based addressing model, recursive rendering and serialization, and template placeholder/directive support for deep group paths. The design keeps current configurations and templates working.

## Decisions

- `parentWhen` supports ancestor scope (not just immediate parent).
- Line-item clauses accept wildcard subgroup paths for any depth.
- Full-page overlays show breadcrumbs for nested groups.
- Full-page overlays can render a header section for parent rows and a body section for nested rows, with view/edit modes.

## Goals

- Support nested subgroups at any depth.
- Keep existing configs, records, and templates working without changes.
- Allow full-page overlay editing for any nested group.
- Preserve current behavior for validation, visibility, selection effects, and templating.
- Keep performance within current limits for large records.

## Non-goals

- No changes to the config sheet structure.
- No redesign of user workflows or form layout beyond nested group rendering.
- No breaking changes to existing placeholders or directives.

## Terminology

- Root group: a top-level LINE_ITEM_GROUP question.
- Subgroup: a nested line item group under a parent row.
- Group path: ordered list of subgroup ids under a root group.
- Group key: a stable string that identifies a specific group instance under a specific parent row path.
- Row path: the group key plus a row id.

## Proposed model

### Config

- `LineItemGroupConfig.subGroups` remains recursive.
- Every subgroup at any depth must define `id`. Siblings must be unique within the same parent.
- `LineItemGroupUiConfig` applies at any depth. In particular:
  - `ui.openInOverlay` controls full-page overlay for that group instance.
  - `ui.mode` and progressive settings apply per group instance.
- Add `ui.overlayDetail` (optional) to enable header/body layout for groups with subgroups.

### In-memory state

Keep `LineItemState` as a map but change keying to support depth.

Group key format:

- Root: `ROOT_GROUP_ID`
- Nested: `ROOT::parentRowId::SUB1` for level 1
- Deeper: `ROOT::parentRowId::SUB1::rowId::SUB2` (repeats `rowId::subGroupId` pairs)

Examples:

- `MEALS` (root group)
- `MEALS::rowA::INGREDIENTS`
- `MEALS::rowA::INGREDIENTS::rowB::BATCHES`

Row metadata:

- Keep `__ckRowId` as today.
- Add `__ckGroupKey` (group key for this row list).
- Add `__ckParentGroupKey` and `__ckAncestorGroupKeys` (array) to make ancestor resolution and cascading deletes deterministic.

### Persistence (payload shape)

Persist nested arrays inside parent row objects, recursively:

```text
MEALS: [
  {
    DISH: "Soup",
    INGREDIENTS: [
      { ING: "Carrot", BATCHES: [ { LOT: "A1" } ] }
    ]
  }
]
```

On load:

- Parse nested arrays into `lineItems` map using group keys.
- Attach `__ckGroupKey` and parent chain metadata to each row.

### UI and overlays

- Replace subgroup-only overlay handling with a generic group overlay keyed by `groupKey`.
- Overlay state should track:
  - `groupKey`
  - `title`
  - `parentChain` for breadcrumb display and for resolving ancestor values
- Group rendering must be recursive:
  - Render rows for the current group.
  - Render child groups inside each row (inline) or via overlay, based on `ui.openInOverlay`.
- Breadcrumbs are required for nested overlays and reflect the group path (root group label + subgroup labels).
- Overlay actions use neutral icon buttons or text labels; do not rely on emoji glyphs.

### Overlay detail layout (header + body)

When `ui.overlayDetail.enabled` is true on a group with subgroups, the full-page overlay uses a master-detail layout:

- Header section
  - Always table mode.
  - Renders the parent group rows (the group being edited).
  - Supports all existing add modes for the parent group.
- Body section
  - Renders a single target subgroup under the selected header row.
  - Supports all existing add modes for that subgroup.
  - Two display modes:
    - Edit mode: table layout.
    - View mode: custom HTML template.
  - The user switches modes via row actions labeled "View" and "Edit" (icon buttons are allowed, no emoji).
  - The body content is driven by the selected header row; if no row is selected, show an empty state.

Config shape:

```text
ui: {
  openInOverlay: true,
  overlayDetail: {
    enabled: true,
    header: {
      tableColumns?: string[],
      tableColumnWidths?: Record<string, string | number>,
      addButtonPlacement?: "top" | "bottom" | "both" | "hidden"
    },
    body: {
      subGroupId: "INGREDIENTS",
      edit: {
        mode: "table",
        tableColumns?: string[],
        tableColumnWidths?: Record<string, string | number>
      },
      view: {
        mode: "html",
        templateId: TemplateIdMap
      }
    },
    rowActions: {
      viewLabel?: LocalizedString,
      editLabel?: LocalizedString
    }
  }
}
```

Behavior details:

- Clicking "View" selects the row and renders the body in HTML view mode.
- Clicking "Edit" selects the row and renders the body in table edit mode.
- If the subgroup has its own subgroups, those continue to use their configured inline/overlay behavior within the body.

Low-level mock (text form, no emoji):

```text
## header

[+ Add leftover row]

---

|Type|Recipe|Action|
|---|---|---|
|Entire Dish|Bulgur Paste|View  Edit|
|Partial Dish|-|View  Edit|

## body

[search box selectorOverlay]

|Ingredient|Quantity|Unit|
|---|---|---|
|Bulgur|200g|g|
|Tomato|1|pc|
|Onion|1|pc|
|Garlic|2|clove|
|Olive Oil|1|tbsp|
|Salt|1|pinch|
|Pepper|1|pinch|
```

### Value resolution order

For field resolution in visibility/validation/option filters/derived values:

1. Current row values
2. Closest ancestor row values (nearest parent first)
3. Top-level form values
4. System fields

Section selectors:

- Replace `subgroupSelectors` with `groupSelectors[groupKey]` for any depth.

### Selection effects

- Target resolution must accept depth:
  - Default behavior remains: a subgroup id resolves relative to the current group path.
  - Add `targetPath` for explicit deep targets:
    - `targetPath: ["INGREDIENTS", "BATCHES"]` means "descend from current group to these subgroups."
- Cascade delete should use `__ckAncestorGroupKeys` to locate descendants at any depth.

### Line-item conditions (visibility and validation)

Extend `lineItems` clauses to support depth and wildcards:

```text
lineItems: {
  groupId: "MEALS",
  subGroupPath?: "INGREDIENTS.BATCHES" | ["INGREDIENTS", "BATCHES"],
  match?: "any" | "all",
  when?: WhenClause,
  parentWhen?: WhenClause,
  parentScope?: "immediate" | "ancestor",
  parentMatch?: "any" | "all"
}
```

Wildcard rules:

- `*` matches a single subgroup level.
- `**` matches any depth (including zero levels).
- Examples:
  - `subGroupPath: "**"` matches any subgroup depth under the root group.
  - `subGroupPath: ["INGREDIENTS", "**"]` matches INGREDIENTS and any deeper path.

Ancestor scope:

- `parentScope: "immediate"` evaluates `parentWhen` against the direct parent row only.
- `parentScope: "ancestor"` evaluates `parentWhen` against any ancestor row (nearest to root).

## Template placeholders and directives

### Placeholder grammar

Allow variable depth paths:

- `{{GROUP.FIELD}}`
- `{{GROUP.SUB1.FIELD}}`
- `{{GROUP.SUB1.SUB2.FIELD}}`

The first segment is always the root group id. The final segment is the field id. Middle segments are subgroup ids.

### Consolidated placeholders

Extend to deep paths:

- `{{CONSOLIDATED(GROUP.SUB1.SUB2.FIELD)}}`
- `{{COUNT(GROUP.SUB1.SUB2)}}`
- `{{SUM(GROUP.SUB1.SUB2.FIELD)}}`
- `{{CONSOLIDATED_ROW(GROUP.SUB1.SUB2.FIELD)}}`

### Table directives

Extend to deep paths:

- `{{ROW_TABLE(GROUP.SUB1.SUB2.FIELD)}}`
- `{{GROUP_TABLE(GROUP.SUB1.SUB2.FIELD)}}`
- `{{CONSOLIDATED_TABLE(GROUP.SUB1.SUB2)}}`

Table scope rules:

- The deepest subgroup path found in the table determines the row set for that table.
- A table must reference only one root group and one subgroup path; mixed paths are ignored (same as current behavior).
- `CONSOLIDATED_TABLE` always applies to the resolved subgroup path (or root group if no subgroup path is present).

### Placeholder map generation

`collectLineItemRows` must return:

- Root group rows keyed by `GROUP`.
- Flattened rows for each subgroup path keyed by `GROUP.SUB1` and `GROUP.SUB1.SUB2`.
- Each flattened row should include `__parent` and `__ancestors` arrays to support token resolution.

### Backward compatibility

- Existing 1-level subgroup tokens remain valid.
- Label slug aliases remain supported, but ID tokens are preferred.
- Existing `CONSOLIDATED_TABLE(GROUP.SUBGROUP.FIELD)` inputs keep working by ignoring the field suffix.

## Feature impact (needs and changes)

- Config schema and validation: enforce `id` at every subgroup depth; validate uniqueness within each parent.
- UI rendering: replace subgroup-only overlay with recursive group rendering and overlay support at any depth.
- Overlay detail layout: add header/body rendering, row selection, and view/edit mode state.
- Breadcrumbs: render group path for all nested overlays.
- Group selectors: store selector state by `groupKey` and resolve per depth.
- Row operations: update add/remove, collapse/expand, and auto-add logic to accept deep group keys.
- Selection effects: add deep path targeting and cascade delete via ancestor keys.
- Validation: recursive subgroup validation, including dedup rules and required fields at any depth.
- Visibility and rules: extend `lineItems` clauses to accept `subGroupPath`, wildcards, and `parentScope`.
- Option filters and non-match warnings: resolve dependencies via ancestor chain.
- Value maps and derived values: apply recursively and allow ancestor field references.
- Autosave and submit payload: recursive serialization and URL-only file sanitization for deep groups.
- Summary view: render nested groups recursively and consolidate values across paths.
- Template engine: update placeholder parsing, row extraction, table directives, consolidated rows, and ALWAYS_SHOW handling to accept deep paths.
- Template migration: update placeholder migration utilities to handle deep paths.
- Tests: add coverage for path parsing, recursive serialization, template directives, selection effects, validation, and visibility at depth.

## Migration and compatibility

- Existing records remain valid; new code must read one-level subgroup data unchanged.
- New deep nesting uses the same nested array shape, so exported records remain human readable.
- Template tokens remain compatible; deep paths are additive.
