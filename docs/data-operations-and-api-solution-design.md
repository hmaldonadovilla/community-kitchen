### Purpose

This document explains **how the app currently retrieves and writes data** (configuration, rules, records, templates, and `dataSource` lookups) using **Google Sheets + Apps Script**, and proposes a **future-state data access architecture** built around a lightweight **HTTP API** with **caching and indexing** that can support **multiple repositories** (not just Google Sheets).

The goal is to make data operations:

- **Reliable** (deterministic reads, predictable invalidation, fewer Apps Script edge failures)
- **Performant** (fast list → detail navigation, minimal bytes, fewer round-trips)
- **Extensible** (plug in other stores without rewriting the UI)
- **Lightweight** (keep the runtime small; avoid heavy frameworks)

---

### Current state (as-is): what the “database layer” is today

Today, “database operations” are split between:

- **Apps Script services** (server-side “API”) compiled into `dist/Code.js`
- **React client** using `google.script.run` to call server functions
- **Google Sheets** as the primary datastore (form config + responses)
- **Google Drive** as a template/files store (Docs/Markdown/HTML templates; uploaded files)

There is no formal DAL/repository abstraction yet; the app directly uses:

- `SpreadsheetApp` to read/write tabular data
- `DriveApp` to fetch templates and files
- `CacheService` + `PropertiesService` for caching/versioning helpers

---

## Current state: key data read/write flows

### 1) Config + rules → WebForm definition (what the UI renders)

**Entry point**: `doGet(e)` → `WebFormService.renderForm(...)` (`src/index.ts`, `src/services/WebFormService.ts`)

**Definition build**:

- Dashboard sheet: `Dashboard.getForms()` reads **Forms Dashboard** (`src/config/Dashboard.ts`)
- Form config sheet: `ConfigSheet.getQuestions(...)` reads the per-form `Config: ...` sheet (`src/config/ConfigSheet.ts`)
- Definition assembly: `DefinitionBuilder.buildDefinition(...)` creates `WebFormDefinition` with:
  - questions (types/labels/options/validations/visibility/line-items/uploads/buttons)
  - `dedupRules` (loaded from config)
  - `listView` configuration (columns, defaultSort, legend, search mode)
  - summary config (native vs HTML template)

**Key code**:

- `src/services/webform/definitionBuilder.ts`
- `src/config/Dashboard.ts`
- `src/config/ConfigSheet.ts`

**How the definition reaches the browser**:

- `WebFormService.renderForm()` builds HTML using `buildReactTemplate(...)`
- The HTML is produced by `src/WebFormTemplate.ts` (bundled into the server output) and includes:
  - the compiled React bundle
  - the `WebFormDefinition`
  - optional **bootstrap list data** (see below)

**Important performance note**:

- There is no durable config cache; definition is rebuilt on each page load.
- There *is* a lightweight server cache for “form context lite” used by list endpoints:
  - `WebFormService.getFormContextLite()` caches `{ form, questionsLite }` in `CacheService` (`src/services/WebFormService.ts`)

---

### 2) List view: fetch list rows (projection) + optional record snapshots

The app supports multiple list endpoints; the newest one is **server-sorted batch**.

**Client → Server**: `google.script.run.fetchSubmissionsSortedBatch(...)` via `src/web/react/api.ts`

**Server implementation**: `ListingService.fetchSubmissionsSortedBatch(...)` (`src/services/webform/listing.ts`)

**How list reads work**:

- Reads the destination tab (e.g. `"<Form Title> Responses"`)
- Builds/ensures response schema via `SubmissionService.ensureDestination(...)` (`src/services/webform/submissions.ts`)
  - ensures meta columns like `Record ID`, `Created At`, `Updated At`, etc.
  - ensures question columns use canonical headers (`Label [ID]`) for stability
- Computes a **sheet-level etag** (see caching section)
- Reads a limited number of rows (capped at **200**) and only the required columns
- Sorts server-side (now multi-key via `listViewSort` tie-breakers) and returns a paginated result
- Optionally includes **page records** (`includePageRecords=true`) by hydrating each row into a `WebFormSubmission` (reads row segments)

**Important limitations** (as-is):

- Hard cap: max **200 rows** are considered for list endpoints and for data sources
- Record hydration may still be **N row reads per page** (though optimized to merge column segments)
- Filtering/search is mostly client-side (after the list is loaded)

---

### 3) Record read: open a record from the list

There are two server read paths:

- `fetchSubmissionByRowNumber(formKey, rowNumber)` — O(1) row read
- `fetchSubmissionById(formKey, id)` — uses TextFinder when available, otherwise scans ID column

**Server**: `ListingService.fetchSubmissionById(...)` / `fetchSubmissionByRowNumber(...)` (`src/services/webform/listing.ts`)

**Key observation**:

- The “by id” path is effectively still **scan-based** in worst case.
- There is no persistent `id -> rowNumber` index today.

---

### 4) Record write: autosave + submit (and dedup enforcement)

**Client → Server**: `saveSubmissionWithId(payload)` (`src/web/react/api.ts`)

**Server**: `SubmissionService.saveSubmissionWithId(...)` (`src/services/webform/submissions.ts`)

Write behavior:

- Generates a record id if missing (`Utilities.getUuid()` fallback)
- Finds existing row by scanning the Record ID column values
- Normalizes:
  - LINE_ITEM_GROUP to JSON
  - FILE_UPLOAD values to a comma-separated URL list (uploads to Drive first)
  - DATE fields to date-only “midnight local” to avoid `date_time` storage
- Runs dedup check (currently **scans all existing rows**, reading full sheet width for each row)
- Writes:
  - updates row in-place, or `appendRow` for new records
- Bumps sheet-level etag (invalidates server caches for list/record)

**Key observation**:

- Writes are not protected by record-level optimistic concurrency; last-write-wins.
- Dedup checks are O(N * columns) and will not scale past small sheets.

---

### 5) DataSource reads (options + projections)

There are two distinct “dataSource” consumers:

#### A) Frontend options/tooltips (CHOICE/CHECKBOX)

**Client → Server**: `fetchDataSource(config, locale, projection, limit, pageToken)`

- Client caching (memory-only): `src/web/data/dataSources.ts`
- Server implementation: `DataSourceService.fetchDataSource(...)` (`src/services/webform/dataSources.ts`)

Behavior:

- Supports same-sheet tab lookups or external sheet lookups (`sheetId::tabName`)
- Reads headers, builds a header index (supports `Label [ID]` bracket keys)
- Returns either scalar list (when projection has 1 field and no mapping) or object list
- Caps reads to **200 rows** and max **50 per page**

#### B) Template placeholder projections (e.g. `{{MP_DISTRIBUTOR.DIST_ADDR_1}}`)

Templates support placeholders like:

- `{{FIELD_ID}}`
- `{{FIELD_ID.SOME_DS_COLUMN}}` for dataSource “detail row” projection

This is implemented in the placeholder builder:

- `buildPlaceholderMap(...)` calls `dataSources.lookupDataSourceDetails(...)` for CHOICE/CHECKBOX values
  - forces a **details fetch** without `projection` and without mapping, to preserve canonical keys
  - caches the details response in-memory (per service instance) (`DataSourceService.dataSourceCache`)

Key files:

- `src/services/webform/followup/placeholders.ts`
- `src/services/webform/dataSources.ts`

**Key observation**:

- Projection lookups are still “scan through up to 200 rows” to find the matching item.
- There is no dataSource-level indexing (value → row) today.

---

### 6) Template retrieval + rendering (Doc/PDF, Markdown, HTML)

Templates can come from:

- Google Drive (Docs/Markdown/HTML)
- Bundled HTML (`bundle:<filename>` embedded at build time)

#### Doc templates

- Cannot be cached in CacheService safely in the same way (requires Doc copies and export steps)
- “Prefetch” warms Drive metadata only

Key: `src/services/webform/followup/docRenderer.ts`

#### Markdown + HTML templates (Drive text)

These are cached in Apps Script `CacheService`:

- Cache key includes a **template cache epoch** stored in `PropertiesService`
- TTL is configurable per form (`templateCacheTtlSeconds`) but CacheService max TTL is 6 hours

Key files:

- `src/services/webform/followup/templateCacheEpoch.ts`
- `src/services/webform/followup/markdownTemplateCache.ts`
- `src/services/webform/followup/htmlTemplateCache.ts`
- `src/services/webform/followup/markdownRenderer.ts`
- `src/services/webform/followup/htmlRenderer.ts`

#### Client-side rendered HTML (`bundle:` templates)

For bundled HTML templates, rendering happens client-side (fast path), with optional client-side
dataSource projection fetching when the template includes projection placeholders.

Key files:

- `src/web/react/app/bundledHtmlClientRenderer.ts`
- `src/services/webform/followup/bundledHtmlTemplates.ts` (generated by `scripts/embed-html-templates.js`)

---

## Current caching + versioning mechanisms

### Server: CacheService + sheet-level etags

**Cache layer**: `CacheEtagManager` (`src/services/webform/cache.ts`)

- Uses `CacheService.getScriptCache()` when available
- Stores list/record responses under a key that includes:
  - a cache “version” prefix (`CK_CACHE:<version>`) stored in document properties
  - a **sheet-level etag** (`CK_ETAG_<sheetId>`) stored in document properties
  - namespace (`LIST`, `RECORD`, `LIST_SORT`, `CTX`) + request parameters

**Etag bumping**:

- On record write: `SubmissionService.saveSubmissionWithId(...)` calls `cacheManager.bumpSheetEtag(...)`
- On meta updates: `touchUpdatedAt`, `writeStatus` also bump etag

**What this gives us**:

- Fast repeated list/record reads (5 min TTL by default)
- Coarse invalidation: any write bumps sheet etag and invalidates caches

**What this does *not* give us**:

- Record-level versioning (no `If-Match`/optimistic locking)
- Efficient ID lookup (still scan-based)
- Efficient dedup checks (still scan-based)

### Server: template cache epoch

Templates (HTML/Markdown) include a separate cache-busting mechanism:

- `createAllForms()` calls `bumpTemplateCacheEpoch()`
- Epoch is embedded in the cache key so changes are immediately visible without waiting TTL

### Client: memory-only caches

The browser keeps several in-memory caches:

- List/records held in React state (and a prefetch loop in `App.tsx`)
- DataSource option cache: `src/web/data/dataSources.ts` (cleared by Refresh)
- Rendered HTML cache: `src/web/react/api.ts` (for Apps Script HTML renders)
- Bundled HTML client renderer caches (cleared by Refresh)

---

## Gap analysis (as-is vs desired future state)

### Reliability gaps

- **Apps Script “null response” behavior** can occur on iOS when payloads are large or calls are stressed.
- **Last-write-wins** updates; no record-level concurrency control.
- Record lookups and dedup checks depend on **full scans**, which increases timeout risk.
- Cache invalidation is mostly coarse (sheet-level), and client caches can become stale until Refresh/reload.

### Performance gaps

- **No persistent indexes**:
  - `recordId -> rowNumber` is not indexed; reads are scan-like.
  - `dataSource value -> row` is not indexed; projections require scanning.
  - Dedup checks scan all rows and all columns.
- **Hard caps** (200 rows) avoid timeouts but prevent scaling.
- Server-side sorting is implemented but still based on reading many rows up front.

### Extensibility gaps

- Data operations are coupled to Apps Script APIs (`SpreadsheetApp`, `DriveApp`, `google.script.run`)
- No formal “repository” interface to support other stores.
- Config, records, templates, and dataSources have different caching/versioning rules.

---

## Future state: lightweight API + repository abstraction + indexes

### Target architecture overview

Move data access behind a small, typed HTTP API:

- **UI (React)** talks to **HTTP API** (not `google.script.run`)
- API delegates to pluggable repositories:
  - Google Sheets (via Sheets API or Apps Script as adapter)
  - Postgres / SQLite
  - Firestore / DynamoDB
  - etc.
- Introduce consistent **versioning**, **indexing**, and **caching** strategies

```mermaid
flowchart LR
  UI[React Web App] -->|HTTP| API[Node API (lightweight)]
  API --> RepoA[SheetsRepo]
  API --> RepoB[SqlRepo]
  API --> RepoC[FirestoreRepo]
  API --> Cache[(Cache: memory / Redis)]
  RepoA --> Sheets[(Google Sheets)]
  RepoA --> Drive[(Google Drive)]
  RepoB --> DB[(SQL DB)]
```

---

### Proposed “Data Access Layer” interfaces

Define explicit modules with stable contracts (typed DTOs):

- **FormDefinitionRepository**
  - `getDefinition(formKey): { definition, etag }`
- **RecordRepository**
  - `listRecords(query): { items, next, total, etag }`
  - `getRecord(id, opts): { record, etag/dataVersion }`
  - `getRecordVersion(id): { dataVersion }` (or HEAD endpoint)
  - `writeRecord(id?, patch, ifMatch): { record, dataVersion }`
- **DataSourceRepository**
  - `queryDataSource(id, query): { items, next, total, etag }`
  - `lookupByKey(id, keyField, keyValue): { row }` (for projection placeholders)
- **TemplateRepository**
  - `getTemplate(templateId): { raw, etag/version }`

This unblocks multi-repo support because the UI depends on **interfaces**, not on Sheets.

---

## Record-level versioning + indexing (your draft requirement)

Your proposal maps directly to standard HTTP caching/locking patterns:

- **Record `dataVersion`** (monotonic integer) for deterministic invalidation and optimistic locking
- A persistent **ID index** so version lookup is O(1)

### Recommended record columns

Minimum:

- `id` (string)
- `dataVersion` (int, server-owned)
- `updatedAt` (optional UX/audit only)
- record fields...

### Recommended index strategy

To avoid scans, keep an index:

- Sheet-based index tab (e.g. `_Index`)
  - `id -> rowNumber`
- Optionally a second index for dedup and dataSource lookups

### Client read flow (detail view)

```ts
// pseudo-code
const cached = recordCache.get(id);
const serverVersion = await api.getRecordVersion(id); // cheap
if (!cached || cached.dataVersion !== serverVersion) {
  const fresh = await api.getRecord(id);
  recordCache.set(id, fresh);
  return fresh;
}
return cached;
```

### Server write flow (optimistic concurrency)

```ts
// pseudo-code
function updateRecord(id, patch, ifVersion) {
  const { row } = index.lookup(id);
  const currentVersion = sheet.get(row, DATA_VERSION_COL);
  if (ifVersion !== currentVersion) throw new ConflictError();
  applyPatch(row, patch);
  sheet.set(row, DATA_VERSION_COL, currentVersion + 1);
  sheet.set(row, UPDATED_AT_COL, nowIso());
  return { id, dataVersion: currentVersion + 1 };
}
```

### Why `dataVersion` beats `updatedAt` for correctness

- No timezone ambiguity
- Integer compare is trivial
- Enables `If-Match`/`409 Conflict` semantics

---

## How this maps to future API endpoints

Suggested endpoints (REST-ish, minimal):

- **Definition**
  - `GET /forms/:formKey/definition` → `{ definition, etag }`
  - `GET /forms/:formKey/definition?ifNoneMatch=...` → `304 Not Modified`

- **List**
  - `GET /forms/:formKey/records?projection=...&sort=...&pageToken=...&filters=...`
  - Returns `{ items, nextPageToken, totalCount, etag }`

- **Record**
  - `HEAD /forms/:formKey/records/:id` → `ETag: <dataVersion>`
  - `GET  /forms/:formKey/records/:id` → `{ record, dataVersion }`
  - `PUT/PATCH /forms/:formKey/records/:id` with `If-Match: <dataVersion>`

- **DataSource**
  - `GET /dataSources/:id?projection=...&q=...&pageToken=...`
  - `GET /dataSources/:id/lookup?field=valueField&value=...` (projection placeholders)

---

## Migration plan (pragmatic steps)

### Phase 0: document + stabilize current Apps Script (now)

- Keep the current Apps Script implementation.
- Continue reducing payload sizes (column reads) and minimizing round-trips.

### Phase 1: introduce indexes + record versions *inside Sheets*

- Add `dataVersion` column to response tabs
- Add `_Index` tab (`id -> rowNumber`)
- Update write path to bump `dataVersion` and update index
- Add `getRecordVersion(id)` endpoint (cheap)
- Update list endpoint to return `dataVersion` for items (optional)

This phase alone makes the existing system much more reliable and faster without changing UI architecture.

### Phase 2: isolate storage behind interfaces (still inside Apps Script)

- Create “repo-like” modules in `src/services/webform/repositories/*`
- Refactor services (listing/submissions/dataSources) to use those interfaces

This reduces coupling before introducing Node.

### Phase 3: introduce Node API (thin gateway)

- Implement the same endpoints as Apps Script but over HTTP
- Start with a **SheetsRepo** implementation
  - either call Sheets API directly
  - or call Apps Script as an internal adapter (less ideal long-term)
- Move caching and indexing decisions into Node (more control)

### Phase 4: add new repositories

- Add e.g. `SqlRepo` for records and/or data sources
- Keep config in Sheets initially (or migrate it too)

---

## Open questions (to align before building the API layer)

### Answers (captured)

- **Auth**: keep the current state (same model as today; “anyone with link” / Apps Script web app access model).
- **Consistency**: reads should be consistent with writes (read-after-write).
- **Scale targets**: **100k+** rows per form over 3+ years.
  - We can move historical data to archives so the operational app stays performant.
- **Search**: full-text search stays in the **frontend** (browser), with date filtering today and potential multi-field filters later.
- **Dedup**: must be **indexed** (unique-constraint-like), not scan-based.

---

## Archival methodology (recommended for 100k+ rows)

### Why we need archiving

Even with indexing, Google Sheets + Apps Script starts to degrade when:

- list queries need to consider too many rows
- server-side sorting requires reading large ranges
- Apps Script responses grow large (especially on iOS)

So the target operating model is:

- **Hot/operational sheet**: small enough to keep list navigation fast (e.g. last 3–12 months)
- **Cold/archive sheets**: hold historical records for retention/audit (e.g. yearly archives)

### Proposed structure

- Destination tab (hot): `"<Form> Responses"`
- Archive tabs (cold), one per year (or quarter):
  - `"<Form> Responses Archive 2024"`
  - `"<Form> Responses Archive 2025"`
  - etc.

### Rule of thumb for moving rows

Archive rows older than a configurable cutoff:

- e.g. “older than 12 months” for operational performance
- while keeping at least “last 3 years” in archives for retention

### Operational implications (Phase 0/1)

- **Indexes must be rebuilt or updated** after archival moves (row numbers shift when rows are deleted).
- Dedup and list operations should operate on:
  - **hot sheet only** (default, best performance), or
  - optionally: “hot + latest archive” depending on business needs.


