# Change log

## Bugs

- ck-bug-1: when entering text in a paragraph or text field that is not enabled right now because of ordered submit validation, the user gets sent in focus to the next field, which is disconcerning, the right approach is to highlight the field so the user can go in focus to start editing. Today the text that is being input starts to appear on the next field and the users does not understand what happened.
  >**DONE - Cursor**
- ck-bug-2: the injected paragraph disclaimer must have a setting to be editable or not.
  >**DONE - Cursor**
- ck-bug-3: the auto save dialog needs to allow a single button instead of two. Ideally we would use the existing react component and make it configurable to only have 1 button.
  >**DONE - Codex**
- ck-bug-4: when completing the info of a line item group and closing the overlay (on ordered submission mode), the overlay pill still highlights the group as `needing attention`. When the error message is shown legitimately, we need be able to configure the error message.
  >**DONE - Codex**
- ck-bug-5: when entering on focus in a paragraph input control it is automatically zooming in iOS, please adjust the behavior to not zoom in. Also the injected disclaimer counts for submit validation as if the user had already entered text, which is not the case.
  >**DONE - Cursor**
- ck-bug-6: there seems to be a bug with the banner that appears when file uploads are pending and the user leaves the edit view to the list view. It is being triggered on a form that does not have file upload fields and even when the user has not entered any data. We should also consider removing the banner altogether, what are the risk?
  >**DONE - Codex**
- ck-bug-7: when checking for duplicates on create button, including `createRecordPreset`, disable the list view to prevent the user from navigating to existing records and compiling the actions done on server side.
  >**DONE - Codex**
- ck-bug-8: tested using Steps UI. Ordered validation (`enforceFieldOrder`) is not working as expected on steps UI for line item groups that open in regular way. For subgroups in overlay the order validation works as expected. However for subgroups in overlay it is allowed to close the overlay without completing the required fields, which is not the case for line item groups in overlay. Finally we need a config setting to define if closing the overlay without completing the required fields is allowed or not.
  >**BACKLOG**
- ck-bug-9:
  - when opening records we are unnecesarrily saving the record even if the user didn't change any data. I think this is trigering some cache inconsistencies and showing the banner to refresh the record unnecessarily.
  - we need to prevent racing conditions that would show the banner to refresh the record or the one asking to wait for file uploads to complete before leaving to the list view. I thing the best solution is that when the user taps the home button to leave the edit or summary view to the list view, we should block the navigation, disable al editing actions and show a banner asking to wait because we saving. No need to specify what is being saved or give options, just a simple message like "Please wait while we save your changes...". We use the blocking overlay dialog without buttons or posibility to dismiss it.
  >**BACKLOG**
- ck-bug-10: The dedup validation of warning messages in the overlay line item and subgroup view is not working as expected.
  >**BACKLOG**
- ck-bug-11:
  - In the line item overlay the `selectorOverlay` search box has 2 `x` to remove the search input text, one to clear the search results and one to clear the search query. We should only have the one to clear the search results.
  - The warning messages are not clearly defined, I would prefer that we add footnote markers that point to the warning section. Make sure to account for the `nonMatchWarningMode` modes as sometimes the footnotes and markes need to be numbered.
  - Warning validations should highlight the field with orange border similarly as we do on error validations. This is valid only for fields that are editable. Non editable fields need to use the foot note markers.
  - The icon to remove rows should be a trash can icon.
  - The section selector needs a setting to hide the label.
  - Move the footnote markers next to the field labels.
  >**DONE - Cursor**
- ck-bug-12: EXCLUDE_WHEN in follow-up templates compared formatted values (e.g., Yes/No → ✔/❌), causing rows to skip exclusion.
  >**DONE - Codex**

## technical requirements

- ck-1: initial load performance improvements.
- ck-2:
  - hide table/cards toggle in list view.
  - We need a legend at the bottom of the list view to explain the statuses use static legend definition in issue 6.
  - We need to normalise statuses values using the existing `statusTransitions` config. We need to have an inProgress and reOpened statuses (which it's value can be set per form, similarly as we do with `onClose`). Also please remove harcoded logic to drive visibility of elements based on the `Closed` status value, the logic needs to be driven by the configured value on statusTransitions. For example the edit button on summary view is not visible if the status is at `onClose`, regarless of it's label value. The list view standard actions on rows and cards that are driven by the status value will use `inProgress` to land on the edit view and `onClose` to land on the summary view. The search bar will allow search by status compiling the values per language that are defined on the `statusTransitions` config and remove the logic that uses the `set` key on custom buttons with `updateRecord` action.
  - We need a status pill for each result card to display the status. This pill needs to appear in all other pages inclucing edit and summary views. For summary view add the pill to the native sumary view and to the html summary template that we already have.
  - Change `Search recipes (name, dietary category, or status)` to `Search recipes (name, dietary, or status)`.
  -Add a list view title `You can search by recipe name, dietary category or status`.
  > **WIP - Cursor**
- ck-3: make cards non clickable in cards mode in list view page, only the footer actions are clickable.
- ck-4: create smart search mode to:

  ```text
  Recipe name + Dietary category + Status, then remove the advanced search icon.

  What the user should be able to type (single field):
  • Recipe name keywords: “mushroom”, “couscous”
  • Dietary keywords: “diabetic”, “vegan”, “vegetarian”, “standard”, “no‑salt” (if kept)
  • Status keywords: “active”, “inactive”, “draft”
  • Combined: “mushroom diabetic”, “draft couscous”, “inactive vegan”

  Technical implementation (for Hector):
  1) Build one “search index text” per recipe record:
     searchText = lower( recipeName
                       + " " + join(applicableDietaries, " ")
                       + " " + status )
  2) When the user types in the search box:
     • Split the query into tokens (space‑separated).
     • Keep only meaningful tokens (ignore very short tokens if needed).
     • Filter recipes where ALL tokens exist in searchText.
  3) Add simple synonym mapping:
     • “available” → active
     • “in progress” → draft
     • “disabled” → inactive
  4) If you want a future‑proof format, also accept typed prefixes:
     • status:active, status:draft, diet:vegan
     (Implementation: detect “key:value” tokens and filter on the right field directly.)

  Result: users never need to open an “advanced search” panel; no training; one fast interaction.
  ```

- ck-6: create custom button action to delete a record. And define dynamic legends based on list results.
- ck-7: define optional max input length for fields and auto expand text and paragraph area vertically.
- ck-9: helper text on all fields, this is localizable and can be set below the field label or inside the input control. Define number of decimals allowed on numeric input fields, 0 means integer only. On numeric field if the user is entering a non numeric character, the field should show a warning because today the input is blocked but the user does not understand why.
- ck-10: LineItemGroupConfig.label should also modify the pill content for the line item groups shown in overlay as it does today for subgroups. Avoid showing count.
- ck-11: smart search on section selector fields.
  - Improve the existing search at CHOICE and section selector fields (`choiceSearchEnabled`) so it covers multiple fields at same time with one input field. The idea is to use the ref: functionality that we already have in place for options. For example if you check our master data in `master_data/IngredientsOptions.csv` you will see that we have columns on the right that define each option's category, dietary applicability, supplier, etc... We can use this to build a search index that covers all these fields at same time. This search index will be used to filter the options in the section selector field.
  - Create a new UI component for line item groups and subgroups that shows the rows as a table.
  - Functional requirements, example for the community kitchen use case:
    Update ingredient selection to support the real kitchen workflow (build the list first, then fill quantities)

    1) One search field that searches across:
    • Ingredient name
    • Ingredient category (e.g., “Fresh vegetables”, “Spices / herbs / condiments”)

    2) Search results must allow MULTIPLE SELECTION before adding:
    • Example: user types “spice” → results show cumin, paprika, curry, pepper, etc.
    • User taps multiple items (checkbox or “+” on each line) then clicks one button: “Add selected (n)”.
    This prevents repeating “search → add → search → add” for 10+ items.

    3) After items are added, show a compact ingredient list where each row has ONLY:
    Ingredient | Quantity | Unit | Remove
    (Quantity + Unit appear only after the ingredient exists on the recipe.)

    4) Category and Allergen are VIEW‑ONLY:
    • On the html summary template for the recipe form (`docs/templates/recipes.summary.html`), show the Allergen column only when at least one ingredient has an allergen value different than `None`, otherwise hide the entire column.
  > **WIP - Codex**

- ck-13: on option filter via array, we need to configure a modality were we match via `or` instead of `and` by default. This would allow to add ingredients that matches part of the diatery restrictions. In this case we display a warning message. These elements will marked with a warning flag that contains the non-satisfied keys in memory and server side. Then, we will add a non editable message in the paragraph field summarizing, per non-satisfied key, the list of elements that are not satisfying the restrictions.

  ```text
  Example:
  - For Vegan recipe, do not use: Chicken, Beef, Pork, Eggs
  - For Diabetic recipe, do not use: Sugar, Honey, Syrup, Sweetener
  ```

  > **DONE - Cursor**
- ck-14: verbatim requirements for html summary template.
- ck-15: create fields to enter createdBy and updatedBy, free text or auto set with the user email, when user is authenticated.
- ck-16: prevent deactivation (custom button action) of a record if it is being used as source data for another record which has not a finalised status. I think easiest check would be to write a blocked flag on the dataSource record when the other form is using it. The block will be released when the ofether form finalises it's data entry process.
  > **CANCELLED**
- ck-17: submit top error message must be configurable and localizable per form. Fields need to be entered in order, if a field a required field is missing input, when the user tries to enter a value for a later field, the form will block will trigger submit validation so the user can enter the value of the field that was missed. This is control via a config setting at the form level.
  > **DONE - Cursor**
- ck-18: one time overlay blocking banner on create/edit/copy to explain to the user that auto save is on and that it works in the background and indicators are on the top right corner of the form. We would save in browser that the user has seen the banner so we don't show it again.
  > **DONE - Codex**
- ck-20: Disable submit button until all required fields are valid. Tooltip: “Complete all required fields to activate.”
  > **DONE - Cursor**
- ck-21: add status badge in edit view
  > **DONE - Cursor**
- ck-22: fix button issue `[Info] [ReactForm] – "list.openButton.ignored" – {openButtonId: "RE_OPEN", reason: "unsupportedAction"}` -> action is `updateRecord` which works fine in summary view but fails in list view, cards mode.
  > **DONE - Cursor**
- ck-23: the search field `x` icon should not clear the search results, add a separate control for that underneath the search field. This separate control appears only when the search results are not empty.
  > **DONE - Cursor**
- ck-24: remove default empty line items in line item groups.
  > **DONE - Cursor**
- ck-25: add buttons below the search bar on cards mode in list view page, within the body of the page. They are displayed when search results are not showing. They are used to trigger predefined search queries. These bottons should have a new action type `listViewSearchPreset` that will be used to trigger the predefined search queries.
  > **DONE - Cursor**
- ck-26: add `source` sort type to the listViewSort config
- ck-27: support placeholders in the email subject
- ck-28: remove the translate stuff to english button on google sheet
- ck-29:
  - Alphabetical order on ingredients list on summary view
  - We need to prevent duplicate ingredient entries, so validation dedup rules are needed within a line item or subgroup
  > **DONE - Cursor**
- ck-38: Review the full application and adjust the UI according to the guidelines defined in `docs/design_patterns/style_guide.md`
  > **WIP - Codex**
- ck-40 & ck-41:
  - Adjust inital visual on page load according to the screenshot.
  - On preset search, show the search results without entering the value in the input search box, ideally presets works via advance mode even if the main search box is on text mode.
  - Remove the clear results button, it has no utility because we can always type and new query that will adjust the results.
  - Keep the preset buttons always visible. Even if results are showing, this allows the user to change trigger a different preset with one click.
  - Change status pill color to avoid green, red and orange, keep neutral colors but distinct.
  - In legend we need controls to define part of the text message to show as a pill and the color used for the pill. This way we can showthe legend elements to be tied to the same pills that are shown on the page.
  > **DONE - Cursor**
- ck-42:
  - the search box should not show results before 1st character is entered.
  - use the full height below the search box to show the overlay results.
  > **DONE - Codex**
- ck-45: Line item overlay
  - The font size of header of table is smaller than the font size of the data.
  - legend: title is `Warning` without `s` | remove the exclamation point
  > **DONE - Codex**
- ck-46: Do not hide even if all the values are `None` the allergen column in docs/templates/recipes.summary.html
  > **DONE - Codex**
- ck-47: Introduce field level dialog modals that can be triggered to hold field changes given a condition that looks on other fields values for the same record. The dialog will put auto-save on hold. If the user accepts the dialog, if the field is part of dedup rules we evaluate that before allowing the value to be cahnged. If dedup validation passes or the field is not concerned by dedup rules, the field change is made, and auto-save resumes, otherwise the change is cancel as well as auto-save.
  > **WIP - Software Engineer**
- ck-48:
  -For line item groups rows, with the `MP_IS_REHEAT` field set to `Yes`, the `Ingredient Needed` button does not need to be shown because these type of meals do not need for the cook to retrieve ingredients from the pantry. Logically we must hide Ingredients needed unless there is at least one row with a recipe selection and the value `No` on the `MP_IS_REHEAT` field. To define this generically we should create a feature where visibility of top level fields, including buttons shown in edit view, is impacted by logic that looks at nested line item and subgroups.
  - When
  > **DONE - Cursor**
- ck-49:
  - Assess if we can apply option filter to data coming from dataSource, based on values from current record fields. The specific use case to enable is: we are setting recipies on a different form, these records are defined by a multi-select field that contains the dietary applicability of the recipe and the values are being saved in the sever as strings separated by commas. In the meal production form we are defining a single dietary applicability for the meal to be preparead and we require the cook to select the recipe that will be used, therefore we need to define an option filter to will exclude the recipies that are not compatible with the dietary applicability of the meal. Please follow guidelines defined in AGENT.md.
  > **DONE - Codex**
- ck-50:
  - we require true nesting design for line item groups and subgroups. Along with 2 level line item handling in full page overlays. Design is defined in `docs/true-nesting-design.md`.
  > **DONE - Cursor**
- ck-51:
  - we need to be able to calculate fields using complex hierarchy. For example a line item group has two numeric field called `QTY` and `MP_TO_COOK`, and also contains a subgroup called `MP_TYPE_LI` that has a numeric field called `PREP_QTY` and a CHOICE field called `PREP_TYPE`. We need to be able to calculate the field `MP_TO_COOK` by doing {`QTY` - SUM(`MP_TYPE_LI.PREP_QTY`)} when `MP_TYPE_LI.PREP_TYPE` is `Full Dish`.
  - then with the calculated field will use selection effects to add a new line item row in MP_TYPE_LI group that has the value of `PREP_QTY` = `MP_TO_COOK` (we will also assign the value of `PREP_TYPE` = `Cook` to avoid creating a loop). I think this last part we can do it with the existing selection effects functionality, please assess.
  > **DONE - Cursor**
- ck-52:
  - Please adjust the functionality of GROUP_TABLE placeholder to support complex hierarchy. Review the configuration defined in `docs/templates/mp.ing_recipe.html`, the table grouping is not happening and check if the sorting is working as expected. Also we need to allow dataSource fields to appear in the template. The value of `MP_MEALS_REQUEST.MP_TYPE_LI.RECIPE` is comming from a dataSource row and we are already using the RECIPE.REC_INST as the `tooltipField` value, in our use case we want to display the content of the `RECIPE.REC_INST` field in the `Instructions` tab of out html template.
  > **DONE - Cursor**
- ck-53:
  - for the `flattenFields` feature we need to be able to control the placement of the field in the parent view, either to the right, left or below the parent field that is controlling the overlay open action. DONE
  - we need to allow up to 3 fields to be displayed in the row header in steps UI, when `"collapsedFieldsInHeader": true`, if there are more fields defined in the step, those will appear in the row body.
  - we need to trigger error validation on field focus out same as we already do for warning validation. DONE
  - remove all item counts from all views, this is unnecessary and add congnitive load to the user, including selection notices and breadcrumbs.
  - define control to hide the trash can icon on the `overlayOpenActions` config. DONE
  - on the `overlayOpenActions` overlay we need to select the first row by default when the overlay is opened, if the view action is available, active it for the first row, if the view action is not available, active the edit action for the first row. DONE
  > **WIP - Cursor**
- ck-bug-13: when you open the overlay the view or edit rendered needs to be triggered only after all fields in the header row are completed and valid. You only need to trigger the view or edit action once. I'm currently seeing multiple triggers of the action even if I'm already in the view or edit mode.

   ```text
  [ReactForm] lineItems.overlayDetail.view.rendered
  {groupId: 'MP_MEALS_REQUEST', rowId:   'MP_MEALS_REQUEST::MP_MEALS_REQUEST_780077aaf68098::MP_TYPE_LI_e7be55f11e3c8', templateId:   'bundle:mp.ing_recipe.html'}
  groupId
  :
  "MP_MEALS_REQUEST"
  rowId
  :
  "MP_MEALS_REQUEST::MP_MEALS_REQUEST_780077aaf68098::MP_TYPE_LI_e7be55f11e3c8"
  templateId
  :
  "bundle:mp.ing_recipe.html"
  [[Prototype]]
  :
  Object
  ```

  > **WIP - Codex**
- ck-54: create the custom html bundled template for the meal production form.
  > **WIP - Codex**
- ck-55: on the full page overlay, when adding lines manually the header section is being hidden and only the body is visible. After we close the overlay and open again it renders correctly, this only happens when adding lines manually, including from `selectorOverlay`. Rows comming from selection effects are working as expected. Error message: `Unable to load subgroup editor (missing group/subgroup configuration for MP_MEALS_REQUEST::MP_MEALS_REQUEST_04ccba0471eba::MP_TYPE_LI::MP_MEALS_REQUEST::MP_MEALS_REQUEST_04ccba0471eba::MP_TYPE_LI_083db004c1b6e::MP_INGREDIENTS_LI).`
  > **WIP - Codex**
- ck-59: Step row flow (rowFlow) progressive prompts + overlay detail body actions / tab hiding.
  > **DONE - Codex**
- ck-56: add `updateLineItems` selection effect to update the line items.
- ck-57:
  - for listView rule columns, please allow multiple actions per row, by only showing icons, instead of icons and text.
  - enable search preset buttons in view.mode:table of list view.
- ck-58: when fetching paginated data from server on first load, we need to fetch data sorted by multiple fields in order, for example `MP_PREP_DATE` desc, `MP_DISTRIBUTOR` asc and MP_SERVICE source order. This way we make sure that the first page of results is always the most releveant to the user. Also call the different pages in parallel so we can fetch the data faster, this goes as well for retrieving the bundle, I've notices that after page load we are making sequential calls to the for the different components which is not efficient. Also I thought we were caching the bundle but this takes more than 2 seconds to be retrieved after page load
- ck-60:
  - we need to control the width of columns in the grid on edit view. Specially on the steps UI as we often need to provide more space to choice fields than to number fields, buttons, etc. Also need need to be able to overide in the steps UI per step.
  - when we make a field read only we need to remove the `*` from the field label and remove the input control box as it takes space. Take a look at the screenshot to see a mock of the expected view when fields are read only or `renderAsLabel` is true.
  - also in the steps UI we need to be able to hide the field label in the context of a step.
- ck-61: set values automatically, add selectionEffects: [{ type: "setValue", ... }]
- ck-62:
  - I see a bug, when I enter the step and data has already been saved with at least one row that MP_IS_REHEAT = Yes, the leftoversInfo prompt is completed and it always opens the overlay, it should happen only when the value was set.
  - Also my current configuration in configJson.json does not allow me to start the rowFlow on the openLeftoversOverlay it was previously working if I created the row with a preset, however I don't want to do that so the user can select the type of leftover from the start. I added minRows: 1 in the groupOverride but this is not working. Please suggest an adequate configuration.
  - Also as shown on the requiremtens document progressive-step-ui.md we need a trash can icon to delete the row, which is shown on the far right of the output line. How do I set that one up
  - Also, we need a dialog when returning from the overlays back to the steps ui, how do I set that one?
  - I need a back button on the `editLeftoverIngredients` instead of close button
  - the `derivedValue` calculation on the `MP_TO_COOK` is being triggered on every character change despite the `applyOn` is set to `blur`.
  > **WIP - Codex**
- ck-63: `ingredientsSelector` prompt is not working, nothing is shown on the input control line.
