# Meal Production – Progressive Disclosure Wireframe (Low Clutter)

This wireframe proposes a progressive disclosure layout optimised for mobile use and zero training. Meal types are collapsed by default and expanded only when the user taps a line. All requirements are respected, including Actual portions appearing after Core temperature.

## Header (always visible) – Some fields are defined to be part of the header

|Field|Value|
|---|---|
|Customer|Croix-Rouge Belliard|
|Service|Dinner|
|Cook(s)|Marie, Jason, Alex|
|Production date|Thu, 25-Apr-2024|

Label and value on the same row

## Meal types (LineItemGroup) – Collapsed view (default)

|Field|Value|
|---|---|
|Diabetic|Requested: 5|
|Normal|Requested: 55|
|No-Salt|Requested: 3|
|Vegan|Requested: 0 (greyed)|
|Vegetarian|Requested: 10|

Each collapsed row shows 2 fields max, we can define if the label of the field can be omitted.

User taps a meal type row to expand it and enter details. Lines with Requested portions = 0 are shown greyed out and cannot be expanded.

## Expanded view – Example: Vegetarian

|Field|Value|
|---|---|
|Requested portions|10 (editable)|
|Leftover used?|NO (user may change to YES)|
|Recipe used|Dahl|
|Core temperature|72 °C + Photo|

Label and value on the same row.

Recipe is a special field that triggers `selectionEffects` for a subgroup, therefore a button is added next to the field to open a full-page overlay to view and configure the subgroup items. If there's no field with selectionEffects on subgroups, we will just see buttons corresponding to the subgroup labels, which whould open the full page overlay.

## Actions

[back] button goes back to the summary or list view. [ View draft report ]

Draft report button is disabled if any validation rule is not fulfilled. Draft report is equivalent to submit.
