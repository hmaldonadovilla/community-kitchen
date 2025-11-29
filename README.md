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

- **Script Cache (5‑minute TTL)** – Each page of `fetchSubmissions` results and every hydrated record is serialized into `CacheService.getScriptCache()`. Cache keys are scoped by form key, page size/token, and a sheet fingerprint so stale rows are automatically discarded after edits.
- **Document Properties ETags** – Every destination tab maintains a lightweight “etag” in `PropertiesService.getDocumentProperties()`. The fingerprint is based on sheet id, row/column counts, and the last updated metadata columns. Any write (including `saveSubmissionWithId`) recomputes the etag, effectively invalidating the Script Cache entries for that sheet.
- **Batch Fetch Endpoint** – `fetchSubmissionsBatch(formKey, projection?, pageSize?, pageToken?, includePageRecords?, recordIds?)` wraps the existing pagination API and returns `{ list, records }`. `list` mirrors the original `fetchSubmissions` response, while `records` pre-hydrates the row objects that were read for that page (plus any explicit `recordIds`). The iframe client uses this payload to render the table and immediately prefill a form without a second round trip.
- **Client Row Cache** – The inline `WebFormTemplate` keeps the most recent batch of records in memory. Selecting a row reuses that cached payload to render the form instantly; a background `google.script.run.fetchSubmissionById` only runs if the record is missing or stale.

### When to refresh or invalidate

Nothing extra is required in day-to-day use: submitting a form, editing a row, or changing the destination tab automatically triggers a new etag and clears the corresponding Script Cache entries. If you need to force a reset after manual sheet edits you can:

- Temporarily change data in the destination tab (e.g., add + remove a dummy row) to generate a fresh etag.
- Delete the stored fingerprints via the Apps Script console: `PropertiesService.getDocumentProperties().deleteAllProperties();`.
- Redeploy a rebuilt `dist/Code.js` bundle (new cache prefixes) or wait for the ~5 minute CacheService TTL to expire naturally.

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

3. **Deploy**:
   - Create a new Google Sheet.
   - Open **Extensions > Apps Script**.
   - Paste the content of `dist/Code.js`.
   - Run `setup()` to initialize the dashboard.

4. **Publish the Web App (custom forms)**:
   - In Apps Script, go to **Deploy > New deployment** and choose **Web app**.
   - Set the entry point to `doGet`.
   - Deploy and use the generated URL as your custom form link (supports line items and uploads).

## Config Notes (LINE_ITEM_GROUP / FILE_UPLOAD)

- **New column**: `Config (JSON/REF)` in each Config sheet. Use it to store JSON or `REF:SheetName` for line items and upload settings.
- **Line items**: Set `Type` to `LINE_ITEM_GROUP` and provide a `lineItemConfig` via JSON or `REF:SheetName` pointing to a sheet with columns: ID, Type, Label EN, Label FR, Label NL, Required?, Options (EN/FR/NL). Types inside a line item can be DATE, TEXT, PARAGRAPH, NUMBER, CHOICE, CHECKBOX.
- **File uploads**: Set `Type` to `FILE_UPLOAD` and provide `uploadConfig` in the Config column (JSON). Supported keys: `destinationFolderId`, `maxFiles`, `maxFileSizeMb`, `allowedExtensions`.
- **Filters**: Add `optionFilter` in the Config JSON to filter CHOICE/CHECKBOX options (works in line items too). `dependsOn` accepts a single field ID or an array for multi-field dependencies; for line items, it can also reference top-level fields. Build composite keys in `optionMap` by joining dependency values with `||`, plus a `*` fallback.  
  Example: `{ "optionFilter": { "dependsOn": ["Product","Supplier"], "optionMap": { "Carrots||Local": ["Crates"], "Carrots": ["Bags","Crates"], "*": ["Bags"] } } }`
- **Validation rules**: Add `validationRules` array in Config JSON.  
  Example: `{ "validationRules":[ { "when": {"fieldId":"Product","equals":"Carrots"}, "then": {"fieldId":"Unit","allowed":["Crates"]}, "message":"Carrots only in crates" } ] }`.

## Testing

Run unit tests with:

```bash
npm test
```
