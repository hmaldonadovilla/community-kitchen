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
   - Optional: add a `List View?` column (to the right of Validation Rules). Mark `TRUE` on the fields you want to show in the list view; if at least one is `TRUE`, the form starts in list mode automatically. Labels come from the question text.
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
   - **Dynamic data sources (options/prefills)**: For CHOICE/CHECKBOX questions, you can set `dataSource` in the Config JSON: `{ "dataSource": { "id": "INVENTORY_PRODUCTS", "mode": "options" } }`. The backend `fetchDataSource(id, language)` Apps Script function (to be added by you) should return an array of options. Use this when options need to stay in sync with another form or sheet.
   - **Selection effects (auto line items)**: Add `selectionEffects` to a CHOICE/CHECKBOX config to spawn line items automatically when certain values are picked. Example:

      ```json
      {
        "selectionEffects": [
          {
            "type": "addLineItems",
            "groupId": "DELIVERY_LINES",
            "triggerValues": ["Add lines"],
            "preset": { "ITEM_UNIT": "Crate" }
          }
        ]
      }
      ```

      This will add a row to the `DELIVERY_LINES` line-item group when the value "Add lines" is selected, pre-filling the `ITEM_UNIT` field with "Crate".
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
   - **Visibility & reset helpers**: Add `visibility` to show or hide a question/line-item field based on another field (`showWhen`/`hideWhen`). Add `clearOnChange: true` to a question to clear all other fields and line items when it changes (useful when a top selector drives all inputs).
   - **Post-submit views (summary/follow-up)**: The web app now shows a submission summary and optional follow-up actions after submit. Configure follow-up actions in code (e.g., links to download receipts or start a follow-up form). A **Submit another** button returns to the form.
   - **Data list view**: A simple list view scaffold is available; wire it to a backend fetcher if you want to show submitted rows in the web app.
   - **Line-item selector & totals**: In a line-item JSON config you can add `sectionSelector` (with `id`, labels, and `options` or `optionsRef`) to render a dropdown above the rows so filters/validation can depend on it. Add `totals` to display counts or sums under the line items, for example: `"totals": [ { "type": "count", "label": { "en": "Items" } }, { "type": "sum", "fieldId": "QTY", "label": { "en": "Qty" }, "decimalPlaces": 1 } ]`.
   - **Quick recipe for the new features**:
     - *Section selector (top-left dropdown in line items)*: In the LINE_ITEM_GROUP JSON, add:

       ```json
       {
         "sectionSelector": {
           "id": "ITEM_FILTER",
           "labelEn": "Category",
           "optionsRef": "REF:SelectorOptions" // or inline: "options": ["Veg", "Dairy"], "optionsFr": [...]
         },
         "fields": [ ...your existing line-item fields... ]
       }
       ```

       Use `ITEM_FILTER` in line-item `optionFilter.dependsOn` or validation `when.fieldId` so options/rules react to the selector.
     - *Totals under line items*: In the same LINE_ITEM_GROUP JSON, append:

       ```json
       "totals": [
         { "type": "count", "label": { "en": "Items" } },
         { "type": "sum", "fieldId": "QTY", "label": { "en": "Total qty" }, "decimalPlaces": 1 }
       ]
       ```

       `count` tallies visible rows; `sum` adds a numeric line-item field (`fieldId` required).
     - *Show/hide logic*: Add `visibility` wherever you configure the field (Config JSON for main questions; line-item field Config column or inline field JSON):

       ```json
       { "visibility": { "showWhen": { "fieldId": "Supplier", "equals": "Local" } } }
       ```

       Supports `showWhen`/`hideWhen` with `equals`, `greaterThan`, `lessThan`. Line-item fields can reference top-level or sibling fields (including `sectionSelector`).
     - *Clear-on-change reset*: On a controlling question add `clearOnChange: true` in Config JSON. When that field changes, all other fields and line items clear, then filters/visibility reapply. Handy for “mode” or “category” selectors.
     - *List view (start on list)*: Add a `List View?` column to the config sheet and mark `TRUE` on the fields you want to display in the list. If at least one is `TRUE`, the form definition includes `listView` and `startRoute: "list"` so the app opens in list mode showing those fields plus `createdAt`/`updatedAt` with pagination.
     - *Data sources (options/prefill from sheets/tabs)*: For CHOICE/CHECKBOX questions (or line-item fields via field JSON), set `dataSource`:

       ```json
       {
         "dataSource": {
           "id": "1abcDEFsheetId::Products",    // or "Products" for same spreadsheet tab
           "projection": ["name_en"],
           "localeKey": "locale",               // optional column used to filter by locale
           "mapping": { "name_en": "value" },   // optional source->target remap
           "limit": 100,
           "mode": "options"
         }
       }
       ```

       The backend `fetchDataSource` reads that tab (or external sheet id + tab) with projection, locale filtering, and mapping. For prefilling line items, include the `mapping` that matches source columns to target field ids.
     - *List view support*: The web app list view is paginated and shows `createdAt`/`updatedAt`. Configure which columns to display via the form definition’s `listView` (field ids). Backend uses `fetchSubmissions`/`fetchSubmissionById`; save uses `saveSubmissionWithId`.
     - *Dedup rules*: Create a sheet named `<Config Sheet Name> Dedup` (e.g., `Config: Fridge Dedup`) with columns:
       1) Rule ID
       2) Scope (`form` or a `dataSourceId` if dedup checks another tab)
       3) Keys (comma-separated field ids forming the uniqueness composite)
       4) Match mode (`exact` or `caseInsensitive`)
       5) On conflict (`reject`, `ignore`, `merge` – merge not implemented)
       6) Message (string or localized JSON)

       Example row: `uniqueNameDate | form | name,date | caseInsensitive | reject | {"en":"Duplicate entry","fr":"Entrée dupliquée"}`. On submit, duplicates are rejected and the message is returned to the frontend.

3. **Web App (Custom UI)**
   - Publish a **Web app** deployment pointing to `doGet`.
   - Share the deployment URL with volunteers; submissions will be written directly to the destination tab and support line items + file uploads.
   - The web app supports list views (paginated) and edit-in-place. The frontend uses `fetchSubmissions` and `fetchSubmissionById` to open existing records with `createdAt`/`updatedAt`. Save calls `saveSubmissionWithId` (or client helper `submitWithDedup`), which enforces dedup rules and returns any conflict messages to display.
   - Validation errors surface in-context: the first invalid field is highlighted and auto-scrolled into view, and a red banner appears under the submit button on long forms.
   - Optional: add `?form=ConfigSheetName` to target a specific form (defaults to the first dashboard entry).

## 7. Generate All Forms

1. Click **Community Kitchen** > **2. Generate All Forms**.
2. The script will:
   - Create new forms if they don't exist.
   - Update existing forms if they do (based on Form ID).
   - Rename the response tab for new forms.
   - Populate the Dashboard with Edit/Published URLs.
