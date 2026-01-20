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
