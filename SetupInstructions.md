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
    - **Group cards (collapsible sections)**: In a question’s `Config (JSON/REF)` cell, you can set a `group` to render fields together inside a card section in the **form body** (collapsible if you want). Example (a “Header” section rendered as a collapsible card):

      ```json
      {
        "group": { "header": true, "title": "Header", "collapsible": true, "defaultCollapsed": false }
      }
      ```

      > **Notes:**
      >- The app header only contains **form title**, **build number**, **language selector**, and **burger menu**.
      >- Legacy `"header": true` is deprecated but still supported; it is mapped to `group: { header: true, title: "Header", collapsible: true }`.
      >- When `group.collapsible` is enabled, the section header shows a **progress pill** `completed/required` (required fields only). Clicking the pill expands/collapses the section.

    - **Field pairing (2‑up layout)**: Use `pair` to control which fields appear next to each other on the same row. If `pair` is not set (or no matching pair is found), the field takes the full row.

        ```json
        { "pair": "qty_temp" }
        ```

    - **Label/control layout override**: Default behavior is label+control inline on full-width rows, and stacked label+control inside 2-up grids. To force stacked label+control even when a field takes the full row:

        ```json
        { "ui": { "labelLayout": "stacked" } }
        ```

    - **Hide/remove a field label**: To visually hide a field label (kept for accessibility), set `ui.hideLabel: true`:

        ```json
        { "ui": { "hideLabel": true } }
        ```

        Works for both top-level questions and line-item fields.

    - **Custom required-field message (localized)**: For required fields, you can override the default required error message by adding `requiredMessage` to the field’s Config JSON. The message supports `{field}` (resolved to the localized field label).
      - For `FILE_UPLOAD` fields, this is used when the effective minimum is 1 (i.e., `required: true` with no `minFiles`, or `uploadConfig.minFiles: 1`). For higher minimums, use `uploadConfig.errorMessages.minFiles`.

        ```json
        {
          "requiredMessage": {
            "en": "Please complete {field}.",
            "fr": "Veuillez remplir {field}.",
            "nl": "Vul {field} in."
          }
        }
        ```

    - **Summary view field visibility**: By default, the Summary view only shows fields that are currently visible in the Form view (i.e., not hidden by `visibility`). You can override this per field (and per line-item field/subgroup field) via `ui.summaryVisibility`:

        ```json
        { "ui": { "summaryVisibility": "always" } }
        ```

        Supported values:
        - `inherit` (default): follow normal `visibility` rules
        - `always`: show even if hidden by `visibility`
        - `never`: never show in summary

    - Optional: add a `List View?` column (to the right of Validation Rules). Mark `TRUE` on the fields you want to show in the list view; if at least one is `TRUE`, the form starts in list mode automatically. Labels come from the question text. You can also define the default sort for a given column by adding `"listViewSort": { "direction": "desc", "priority": 1 }` to that question’s Config JSON. Lower priorities win; when nothing is specified we fall back to `updatedAt desc`.
    - Want the list view to show system fields like Created/Updated/Status/PDF URL? Add `"listViewMetaColumns": ["updatedAt", "status", "pdfUrl"]` to the **Follow-up Config (JSON)** column on the dashboard. Supported values are `createdAt`, `updatedAt`, `status`, and `pdfUrl`; the columns appear in the order you list them, and users can click any column header to sort ascending/descending.
      - Recommended (consolidated): use `listView.metaColumns` instead:

      ```json
      { "listView": { "metaColumns": ["updatedAt", "status", "pdfUrl"] } }
      ```

    - Want to change the **list view title**? Set `listView.title`:

      ```json
      { "listView": { "title": { "en": "My Records" } } }
      ```

    - Want to replace the default keyword search with **search by date**? Set `listView.search`:

      ```json
      { "listView": { "search": { "mode": "date", "dateFieldId": "DATE" } } }
      ```

      Notes:
      - `dateFieldId` should usually be a `DATE` question id.
      - The list view automatically fetches this field for filtering even if it is not shown as a visible column.

    - Want a **rule-based Action column** (computed from record fields)? Add `"listViewColumns"` to the same dashboard JSON column. These columns are **prepended** before question + meta columns.
      - Recommended (consolidated): use `listView.columns` instead of `listViewColumns`.

      Example: show `Missing` (⚠️) when the record DATE is not today and the status is not Closed; otherwise show `Edit` or `View`. Clicking the cell opens the record in the Form (edit) view (Closed records are read-only):

      ```json
      {
        "listView": {
          "columns": [
            {
              "type": "rule",
              "fieldId": "action",
              "label": { "en": "Action" },
              "openView": "form",
              "cases": [
                { "when": { "all": [ { "fieldId": "status", "notEquals": "Closed" }, { "fieldId": "DATE", "isNotToday": true } ] }, "text": "Missing", "style": "warning", "icon": "warning" },
                { "when": { "fieldId": "status", "notEquals": "Closed" }, "text": "Edit", "style": "link" },
                { "when": { "fieldId": "status", "equals": "Closed" }, "text": "View", "style": "link" }
              ]
            }
          ]
        }
      }
      ```

      Tip: to make a `style: "link"` case open a URL stored in another field (e.g. `pdfUrl`), set `hrefFieldId` on the column or the case:

      ```json
      {
        "listView": {
          "columns": [
            {
              "type": "rule",
              "fieldId": "pdf",
              "label": { "en": "PDF" },
              "hrefFieldId": "pdfUrl",
              "cases": [
                { "when": { "fieldId": "pdfUrl", "notEmpty": true }, "text": "Open PDF", "style": "link" },
                { "text": "—", "style": "muted" }
              ]
            }
          ]
        }
      }
      ```

      Optional: show a **legend in the sticky bottom bar** to explain icons / table elements. The legend is **only shown when you define it** (recommended when you use `icon` in rule columns):

      ```json
      {
        "listView": {
          "legend": [
            { "icon": "warning", "text": { "en": "Needs attention (e.g. Missing DATE)" } },
            { "icon": "check", "text": { "en": "OK / complete" } },
            { "text": { "en": "Click Action to open the record." } }
          ]
        }
      }
      ```

      Supported icons: `warning`, `check`, `error`, `info`, `external`, `lock`, `edit`, `view`.

    - Want a **logo** in the app header? Set `appHeader.logo` in the dashboard “Follow-up Config (JSON)” column. You can provide a Google Drive file id, a Drive share URL, or a direct `https://...` image URL:

      ```json
      { "appHeader": { "logo": "https://drive.google.com/file/d/<ID>/view?usp=sharing" } }
      ```

    - Want group sections to **auto-collapse on completion** (and optionally open the next incomplete section + auto-scroll on expand)? Set `groupBehavior`:

      ```json
      {
        "groupBehavior": {
          "autoCollapseOnComplete": true,
          "autoOpenNextIncomplete": true,
          "autoScrollOnExpand": true
        }
      }
      ```

    - Want a **submit confirmation dialog** (Confirm/Cancel overlay) title? Set `submissionConfirmationTitle` (localized). When omitted, the UI uses system string defaults:

      ```json
      {
        "submissionConfirmationTitle": {
          "en": "Confirm submission",
          "fr": "Confirmer l'envoi",
          "nl": "Verzenden bevestigen"
        }
      }
      ```

    - Want a **submit confirmation dialog** (Confirm/Cancel overlay) message? Set `submissionConfirmationMessage` (localized). When omitted, the UI uses system string defaults.
      You can include record placeholders using `{FIELD_ID}` (or `{{FIELD_ID}}`) and the UI will substitute the **current record values** (localized display where possible):

      ```json
      {
        "submissionConfirmationMessage": {
          "en": "This report confirms that the checks were completed by {COOK} on {DATE}, in accordance with the Kitchen Safety & Cleaning Checks procedure.",
          "fr": "Ce rapport confirme que les contrôles ont été effectués par {COOK} le {DATE}, conformément à la procédure Kitchen Safety & Cleaning Checks.",
          "nl": "Dit rapport bevestigt dat de controles zijn uitgevoerd door {COOK} op {DATE}, volgens de Kitchen Safety & Cleaning Checks procedure."
        }
      }
      ```

    - Want to **override the Submit button label**? Set `submitButtonLabel` (localized). When omitted, the UI uses system string defaults:

      ```json
      {
        "submitButtonLabel": {
          "en": "Send",
          "fr": "Envoyer",
          "nl": "Verzenden"
        }
      }
      ```

    - Want draft autosave while editing? Add `"autoSave": { "enabled": true, "debounceMs": 2000, "status": "In progress" }` to the same dashboard JSON column. Draft saves run in the background without validation and update the record’s `Updated At` + `Status`. Records with `Status = Closed` are treated as read-only and are not auto-saved.
    - **Status**: Set to "Active" to include in the form, or "Archived" to remove it (keeping data).
    - **Line items**: Set `Type` to `LINE_ITEM_GROUP` and use the `Config (JSON/REF)` column with JSON or `REF:SheetName` pointing to a line-item sheet (columns: ID, Type, Label EN, Label FR, Label NL, Required?, Options (EN), Options (FR), Options (NL), Config JSON). Line-item field types can be DATE, TEXT, PARAGRAPH, NUMBER, CHOICE, CHECKBOX, FILE_UPLOAD.
        - Line-item fields also support `group`, `pair`, and `ui` (including `ui.control` and `ui.labelLayout`) the same way top-level questions do.
        - Header controls:
          - `ui.showItemPill`: show/hide the “N items” pill in the line-item header (default: true)
          - `ui.addButtonPlacement`: where the Add button appears (`top`, `bottom`, `both`, `hidden`; default: `both`)
          - `ui.allowRemoveAutoRows`: when `false`, hides the **Remove** button for rows marked `__ckRowSource: "auto"`
          - `ui.saveDisabledRows`: when `true`, includes disabled progressive rows in the submitted payload (so they can appear in downstream PDFs)
        - Progressive disclosure (collapsed-by-default rows): in the LINE_ITEM_GROUP JSON, add a `ui` block. The collapsed view renders only `collapsedFields` (editable). The expand toggle is gated by `expandGate`:
            - The expand/collapse control is also a **progress pill** `completed/required` for required fields within that row.

       ```json
       {
         "ui": {
           "mode": "progressive",
           "collapsedFields": [
             { "fieldId": "REQUESTED_PORTIONS", "showLabel": true },
             { "fieldId": "LEFTOVER_USED", "showLabel": false }
           ],
           "expandGate": "collapsedFieldsValid",
           "defaultCollapsed": true
         },
         "fields": [
           { "id": "REQUESTED_PORTIONS", "type": "NUMBER", "labelEn": "Requested portions", "required": true },
           { "id": "LEFTOVER_USED", "type": "CHOICE", "labelEn": "Leftover used?", "options": ["NO","YES"] },
           { "id": "CORE_TEMP", "type": "NUMBER", "labelEn": "Core temperature (°C)" },
           { "id": "ACTUAL_PORTIONS", "type": "NUMBER", "labelEn": "Actual portions" }
         ]
       }
       ```

       To block expansion when a numeric collapsed field is 0, add an unconditional validation rule on that field (rules run when `when` has no conditions):

       ```json
       {
         "validationRules": [
           { "when": { "fieldId": "REQUESTED_PORTIONS" }, "then": { "fieldId": "REQUESTED_PORTIONS", "min": 1 }, "message": "Requested must be > 0" }
         ]
       }
       ```

       Put the rule JSON on that line-item field (either inline in `fields[]` or in the line-item ref sheet’s Config column).
    - Row disclaimers (per-row hints): in the LINE_ITEM_GROUP (or subgroup) JSON, you can optionally add `ui.rowDisclaimer` to show a localized disclaimer at the top of each row. It supports simple placeholders using row field ids and `__ckRowSource`:

       ```json
       {
         "ui": {
           "rowDisclaimer": {
             "cases": [
               { "when": { "fieldId": "__ckRowSource", "equals": "auto" }, "text": { "en": "Auto-generated", "fr": "Auto-généré", "nl": "Automatisch" } },
               { "when": { "fieldId": "__ckRowSource", "equals": "manual" }, "text": { "en": "Manual row", "fr": "Ligne manuelle", "nl": "Handmatig" } }
             ]
           }
         }
       }
       ```

       - Placeholders: `{{FIELD_ID}}`, `{{__ckRowSource}}` (auto/manual), `{{__ckRowSourceLabel}}` (localized).
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
    - Auto add flow (no overlay): use `addMode: "auto"` with `anchorFieldId` pointing to a CHOICE line-item field that has an `optionFilter.dependsOn` (one or more controlling fields). When all `dependsOn` fields are filled, the form will automatically create one row per allowed anchor option (same filtering logic as overlay). If the controlling fields change later, auto-generated rows are recomputed and overwritten; manual rows are preserved.
      - Progressive + expand gate: if you also set `"ui": { "mode": "progressive", "expandGate": "collapsedFieldsValid", "collapsedFields": [...] }` then:
        - Auto-generated rows treat the anchor field as the row title and it is not editable (it’s system-selected).
        - Auto-generated rows created by `addLineItemsFromDataSource` selection effects also lock the anchor field and render it as the row title when `anchorFieldId` is set (works for subgroups too).
        - Rows that are still “disabled” (collapsed fields not yet valid) are ignored for validation, so you can submit with unfinished rows.
        - If the LINE_ITEM_GROUP question is marked `required: true`, at least one enabled+valid row is still required (disabled rows don’t satisfy required).
    - Subgroups: add `subGroups` to a line-item group to render child rows under each parent row (e.g., `Ingredients` under a `Dish`). Each child entry reuses the same shape as `LineItemGroupConfig` (min/max/addMode/fields/optionFilter/selectionEffects/totals). You can define child fields inline or point to a ref sheet via `"ref": "REF:ChildTab"` (same column format as parent line-item refs). Inline values override the ref (e.g., to change labels/minRows). **Each subgroup must define a stable `id`**, and submitted payloads contain an array of parents where each parent row stores its child array under that subgroup `id`. Default mode renders inline subgroup sections with Show/Hide. Progressive mode (`ui.mode: "progressive"`) edits subgroups via a full-page overlay opened from “Open …” buttons next to triggering fields (selection effects) plus fallback “Open …” buttons for remaining subgroups.
      Example config:

      ```json
      {
        "lineItemConfig": {
          "fields": [
            { "id": "RECIPE", "type": "TEXT", "labelEn": "Recipe" },
            { "id": "NUMBER_OF_PORTIONS", "type": "NUMBER", "labelEn": "Portions" },
            { "id": "DISH_TYPE", "type": "CHOICE", "labelEn": "Dish type", "options": ["Lunch","Dinner"] }
          ],
          "subGroups": [
            {
              "id": "INGREDIENTS",
              "label": { "en": "Ingredients", "fr": "Ingrédients", "nl": "Ingrediënten" },
              "fields": [
                { "id": "ING", "type": "TEXT", "labelEn": "Ingredient", "required": true },
                { "id": "QTY", "type": "NUMBER", "labelEn": "Qty" },
                { "id": "UNIT", "type": "CHOICE", "labelEn": "Unit", "options": ["g","kg","bag","unit"] },
                { "id": "ALLERGEN", "type": "TEXT", "labelEn": "Allergen" }
              ]
            }
          ]
        }
      }
      ```

      Result shape on submit (summary/PDF use this shape):

      ```json
      [
        {
          "RECIPE": "Vegetables Bulgur",
          "NUMBER_OF_PORTIONS": 4,
          "DISH_TYPE": "Lunch",
          "INGREDIENTS": [
            { "ING": "Bulgur (wheat)", "QTY": "14.40", "UNIT": "kg", "ALLERGEN": "GLUTEN" },
            { "ING": "Couscous mix (frozen)", "QTY": "8", "UNIT": "bag", "ALLERGEN": "GLUTEN" }
          ]
        }
      ]
      ```

    - **PDF templates: forcing visibility for disabled progressive rows**: When a line-item group uses progressive mode with `"expandGate": "collapsedFieldsValid"`, rows that are still disabled (collapsed fields missing/invalid) are rendered in PDFs as **ROW_TABLE title only** by default. To force a specific field row to remain visible in the PDF for disabled rows, wrap the placeholder with:

      - `{{ALWAYS_SHOW(GROUP.FIELD)}}`
      - `{{ALWAYS_SHOW(GROUP.SUBGROUP.FIELD)}}`
      - `{{ALWAYS_SHOW(CONSOLIDATED_ROW(GROUP.SUBGROUP.FIELD))}}`

      Example:

      ```text
      Portions
      {{ALWAYS_SHOW(MP_MEALS_REQUEST.FINAL_QTY)}}
      ```

    - **File uploads**: Set `Type` to `FILE_UPLOAD` and use the `Config (JSON/REF)` column with an `uploadConfig` JSON object. Common keys:
      - `destinationFolderId`: Drive folder to store uploads
      - `minFiles` / `maxFiles`: enforce minimum/maximum number of attachments (submit-time validation)
      - `maxFileSizeMb`: per-file max size (rejected client-side)
      - `allowedExtensions` and/or `allowedMimeTypes`: restrict types (validated client-side)
      - `errorMessages`: optional localized override strings for upload validation errors
      - `helperText`: optional localized helper text shown under the upload control (falls back to system strings)
      - `linkLabel`: optional localized label template used for file links in Summary/PDF (e.g. `"Photo {n}"`)
      - `ui.variant`: optional UI variant; set to `"progressive"` to show slots + checkmarks based on `minFiles`
      - `ui.slotIcon`: `"camera"` | `"clip"` (optional; controls the icon used in progressive slots)
      - `compression`: optional client-side **image** compression (videos are uploaded as-is; prefer size limits)
      The React UI renders compact upload controls and a dedicated “Files (n)” overlay for managing selections.
      - File uploads are also supported inside line items and subgroups by setting a line-item field’s `type` to `FILE_UPLOAD` (with optional per-field `uploadConfig`).
      - When `CK_DEBUG` is enabled you’ll also see `[ReactForm] upload.*` events in DevTools that describe every add/remove/drop action for troubleshooting.
    - **Dynamic data sources (options/prefills)**: For CHOICE/CHECKBOX questions, you can set `dataSource` in the Config JSON: `{ "dataSource": { "id": "INVENTORY_PRODUCTS", "mode": "options" } }`. The backend `fetchDataSource(id, locale, projection, limit, pageToken)` Apps Script function is included in `dist/Code.js` and used by the web UI. Use this when options need to stay in sync with another form or sheet.
      - **Header convention (recommended)**: Use `Label [KEY]` headers in the source tab (e.g., `Supplier [SUPPLIER]`, `Email [EMAIL]`) so config can reference stable keys. `projection` / `mapping` can use either raw header text or the bracket key.
    - **Choice UI controls (iOS-style)**: For `CHOICE` questions (and line-item `CHOICE` fields), you can optionally set `ui.control` in the Config JSON to influence which control is rendered:
      - `auto` (default): `<= 3` options → segmented, `<= 6` → radio list, else → native dropdown. Boolean-like non-required choices (e.g., YES/NO) may render as an iOS switch.
      - `select`, `radio`, `segmented`, `switch`: force a specific variant.

      Example:

      ```json
      { "ui": { "control": "segmented" } }
      ```

    - **Label/control layout override**: For any field (top-level, line-item, subgroup), you can force the label to be stacked above the control:

      ```json
      { "ui": { "labelLayout": "stacked" } }
      ```

    - **Consent checkbox**: A `CHECKBOX` field with **no options** (and no `dataSource`) is treated as a consent boolean and rendered as a **single checkbox**. The stored value is a boolean; when `required: true`, the checkbox must be checked to submit.
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
    - **Default values (`defaultValue`)**: To prefill a field on **new records / new rows**, add `defaultValue` in the field JSON.
      - This is only applied when the field is **missing from the payload**, so it **does not override user edits** once the field exists.
      - Works for **top-level fields** and **line-item / subgroup fields**.

      ```json
      { "defaultValue": "no" }
      ```

      > **Notes:**
      >- For `CHOICE`, use the stored option value (usually the EN option string).
      >- For consent `CHECKBOX` (no options + no `dataSource`), use `true/false`.
      >- For multi-select `CHECKBOX`, use an array: `{ "defaultValue": ["A", "B"] }`.
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
      - You can also **copy values** into the new row using reference strings in `preset`:
        - `$row.FIELD_ID` copies from the originating **line-item row** (when the effect is triggered inside a line item)
        - `$top.FIELD_ID` copies from **top-level** record values

      ```json
      {
        "selectionEffects": [
          {
            "type": "addLineItems",
            "groupId": "MP_LINES",
            "triggerValues": ["Yes"],
            "preset": {
              "MEAL_TYPE": "$row.MEAL_TYPE",
              "SERVICE_DATE": "$top.MEAL_DATE"
            }
          }
        ]
      }
      ```

    - **Filters & rules**: For CHOICE/CHECKBOX fields, add `optionFilter` in the JSON to filter options based on another field, and `validationRules` to enforce dependencies (works in main form and line items).
      - Example (main form filter):

        ```json
        { "optionFilter": { "dependsOn": "Supplier", "optionMap": { "VDS": ["Fresh vegetables", "Dairy"], "*": ["Other"] } } }
        ```

      - Sheet-driven option maps (recommended for non-developers): use `optionMapRef` to load the mapping from a separate tab.
        - Create a tab (e.g. `Supplier_Map`) with a **header row** and at least two columns:
          - `Supplier` (key)
          - `Allowed options` (lookup value)
        - Add one row per mapping entry. Repeated keys are merged. Add a `*` key for fallback.

        ```json
        {
          "optionFilter": {
            "dependsOn": "Supplier",
            "optionMapRef": { "ref": "REF:Supplier_Map", "keyColumn": "Supplier", "lookupColumn": "Allowed options" }
          }
        }
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

      - Conditional required when another field is filled (useful for TEXT / PARAGRAPH):

        ```json
        { "validationRules": [ { "when": { "fieldId": "Other details", "notEmpty": true }, "then": { "fieldId": "Reason", "required": true } } ] }
        ```

        Supported conditions: `equals` (string/array), `greaterThan`, `lessThan`, `notEmpty`. Actions: `required` true/false, `min`, `max`, `minFieldId`, `maxFieldId`, `allowed`, `disallowed`.
      - Warning rules (non-blocking): set `"level": "warning"` to surface a message without blocking submit.
        - You can use normal rules (`when` + `then`) or **message-only** rules (`when` + `message`, omit `then`) to show a warning when the condition matches.
        - Optional: `"warningDisplay": "top" | "field" | "both"` to control where warnings render in the UI (edit + summary). Defaults to `"top"`.
        - Optional: `"warningView": "edit" | "summary" | "both"` to control which UI view shows the warning. Defaults to `"both"`.
        - Warnings are shown in the UI based on `warningView`. In PDFs, warnings are only rendered when the template includes `{{VALIDATION_WARNINGS}}`.
      - Scope rules to follow-up only: add `"phase": "followup"` to a rule when it should only block follow-up actions (e.g., require `FINAL_QTY` during follow-up but keep it optional on submit).

    - Computed fields (`derivedValue`):
          - Use when a value should be computed automatically (optionally hidden/system-managed).
      - Add in Config JSON (works for main or line-item fields):

        ```json
        {
          "derivedValue": {
                "op": "addDays",
            "dependsOn": "MEAL_DATE",
            "offsetDays": 2,
            "hidden": true
          }
        }
        ```

          - Supported ops:
            - `addDays`: date math (offset can be negative). Defaults to `"when": "always"` (recomputes when dependencies change).
            - `today`: prefill a DATE field with today’s local date. Defaults to `"when": "empty"` (only sets when the target is empty).
            - `timeOfDayMap`: map time-of-day to a value via thresholds. Defaults to `"when": "empty"`.
            - `copy`: copy another field’s value into the target. Defaults to `"when": "empty"` (behaves like a default; allows user overrides) and applies on `"applyOn": "blur"` (so it doesn’t change mid-typing).
              - Optional: `"applyOn": "change"` to apply on every keystroke/change.
              - Optional: `"copyMode": "allowIncrease" | "allowDecrease"` (only with `"when": "always"`) to allow operator overrides in one direction and clamp back to the source value on blur.

          - Example: prefill a DATE field with today (local):

            ```json
            { "derivedValue": { "op": "today" } }
            ```

          - Example: map time-of-day to a label (uses current time):

            ```json
            {
              "derivedValue": {
                "op": "timeOfDayMap",
                "thresholds": [
                  { "before": "10h", "value": "Before 10" },
                  { "before": "12h", "value": "Still morning" },
                  { "before": "15h", "value": "Getting closer to tea time" },
                  { "value": "out of office" }
                ]
              }
            }
            ```

          - Tip: If you want a computed value to behave like a default (allow user overrides), set `"when": "empty"`. If you want it to stay in sync with dependencies, set `"when": "always"`.

          - Example: copy a NUMBER default from another NUMBER field:

            ```json
            { "derivedValue": { "op": "copy", "dependsOn": "FIELD_A" } }
            ```

          - Example: copy but allow increases only (never below the source):

            ```json
            { "derivedValue": { "op": "copy", "dependsOn": "QTY", "when": "always", "copyMode": "allowIncrease" } }
            ```

      - Example: cross-field numeric validation (B must be >= A):

        ```json
        {
          "validationRules": [
            { "when": { "fieldId": "A" }, "then": { "fieldId": "B", "minFieldId": "A" }, "message": "B must be at least A." }
          ]
        }
        ```

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
      - **Post-submit experience (summary)**: After a successful submit, the React app automatically runs the configured follow-up actions (Create PDF / Send Email / Close record when configured) and then shows the Summary screen with timestamps + status. The UI no longer includes a dedicated Follow-up view.
      - **Data list view**: The React web app includes a Records list view backed by Apps Script. It uses `fetchSubmissions` for lightweight row summaries (fast list loads) and `fetchSubmissionById` to open a full record on demand. `listView.pageSize` defaults to 10 and is capped at 50; search runs client-side (keyword search by default, or date search via `listView.search`), and sorting is done by clicking a column header (totalCount is capped at 200).
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

    - *Tooltips from data sources*: Add `"tooltipField": "column_name"` inside `dataSource` to show tooltip overlays for each option (works for line-item fields too). Inline option metadata is supported as a fallback. You can customize the overlay title/trigger text per field with `"tooltipLabel": { "en": "Recipe instructions", "fr": "Instructions", "nl": "Instructies" }`; the label is localized automatically in form and summary.
    - *Readonly TEXT value maps*: Add `valueMap` with `dependsOn` and `optionMap` to auto-fill a readonly TEXT field (arrays join with `","`). Example: `{"valueMap":{"dependsOn":"ING","optionMap":{"Pesto":["Milk","Peanuts"],"*":["None"]}}}`.
      - You can also load `valueMap.optionMap` from a sheet tab using `optionMapRef` (same shape as `optionFilter`):
        - Create a tab (e.g. `Allergen_Map`) with headers like `ING` and `Allergens` (key + lookup).
        - Repeated keys are merged; `*` is a fallback.
        - Each lookup cell can contain a single value or a comma-separated list.
        - Example:

        ```json
        { "valueMap": { "dependsOn": "ING", "optionMapRef": { "ref": "REF:Allergen_Map", "keyColumn": "ING", "lookupColumn": "Allergens" } } }
        ```

    - *Consolidated aggregation (summary + PDF)*: Unique values are shown automatically in the summary view and can be referenced in PDF/email templates with placeholders. Use `{{CONSOLIDATED(GROUP.FIELD)}}` for parent groups, and `{{CONSOLIDATED(GROUP.SUBGROUP.FIELD)}}` for nested subgroups (IDs are uppercase; dotted paths match the JSON shape above). Example: `{{CONSOLIDATED(MP_DISHES.INGREDIENTS.ALLERGEN)}}` renders the unique allergens across all ingredient rows.
    - *ITEM_FILTER visibility*: The section selector (`ITEM_FILTER`) remains available for filters/visibility but is hidden in the summary view (including inside subgroups).

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
     },
     "autoSave": {
       "enabled": true,
       "debounceMs": 2000,
       "status": "In progress"
     }
   }
   ```

   - `pdfTemplateId`: Google Doc template used to build the PDF. Provide either:
     - a single Doc ID (`"1PdfTemplate..."`)
     - a language map (`{ "EN": "...", "FR": "..." }`)
     - or a conditional selector (`cases`) that picks a template based on a record field value:

       ```json
       {
         "cases": [
           { "when": { "fieldId": "CHECK_FREQUENCY", "equals": "Weekly" }, "templateId": { "EN": "DOC_WEEKLY_EN", "FR": "DOC_WEEKLY_FR" } },
           { "when": { "fieldId": "CHECK_FREQUENCY", "equals": "Monthly" }, "templateId": "DOC_MONTHLY" }
         ],
         "default": "DOC_FALLBACK"
       }
       ```

     Use `{{FIELD_ID}}` tokens (or slugified labels) in the Doc; the runtime replaces them with the submitted values (line items render as bullet summaries).
   - `pdfFolderId` (optional): target Drive folder for generated PDFs; falls back to the spreadsheet’s parent folder.
   - `emailTemplateId`: Google Doc containing the email body. Same structure as `pdfTemplateId` (string, language map, or `cases` selector). Tokens work the same as in the PDF template.
   - `emailRecipients`: list of addresses. Entries can be plain strings (placeholders allowed) or objects describing a data source lookup:
     - `recordFieldId`: the form/line-item field whose submitted value should be used as the lookup key.
     - `dataSource`: standard data source config (sheet/tab reference, projection, limit, etc.).
     - `lookupField`: column in the data source to match against the submitted value.
     - `valueField`: column containing the email address to use.
     - `fallbackEmail` (optional): used when the lookup fails.
   - `emailCc` / `emailBcc`: same structure as `emailRecipients`, useful for copying chefs/managers automatically.
   - `statusFieldId` (optional): question ID to overwrite when actions run. If omitted we use the auto-generated `Status` column in the response tab.
   - `statusTransitions`: strings written when `CREATE_PDF`, `SEND_EMAIL`, or `CLOSE_RECORD` complete.
   - `autoSave` (optional): enables draft autosave while editing in the web app (no validation). On any change, the app saves in the background after `debounceMs` and writes the configured `status` (default `In progress`). If the record’s status is `Closed`, the edit view becomes read-only and autosave stops.

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
       - Note: DATE fields are supported even when Google Sheets stores them as Date cells (Apps Script `Date` values); the dedup matcher normalizes them to `yyyy-MM-dd` before comparing.

### Web App (Custom UI)

- Publish a **Web app** deployment pointing to `doGet`.
- Share the deployment URL with volunteers; submissions will be writtendirectly to the destination tab and support line items + file uploads.
- **Destination “Responses” headers (stable keys)**: The destination tab stores field columns using the convention **`Label [ID]`** (example: `Meal Number [Q5]`). The bracket token is the canonical key, so labels can repeat and can be renamed without breaking storage.
- The web app supports list views (paginated) and edit-in-place. The frontenduses `fetchSubmissions` and `fetchSubmissionById` to open existing records with`createdAt`/`updatedAt`. Save calls `saveSubmissionWithId` (or client helper`submitWithDedup`), which enforces dedup rules and returns any conflictmessages to display.
- Validation errors surface in-context: the first invalid field is highlightedand auto-scrolled into view, and a red banner appears under the submit buttonon long forms.
- Optional: add `?form=ConfigSheetName` to target a specific form (defaults tothe first dashboard entry).

### Template placeholders (PDF/email)

- **Basic fields (recommended)**: Use **ID-based** placeholders like `{{FIELD_ID}}` inside your Doc template. Standard metadata is available out of the box: `{{RECORD_ID}}`, `{{FORM_KEY}}`, `{{CREATED_AT}}`, `{{UPDATED_AT}}`, `{{STATUS}}`, etc. Placeholder matching is case-insensitive, so `{{Updated_At}}` works.
  - Legacy support: slugified-label placeholders like `{{MEAL_NUMBER}}` still work, but they are **deprecated** because they can collide when labels repeat.
  - **Template migration (one-time)**: Run `migrateFormTemplatesToIdPlaceholders(formKey)` to rewrite legacy label-based placeholders to ID-based placeholders in-place for a form’s configured templates (follow-up templates + `BUTTON` doc templates).
- **Validation warnings**: Use `{{VALIDATION_WARNINGS}}` to place non-blocking validation warnings (rules with `"level": "warning"`) in the template. Warnings are only rendered in the PDF when this placeholder is present.
- **Data source columns**: When a CHOICE/CHECKBOX question comes from a data source, you can access the columns returned in its `projection` via `{{QUESTION_ID.Column_Name}}` (spaces become underscores). Example: `{{MP_DISTRIBUTOR.Address_Line_1}}`, `{{MP_DISTRIBUTOR.CITY}}`, `{{MP_DISTRIBUTOR.EMAIL}}`.
- **Line item tables**: Build a table row whose cells contain placeholders such as `{{MP_INGREDIENTS_LI.ING}}`, `{{MP_INGREDIENTS_LI.CAT}}`, `{{MP_INGREDIENTS_LI.QTY}}`. The service duplicates that row for every line item entry and replaces the placeholders per row. Empty groups simply clear the template row.
- **Grouped line item tables**: Add a directive placeholder like `{{GROUP_TABLE(MP_INGREDIENTS_LI.RECIPE)}}` anywhere inside the table you want duplicated per recipe. The renderer will:
  1. Create a copy of the entire table for every distinct value of the referenced field (`RECIPE` in this example).
  2. Replace the directive placeholder with the group value (so you can show it in the heading).
  3. Populate the table rows with only the line items that belong to that recipe. If multiple line-item rows share the same recipe, the table’s placeholder rows will repeat for each matching row (e.g., you may see “Portions/Recipe/Core temp” repeated).
  Combine this with row-level placeholders (e.g., `{{MP_INGREDIENTS_LI.ING}}`, `{{MP_INGREDIENTS_LI.CAT}}`, `{{MP_INGREDIENTS_LI.QTY}}`) to print a dedicated ingredient table per dish without manually duplicating sections in the template.
- **Zebra striping (readability)**: Generated rows inside `GROUP_TABLE` and `CONSOLIDATED_TABLE` outputs use **alternating row background colors** automatically (no configuration needed).
- **Per-row line item sections (recommended for key/value “section tables”)**: Add a directive placeholder like `{{ROW_TABLE(MP_MEALS_REQUEST.MEAL_TYPE)}}` anywhere inside the table you want duplicated once per line-item row (even if the title field repeats). The renderer will:
  1. Create a copy of the entire table for each line-item row, preserving row order.
  2. Replace the directive placeholder with the current row’s field value (so you can show it in the heading).
  3. Populate the table rows using that single row (so “Portions/Recipe/Core temp” do **not** duplicate inside one section when titles repeat).
- **Nested subgroup tables (parent → child line items)**: To mirror Summary’s nested layout, add a table that uses `{{PARENT_ID.SUBGROUP_ID.FIELD_ID}}` placeholders inside the row cells (**IDs only**; subgroup `id` is required). The renderer will:
  - Insert one copy of the table per parent row that has children.
  - For each child row, duplicate the template row(s) and replace subgroup placeholders. You can also include parent fields in the same row via `{{PARENT_ID.FIELD_ID}}` if needed.
  - Example: if `MP_DISHES` has a subgroup `INGREDIENTS`, a table row like `{{MP_DISHES.INGREDIENTS.ING}} | {{MP_DISHES.INGREDIENTS.QTY}} | {{MP_DISHES.INGREDIENTS.UNIT}}` will render all ingredients under each dish in separate tables.
- **Consolidated values**: Use `{{CONSOLIDATED(GROUP_ID.FIELD_ID)}}` (**IDs only**) to list the unique values across a line item group. Example: `{{CONSOLIDATED(MP_INGREDIENTS_LI.ALLERGEN)}}` renders `GLUTEN, NUTS, SOY`. When empty, consolidated placeholders render `None`.
  - **Row-scoped subgroup consolidation**: Inside a per-row section (recommended: within `ROW_TABLE` output), use `{{CONSOLIDATED_ROW(GROUP.SUBGROUP.FIELD)}}` to aggregate subgroup values for the current parent row (renders `None` when empty).
  - **Consolidated calculations**:
    - `{{COUNT(GROUP_ID)}}` counts group rows.
    - `{{COUNT(GROUP_ID.SUBGROUP_ID)}}` counts subgroup rows across all parents.
    - `{{SUM(GROUP_ID.FIELD_ID)}}` sums a `NUMBER` field across group rows (subgroup path supported: `{{SUM(GROUP_ID.SUBGROUP_ID.FIELD_ID)}}`).
  - **Consolidated subgroup tables**: To build a *single* subgroup table across all parent rows (and dedupe rows by the placeholder combination), add `{{CONSOLIDATED_TABLE(GROUP.SUBGROUP)}}` somewhere inside the table. The directive is stripped at render time; the table rows are generated from the unique combinations of the row’s placeholders.
- **Numeric aggregation in consolidated subgroup tables**: If the table row includes `NUMBER` placeholders (e.g., `{{GROUP.SUBGROUP.QTY}}`), then `CONSOLIDATED_TABLE` will **sum those numeric fields** when all **non-numeric** columns match (so duplicates collapse and quantities aggregate).
  - **Item count in consolidated subgroup tables**: Use `{{GROUP.SUBGROUP.__COUNT}}` to show how many source rows were consolidated into the generated row.
  - **Exclude rows**: Add `{{EXCLUDE_WHEN(KEY=VALUE[, KEY2=VALUE2 ...])}}` anywhere inside the table to exclude matching rows *before* consolidation/sorting.
    - Keys: `FIELD_ID`, `GROUP.FIELD_ID`, or `GROUP.SUBGROUP.FIELD_ID`
    - Values: use `|` to match multiple values (example: `{{EXCLUDE_WHEN(STATUS=Removed|Deleted)}}`)
- **Sorting generated rows (tables/lists)**: Add `{{ORDER_BY(...)}}` anywhere inside a table to control the order of generated rows (works with `CONSOLIDATED_TABLE`, normal line-item tables, and subgroup tables).
  - **Syntax**: `{{ORDER_BY(KEY1 [ASC|DESC], KEY2 [ASC|DESC], ...)}}`
  - **Keys**:
    - `FIELD_ID` (e.g., `CAT`)
    - `GROUP.FIELD_ID` (e.g., `MP_MEALS_REQUEST.MEAL_TYPE`)
    - `GROUP.SUBGROUP.FIELD_ID` (e.g., `MP_MEALS_REQUEST.MP_INGREDIENTS_LI.ING`)
  - **Examples**:
    - Sort ingredients table by category then ingredient: `{{ORDER_BY(CAT ASC, ING ASC)}}`
    - Sort by quantity descending: `{{ORDER_BY(QTY DESC)}}` (also accepts `QTY:DESC` or `-QTY`)

### BUTTON fields (custom actions)

`BUTTON` questions render as **custom actions** in the web UI. Three actions are supported:

- **Doc template preview** (`action: "renderDocTemplate"`): render a Google Doc template (with the placeholders above) into an in-app **PDF preview**. The PDF is generated **in-memory** and discarded when you close the overlay (no Drive PDF file is written). The PDF is shown immediately once ready (no extra “Open” click).
- **Markdown template preview** (`action: "renderMarkdownTemplate"`): read a Markdown template from Google Drive (plain text / `.md`), replace placeholders, and show the rendered content immediately in-app (fast preview, no Drive/Docs preview pages).
- **Create preset record** (`action: "createRecordPreset"`): create a **new record** and prefill field values (stored values, not localized labels).

### UI tips (React edit + Summary)

- **PARAGRAPH fields (textarea height)**: You can increase the visible height of a paragraph field in the edit view by setting:
  - `ui.paragraphRows` (integer, 2–20; default 4)

#### Example: PDF preview button

```json
{
  "button": {
    "action": "renderDocTemplate",
    "templateId": { "EN": "DOC_ID_EN", "FR": "DOC_ID_FR", "NL": "DOC_ID_NL" },
    "placements": ["form", "formSummaryMenu", "summaryBar", "topBarSummary"],
    "folderId": "OPTIONAL_DRIVE_FOLDER_ID"
  }
}
```

`templateId` supports the same structure as `pdfTemplateId` / `emailTemplateId` (string, language map, or `cases` selector).

#### Example: Markdown preview button

```json
{
  "button": {
    "action": "renderMarkdownTemplate",
    "templateId": { "EN": "MARKDOWN_FILE_ID_EN", "FR": "MARKDOWN_FILE_ID_FR", "NL": "MARKDOWN_FILE_ID_NL" },
    "placements": ["form", "formSummaryMenu", "summaryBar", "topBarSummary"]
  }
}
```

#### Example: create record with preset values

```json
{
  "button": {
    "action": "createRecordPreset",
    "presetValues": {
      "SHIFT": "AM",
      "CONSENT": true,
      "STATUS": "In progress"
    },
    "placements": ["listBar", "topBarList"]
  }
}
```

#### Notes

- **Preview mode**:
  - `previewMode` is **deprecated/ignored** and kept only for backward compatibility.
  - The current UI always opens an **in-app PDF preview** (generated in-memory; no Drive PDF file).

- **Placements**:
  - `form`: render inline as a normal field in the edit form (**PDF/Markdown preview**).
  - `formSummaryMenu`: appear inside the Summary button menu while editing.
  - `summaryBar`: appear in the Summary view bottom action bar (menu if multiple).
  - `topBar`: appear in the global action bar directly under the header (**all views**).
  - `topBarList`: appear in the top action bar on the List view.
  - `topBarForm`: appear in the top action bar on the Form (edit) view.
  - `topBarSummary`: appear in the top action bar on the Summary view.
  - `listBar`: appear in the List view bottom action bar (menu if multiple).

## UI Navigation & Shell

- The web app uses an app-like shell:
  - Header shows a **logo circle + form title** (Excel-style).
  - Tap the logo circle to open a **left drawer** with **Refresh**, **Language** (only when enabled / 2+ languages), and **Build**.
  - Optional: a **top action bar** under the header can show system + custom actions (default behavior uses `BUTTON` placements like `topBarList` / `topBarForm` / `topBarSummary`).
  - A fixed **bottom action bar** provides navigation/actions per view (defaults below can be overridden via `"actionBars"`):
    - **List**: Home + Create + (custom list actions, if configured).
    - **Summary**: Home + Create + Edit + (custom summary actions, if configured).
    - **Form**: Home + Create + Summary/Actions + Submit.

- **Optional: configure action bars (system + custom buttons)**:
  - In the dashboard “Follow-up Config (JSON)” column, you can provide `"actionBars"` to control:
    - which **system** buttons appear (`home`, `create`, `edit`, `summary`, `actions`, `submit`)
    - which **custom** button groups appear (by `BUTTON` `placements`)
    - ordering and visibility per view (`list`, `form`, `summary`) and per bar (`top`, `bottom`)
    - whether **createRecordPreset** buttons appear inside the **Create** menu (via the `create` system item `actions: ["createRecordPreset"]`)

  Example (hide Home on the list view, show listBar custom buttons inline in the top bar, keep Submit on the bottom bar):

```json
{
  "actionBars": {
    "system": { "home": { "hideWhenActive": true } },
    "top": {
      "list": { "items": ["create", { "type": "custom", "placements": ["listBar"], "display": "inline" }] }
    },
    "bottom": {
      "list": { "items": ["create", { "type": "system", "id": "actions", "placements": ["listBar"], "menuBehavior": "menu" }] },
      "form": { "items": ["home", "create", { "type": "system", "id": "summary" }], "primary": ["submit"] }
    }
  }
}
```

Example (show `createRecordPreset` buttons inside the **Create** menu on the bottom bar for Form + Summary views):

```json
{
  "actionBars": {
    "bottom": {
      "form": {
        "items": [
          "home",
          { "type": "system", "id": "create", "actions": ["createRecordPreset"] },
          { "type": "system", "id": "summary" }
        ],
        "primary": ["submit"]
      },
      "summary": {
        "items": ["home", { "type": "system", "id": "create", "actions": ["createRecordPreset"] }, "edit"]
      }
    }
  }
}
```

- **Optional: configure languages (max 3)**:
  - In the dashboard “Follow-up Config (JSON)” column, set:
    - `"languages": ["EN","FR","NL"]` (or `"EN,FR,NL"`)
    - `"defaultLanguage": "EN"`
  - To **disable language selection** (force a single language), set `"languageSelectorEnabled": false`.
    - When disabled (or when only 1 language is enabled), the Language selector is hidden and the app always uses `defaultLanguage`.
  - System UI copy (menus, autosave banners, expand/collapse, etc.) lives in `src/web/systemStrings.json` and ships with defaults for **EN/FR/NL (Belgian Dutch)**.

- **Optional: disable Summary view**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"summaryViewEnabled": false`.
  - Behavior when disabled:
    - Clicking a record in the list always opens the **Form** view (Closed records are read-only).
    - The Summary action in the bottom bar is hidden; if `BUTTON` actions are configured for the form summary menu, an **Actions** menu is shown instead.

- **Optional: portrait-only mode (avoid landscape)**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"portraitOnly": true`.
  - Behavior when enabled:
    - On phone-sized screens, landscape orientation shows a blocking “rotate to portrait” message.
    - Note: browsers (especially iOS Safari) cannot reliably lock orientation; this is a UI guardrail.

- **Optional: preserve option order (disable alphabetical sorting)**:
  - By default, CHOICE/CHECKBOX options are sorted alphabetically by the localized label.
  - This is a **per-field** setting (so you can mix alphabetical + source ordering in the same form).
  - To preserve your configured order (config sheets / optionFilter / data sources), set `"optionSort": "source"` on:
    - Any top-level CHOICE/CHECKBOX question (in the question’s **Config (JSON/REF)** column JSON)
    - Any line-item/subgroup CHOICE/CHECKBOX field (in the line-item field’s **Config** column JSON, or inside the `lineItemConfig.fields[]` object)

- **Optional: make a field read-only in the Edit view**:
  - Set `"readOnly": true` in the field’s **Config** JSON.
  - Supported for:
    - Top-level questions (in the question’s **Config (JSON/REF)** column JSON)
    - Line-item fields and subgroup fields (in the line-item field’s **Config** column JSON, or inside the `lineItemConfig.fields[]` objects)
  - Notes:
    - The value is still included in submissions.
    - Intended for fields set by `defaultValue`, `derivedValue`, or `createRecordPreset` buttons.

- **Optional: disable “Copy current record”**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"copyCurrentRecordEnabled": false`.
  - Behavior when disabled:
    - The Create button always starts a **New record** (no copy option).

- **Optional: disable “New record” (blank record creation)**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"createNewRecordEnabled": false`.
  - Behavior when disabled:
    - The Create menu no longer shows **New record**.
    - Users can only create records via `createRecordPreset` buttons (and/or Copy current record, if enabled).

- **Optional: disable create preset buttons**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"createRecordPresetButtonsEnabled": false`.
  - Behavior when disabled:
    - Any `BUTTON` with `action: "createRecordPreset"` is ignored and **will not show** in any action bars/menus.

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
