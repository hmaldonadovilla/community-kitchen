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
   - Optional: add a `List View?` column (to the right of Validation Rules). Mark `TRUE` on the fields you want to show in the list view; if at least one is `TRUE`, the form starts in list mode automatically. Labels come from the question text. You can also define the default sort for a given column by adding `"listViewSort": { "direction": "desc", "priority": 1 }` to that question’s Config JSON. Lower priorities win; when nothing is specified we fall back to `updatedAt desc`.
   - Want the list view to show system fields like Created/Updated/Status/PDF URL? Add `"listViewMetaColumns": ["updatedAt", "status", "pdfUrl"]` to the **Follow-up Config (JSON)** column on the dashboard. Supported values are `createdAt`, `updatedAt`, `status`, and `pdfUrl`; the columns appear in the order you list them, and users can click any column header to sort ascending/descending.
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
   - **File uploads**: Set `Type` to `FILE_UPLOAD` and use the `Config (JSON/REF)` column with JSON keys: `destinationFolderId`, `maxFiles`, `maxFileSizeMb`, `allowedExtensions`. The React UI renders drag-and-drop upload zones that respect those caps, highlight remaining slots, and announce changes for screen readers; volunteers can still click to browse if drag/drop is unavailable. When `CK_DEBUG` is enabled you’ll also see `[ReactForm] upload.*` events in DevTools that describe every add/remove/drop action for troubleshooting.
   - **Dynamic data sources (options/prefills)**: For CHOICE/CHECKBOX questions, you can set `dataSource` in the Config JSON: `{ "dataSource": { "id": "INVENTORY_PRODUCTS", "mode": "options" } }`. The backend `fetchDataSource(id, language)` Apps Script function (to be added by you) should return an array of options. Use this when options need to stay in sync with another form or sheet.
   - **Auto-increment IDs**: For `TEXT` questions that should generate IDs (e.g., “Meal Preparation #”), add:

     ```json
     {
       "autoIncrement": {
         "prefix": "MP-AA",
         "padLength": 6
       }
     }
     ```

     Leave the field empty in the UI and the backend will emit `MP-AA000001`, `MP-AA000002`, etc. Counters are stored in script properties, so numbering persists across deployments. Use `"propertyKey": "MEAL_RUN"` when you need isolated counters within the same form.
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
   - **Post-submit views (summary/follow-up)**: The React app shows a submission summary with the record ID (copy button), timestamps, status, and quick CTAs for “Go to follow-up” / “Submit another”. Follow-up actions stay disabled until a record is selected, display the current status + last updated timestamp, and highlight the configured status transitions so operators always know what each button does. Configure the follow-up behavior in code (PDF/email templates, destination folders, recipients) just like before.
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

### Data-driven selection effects (line items)

Use `type: "addLineItemsFromDataSource"` when you want a CHOICE/CHECKBOX field—either on the main form or inside a `LINE_ITEM_GROUP`—to pull JSON rows from another sheet and generate ingredients/parts automatically. This is how the Meal Production form hydrates `MP_INGREDIENTS_LI` from the “Recepies Data” tab.

1. **Provide a data source on the driving field** (main question or line-item field):

   ```json
   {
     "dataSource": {
       "id": "Recepies Data",
       "projection": ["Dish Name", "Number of Portions", "Ingredients"],
       "mode": "options"
     }
   }
   ```

   - `id`: tab name (same spreadsheet) or `sheetId::tabName` for an external file.
   - `projection`: columns you need to return (include the lookup column plus any fields referenced later such as `Ingredients`, `Number of Portions`).
   - Optional `mapping`, `localeKey`, `limit`, etc., follow the standard data-source contract.

2. **Attach the selection effect** to the same field:

   ```json
   {
     "selectionEffects": [
       {
         "type": "addLineItemsFromDataSource",
         "groupId": "MP_INGREDIENTS_LI",
         "lookupField": "Dish Name",
         "dataField": "Ingredients",
         "lineItemMapping": { "ING": "ING", "QTY": "QTY", "UNIT": "UNIT" },
         "aggregateBy": ["ING", "UNIT"],
         "aggregateNumericFields": ["QTY"],
         "clearGroupBeforeAdd": true,
         "rowMultiplierFieldId": "QTY",
         "dataSourceMultiplierField": "Number of Portions",
         "scaleNumericFields": ["QTY"]
       }
     ]
   }
   ```

   Field reference guide:

   - `groupId`: destination line-item group ID (must exist in the same form definition).
   - `lookupField`: column from the data source used to match the selected value. Defaults to the first column or the data source `mapping.value`.
   - `dataField`: column that contains a JSON array/object describing the rows to add (e.g., `Ingredients` = `[{"ING":"Carrots","QTY":"2","UNIT":"kg"}]`).
   - `lineItemMapping`: map of line-item field ids → keys/paths in each JSON entry. Dot notation is supported for nested objects.  
     - Prefix a path with `$row.` to copy values from the originating line-item row (the row whose fields triggered the effect). Example: `"lineItemMapping": { "ING": "ING", "QTY": "QTY", "UNIT": "UNIT", "RECIPE": "$row.RECIPE" }` copies the row’s `RECIPE` field into each generated ingredient line so you can keep track of the source dish; add that field to `aggregateBy` if you need separate buckets per recipe.
   - `aggregateBy`: non-numeric fields used to build a dedupe key. Identical values across these fields are merged into a single row.
   - `aggregateNumericFields`: numeric fields that should be summed when aggregation occurs. All line-item fields typed as NUMBER are automatically included.
   - `scaleNumericFields`: optional explicit list of fields whose numeric values should be multiplied by the scale factor. If omitted, it reuses `aggregateNumericFields`, then NUMBER fields.
   - `clearGroupBeforeAdd`: defaults to `true`. Set to `false` to append instead of rebuilding.

3. **Optional multiplier support**:

   - `rowMultiplierFieldId`: the originating line-item field whose numeric value (e.g., “Meals” or “Quantity”) drives scaling.
   - `dataSourceMultiplierField`: column in the data source row that represents the baseline quantity (e.g., “Number of Portions”). The runtime divides `rowMultiplierFieldId` by this baseline to get the scale factor.
   - Effectively, `scaledValue = sourceValue * (rowMultiplier / dataSourceBaseline)`, and the result is rounded to two decimals before aggregation.

4. **Line-item drivers**: You can place the CHOICE/CHECKBOX field inside the same line-item group that will receive the generated rows. Each row maintains its own cache so selecting “Dish A” in row one and “Dish B” in row two aggregates correctly. A row triggers only when all required fields are filled (or when you explicitly clear the row).

5. **Debugging & logs**:

   - Enable `CK_DEBUG` (see “Debug Logging” in this document) to surface `[SelectionEffects]` logs in DevTools.
   - Watch for:
     - `[SelectionEffects] evaluating …` – shows current/new/removed selections per row/context.
     - `[SelectionEffects] scale factor computed …` – prints the multiplier, desired quantity, baseline, and final factor.
     - `[SelectionEffects] data-driven effect produced no entries` – indicates the data field returned an empty array or the lookup column didn’t match.

Full example (Meal Production line items):

```json
{
  "lineItemConfig": {
    "fields": [
      {
        "id": "RECIPE",
        "type": "CHOICE",
        "labelEn": "Recipe",
        "required": true,
        "dataSource": {
          "id": "Recepies Data",
          "projection": ["Dish Name", "Number of Portions", "Ingredients"],
          "mode": "options"
        },
        "selectionEffects": [
          {
            "type": "addLineItemsFromDataSource",
            "groupId": "MP_INGREDIENTS_LI",
            "lookupField": "Dish Name",
            "dataField": "Ingredients",
            "lineItemMapping": { "ING": "ING", "QTY": "QTY", "UNIT": "UNIT" },
            "aggregateBy": ["ING", "UNIT"],
            "aggregateNumericFields": ["QTY"],
            "rowMultiplierFieldId": "MEALS",
            "dataSourceMultiplierField": "Number of Portions",
            "scaleNumericFields": ["QTY"]
          }
        ]
      },
      { "id": "MEALS", "type": "NUMBER", "labelEn": "Meals", "required": true }
    ]
  }
}
```

When a row is filled with `RECIPE = "Dish A"` and `MEALS = 20`, the runtime:

1. Fetches “Dish A” from “Recepies Data”.
2. Reads the `Ingredients` JSON and the baseline `Number of Portions` (e.g., `10`).
3. Multiplies every ingredient quantity by `20 / 10 = 2.0`, rounds to two decimals, aggregates duplicates across all selected dishes, and writes them into `MP_INGREDIENTS_LI`.
4. If the row is cleared or deselected, only that contribution is removed.

Tip: if you see more than two decimals, confirm you’re on the latest bundle and that `scaleNumericFields` includes the field you expect. Aggregation rounds to two decimals before sending presets to the DOM.

### Follow-up actions (PDF/email/close)

1. **Add config on the dashboard**: the *Forms Dashboard* now includes a “Follow-up Config (JSON)” column. Provide the per-form automation settings there. Example:

   ```json
   {
     "pdfTemplateId": {
       "EN": "1PdfTemplateForEnglish",
       "FR": "1PdfTemplateForFrench"
     },
     "pdfFolderId": "1FOLDERIDOptional",
     "emailTemplateId": {
       "EN": "1EmailDocEn",
       "FR": "1EmailDocFr"
     },
     "emailSubject": {
       "en": "Meal production summary",
       "fr": "Synthèse production"
     },
     "emailRecipients": [
       "ops@example.com",
       {
         "type": "dataSource",
         "recordFieldId": "DISTRIBUTOR",
         "lookupField": "Distributor",
         "valueField": "email",
         "dataSource": {
           "id": "Distributor Data",
           "projection": ["Distributor", "email"]
         },
         "fallbackEmail": "kitchen@example.com"
       }
     ],
     "statusFieldId": "STATUS_FIELD",
     "statusTransitions": {
       "onPdf": "PDF ready",
       "onEmail": "Emailed",
       "onClose": "Closed"
     }
   }
   ```

   - `pdfTemplateId`: Google Doc template used to build the PDF. Provide either a single Doc ID or an object keyed by `EN`/`FR`/`NL` (the form language determines which template runs). Use `{{FIELD_ID}}` tokens (or slugified labels) in the Doc; the runtime replaces them with the submitted values (line items render as bullet summaries).  
   - `pdfFolderId` (optional): target Drive folder for generated PDFs; falls back to the spreadsheet’s parent folder.  
   - `emailTemplateId`: Google Doc containing the email body. Can be a string or language map (same rules as the PDF template). Tokens work the same as in the PDF template.  
   - `emailRecipients`: list of addresses. Entries can be plain strings (placeholders allowed) or objects describing a data source lookup:
     - `recordFieldId`: the form/line-item field whose submitted value should be used as the lookup key.
     - `dataSource`: standard data source config (sheet/tab reference, projection, limit, etc.).
     - `lookupField`: column in the data source to match against the submitted value.
     - `valueField`: column containing the email address to use.
     - `fallbackEmail` (optional): used when the lookup fails.
   - `emailCc` / `emailBcc`: same structure as `emailRecipients`, useful for copying chefs/managers automatically.
   - `statusFieldId` (optional): question ID to overwrite when actions run. If omitted we use the auto-generated `Status` column in the response tab.  
   - `statusTransitions`: strings written when `CREATE_PDF`, `SEND_EMAIL`, or `CLOSE_RECORD` complete.

2. **Provide templates**:
   - PDF / email templates live in Docs. Use literal placeholders (`{{FIELD_ID}}`, `{{RECORD_ID}}`, etc.). Line item groups render as bullet lists (`Label EN: value • ...`).  
   - Store the Doc IDs in the dashboard JSON. When the action runs we copy the Doc, replace tokens, export to PDF, and (optionally) email it as an attachment.

3. **Run actions**:
   - After submit, the Summary step now surfaces “Create PDF”, “Send PDF via email”, and “Close record” buttons when a record ID is available.  
   - The list view gained the `⋮` action menu so you can trigger the same follow-ups (or open the record) without leaving the table. Search/filter/sort all run client-side, so it feels instant even with ~200 rows.

4. **Status & links**:
   - The response tab automatically gains `Status` and `PDF URL` columns. Actions update those cells plus any custom `statusFieldId` you provided.  
   - Every action also refreshes the list view cache, so the new status is visible after a second or two.
     - *List view support*: The web app list view is paginated and shows `createdAt`/`updatedAt`. Configure which columns to display via the form definition’s `listView` (field ids). Backend uses `fetchSubmissions`/`fetchSubmissionById`; save uses `saveSubmissionWithId`.
     - *Dedup rules*: Create a sheet named `<Config Sheet Name> Dedup` (e.g., `Config: Fridge Dedup`) with columns:
       1) Rule ID
       2) Scope (`form` or a `dataSourceId` if dedup checks another tab)
       3) Keys (comma-separated field ids forming the uniqueness composite)
       4) Match mode (`exact` or `caseInsensitive`)
       5) On conflict (`reject`, `ignore`, `merge` – merge not implemented)
       6) Message (string or localized JSON)

       Example row: `uniqueNameDate | form | name,date | caseInsensitive | reject | {"en":"Duplicate entry","fr":"Entrée dupliquée"}`. On submit, duplicates are rejected and the message is returned to the frontend.

### Web App (Custom UI)

- Publish a **Web app** deployment pointing to `doGet`.
- Share the deployment URL with volunteers; submissions will be writtendirectly to the destination tab and support line items + file uploads.
- The web app supports list views (paginated) and edit-in-place. The frontenduses `fetchSubmissions` and `fetchSubmissionById` to open existing records with`createdAt`/`updatedAt`. Save calls `saveSubmissionWithId` (or client helper`submitWithDedup`), which enforces dedup rules and returns any conflictmessages to display.
- Validation errors surface in-context: the first invalid field is highlightedand auto-scrolled into view, and a red banner appears under the submit buttonon long forms.
- Optional: add `?form=ConfigSheetName` to target a specific form (defaults tothe first dashboard entry).

### Template placeholders (PDF/email)

- **Basic fields**: Use `{{FIELD_ID}}` or the slugified label (`{{MEAL_NUMBER}}`) inside your Doc template. Standard metadata is available out of the box: `{{RECORD_ID}}`, `{{FORM_KEY}}`, `{{CREATED_AT}}`, `{{UPDATED_AT}}`, `{{STATUS}}`, etc. Placeholder matching is case-insensitive, so `{{Updated_At}}` works.
- **Data source columns**: When a CHOICE/CHECKBOX question comes from a data source, you can access the columns returned in its `projection` via `{{QUESTION_ID.Column_Name}}` (spaces become underscores). Example: `{{MP_DISTRIBUTOR.Address_Line_1}}`, `{{MP_DISTRIBUTOR.CITY}}`, `{{MP_DISTRIBUTOR.EMAIL}}`.
- **Line item tables**: Build a table row whose cells contain placeholders such as `{{MP_INGREDIENTS_LI.ING}}`, `{{MP_INGREDIENTS_LI.CAT}}`, `{{MP_INGREDIENTS_LI.QTY}}`. The service duplicates that row for every line item entry and replaces the placeholders per row. Empty groups simply clear the template row.
- **Grouped line item tables**: Add a directive placeholder like `{{GROUP_TABLE(MP_INGREDIENTS_LI.RECIPE)}}` anywhere inside the table you want duplicated per recipe. The renderer will:
  1. Create a copy of the entire table for every distinct value of the referenced field (`RECIPE` in this example).
  2. Replace the directive placeholder with the group value (so you can show it in the heading).
  3. Populate the table rows with only the line items that belong to that recipe.  
  Combine this with row-level placeholders (e.g., `{{MP_INGREDIENTS_LI.ING}}`, `{{MP_INGREDIENTS_LI.CAT}}`, `{{MP_INGREDIENTS_LI.QTY}}`) to print a dedicated ingredient table per dish without manually duplicating sections in the template.
- **Consolidated values**: Use `{{CONSOLIDATED(GROUP_ID.FIELD_ID)}}` (or the slugified label) to list the unique values across a line item group. Example: `{{CONSOLIDATED(MP_INGREDIENTS_LI.ALLERGEN)}}` renders `GLUTEN, NUTS, SOY`.

## 7. Generate All Forms

1. Click **Community Kitchen** > **2. Generate All Forms**.
2. The script will:
   - Create new forms if they don't exist.
   - Update existing forms if they do (based on Form ID).
   - Rename the response tab for new forms.
   - Populate the Dashboard with Edit/Published URLs.
   - Invalidate the server-side Script Cache so the custom web app immediately serves the regenerated form definitions.

## 8. Publish the Web App

1. In Apps Script, go to **Deploy → New deployment** and choose **Web app**.
2. Set the entry point to `doGet`, grant access to the volunteers’ Google accounts, and deploy.
3. Share the deployment URL. The React experience is served by default and is the only supported UI going forward.
