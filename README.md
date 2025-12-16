# Community Kitchen Form Generator

A Google Apps Script project to digitize AFSCA compliance documentation for a community kitchen in Brussels.

## Features

- **Multi-language Support**: Generates forms with branching logic for English, French, and Dutch.
- **Dashboard Management**: Manage multiple forms from a single "Forms Dashboard" sheet.
- **Smart Updates**: Updates existing forms without breaking links or losing data.
- **Archiving**: Soft-delete questions by marking them as "Archived" in the config sheet.
- **Destination Management**: Automatically renames response tabs for better organization.
- **Custom Web App Forms**: Generate Apps Script web apps (via `doGet`) that support line items and file uploads while still writing back to your Sheets.
- **Dynamic Options & Rules**: Option filtering based on another field plus cross-field validation rules (main form and line items).
- **Localized Sorting & Tooltips**: All option lists sort alphabetically per language; options can show tooltips from data sources (with inline fallback).
- **Derived TEXT Maps**: TEXT fields (and line-item fields) can be readonly value-maps that derive their content from another field via `optionMap`.
- **Computed Fields**: `derivedValue` can auto-calculate fields (e.g., expiration date = prep date + 2 days) and keep them hidden/system-managed.
- **Nested Line Items**: Line-item groups support child subgroups (e.g., Dish headers with Ingredients sub-rows) with option filters, selection effects, and totals.
- **Consolidated Outputs**: Summary view and PDF placeholders support consolidated aggregations, including subgroup paths (e.g., `{{CONSOLIDATED(MP_DISHES.INGREDIENTS.ALLERGEN)}}`). `ITEM_FILTER` is hidden in summary.
- **Unified Shell & Navigation**: Sticky header across List, Summary, Form, and Follow-up with a home button (always returns to List on refresh) and top-right language selector for mobile-friendly navigation.
- **Post-submit Console**: The React summary screen now shows a modern summary header (status/timestamps only, no exposed IDs), quick actions (Edit, Follow-up, Create copy, New blank), and keeps a “Submit another” loop for operators.
- **Drag & Drop Uploads**: React forms ship with keyboard-accessible dropzones that enforce file caps, surface total size + remaining slots, and expose per-file remove/clear controls with live announcements.
- **React Shell Only**: The published web app renders the React UI automatically; the legacy iframe template has been removed.

## Architecture

The project is refactored into modular components:

- **`src/index.ts`**: Entry point for Apps Script triggers and menu items.
- **`src/config/Dashboard.ts`**: Handles reading and writing to the central dashboard.
- **`src/config/ConfigSheet.ts`**: Parses individual form configuration sheets.
- **`src/services/FormGenerator.ts`**: Orchestrates the generation process.
- **`src/services/FormBuilder.ts`**: Handles the low-level Google Form manipulation.
- **`src/services/WebFormService.ts`**: Renders custom web app forms (with line items and file uploads) and writes submissions directly into the destination tabs.

## Server-Side Caching & Prefill

The custom web app now ships with a multi-layer cache to keep list views and record prefill snappy while staying inside Apps Script limits:

- **Script Cache (5‑minute TTL)** – Each page of `fetchSubmissions` results and every hydrated record is serialized into `CacheService.getScriptCache()`. Cache keys are scoped by form key, page size/token, and a per-sheet etag so stale rows are automatically discarded after edits.
- **Document Properties ETags (fast reads)** – Every destination tab maintains a lightweight “etag” (version string) in `PropertiesService.getDocumentProperties()`. Reads reuse the stored etag to avoid expensive full-column hashing; writes (including `saveSubmissionWithId` and follow-up status updates) bump the etag, invalidating Script Cache entries. If the destination tab grows (row/column counts change), the etag is auto-bumped as well.
- **Batch Fetch Endpoint** – `fetchSubmissionsBatch(formKey, projection?, pageSize?, pageToken?, includePageRecords?, recordIds?)` returns `{ list, records }`. `list` mirrors `fetchSubmissions`, while `records` can optionally pre-hydrate the page’s records (plus any explicit `recordIds`) when you want to open a row without an extra round trip.
- **Client Row Cache** – The React client keeps list rows and any hydrated records in memory. Selecting a row reuses the cached payload when available; otherwise it fetches the full record with `fetchSubmissionById`.

### When to refresh or invalidate

Nothing extra is required in day-to-day use: submitting a form, editing a row, or changing the destination tab automatically triggers a new etag and clears the corresponding Script Cache entries. If you need to force a reset after manual sheet edits you can:

- Temporarily change data in the destination tab (e.g., add + remove a dummy row) to generate a fresh etag.
- Delete the stored fingerprints via the Apps Script console: `PropertiesService.getDocumentProperties().deleteAllProperties();`.
- Run **Community Kitchen → Create/Update All Forms** in the Google Sheet. The generator now bumps the cache version in `PropertiesService`, which invalidates every Script Cache namespace immediately after forms are regenerated.
- Redeploy a rebuilt `dist/Code.js` bundle (new cache prefixes) or wait for the ~5 minute CacheService TTL to expire naturally.

## Debug Logging

Verbose logging can be toggled per deployment via a script property (`CK_DEBUG`). Add the following helper functions to the Apps Script editor (e.g., in `Code.gs`) and run them as needed:

```js
function enableDebugLogs() {
  PropertiesService.getScriptProperties().setProperty('CK_DEBUG', '1');
  Logger.log('CK_DEBUG enabled');
}

function disableDebugLogs() {
  PropertiesService.getScriptProperties().deleteProperty('CK_DEBUG');
  Logger.log('CK_DEBUG disabled');
}
```

When enabled, server-side debug statements (e.g., `WebFormService` diagnostics) stream to both `Logger.log` and the execution log, making it easier to trace dashboard loading, form rendering, and data fetches. Disable logging before final deployments to avoid noisy logs.

Enabling `CK_DEBUG` also flips `window.__WEB_FORM_DEBUG__` on the web client, so the React bundle prints `[ReactForm] …` events (uploads, submit lifecycle, follow-up actions) in DevTools alongside the inline status banner.

## Setup

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Build**:

   ```bash
   npm run build
   ```

   This generates `dist/Code.js`.
   A bundle-size guard now runs automatically after every build; it warns once the gzipped `dist/Code.js` passes ~1 MB and fails the build above ~1.2 MB so we stay within HtmlService limits.

3. **Deploy**:
   - Create a new Google Sheet.
   - Open **Extensions > Apps Script**.
   - Paste the content of `dist/Code.js`.
   - Run `setup()` to initialize the dashboard.

4. **Publish the Web App (custom forms)**:
   - In Apps Script, go to **Deploy > New deployment** and choose **Web app**.
   - Set the entry point to `doGet`.
   - Deploy and use the generated URL as your custom form link (supports line items and uploads).
   - React is the only experience; the legacy iframe UI has been removed.

## Config Notes (LINE_ITEM_GROUP / FILE_UPLOAD)

- **New column**: `Config (JSON/REF)` in each Config sheet. Use it to store JSON or `REF:SheetName` for line items and upload settings.
- **Line items**: Set `Type` to `LINE_ITEM_GROUP` and provide a `lineItemConfig` via JSON or `REF:SheetName` pointing to a sheet with columns: ID, Type, Label EN, Label FR, Label NL, Required?, Options (EN/FR/NL). Types inside a line item can be DATE, TEXT, PARAGRAPH, NUMBER, CHOICE, CHECKBOX.
- **File uploads**: Set `Type` to `FILE_UPLOAD` and provide `uploadConfig` in the Config column (JSON). Supported keys: `destinationFolderId`, `maxFiles`, `maxFileSizeMb`, `allowedExtensions`.
- **Filters**: Add `optionFilter` in the Config JSON to filter CHOICE/CHECKBOX options (works in line items too). `dependsOn` accepts a single field ID or an array for multi-field dependencies; for line items, it can also reference top-level fields. Build composite keys in `optionMap` by joining dependency values with `||`, plus a `*` fallback.  
  Example: `{ "optionFilter": { "dependsOn": ["Product","Supplier"], "optionMap": { "Carrots||Local": ["Crates"], "Carrots": ["Bags","Crates"], "*": ["Bags"] } } }`
- **Validation rules**: Add `validationRules` array in Config JSON.  
  Example: `{ "validationRules":[ { "when": {"fieldId":"Product","equals":"Carrots"}, "then": {"fieldId":"Unit","allowed":["Crates"]}, "message":"Carrots only in crates" } ] }`.
- **Data-driven selection effects**: You can hydrate a line item group with rows that already exist in a data sheet. Add a `selectionEffects` entry with `type: "addLineItemsFromDataSource"` on any CHOICE / CHECKBOX question or line-item field. The form reuses cached data-source rows (or fetches the override) and, when the selected value matches, deserializes the specified column (e.g., JSON stored in `Ingredients`) into line-item presets. Mapping entries now support `$row.FIELD_ID` to copy values from the originating line-item row (e.g., keep the selected recipe name on every generated ingredient). See `SetupInstructions.md` (“Data-driven selection effects”) for the end-to-end config walkthrough, multiplier options, and sample JSON.
- **List view UX upgrades**: The list screen now includes a search bar, one-click filters (pick a column + value), and client-side sorting (defaulted via the form config). Each row also exposes a mobile-friendly `⋮` action button so opening an entry or triggering follow-up actions is obvious on small screens.
- **List view meta columns**: Control which system columns appear (e.g., Created At, Updated At, Status, PDF URL) by adding `"listViewMetaColumns": ["updatedAt", "status", "pdfUrl"]` to the dashboard JSON column. Only the fields you list are appended after the questions marked for list view, and they can be sorted by clicking the column headers.
- **Follow-up actions**: After submitting—or straight from the list—you can run the configured actions (`Create PDF`, `Send PDF via email`, `Close record`). Add JSON to the new “Follow-up Config (JSON)” column on the *Forms Dashboard* to point at template IDs, recipients, and target status values. See `SetupInstructions.md` for the full schema plus template guidance.
- **Language-aware templates & dynamic recipients**: Follow-up configs now accept per-language `pdfTemplateId` / `emailTemplateId` maps and recipient entries that look up emails via data sources (e.g., find the distributor row in “Distributor Data” and use its `email` column). The runtime picks the correct template for the submission’s language and expands placeholders before generating / emailing PDFs, including `emailCc` / `emailBcc` recipient lists when you need extra copies.
- **Auto-increment IDs**: Any `TEXT` field can be tagged with `"autoIncrement": { "prefix": "MP-AA", "padLength": 6 }` in its Config JSON. When the user leaves that field blank, Apps Script generates sequential IDs (e.g., `MP-AA000001`) and stores the counter in script properties so numbers stay unique across sessions.
- **Template-friendly placeholders**: PDF/email templates understand `{{FIELD_ID}}`, `{{Slug_of_Label}}`, and nested values such as `{{MP_DISTRIBUTOR.Address_Line_1}}` (taken from the data source row that provided the selected option). Line-item rows can be templated inside tables—create a row with placeholders like `{{MP_INGREDIENTS_LI.ING}}` and the service will duplicate the row for every line item. Use `{{CONSOLIDATED(MP_INGREDIENTS_LI.ALLERGEN)}}` to list the unique allergen values collected across the group. Need one table per recipe? Add `{{GROUP_TABLE(MP_INGREDIENTS_LI.RECIPE)}}` to a table and it will clone the entire block for each distinct recipe, replacing the directive with the recipe name and rendering only that recipe's ingredients inside the table.

- For a complete walkthrough (JSON samples, multiplier fields, aggregation behavior, logging tips), check `SetupInstructions.md`.

## Testing

Run unit tests with:

```bash
npm test
```
