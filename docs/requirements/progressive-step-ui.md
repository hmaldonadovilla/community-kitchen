# Meal Production Form

## Main flow for `MP_MEALS_REQUEST` line item group

The objective is to create a new way to display output after a user input is set. We aim to use the steps UI to define a mode where within a step we can set the content of line item rows one question at a time.
For each line item group row we will have a section with up to 2 rows. The first row will be the output row and will show the fields separated by a pipe, without boxes margin or padding, it will be like seeing text in a output paragraph. The second row will be the input row and will show the label and the input control for the question the user needs to answer. Whe the question is answered the output row will be updated with the new values and the input question will change be hidden or remain. Here's an example of a part of the expected flow:

### When the step starts we see the below

- fields in output line: `MEAL_TYPE` | `QTY`
- input question: `MP_IS_REHEAT`

row view

```text
Diabetic | 100
Will you used leftovers for this meal?: [Yes/No]
```

### After `Will you used leftovers for this meal?=No`

- the answer for `MP_IS_REHEAT` is `No` changed the value of `LEFTOVER_INFO` to `No left over`
- the answer for `MP_IS_REHEAT` is `No` generated a new line item row in the `MP_TYPE_LI` group with the fields with preset values using our existing selection effects functionality.
- `MP_IS_REHEAT` input field is hidden
- the value of `MP_TO_COOK` is set to the value of `QTY` using our existing derived value functionality. A label is defined to be rendered before the value of `MP_TO_COOK`.
- fields in output line: `MEAL_TYPE` | `QTY` | `LEFTOVER_INFO` | `MP_TO_COOK`
- a pencil icon is displayed next to the value of `LEFTOVER_INFO` if it's tapped we go back to the previous question.
- input question: `RECIPE` field which is a question from a `MP_MEALS_REQUEST` child group called `MP_TYPE_LI`. We are able to raise it in the parent view because it is defined as part of `overlayOpenActions` which has an `groupOverride` with `maxRows` set to 1.

row view

```text
Diabetic | 100 | No left over✏️ | To cook: 100
Select Recipe: [{{RECIPE}}]
```

### After recipe selection

- fields in output line: `MEAL_TYPE` | `QTY` | `LEFTOVER_INFO` | `MP_TO_COOK`
- input question: `RECIPE`
- a button to open the `MP_TYPE_LI` group overlay is displayed on the right of the `RECIPE` field, which remains visible and editable.
- if the user taps the pencil icon next to the `LEFTOVER_INFO` field, we go back to the previous question but we show a confirmation dialog before doing so. `Changing to leftovers will clear the selected recipe. Continue?`

row view

```text
Diabetic | 100 | No left over✏️ | To cook: 100
Select Recipe: [Pasta Tomato] [View/Edit]
```

### After Recipe [View/Edit] tap

- We open the `MP_TYPE_LI` group overlay, since we are viewing a single row in the overlay that cannot be modify we only see the body section of the overlay that contains the ingredients and instructions for the recipe, which are `MP_INGREDIENTS_LI` a subgroup of `MP_TYPE_LI`. The view mode is `html` and the template id is `bundle:mp.ing_recipe.html`, which we already have defined in docs/templates/mp.ing_recipe.html. In the overlay we will no longer show the edit button on the header section but directly in the body section of the overlay, as a pencil icon on the `Ingredients` tab. The overlay uses the existing close button on the top right corner as currently in place.

### After recipe selection the `Ingredients Needed` button appears at the end of all dietary type rows, it joins the rest of top level questions in the step

- This button has already been configured with the existing `BUTTON` field and appropriate visibility logic.

## Alternative when leftovers are used

### When the step starts we see the below

- fields in output line: `MEAL_TYPE` | `QTY`
- input question: `MP_IS_REHEAT`

row view

```text
Diabetic | 100
Will you used leftovers for this meal?: [Yes/No]
```

### After `Will you used leftovers for this meal?=Yes`

- After tapping on Yes, without additional clicks the overlay opens showing the style of UI as for the `MP_MEALS_REQUEST` questions but this time it applies to the `MP_TYPE_LI` which is a child group of `MP_MEALS_REQUEST`. We are essentailly opening the same overlay as before but with a different groupOverride to focus on the `MP_TYPE_LI` rows where `PREP_TYPE` is `Entire dish` or `Part Dish`. Also this overlay has below the rows section a button to add a new rows on the right and button to go back on the left. The button to add rows is shown only when all the info for the 1st row has been completed.
- Here we are adding rows to the `MP_TYPE_LI` group.
- Since the group is empty, we see the 1st question and no output line yet.
- input question: `PREP_TYPE`, this overlay uses `groupOverride` to limit the options of the input control to the values of `PREP_TYPE`.

row view

```text
What type of leftover? {{PREP_TYPE}}
```

### After `PREP_TYPE="Entire dish"`

- fields in output line: `PREP_TYPE`
- we add a trash can icon 🗑️ to the right of the row if it's tapped we delete the row and the inital question is shown again.
- input question: `RECIPE` field is shown

row view

```text
Entire dish | Select Recipe: [{{RECIPE}}]    🗑️
```

### After Leftovers Recipe selection

- fields in output line: `PREP_TYPE` | Select Recipe: `RECIPE` [View/Edit]     🗑️
- in the output line the `RECIPE` field is shown as an editable input field and a button to open the view of the ingredients `MP_INGREDIENTS_LI`.
- input question: `PREP_QTY` field is shown

row view

```text
Entire dish | Select Recipe: [Pasta Tomato] [View/Edit]    🗑️
Enter Yield portions: {{PREP_QTY}}
```

### After Leftovers Recipe [View/Edit] tap

In this case the view mode is `html` and the template id is `bundle:mp.ing_recipe.html`, which we already have defined in docs/templates/mp.ing_recipe.html. In the overlay we will no longer show the edit button on the header section but directly in the body section of the overlay, as a pencil icon on the `Ingredients` tab. In this case we will not show the `Instructions` tab. When clicking close you come back to the leftovers selection question view. I assume that this will be the same overlay but the view are just showing full screen and hiding the non relevant content. The ingredients

### After Leftovers Yield portions input

- fields in output line: `PREP_TYPE` | Select Recipe: `RECIPE` [View/Edit] | `PREP_QTY` portions 🗑️
- we add an edit icon ✏️ to the right of the `PREP_QTY` field if it's tapped we go back to the previous question no need to show a confirmation dialog since the change does not affect the rest of the data.
- a button to add another leftover is displayed on the right of the `PREP_QTY` field, which remains visible and editable.
- the overlay has a close button on the top right corner as currently in place.

row view

```text
Entire dish | Select Recipe: [Pasta Tomato] [View/Edit] | 10 portions✏️    🗑️
[BACK]                                                    [+ another leftover]
```

### Alternate lefovers flow, after `PREP_TYPE="Part Dish"`

- fields in output line: `PREP_TYPE`
- we add a trash can icon 🗑️ to the right of the row if it's tapped we delete the row and the inital question is shown again.
- the `selectorOverlay` multi-select search input control is shown with the options of the `MP_INGREDIENTS_LI` group.
- the selected ingredients are displayed in the output line as a list of ingredient names `ING` fields separated by a comma.

row view

```text
Part dish | Tomatoes, Carrots, Onions, Peppers, Cauliflower    🗑️
```

## Comming back to the main flow from the leftovers flow

- fields in output line: `MEAL_TYPE` | `QTY` | `LEFTOVER_INFO` | `MP_TO_COOK`
- input question: `RECIPE`
- The `MP_TO_COOK` value has been adjusted using our existing derived value functionality.
- a trash can icon 🗑️ is displayed next to the `LEFTOVER_INFO` field if it's tapped we delete all the leftover rows and switch the initial`MP_IS_REHEAT` question to `No`, `LEFTOVER_INFO` is set to `No left over` and the rest of the information remains. no need to go back to the inital question. Also, the `No left over` text is shown with a pencil icon ✏️ to the right of it and if this is tapped we go back to the initial question.

row view

```text
Diabetic | 100 | Left over Yes🗑️ | To cook: 50
Select Recipe: [{{RECIPE}}]
```

## Apendix

### Risk 1 — Overlay jump breaks context

To mitigate the risk of breaking context when jumping to an overlay, we will use the following approach:

- define the 2 fields from the parent `MP_MEALS_REQUEST` group as title of the overlay. I our use case we will use `MEAL_TYPE` and `QTY` fields as follows:

```text
Leftovers for: {{MEAL_TYPE}} (Requested: {{QTY}})
```

### Risk 2 — Transition back to main flow is unclear

Show an informative dialog with a single Ok button to confirm the transition back to the main flow.
