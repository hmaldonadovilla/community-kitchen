# Ingredients Management – Requirements

1.	Purpose
The purpose of this document is to outline the requirements for a solution to manage the master list of ingredients and their attributes that are used in Recipe Management and Meal Production apps.
2.	UX Principles
The solution must ensure:
•	Zero training required.
•	Simple language.
•	Prevent errors at input level.
•	Only show actions when relevant/allowed.
•	Always show impact of user’s action before allowing changes or destructive actions.
•	All changes take effect on the system date = today. Past date is not allowed. Historical data remains unchanged.
•	No retroactive impact of user’s action on historical data.
•	Traceability and auditability of all actions over-time.
•	Changes must be auto-saved unless specified otherwise.
•	Non-activated changes must be reversible/cancellable.
•	Permanent deletion is allowed only for Draft ingredients that have never been used.
‘Active’ or ‘Disabled ingredients are never physically deleted from the database.
3.	Supported User Actions
The user must be able to:
1.	Search ingredient directly on the Home page.
2.	View ingredient’s attributes by
•	selecting the ingredient on the Home page and clicking on (👁️). The system will bring the user to a dedicated View screen.
•	clicking on (👁️) located at the bottom action bar of Create, Copy and Edit screens. The system will bring the
•	user to a dedicated View screen.
3.	Create an ingredient
•	from scratch starting from the Home page by clicking on (+ new ingredient) and navigating to a dedicated Create screen.
•	by copying (⧉) the attributes, except name, of an ingredient selected on the Home page and navigating to a dedicated Copy screen
4.	Edit ingredient’s attributes: name, category, allergen, supplier, allowed unit, dietary applicability, effective end date by selecting the ingredient and clicking on (✏️) on the Home page and navigating to a dedicated Edit screen.
Newly created ingredients are not available in Recipe management or Meal Production unless they are explicitly activated by the user with action Activate.
Changes to ingredients attributes with (✏️) action are effective from today’s date.
Cancel action must be made available on Create and Edit screens.
4.	Supported statuses and allowed actions
1.	Draft: not activated, not available in Recipe Management or Meal production apps.
Actions available: (👁️) (✏️) (🗑️)
2.	Active: available in Recipe Management or Meal production apps.
Actions available: (👁️) (✏️) (⧉)
3.	Disabled: historical only, not available in Recipe Management or Meal production apps.
Actions available: (👁️).
Only show actions when relevant and allowed.
The system should never display (⧉) for Draft ingredients.
The system should never display (✏️) (⧉) for ‘Disabled’ ingredients.
The system should never display (🗑️) for Active or Disabled ingredients.
5.	Search ingredients
From the home page, the user must be enabled to
1.	Search
The search must only support search by ingredient name only. The search must support exact text match, be case-insensitive and ignore leading and trailing spaces.
The system displays the ingredient(s) with name (in alpha order), status and corresponding actions depending on the status of the ingredient:
•	Draft: 		(👁️) (✏️) (🗑️)
•	Active: 	(👁️) (✏️) (⧉)
•	Disabled: 	(👁️)
The statuses and action icons must be explained by a legend underneath the search results.
Example:
Search ingredient: [ 🔍 tomato ]
Result:
Peeled tomato | Active 	(👁️) (✏️) (⧉)
Tomato | Active 		(👁️) (✏️) (⧉)
Tomato cubes | Disabled 	(👁️) 
Tomato paste | Active 	(👁️) (✏️) (⧉)

2.	View and download into Google sheet below predefined lists of ingredients:
•	List of ingredients filtered by category: [Select category▼ ]
•	List of ingredients filtered by supplier: [Select supplier▼ ]
•	List of ingredients filtered by allergen: [Select allergen▼ ]
•	List of ingredients filtered by dietary category: [Select dietary type ▼ ]
•	List of unused ingredients

The system automatically generate a downloadable Google sheet in which the ingredient(s) are listed in alpha order with the following attributes in columns:
Status, category, allergen, supplier, allowed unit, dietary applicability, created by, effective start date, effective end date, last changed on, last changed by

6.	View ingredient
From the Home page, the user must be enabled to View the attributes of a selected ingredient by clicking on (👁️). The system brings the user to the View screen, where they can view the following information related to the selected ingredient:
1.	Ingredient name
2.	Category
3.	Allergen
4.	Supplier
5.	Allowed unit
6.	Dietary applicability
7.	Status:
•	Active since 05-Feb-2026 = date of go live or {effective start date} if manually created after go live.
•	Disabled by since {effective end date}
8.	Created by {System Administrator or name of the person who created the ingredient after go live}
9.	Last changed on blank if effective end date = 31-Dec-9999 {date on which the effective end date was changed}
10.	Last changed by blank if effective end date = 31-Dec-9999 {name of the person who changed the effective end date}
On the same screen, at the bottom, the user must be able to see action buttons to
(🏠) (✏️ if Draft or Active) (⧉ if Active) (🗑️if Draft)
Example 1: Active ingredient
Ingredient Name: Tomato
Category: Fresh Vegetables
Supplier: Freshmed;Mabru;VDS
Allergens: None
Allowed units: kg, gr, bucket
Dietary applicability: Diabetic, Vegan, Vegetarian, Standard, No-salt
Status: Active
Effective start date: 05-Feb-2026
Effective end date: 31-Dec-9999
Created by System Administrator
Last changed on: N/A
Last changed by: N/A
(🏠) (✏️) (⧉)
Example 2: Disabled ingredient
Ingredient Name: Sun-dried tomato
Category: Fresh Vegetables
Supplier: Freshmed;Mabru;VDS
Allergens: None
Allowed units: kg, gr, bucket
Dietary applicability: Diabetic, Vegan, Vegetarian, Standard, No-salt
Status: Disabled
Effective start date: 05-Feb-2026
Created by System Administrator
Effective end date: 10-Feb-2026
Last changed by Que Nguyen
(🏠) (✏️) (⧉)
Example 3: Draft ingredient
Ingredient Name: Radish
Category: Fresh Vegetables
Supplier: Freshmed;Mabru;VDS
Allergens: None
Allowed units: kg, gr, bucket
Dietary applicability: Diabetic, Vegan, Vegetarian, Standard, No-salt
Status: Draft
Created by Que Nguyen
(🏠) (✏️) (⧉)

7.	Create Ingredient
The user is presented with the option to create a new ingredient (+new ingredient) on the Home page. By clicking on [+ new ingredient] the user is brought to the Create screen where the following information must be entered. Until the user successfully enters their name and a valid ingredient name, no duplicate, auto-save must be disabled.
Below ingredient attribute fields are compulsory fields.
1.	{Created by}: Enter your name
2.	{Ingredient Name}: Enter the name of the ingredient. Enable auto-save if value entered in this field is valid and a name was entered in [Created by]
Name must be minimum 2 characters, no special characters allowed except dash.
The system should auto-transform if all caps was used by the user.
As soon as the name is entered, the system performs a duplicate check and if no duplicate create an ingredient record with status ‘Draft’.
Do not allow user to continue with the creation if it is a duplicate instead display message: “An ingredient with the same name already exists.
Do you want to change the name or cancel the creation?”
	Cancel  Bring the user to Home page
	Change name  Bring the user back to the create screen and blank out name.
If no duplicate, allow the user to proceed with the other fields to create the new ingredient as ‘Draft’ until the user clicks [Activate] and make it available in Recipe Management app and Meal Production app from its effective start date with status active until 31-Dec-9999.
3.	{Category} Select one category from dropdown list. No multi-select allowed. One category must be selected.
4.	{Supplier} Select one or more suppliers from dropdown list. At least one supplier must be selected. Multi-select allowed
5.	{Allergen} Select None or corresponding allergens from dropdown list, multi-select allowed. At least one value must be selected. Multi-select is allowed except if ‘none’ is selected.
6.	{Allowed unit} Select one or more applicable units from dropdown list. At least one must be selected. Multi-select allowed.
7.	{Dietary applicability} Select one or more from dropdown list. At least one dietary category must be selected. Multi-select allowed.
At the bottom of the Create screen, the following actions are available to the user:
•	(🏠) bring the user to the home page and auto-save data with status ‘Draft’ only if name has been entered. An ingredient ID is assigned to the ‘Draft’ record.
•	(🗑️) pop-up screen with message “Cancel draft ingredient? You are about to permanently delete the draft ingredient, do you want to proceed?”
	Yes  Delete permanently the draft ingredient or
	No  stay on Create page.
•	(👁️) bring the user to the View screen where they can view the draft details of the ingredients
•	[Activate] providing that all data has been entered and that there is no duplicate, the status of the newly created ingredient will change from ‘Draft’ to ‘Active’ effective today’s date. The system displays message “Ingredient xxx will become active and selectable in Recipe management and Meal production on {today’s date}.
The system changes the status from ‘Draft’ to ‘Active’ with ‘effective start date’ = date of activation and ‘effective end date’ = 31-Dec-9999.
The newly created Active ingredient is available in Recipe management and Meal production.
Mock-up Create ingredient
---------------------------------
+ new ingredient
Created by Name*: [Enter you name________]
Ingredient Name*: [Enter the name of the ingredient_________]
Category*: [Select the category the ingredient belongs to▼]
Supplier*: [Select one or more suppliers▼]
Allergen*: [Select the None or the corresponding allergens▼]
Allowed unit*: [Select the units allowed for the ingredient▼]
Dietary Applicability*: [Select the dietary types the ingredients is applicable for▼]
(🏠) (🗑️) [ Activate] 
8.	Copy ingredient
From the Home page, the user must be able to select an ‘Active’ ingredient and click on (⧉) to copy its attributes, except the name, to create a new one. Only ‘Active ingredient record can be copied. ‘Draft’ and ‘Disabled’ ingredients cannot be copied.
The system will force the user to enter their name in the [Created by] field and the name of the ingredient in [Ingredient name]. The copied values for Category, Supplier, Allergen, allowed unit, and Dietary applicability are editable by the users.
Auto-save functionality must be disabled until the user enters their name and a valid ingredient name, non-duplicate. As soon as an ingredient name is entered, the system performs a duplicate check and if no duplicate create an ingredient record with status ‘Draft’, only then auto-save is enabled.
Do not allow user to continue with the creation if it is a duplicate instead display message: “An ingredient with the same name already exists.
Do you want to change the name or cancel the creation?”
	Cancel  Bring the user to Home page
	Change name  Bring the user back to the create screen and blank out name.
If no duplicate, allow the user to proceed with the other fields to create the new ingredient as ‘Draft’ until the user clicks [Activate] and make it available in Recipe Management app and Meal Production app from its effective start date with status active until 31-Dec-9999.
Providing that all data has been entered and that there is no duplicate, the status of the newly created ingredient using copy functionality will change from ‘Draft’ to ‘Active’ effective today’s date. The system displays message “Ingredient xxx will become active and selectable in Recipe management and Meal production on {today’s date}.
At the bottom of the Copy screen, the following actions are available to the user:
•	(🏠): bring the user to the home page and auto-save data with status ‘Draft’ only if name has been entered.
•	(🗑️): pop-up screen with message “Cancel created ingredient? You are about to cancel the creation of a new ingredient, do you want to proceed”
	Yes  Delete permanently the draft ingredient or
	No  stay on Create page.
•	(👁️) view the draft details of the ingredients
•	[Activate]: providing that all data has been entered and that there is no duplicate, the status of the newly created ingredient will change from ‘Draft’ to ‘Active’ effective today’s date. The system displays message “Ingredient xxx will become active and selectable in Recipe management and Meal production on {today’s date}.
The system changes the status from Draft to Active with effective start date = date of activation and effective end date = 31-Dec-9999.
Mock-up Copy ingredient
Copy from Tomato
Created by Name*: [Enter you name________]
Ingredient Name*: [Enter the name of the ingredient_________]
Category*: [Fresh Vegetables▼]
Supplier*: [Freshmed;Mabru;VDS▼]
Allergens*: [None▼]
Allowed units*: [kg, gr, bucket▼]
Dietary applicability*: [Diabetic, Vegan, Vegetarian, Standard, No-salt▼]
(🏠) (🗑️) [ Activate] 
9.	Edit ingredient
The user must be able to edit the following information for ingredients with status = ‘Draft’ or ‘Active’. Changes must never modify existing Meal production summaries or reports.
•	Ingredient name
•	Category
•	Supplier
•	Allergen
•	Allowed unit
•	Dietary applicability
•	Effective end date (only editable for ‘Active’ ingredients)
1.	Edit ‘Draft’ ingredients name, category, supplier, allergen, allowed units and dietary applicability:
If the status is ‘Draft’, editing the ingredient equates to continue with its creation. By clicking on (✏️) next to the selected ‘Draft’ ingredient on the Home page, the system brings the user to the Create screen where they are asked to enter their name in [Created by] field if it is not the same and complete the creation of the ingredient.
If the user changes the Ingredient name, perform a duplicate check. Do not allow user to continue with the change of ingredient name instead display message: “An ingredient with the same name already exists. Do you want to give it another name or keep the old name?”
	Keep the old name  Bring the user to Home page
	Change the name  Blank out the ingredient name field and bring the user back to that field.
(🏠) (🗑️) [ Activate]  action buttons are also available to the user at the bottom of the screen.
2.	Edit ‘Active’ ingredient
By clicking on (✏️) next to the selected ‘Active’ ingredient on the Home page, the system brings the user to the Edit screen where the system displays the Ingredient information. The user is asked to enter their name in [Changed by]. The user is able to change
If the user changes the Ingredient name, perform a duplicate check. Do not allow user to continue with the change of ingredient name instead display message: “An ingredient with the same name already exists. Do you want to give it another name or keep the old name?”
•	Keep the old name  Bring the user to Home page
•	Change the name  Blank out the ingredient name field and bring the user back to that field.
Regardless of the field being changed, check if the ingredient was used before in Recipe management or Meal production.
•	Not used before:
If the change is not related to ‘effective end date’ display message: “The updated version of the ingredient will replace the old version in the Master list of ingredients effective today’s date. The effective end date of the old version will set to today’s date and the status of old version of the ingredient will become ‘Disabled’. Do you want to proceed?
	No, cancel the change.
Bring the user to Home page and reverse the change
	Yes, disable the old version and activate the new one effective today’s date.’
The system asks the user to enter their name and click Save. The system changes the effective end date of the old version to today’s date and capture the name of the person who made the change in the field “Last changed by”. Activate button is not visible in this case.
If the change is related to ‘effective end date’ display message: “The effective end date of the ingredient will be set to today’s date. Effective today’s date the ingredient status is ‘Disabled’ and will no longer be available in Recipe management and Meal production apps. Do you want to proceed?
	No, cancel the change.
Bring the user to Home page and reverse the change
	Yes, disable the old version. Change the effective end date of the ingredient effective today’s date and change its status to ‘Disabled’
The system changes the ‘effective end date’ of the record to today’s date and capture the name of the person the field “Last changed by”. Activate action button is not visible in this case.
•	Used before  the system must perform an impact analysis.
Using the ingredient ID as a reference, the system must search in Recipe Management app if the ingredient was previously used in any recipe. 
	If No proceed with the change
	If Yes, display message “Change {field name}? Changing {field name} will disable the old version of the ingredient effective today’s date. This change will automatically disable the following recipes that include the old version of the ingredient.
Recipe 1
Recipe 2
Recipe n
Effective today’s date the concerned recipe(s) will not be available in Meal production app until you remove the ‘Disabled’ version of the ingredient from the recipe(s) and activate them. Do you want to continue with the change?
 No, cancel the change. Discard the change and bring the user back to Home page.
 Yes, continue with the change and disable the concerned recipes. The system forces the user to enter their name and save. The system also displays message “You must go to the Recipe management app to remove the ‘Disabled’ version of the ingredient from the concerned recipe(s) and activate them so they can be used in Meal production app.”
-	If the change is not related to ‘effective end date’ of an Active ingredient, the change leads to below automated automated activities:
	Changing the ‘effective end date’ of the old version of the ingredient from 31-Dec-9999 to today’s date, effective today’s date. The status of the old version of the ingredient is “Disabled”. Store the name of the user in “Last changed by” field.
	Creating the new version of the ingredient as a new ingredient, with a new ingredient ID, with ‘effective start date’ = today’s date and ‘effective end date = 31-Dec-9999. The status of the new version of the ingredient is “Active” and the “Created by” will store the name of the user.
	Disabling the impacted recipes, if any, effective today’s date.
-	If the change is related to ‘effective end date’, the change leads to the following activities:
	Changing the ‘effective end date’ of the old version of the ingredient from 31-Dec-9999 to today’s date, effective today’s date. The status of the old version of the ingredient is “Disabled”. Store the name of the user in “Last changed by” field.
	Disabling the impacted recipes, if any, effective today’s date.
At the bottom of the Edit screen, the following actions are available to the user:
•	(🏠): bring the user to the Home page.
•	Cancel: pop-up screen with message “Cancel created ingredient? You are about to cancel the changes, do you want to proceed”
	Yes  Discard the changes and bring the user to Home page
	No  stay on Edit page.
•	(👁️) view the new version
10. Data Model
Each ingredient stores:
•	Ingredient ID auto-generated by the system and not visible to end users.
•	Ingredient name
•	Category
•	Supplier
•	Allergen
•	Allowed unit
•	Dietary applicability
•	Effective start date
•	Effective end date
•	Status
•	Created by
•	Last changed by
Recipes and Meal Production reference ‘Ingredient ID’.

10.	Implementation tips


✅ 1. “Non-Negotiable Implementation Contract

You must implement exactly what is written in the Ingredients Management – Requirements document.

Non-negotiable rules:

1. Do not invent UI patterns, fields, actions, or workflows.
2. Do not simplify or optimize flows.
3. Do not change action logic or status logic.
4. Do not rename actions or statuses.
5. Do not remove confirmations or impact analysis.
6. Do not change effective date rules.
7. Do not redesign screens or layout.
8. Follow UI Hygiene & Typography Contract strictly.
9. If something is unclear, STOP and ask before coding.

Output code changes with explanations. No UX suggestions.

✅ 2. Break work into atomic tasks (never “implement everything”)

- These tasks must resuse existing features
- Reuse existing UI patterns and components
- Reuse existing actions and workflows
- Reuse existing data models and schemas
- Reuse existing validation rules and constraints
- Reuse existing error handling and messaging
- Reuse existing logging and telemetry
- Keep new development to a minimun, try to handle the use cases with configuration
- Create a ingredients management form configuration file in docs/config/staging/config_ingredients_management.json

✅ 3. Add explicit “DO NOT CHANGE” list

DO NOT:

- Change existing icons
- Change labels
- Change wording
- Change colors
- Change layout
- Replace checkboxes with text
- Replace icons with words
- Add frames or cards
- Remove frames unless explicitly instructed

✅ 4. Add acceptance criteria per feature

For example, for Create Ingredient:
Acceptance criteria:

- Draft ingredient is created after valid name entered
- Duplicate name is blocked
- Activate changes status to Active
- Effective start date = today
- Ingredient becomes selectable in Recipe Management and Meal Production Management
- Draft can be deleted
- Active cannot be deleted

✅ 5. STOP condition

**This is critical:** If any requirement conflicts with existing code or UI Hygiene contract, STOP and report the conflict instead of making assumptions.

✅ 6. Glossary of the Ingredients Management form

- `Draft` = not selectable in Recipe management and Meal Production, no effective start date or end date. Can be viewed, can be edited, can be deleted, can not be copied, can not be disabled.
- `Active` = selectable, has an effective start date and effective end date = 31-Dec-9999. Can be viewed, copied, edited, disabled. Can not be deleted.
- `Disabled` = historical only. Not selectable, has an effective start date, has an effective end date < 31-Dec-9999 and < today’s date. Can be viewed. Can not be edited, can not be deleted, can not be copied, can not be disabled.
- `Activate` = irreversible action. Only applicable to Draft and only presented during Create, Edit, Copy actions.
- `Delete` = irreversible action. Only applicable to Draft
- `Copy` = duplicate attributes except name.
- `Edit` = versioning with disable old + create new
