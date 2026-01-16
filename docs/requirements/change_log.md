# Change log

## Bugs

- ck-bug-1: when entering text in a paragraph or text field that is not enabled right now because of ordered submit validation, the user gets sent in focus to the next field, which is disconcerning, the right approach is to highlight the field so the user can go in focus to start editing. Today the text that is being input starts to appear on the next field and the users does not understand what happened.
  >**DONE - Cursor**
- ck-bug-2: the injected paragraph disclaimer must have a setting to be editable or not.
  >**DONE - Cursor**
- ck-bug-3: the auto save dialog needs to allow a single button instead of two. Ideally we would use the existing react component and make it configurable to only have 1 button.
  >**DONE - Codex**
- ck-bug-4: when completing the info of a line item group and closing the overlay (on ordered submission mode), the overlay pill still highlights the group as `needing attention`. When the error message is shown legitimately, we need be able to configure the error message.
  >**WIP - Codex**
- ck-bug-5: when entering on focus in a paragraph input control it is automatically zooming in iOS, please adjust the behavior to not zoom in. Also the injected disclaimer counts for submit validation as if the user had already entered text, which is not the case.
  >**DONE - Cursor**
- ck-bug-6: there seems to be a bug with the banner that appears when file uploads are pending and the user leaves the edit view to the list view. It is being triggered on a form that does not have file upload fields and even when the user has not entered any data. We should also consider removing the banner altogether, what are the risk?
  >**WIP - Codex**
- ck-bug-7: when checking for duplicates on create button, including `createRecordPreset`, disable the list view to prevent the user from navigating to existing records and compiling the actions done on server side.
  >**DONE - Codex**

## technical requirements

- ck-1: initial load performance improvements.
- ck-2: hide table/cards toggle in list view. We need a legend at the bottom of the list view to explain the statuses use static legend definition in issue 6. And we need a status pill for each result card to display the status. This pill needs to appear in all other pages inclucing edit and sumamry views. We need to normalise statuses values using the existing `statusTransitions` config. We need to have an inProgress and reOpened statuses (which it's value can be set per form, similarly as we do with `onClose`). Also please remove harcoded logic to drive visibility of elements based on the `Closed` status value, the logic needs to be driven by the configured value on statusTransitions. Change `Search recipes (name, dietary category, or status)` to `Search recipes (name, dietary, or status)`. Add a list view title `You can search by recipe name, dietary category or status`.
- ck-3: make cards non clickable in cards mode in list view, only the footer action are clickable.
- ck-4: create smart search mode to:

  ```text
  Improve the existing smart search so it covers Recipe name + Dietary category + Status, then remove the advanced search icon.

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
- ck-8: define a non editable default text paragraph for paragraph fields at the end of the field.
- ck-9: helper text on all fields, this is localizable and can be set below the field label or inside the input control. Define number of decimals allowed on numeric input fields, 0 means integer only. On numeric field if the user is entering a non numeric character, the field should show a warning because today the input is blocked but the user does not understand why.
- ck-10: LineItemGroupConfig.label should also modify the pill content for the line item groups shown in overlay as it does today for subgroups. Avoid showing count.
- ck-11: smart search on section selector fields.

  ```text
  Update ingredient selection to support the real kitchen workflow (build the list first, then fill quantities):

  1) One search field (smart search) that searches across:
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
  • Do not show Category and Allergen in the Create/Edit ingredient rows.
  • On the View recipe page, group by Category (already good) and show Allergen only when it is not “None”.
  ```

- ck-13: on option filter via array, we need to configure a modality were we match via `or` instead of `and` by default. This would allow to add ingredients that matches part of the diatery restrictions. In this case we display a warning message. These elements will marked with a warning flag that contains the non-satisfied keys in memory and server side. Then, we will add a non editable message in the paragraph field summarizing, per non-satisfied key, the list of elements that are not satisfying the restrictions.

  ```text
  Example:
  - For Vegan recipe, do not use: Chicken, Beef, Pork, Eggs
  - For Diabetic recipe, do not use: Sugar, Honey, Syrup, Sweetener
  ```

- ck-14: verbatim requirements for html summary template.
- ck-15: create fields to enter createdBy and updatedBy, free text or auto set with the user email, when user is authenticated.
- ck-16: prevent deactivation (custom button action) of a record if it is being used as source data for another record which has not a finalised status. I think easiest check would be to write a blocked flag on the dataSource record when the other form is using it. The block will be released when the ofether form finalises it's data entry process.
- ck-17: submit top error message must be configurable and localizable per form. Fields need to be entered in order, if a field a required field is missing input, when the user tries to enter a value for a later field, the form will block will trigger submit validation so the user can enter the value of the field that was missed. This is control via a config setting at the form level.
- ck-18: one time overlay blocking banner on create/edit/copy to explain to the user that auto save is on and that it works in the background and indicators are on the top right corner of the form. We would save in browser that the user has seen the banner so we don't show it again.
- ck-20: Disable submit button until all required fields are valid. Tooltip: “Complete all required fields to activate.”
- ck-21: add status badge in edit view
- ck-22: fix button issue `[Info] [ReactForm] – "list.openButton.ignored" – {openButtonId: "RE_OPEN", reason: "unsupportedAction"}` -> action is `updateRecord` which works fine in summary view but fails in list view, cards mode.
- ck-23: the search field `x` icon should not clear the search results, add a separate control for that.
- ck-24: remove default empty line items in line item groups.
- ck-25: add buttons below the search bar on cards mode in list view page. To trigger predefined search queries.
- ck-26: add `source` sort type to the listViewSort config
- ck-27: support placeholders in the email subject
- ck-28: remove the translate stuff to english button on google sheet

---
