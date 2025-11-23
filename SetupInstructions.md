# Google Apps Script Setup Instructions (TypeScript)

This project uses TypeScript. You need to build the script before using it in Google Sheets.

## 1. Prerequisites

- Node.js installed on your machine.

## 2. Build the Script

1. Open a terminal in this directory.
2. Run `npm install` to install dependencies.
3. Run `npm test` to run unit tests (Optional).
4. Run `npm run build` to compile the TypeScript code.
   - This will generate a `dist/Code.js` file.

## 3. Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it "Community Kitchen Logs".

## 4. Add the Script

1. In the spreadsheet, go to **Extensions** > **Apps Script**.
2. Delete any code in the `Code.gs` file.
3. Copy the content of `dist/Code.js` (generated in step 2) and paste it into the editor.
4. Click the **Save** icon.
5. Name the project "Form Generator".

## 5. Run Setup

1. Refresh your Google Sheet tab.
2. Click **Community Kitchen** > **1. Setup Dashboard**.
3. Authorize the script when prompted.
4. This will create a "Forms Dashboard" and example config sheets.

## 6. Configure Your Forms

1. **Dashboard**: Add new rows to the "Forms Dashboard" sheet for each form.
   - **Form Title**: The title users will see.
   - **Configuration Sheet Name**: e.g., "Config: Fridge".
   - **Destination Tab Name**: Name for the sheet where responses will go (e.g., "Fridge Logs").
   - **Description**: Form description.
   - **Form ID / URLs**: Leave these blank. The script will fill them in.
2. **Config Sheets**: Create new sheets (tabs) for each form.
   - Copy the header row from an example sheet (includes `Config (JSON/REF)` for line items or file upload settings).
   - **Status**: Set to "Active" to include in the form, or "Archived" to remove it (keeping data).
   - **Line items**: Set `Type` to `LINE_ITEM_GROUP` and use the `Config (JSON/REF)` column with JSON or `REF:SheetName` pointing to a line-item sheet (columns: ID, Type, Label EN/FR/NL, Required?, Options EN/FR/NL). Line-item field types can be DATE, TEXT, PARAGRAPH, NUMBER, CHOICE, CHECKBOX.
     - Overlay add flow (multi-select): include `addMode`, `anchorFieldId`, and optional `addButtonLabel` in the JSON. The anchor must be a CHOICE field ID inside the line-item fields. Example:

       ```json
       {
         "addMode": "overlay",
         "anchorFieldId": "ITEM_PRODUCT",
         "addButtonLabel": { "en": "Add multiple lines" },
         "fields": [
           { "id": "ITEM_PRODUCT", "type": "CHOICE", "labelEn": "Product", "options": ["Tomatoes", "Potatoes"] },
           { "id": "ITEM_UNIT", "type": "CHOICE", "labelEn": "Unit", "options": ["Crate", "Bag"] }
         ]
       }
       ```

       Users tap **Add lines**, pick multiple products in the overlay, and a new row is created per selection. You can still keep line-item fields in a ref sheet (e.g., `Options (EN)` = `REF:DeliveryLineItems`) while storing only the overlay metadata (addMode/anchor/button label) in `Config (JSON/REF)`. The ref sheet supplies fields; the JSON supplies overlay settings.
   - **File uploads**: Set `Type` to `FILE_UPLOAD` and use the `Config (JSON/REF)` column with JSON keys: `destinationFolderId`, `maxFiles`, `maxFileSizeMb`, `allowedExtensions`.
   - **Filters & rules**: For CHOICE/CHECKBOX fields, add `optionFilter` in the JSON to filter options based on another field, and `validationRules` to enforce dependencies (works in main form and line items).
     - Example (main form filter):

       ```json
       { "optionFilter": { "dependsOn": "Supplier", "optionMap": { "VDS": ["Fresh vegetables", "Dairy"], "*": ["Other"] } } }
       ```

      - Composite filters and cross-scope dependencies:
        - `dependsOn` can be a single ID or an array (for multi-field filters). When you provide an array, join dependency values with `||` in `optionMap` keys, plus `*` as a fallback.
        - Line-item filters can depend on top-level fields; reference the parent field ID directly.

        ```json
        { "optionFilter": { "dependsOn": ["Supplier", "Delivery type"], "optionMap": { "VDS||Fresh vegetables": ["Chilled"], "VDS": ["Dry"], "*": ["Dry", "Chilled"] } } }
        ```

        ```json
        { "optionFilter": { "dependsOn": "Delivery type", "optionMap": { "Frozen": ["Freezer"], "*": ["Fridge", "Freezer"] } } }
        ```

     - Example (main form validation):

       ```json
       { "validationRules": [ { "when": { "fieldId": "Delivery type", "equals": "Carrots" }, "then": { "fieldId": "Unit", "allowed": ["Crates"] }, "message": "Carrots must be recorded in crates." } ] }
       ```

     - Numeric + required rules:

       ```json
       { "validationRules": [
         { "when": { "fieldId": "Delivery type", "equals": "Fresh vegetables" }, "then": { "fieldId": "Temperature (°C)", "required": true, "max": 10 }, "message": "Fresh veg must have a temperature of 10°C or less." },
         { "when": { "fieldId": "Quantity", "greaterThan": 100 }, "then": { "fieldId": "Notes", "required": true }, "message": "Add a note when quantity is over 100." }
       ] }
       ```

       Supported conditions: `equals` (string/array), `greaterThan`, `lessThan`. Actions: `required` true/false, `min`, `max`, `allowed`, `disallowed`.

       Validation messages can be localized. `message` accepts a string or an object keyed by language (EN/FR/NL) and falls back to English. Example:

       ```json
       {
         "validationRules": [
           {
             "when": { "fieldId": "Delivery type", "equals": "Carrots" },
             "then": { "fieldId": "Unit", "allowed": ["Crates"] },
             "message": { "en": "Carrots must be in crates.", "fr": "Les carottes doivent être en caisses.", "nl": "Wortelen moeten in kratten." }
           }
         ]
       }
       ```

     - Example (line-item filter): put this in the line-item config JSON or line-item ref sheet Config column:

       ```json
       { "optionFilter": { "dependsOn": "LI1", "optionMap": { "Tomatoes": ["Box", "Tray"], "Potatoes": ["Bag"], "*": ["Box"] } } }
       ```

     - Example (line-item validation):

       ```json
       { "validationRules": [ { "when": { "fieldId": "LI1", "equals": "Carrots" }, "then": { "fieldId": "LI2", "allowed": ["Crate"] }, "message": "Carrots only allowed in crates." } ] }
       ```

       The same operators (`equals`, `greaterThan`, `lessThan`) and actions (`required`, `min`, `max`, `allowed`, `disallowed`) work inside line items.

3. **Web App (Custom UI)**
   - Publish a **Web app** deployment pointing to `doGet`.
   - Share the deployment URL with volunteers; submissions will be written directly to the destination tab and support line items + file uploads.
   - Validation errors surface in-context: the first invalid field is highlighted and auto-scrolled into view, and a red banner appears under the submit button on long forms.
   - Optional: add `?form=ConfigSheetName` to target a specific form (defaults to the first dashboard entry).

## 7. Generate All Forms

1. Click **Community Kitchen** > **2. Generate All Forms**.
2. The script will:
   - Create new forms if they don't exist.
   - Update existing forms if they do (based on Form ID).
   - Rename the response tab for new forms.
   - Populate the Dashboard with Edit/Published URLs.
