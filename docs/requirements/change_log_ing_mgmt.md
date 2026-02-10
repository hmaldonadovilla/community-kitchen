# Ingredients Management - Implementation adjustments

## Acceptance criteria

Click on button  [+ Create] on Home page. The system will bring you to the create ingredient page where you are asked to enter the following information:

1. {Created by}: Enter your name
2. {Ingredient Name}: Enter the name of the ingredient. Enable auto-save if value entered in this field is valid and a name was entered in {Created by}

    - Name must be minimum 2 characters, no special characters allowed except dash.
    - The system should auto-transform if all caps was used by the user.
    - As soon as the name is entered, the system performs a duplicate check and if no duplicate create an ingredient record with status ‘Draft’.
    - Do not allow user to continue with the creation if it is a duplicate instead display message:

    ```text
    “An ingredient with the same name already exists.
    Do you want to change the name or cancel the creation?”
    - Cancel -> Bring the user to Home page
    - Change name -> Bring the user back to the create screen and blank out name.
    ```

    - If no duplicate, allow the user to proceed with the other fields to create the new ingredient as ‘Draft’ until the user clicks [Activate] and make it available in Recipe Management app and Meal Production app from its effective start date with status active until 31-Dec-9999.

3. {Category} Select one category from dropdown list. No multi-select allowed. One category must be selected.
4. {Supplier} Select one or more suppliers from dropdown list. At least one supplier must be selected. Multi-select allowed
5. {Allergen} Select None or corresponding allergens from dropdown list, multi-select allowed. At least one value must be selected. Multi-select is allowed except if ‘none’ is selected.
6. {Allowed unit} Select one or more applicable units from dropdown list. At least one must be selected. Multi-select allowed.
7. {Dietary applicability} Select one or more from dropdown list. At least one dietary category must be selected. Multi-select allowed.

## Detected issues

1. Field helpers as described in the requirements document are missing for all fields.
2. Enable auto-save pop-up message appears before Created by and Ingredient name values are entered. This will lead to empty records. A record should only be created if Created by and Ingredient name have been captured, not before as described in the requirements document
3. The duplicate checks shows a message that is related to duplicated customer. It should show the below message as stated in the requirements document:

    ```text
    "An ingredient with the same name already exists. Do you want to change the name or cancel the creation?
    - Cancel -> Bring the user to Home page
    - Change name -> Bring the user back to the create screen and blank out name.
    ```

4. Effective start date and an Effective end date are editable fields. The requirement does not asked for this field to be editable, nor visible on the Create screen. These fields are to be populated by the system when the user clicks Activate. See requirement document.
5. The summary view shows status twice.
6. The field last changed by is shown on the Create screen which is irrelevant at this stage and was not requested as per requirement. Remove the field during creation.
7. There is a Summary which brings the user to the View only page. Change Summary to the eye icon.

## Implementation guidelines

- Implement the acceptance criteria as described in the requirements document and highlighted above
- Requirement document is located in the `docs/requirements/ingredients_mgmt_design.md` file
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

## Submit dialog

The dialog message shown after Activate does not reflect what was requested in the requirement document. It should say:

```text
title: Activate new ingredient?
message: “Ingredient xxx will become active and selectable in Recipe management and Meal production on {today’s date}. Do you want to continue?
actions:
- No, continue editing draft ingredient
- Yes, activate.
if No, stay on edit view
if Yes, the system should now automatically populate the effective start date and effective end date.
```

## The system should now automatically populate the effective start date (today) and effective end date (31-Dec-9999) when the user clicks Activate

## Add configurable message for `validation.fixErrors`

## Implement for field helper text feature the possibility of having two helper texts, one `belowLabel` and one `placeholder` for the field control

- configure for the `Ingredient Name` field:
  - helper text `belowLabel`:

    ```text
    Name must be minimum 2 characters, no special characters allowed except dash
    ```

  - helper text `placeholder`:

    ```text
    Enter the name of the ingredient
    ```

---

## Data integrity

After having entered both Created by and Ingredient name, I successfully removed the ingredient name / created by name and went back to home page. We need to treat Created by and Ingredient name as key fields (the same as MP_DISTRIBUTOR, MP_PREP_DATE and MP_SERVICE on meal-production form).

### Show a modal message and delete the record after user agreement

The modal message should appear when user goes back to Home without both 'Created by value' and 'Ingredient name' filled

- 'Created by value' is removed and remains emtpy even if the 'Ingredient name' is filled and data after Ingredient name is filled.
- 'Ingredient name' is removed even if the 'Created by' is filled and data after Ingredient name is filled and User goes back to Home without 'Created by value' and 'Ingredient name' all filled.

Modal message:
Title: Missing key information to create a draft ingredient record

Message: A draft ingredient record can only exist when created by and ingredient name are all filled in. Leaving this page now will permanently delete this record and all data already entered.
This action cannot be undone.

Actions

- Continue, delete the record
- Cancel, continue editing

### Implementation guidelines

- Implement the modal message and delete the record after user agreement as described in the requirements document and highlighted above
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--

## Modal actions are shown as centered aligned. Change it to left aligned as the action spans onto two lines

## Modal behaviour

- Do not allow modals to be dismissed with a `x` button or by clicking outside the modal. The user must select an action from the modal, unless this is explicitly defined in the modal's configuration.
- Make sure that all the modals in all forms configured in the `docs/config/exports/staging/` are compliant with the expected behaviour (no dismissing with `x` button or clicking outside the modal).

--

## Please remove the option to copy an existing record from the meal-production form

--

## Implement custom html bundeled tempalte for the ingredients management form's summary view

The current View screen does not provide the information in the way it is requested in the requirement document.

UI Hygiene rules are not followed. Information are scattered all over the place and you cannot make the difference between field name and field value. The font size of the Field names is smaller than the font size of the field values.
Implement as per the original requirements.

### Implementation guidelines

- Implement the custom html bundeled tempalte for the ingredients management form's summary view as described in the requirements document and highlighted above
- the requirements document is located in the `docs/requirements/ingredients_mgmt_design.md` file
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--

Pending tasks:

## when the user starts a new record, does not enter any information and leaves to the home page, we should not show the `Missing key information to create a draft ingredient record` dialog. In this case we need to allow the user to leave

## replace the label of the summary view from `Summary` to `View`

## We need to detach the auto-save enablement from the dedup check feature when the configuration is present.

- We should be able to set independent fields that trigger dedup validation
- We need to define independent fields that would enable auto-save

### Please create the logic and configuration elements to account for this new feature

### Enable in the configuration of ingredients management form

- the feature to allow data to be entered in strick order
- Move the ingredient name field to the first position

### The dedup check opens a pop-up message explaning that dedup check is running, this message is configurable per form, it blocks the user form entering any other field until the dedup check is complete and the message is dismissed when dedup check is complete. If dedup check fails, the existing dialog message is shown

### Use case to support

- The user start a new record and enters the ingredient name as the first field
- Dedup check is triggered and the user is blocked from entering any other field until the ingredient name is valid and unique
- The user will then enter the created by field and the system will auto-save the record as a draft record

#### Modal / Inline Message (during check)

Title
Checking ingredient name

Message
Please wait while the system checks whether this ingredient already exists.
Do not leave this page until the check is complete.

(Spinner visible, no buttons)

⸻

What changes when the check is complete (this is the key)

The same area must update automatically. No new modal.

If no duplicate is found

Replace the message with:

Title
Ingredient name available

Message
You can continue entering the ingredient details.

(Spinner disappears)

show a small ✓ icon.

⸻

If a duplicate is found

Replace the message with your existing blocking error:

Title
Ingredient already exists

Message
An ingredient with this name already exists.
Please change the name or cancel the creation.

(Spinner disappears, normal actions resume)

⸻

Why this works:
-	The user sees start (spinner + “checking”)
-	The user sees end (text changes + spinner gone)
-	No buttons = no temptation to click
-	No extra cognitive load
-	Works even if the check takes longer than expected

⸻

The check is considered complete only when the spinner disappears and the message text changes.

### Implementation guidelines

- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--

Pending tasks Ingredients Management:

## When the user starts a new record, does not enter any information and leaves to the home page, we should not show the `Missing key information to create a draft ingredient record` dialog. In this case we need to allow the user to leave

## replace the label of the summary view from `Summary` to `View`

---

## Improve the Final report - PDF html template

1. Increase font size of al texts on Final report, except for 'Community kitchen' to make it readable.
2. Optimize the use of the width of the table by moving the separation bar more to the left to make the report shorter in number of pages required.
3. Make the font size of {Customer} the same as 'Community kitchen'

## In meal-production, on the edit view, the label of the bottom action button to go to the summary view should be 'Summary'

## Entire dish leftover adjustments

### Prevent the user from leaving the page without entering a value = or > to 0

#### Modal message

Title: Missing Entire leftover number of portions.
Message: Enter the number of portion this leftover dish will yield. \nEnter 0 if the dish will be fully combined with today's dish in which case its ingredients will be added to today's dish ingredients on the Report. \nIf value > 0, the  leftover will be shown as an entire dish with its recipe and ingredients. \nIf no value is entered, this incomplete record will be removed permanently.
Actions:

- Continue editing
- Discard incomplete leftover record.

#### When user enters 0 in Entire dish leftover

Combine the ingredients of the selected recipe as well as any changes that the user may have entered against the selected recipe to the ingredients of to cook recipe for both Summary and Final report.

In the Summary, the system is behaving correctly by showing Entire Dish leftover: 0 portion |{name of entire dish recipe}, Cooked: the number of ordered portions minus 0 | {name of to cook recipe} followed by the ingredients of both recipes. Remove all duplicated values.

In the Final report (pdf report html template), the system must not mention any Entire dish Leftover = 0. It should only show the To cook recipe with the To cook quantity and the combined list of ingredients, removing duplicated values. In this case the To cook quantity is the number of ordered portions minus 0. In this case I think the logic used to build the Final report is incorrect.

--

## Data integrity dialogs on meal-production form

### Record will be permanently deleted when user clicks on the home button to go to the listView from the editView page without Customer + Production date + Service all filled

==> Modal message:

Title: Incomplete meal production record

Message: 'A meal production record can only exist when customer, production date, and service are all filled in. Leaving this page now will permanently delete this record and all data and photos already entered.
This action cannot be undone.
Actions:

- Continue — Delete the record
- Cancel — Continue editing

### Changing Customer without leaving the Order page

When Customer is changed and the MP_PREP_DATE has been populated

==> Modal message
Title: Change Customer
Message: Changing the customer will permanently delete production date and service as well as any data or photos you may have entered after service. A meal production record can only exisit when customer, production date, and service are all filled in. If you wish to proceed with the change, make sure you enter the production data and the service before leaving the page otherwise the record will be permanently deleted.
This action cannot be undone.

Actions

- Continue and delete subsequent data.
- Cancel and keep current customer

### Changing Production date to a future date without leaving the Order page

When Production date is changed to a future date, and MP_SERVICE has been populated

==> Modal message
Title: Change Production date
Message: Changing the production date will permanently delete service as well as any data or photos entered after service. A meal production record can only exisit when customer, production date, and service are all filled in. If you wish to proceed with the change, make sure you enter the service before leaving the page otherwise the record will be permanently deleted.
This action cannot be undone.

Actions

- Continue and delete subsequent data.
- Cancel and keep current production date

--

## Style not injected

- we are still not able to see the styles defined in `src/services/webform/followup/mealProductionPdfContent.ts` in the pdf report html template, `docs/templates/meal_production.pdf.html`. We have tried to set the styles in the html template, and inline in the script, but none of it works.

--

## Consistent styles for text helpers and helper configuration

1. Underneath the Ingredient search box in Recipe form add a helper message: “Uses exact words for Search (example: tomato or tomatoes, not tom, diabetic, not dia)."
2. All helper texts must use the platform default secondary text color, same font family and size as labels or one step smaller, regular weight, no italics, no color semantics. Remove bold, frames and do not use red, orange or green colors. Do not change logic,  wording, location, or behavior. Helper texts must be aligned the same way as the field they support. If they support an entire screen, they should be left aligned, never centered aligned if they span onto two lines.

## We are missing the legend on recipe management form, for edit, view and copy icons, we also need to enable two columns for the legend

--

## In recipe management form please organize the legend so all 3 elements related to actions are on the first column and the entries related to status are on the second column

## When we set `enforceFieldOrder` to true, I expect that the user is guided via validation messages to fill the fields in the correct order. This must happen in all UIs, specially in the Steps UI, where we can have a combination of top level fields and line item groups rendered as tables.

## There's a lot of unused width space in the legend, when using two columns. Please define a setting to set the percentage of width for each column.

- on recipe management please set 25% for the first column and 75% for the second column

--

## Adjust the summary view bundled html template for the Ingredients Management form

- The current View screen does not provide the information in the way it is requested in the requirement document. The current View screen shows:
  - The value of 'Ingredient name' without the label 'Ingredient name', e.g. It shows Tomato instead of Ingredient name    Tomato
  - On the second line, the system shows {Active since...} instead of Category. Remove this line that is not required
  - It shows Effective start date which is not part of the requirement
  - It shows Effective end date which is not part of the requirement

### Implementation guidelines

- Implement the adjustments to the summary view bundled html template for the Ingredients Management form as described in the requirements document and highlighted above
- the requirements document is located in the `docs/requirements/ingredients_mgmt_design.md` file
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--

## Legend, create label and multi-select dropdown list adjustments

### Legend adjustments for Active ingredient

- For Active ingredient, only View action is allowed. Edit and Copy actions are valid actions but because these functionalities are not configured, these actions must be removed and the legend must be modified to reflect it.
- For Draft ingredient, View and Edit actions are allowed. Current configuration is correct.
- Until all requirements are implemented, the legend should not include Disabled status and should show
  Legend:
  - 👁 View draft or active ingredient
  - ✏️Edit draft ingredient
  - Draft: creation in progress, not available selectable in Recipe Management and Meal Production
  - Active: Available in Recipe Management and Meal Production

### Rename[ + Create] to [ + new ingredient] as per requirement. Set a label for the create record button instead of the default

### The tick boxes in multi-select dropdown list for Supplier, Allergen, Dietary applicability are too small and very difficult to reach.  It is not ergonomic

### Implementation guidelines

- Implement the adjustments to the legend as described in the requirements document and highlighted above
- the requirements document is located in the `docs/requirements/ingredients_mgmt_design.md` file
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/style_guide.mdc` rules strictly.

--

## Active status on html summary view bundled template

- Concatenate the status and EFFECTIVE_START_DATE to produce this mention: {{status}} since {{EFFECTIVE_START_DATE}}
- This only applies when the status is Active

## Disabled status on html summary view bundled template

- Concatenate the status, LAST_CHANGED_BY and EFFECTIVE_END_DATE to produce this mention: {{status}} by {{LAST_CHANGED_BY}} since {{EFFECTIVE_END_DATE}}
- This only applies when the status is Disabled

## Please increase the size of checkboxes in the multi-select dropdown

### Implementation guidelines

- Implement the adjustments to the html summary view bundled template for the Ingredients Management form as described above
- Perform configuration changes in the relevant file in the `docs/config/exports/staging/config_ingredients_mgmt.json`
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--
