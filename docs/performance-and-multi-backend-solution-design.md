## Purpose

This document replaces the earlier data-operations design with a combined plan for:

- improving initial load and data retrieval performance
- introducing backend flexibility so the UI is no longer tied to Google Sheets + Apps Script

The design is grounded in the current codebase as of 2026-03-19. It reflects work that is already implemented, identifies the remaining bottlenecks, and defines the migration path for Community Kitchen and future clients.

## Executive decision

For Community Kitchen, the recommended target architecture is:

- `React UI`
- `transport abstraction` in the client
- `Apps Script` retained as the public web entrypoint for the current deployment model
- `thin HTTP API` deployed on `Cloud Run` for the high-volume data plane
- `Cloud Firestore` as the first non-Sheets operational datastore
- bundled JSON form configuration retained as the deployed configuration source
- `Google Drive` retained initially for templates, uploaded files, and archive exports

This is the best default for the nonprofit client because it materially improves read performance, keeps infrastructure lightweight, and can stay within Google free-tier limits for small-to-moderate usage. It also creates the correct seam for later adapters such as Postgres, MongoDB, and Redis.

`Cloud SQL` is not the default recommendation because it is not part of the Google Cloud always-free list. It is still a valid future adapter for clients that need relational storage and accept recurring infrastructure cost.

Important execution rule for this initiative:

- backend migration is not the first optimization lever
- the first responsibility of the rework is to measure the current baseline, minimize the Apps Script shell, and re-measure before deciding how much backend movement is still required
- the first Cloud Run proof should use the existing Google Drive / Google Sheets data through Google APIs, because that proves the HTTP API and hybrid transport without requiring an up-front data migration
- Firestore remains the recommended target operational datastore after the Drive-backed API path is proven, if the re-measured results still do not meet the agreed performance goals or if backend flexibility remains a strategic requirement
- the Cloud Run / Firestore scripts currently present in the repository should be treated as optional backend preparation, not as the default execution path for Phase 0 or Phase 1

Important constraint:

- `Cloud Run` and Google Cloud free-tier products still require an active Google Cloud billing account, even when monthly usage stays within free limits
- `Cloud Run` does not automatically inherit the deployed Apps Script user's Drive permissions, so Apps Script must remain in the architecture for any flow that still depends on "execute as deployed user"
- a Drive-backed Cloud Run API must use explicit Google API access, normally by sharing the required Sheets, Drive folders, templates, and image/resource folders with the Cloud Run runtime service account; domain-wide delegation is a separate Workspace-admin option, not the default nonprofit setup

## Current architecture baseline

Today the runtime is still primarily:

- Apps Script server code compiled into `dist/Code.js`
- React client calling Apps Script through `google.script.run`
- Google Sheets for form config, response records, and many dataSource lookups
- Google Drive for templates and uploaded files

The current codebase already includes important Phase 1 improvements that the old design document did not reflect:

- record index sheets per response tab in [`src/services/webform/recordIndex.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/webform/recordIndex.ts)
- `dataVersion` support and optimistic-lock checks in [`src/services/webform/submissions.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/webform/submissions.ts)
- `getRecordVersion` and `rebuildIndexes` service entrypoints in [`src/services/WebFormService.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/WebFormService.ts)
- server-sorted batch list loading in [`src/services/webform/listing.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/webform/listing.ts)
- home/bootstrap caching in [`src/services/WebFormService.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/WebFormService.ts)

This means the current baseline is no longer "raw Sheets only". It is "Apps Script plus cache/index optimizations, but still transport-coupled to Apps Script and still fundamentally limited by Sheets reads".

## Deployment model and URL continuity

The deployment requirement is now explicit:

- the app must remain usable by unauthenticated users who have the URL
- the app must continue to benefit from the deployed Apps Script user's authority for Drive-backed resources
- CLI deployment must remain possible
- Apps Script-only deployment must remain a first-class production mode for clients that cannot attach a Google Cloud billing account or cannot accept any risk of GCP spend

### Required backend and deployment modes

The repository must support three modes from the same codebase:

1. `apps-script-only`
   - React bundle and server functions are served by Apps Script.
   - Data reads, data writes, templates, uploads, and follow-up actions all use Apps Script services.
   - Google Sheets and Google Drive remain the operational stores.
   - No Cloud Run service is required.
   - No Google Cloud billing-enabled project is required beyond the Apps Script / Google Workspace environment.
   - This is the default mode and must remain safe for clients that cannot risk a GCP bill.

2. `hybrid-drive-api`
   - Apps Script remains the public web entrypoint and continues to serve the React shell.
   - A configured Cloud Run HTTP API handles selected read-heavy calls by reading the existing Google Sheets and Google Drive assets through Google Sheets API and Google Drive API.
   - Operational data can still live in existing spreadsheets while the app proves the Cloud Run data plane, routing, CORS, auth, monitoring, and latency profile.
   - Documents, templates, images, and application resources can still live in Google Drive and be accessed through a Drive-backed repository.
   - The Cloud Run runtime service account must be granted access to the required Sheets, Drive folders, templates, and resource folders, unless a separate domain-wide delegation model is implemented.
   - Apps Script continues to own flows that must execute as the deployed Apps Script user, especially writes or side effects that have not been deliberately moved.
   - The same React build selects Apps Script, HTTP, or mixed routing through runtime configuration.
   - This mode requires a Cloud Run or equivalent HTTP API deployment and therefore requires whatever billing/account setup that platform requires.

3. `hybrid-firestore-drive`
   - Apps Script remains the public web entrypoint unless a client deliberately chooses a different public frontend host.
   - Cloud Run handles selected data-plane calls.
   - Firestore stores operational records, data source projections, indexes, cache metadata, and eventually audit data.
   - Google Drive remains the store for templates, uploaded files, image resources, and archive exports unless and until those assets are migrated.
   - This is the true multi-backend target for clients that need more than Sheets can provide but still want Drive-hosted assets.

This is not a temporary fallback model. The product requirement is permanent deployment flexibility: cost-sensitive clients can continue Apps Script-only, clients with existing Drive data can use a Drive-backed Cloud Run API first, and clients that need a stronger operational datastore can move records/projections to Firestore while retaining Drive for files and resources.

### Backend mode invariants

- The default runtime behavior is always `apps-script-only`.
- Cloud Run / HTTP API routing is never enabled implicitly just because API scaffolding exists in the repository.
- A missing or invalid API base URL must not break Apps Script-only deployments.
- Drive-backed file upload and non-Doc HTML/Markdown template rendering can move to Cloud Run after the equivalent Drive API repository and permission model are explicitly implemented and tested. Doc/PDF preview rendering, preview artifact cleanup, and email/PDF follow-up flows stay on Apps Script until their Cloud Run parity slices are implemented.
- In `hybrid-drive-api`, Cloud Run reads existing Sheets/Drive data directly through Google APIs; it should not proxy through Apps Script as the primary backend path, because that would hide the performance characteristics of the Cloud Run data plane.
- Row numbers remain a legacy Sheets adapter detail. Cross-backend contracts should use stable record IDs and `dataVersion`.
- The API path must preserve current `dataVersion`, ETag/not-modified, pagination, dedup, audit, and cache invalidation semantics.

### Recommended deployment shape

Phase 1 and Phase 2 should use a hybrid deployment model:

- `Apps Script web app` remains the public entrypoint
- the current production URL can remain unchanged
- the React app can still be served from Apps Script
- Apps Script continues to handle flows that depend on deployed-user Drive access
- `Cloud Run` is introduced behind the scenes for performance-sensitive record and query APIs

This avoids a breaking URL migration and preserves the current "anyone with the link" behavior.

### Why not switch the public URL immediately

If the public frontend moved directly to Cloud Run, the backend would execute as a Google Cloud service account, not as the deployed Apps Script user. That breaks the current Drive permission model unless all required Drive resources are explicitly migrated or shared to a service account.

Because that migration is not a requirement for this phase, the correct first step is:

- keep Apps Script as the public shell
- move only the hot data plane behind the new API

### Deployment tooling

The recommended deployment workflow remains CLI-driven:

- keep `npm run deploy:apps-script` for the Apps Script web app
- add a new CLI deployment command for the API, likely wrapping `gcloud run deploy --source` or `gcloud run deploy --image`
- optionally add a top-level script such as `npm run deploy:staging` that deploys both layers in sequence

For the current stage of the initiative:

- `npm run deploy:apps-script` remains the normal deployment flow
- the GCP setup and deploy scripts are optional readiness tooling only
- they should not be treated as proof that the project has already committed to Cloud Run or Firestore for the current iteration

Operational consoles:

- Apps Script deployments remain managed where they are today
- Cloud Run and Firestore are managed in Google Cloud Console

This satisfies the requirement to keep deployment scriptable while adding a second deployment target.

## Configuration source of truth

Bundled JSON configuration is already the correct deployed fast path and must remain the runtime source of truth.

Current implementation already supports bundled config loading through:

- [`scripts/embed-form-configs.js`](/Users/a57321/Documents/Repos/community-kitchen/scripts/embed-form-configs.js)
- [`src/services/webform/formConfigBundle.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/webform/formConfigBundle.ts)

Updated design decision:

- deployed runtime configuration continues to come from `docs/config/exports/{env}` and the generated bundled config
- runtime should not go back to reading live form definitions from Sheets on the hot path
- Sheets can remain an optional authoring source if you want a "generate bundled config from sheet" workflow

So the configuration plan is:

- `bundled JSON` is the deployed source of truth
- `Google Sheets` is optional authoring tooling, not required runtime infrastructure

## What is still slow or fragile

The highest-impact remaining issues are:

1. Initial page load still depends on Apps Script request startup plus definition/bootstrap work, so TTFB remains the dominant cost.
2. The client is hard-coupled to `google.script.run` in [`src/web/react/api.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/web/react/api.ts), which blocks reuse with other backend stacks.
3. List loading still operates under practical row caps and partial hydration logic because Sheets reads are expensive at scale.
4. dataSource projections still rely on spreadsheet-style scans rather than true indexed lookup storage.
5. Configuration, records, data sources, templates, audit data, and analytics do not yet sit behind one backend contract.

This means there are two different categories of performance work:

1. load-logic optimization
   - reduce how much work happens during the initial Apps Script request
   - stop loading data that is not required for the first screen
   - move non-critical bootstrap work out of the first response path
2. backend/platform optimization
   - move hot operational reads and writes to a more suitable datastore and transport

The design for this phase must explicitly address category 1 before treating category 2 as mandatory.

## Measurement baseline

### Tooling review

The existing performance tooling is useful, but it covers two different layers:

- [`scripts/performance/lighthouse-runner.js`](/Users/a57321/Documents/Repos/community-kitchen/scripts/performance/lighthouse-runner.js) measures initial-load metrics:
  - TTFB
  - server response time
  - FCP
  - LCP
  - TTI
  - Speed Index
  - Total Blocking Time
  - Lighthouse performance score
- [`scripts/performance/scenario-runner.js`](/Users/a57321/Documents/Repos/community-kitchen/scripts/performance/scenario-runner.js) measures app-specific interaction timings:
  - document server-measured `doGet -> renderForm -> buildHtml` timing
  - document unattributed gap (`documentRequestMs - serverDocumentMeasuredMs`)
  - home time-to-data
  - bootstrap RPC timing
  - list fetch timing
  - record open timing
  - back-to-home timing
  - submit pipeline timing

Conclusion:

- `lighthouse-runner.js` already covers the right initial-load metrics and does not need a redesign before this backend work starts.
- Lighthouse alone is not enough for this project because it does not capture "list ready", "record ready", or submit flow latency.
- The baseline for this initiative must use both scripts.

### Latest checked-in Lighthouse baseline

The most recent checked-in measured baseline for the Recipes config form is:

- source file: [`perf-results/community-kitchen-recipes-after-ck-perf-index-cache.json`](/Users/a57321/Documents/Repos/community-kitchen/perf-results/community-kitchen-recipes-after-ck-perf-index-cache.json)
- measured on: 2026-01-16

| Metric | Current checked-in average |
| --- | --- |
| TTFB | 3107.4 ms |
| FCP | 2540.0 ms |
| LCP | 2555.0 ms |
| TTI | 2555.0 ms |
| Performance score | 0.875 |

Older checked-in comparison points are still useful:

- [`perf-results/community-kitchen-recipes.json`](/Users/a57321/Documents/Repos/community-kitchen/perf-results/community-kitchen-recipes.json), measured 2026-01-15, TTFB avg `3747 ms`
- [`perf-results/community-kitchen-recipes-2.json`](/Users/a57321/Documents/Repos/community-kitchen/perf-results/community-kitchen-recipes-2.json), measured 2026-01-16, TTFB avg `2933.3 ms`

Interpretation:

- the project already improved from the earlier January 15, 2026 baseline
- the app is still above the target stated in [`docs/requirements/change_log_perf_improvement.md`](/Users/a57321/Documents/Repos/community-kitchen/docs/requirements/change_log_perf_improvement.md), which asks for TTFB below `2.5s` on a mid-range mobile profile
- the main remaining problem is backend startup and data retrieval, not browser rendering alone

### Scenario baseline status

There are no checked-in `perf-results/*scenario*.json` files yet. That is a gap.

Before implementation starts, the team should record and commit:

- one `mobile-4g` scenario baseline
- one `mobile-wifi` scenario baseline

Required commands:

```bash
npm run perf:lighthouse -- \
  --url="https://<staging-web-app-url>" \
  --runs=5 \
  --preset=mobile-4g \
  --output=perf-results/baseline-lighthouse-mobile-4g.json

npm run perf:lighthouse -- \
  --url="https://<staging-web-app-url>" \
  --runs=5 \
  --preset=mobile-wifi \
  --output=perf-results/baseline-lighthouse-mobile-wifi.json

npm run perf:scenario -- \
  --url="https://<staging-web-app-url>" \
  --formKey="Config: Meal Production" \
  --runs=5 \
  --preset=mobile-4g \
  --output=perf-results/baseline-scenario-mobile-4g.json

npm run perf:scenario -- \
  --url="https://<staging-web-app-url>" \
  --formKey="Config: Meal Production" \
  --runs=5 \
  --preset=mobile-wifi \
  --output=perf-results/baseline-scenario-mobile-wifi.json
```

The "before vs after" scorecard for this initiative must track at least:

- TTFB
- FCP
- LCP
- home time-to-data
- list fetch RPC duration
- record fetch/open duration
- submit pipeline duration

### Measurement gate before backend migration

The client challenge is valid: poor performance may be caused not only by the datastore, but also by application logic that loads too much too early.

So the design must follow this decision gate:

1. record the current baseline with the existing staging deployment
2. implement shell minimization inside the current Apps Script architecture
3. record the same measurements again
4. decide whether the remaining gap justifies Cloud Run + Firestore for Community Kitchen now, or whether that migration should be phased more gradually

This prevents the project from using datastore migration as a substitute for fixing avoidable load behavior.

The backend recommendation therefore becomes:

- first optimize what is loaded
- then optimize where hot data lives

## Google-hosted database options reviewed on 2026-03-19

The review below is based on current Google documentation:

- Google Cloud free tier: <https://docs.cloud.google.com/free/docs/free-cloud-features>
- Firebase pricing plans: <https://firebase.google.com/pricing>
- Firebase Realtime Database overview: <https://firebase.google.com/docs/database>
- Firestore SDKs and server libraries: <https://firebase.google.com/docs/firestore/client/libraries>
- Cloud Run deployment: <https://cloud.google.com/run/docs/deploying-source-code>
- Cloud Run custom domains: <https://docs.cloud.google.com/run/docs/mapping-custom-domains>

### 1. Cloud Firestore

Current fit:

- part of the Google Cloud free tier
- requires an active Google Cloud billing account like other Google Cloud free-tier products
- always-free quota currently listed as `1 GiB storage`, `50,000 reads/day`, `20,000 writes/day`, `20,000 deletes/day`, and `10 GiB/month outbound`
- has server libraries for Node and other languages
- supports an intermediary server pattern cleanly

Why it fits Community Kitchen:

- much better random-read and key-based lookup behavior than Sheets
- good fit for record-by-id, list pages, precomputed projections, and data source lookup tables
- serverless operational model
- easy first backend behind a stable API

Tradeoffs:

- not relational
- query patterns need to be modeled intentionally
- free quota can be exceeded if traffic or write volume grows substantially

Decision:

- recommended as the first production datastore for operational records and indexed data source projections

### 2. Firebase Realtime Database

Current fit:

- still has a no-cost Firebase plan path
- strong for direct client sync and offline-first mobile patterns

Why it is not the default here:

- the data model is a JSON tree, which is a weaker fit for this app's list sorting, record projection, and future multi-backend parity goals
- it would push the architecture toward Firebase-specific patterns instead of a clean backend abstraction

Decision:

- not recommended as the primary datastore for this project

### 3. Cloud SQL

Current fit:

- good technical fit for relational workloads and enterprise hosting
- strong candidate for future Postgres-backed clients

Why it is not the Community Kitchen default:

- Google's always-free product list includes Firestore and Cloud Run, but not Cloud SQL
- that means it does not satisfy the "real database and still free to use" requirement as cleanly as Firestore

Decision:

- not the nonprofit default
- keep it as a future adapter for paid clients that want SQL

### 4. Firestore with MongoDB compatibility

This is worth watching for future enterprise reuse, especially if a future client wants MongoDB-style tooling. It is not the default recommendation for Community Kitchen because the immediate goal is low-risk performance improvement, not MongoDB API compatibility.

## Recommended target architecture

### Principle

Separate three concerns that are currently mixed together:

1. transport
2. application service contract
3. datastore implementation

### Target shape

```text
React UI
  -> BackendTransport
    -> AppsScriptTransport | HttpTransport | HybridTransport
      -> Application API
        -> DefinitionRepository
        -> RecordRepository
        -> DataSourceRepository
        -> TemplateRepository
        -> AuditRepository
        -> ArchiveRepository
        -> AnalyticsRepository
          -> BundledConfigAdapter | SheetsAdapter | DriveAdapter | FirestoreAdapter | PostgresAdapter | MongoAdapter
```

### Client transport contract

The React app should stop depending directly on `google.script.run`.

Introduce a small transport abstraction in the client:

```ts
type BackendTransport = {
  fetchHomeBootstrap(formKey: string, clientRev?: number | null): Promise<HomeBootstrapResponse>;
  fetchSubmissionsSortedBatch(...args: any[]): Promise<BatchResponse>;
  fetchSubmissionById(formKey: string, id: string): Promise<WebFormSubmission | null>;
  getRecordVersion(formKey: string, id: string, rowNumberHint?: number | null): Promise<RecordVersionResult>;
  saveSubmissionWithId(payload: SubmissionPayload): Promise<SubmissionResult>;
  fetchDataSource(...args: any[]): Promise<DataSourceResponse>;
};
```

Required implementations:

- `AppsScriptTransport`
- `HttpTransport`
- `HybridTransport`

`HybridTransport` is important for this project because it allows:

- Drive-dependent flows to continue through Apps Script
- performance-sensitive data flows to move to Cloud Run
- one UI build to work during migration without changing the public URL

### Backend repository contract

The backend must expose a stable application contract independent of the physical datastore.

Recommended repositories:

- `FormDefinitionRepository`
- `RecordRepository`
- `DataSourceRepository`
- `TemplateRepository`
- `AuditRepository`
- `ArchiveRepository`
- `AnalyticsRepository`

Recommended record contract:

```ts
type RecordRepository = {
  listRecords(query: ListQuery): Promise<ListResult>;
  getRecord(formKey: string, id: string): Promise<RecordResult | null>;
  getRecordVersion(formKey: string, id: string, rowNumberHint?: number): Promise<RecordVersionResult>;
  saveRecord(input: SaveRecordInput): Promise<SaveRecordResult>;
  deleteRecord(formKey: string, id: string): Promise<void>;
};
```

This preserves the already-correct `dataVersion` direction from the Apps Script implementation and makes later adapters practical.

## Community Kitchen datastore recommendation

The recommended first production split is:

- keep bundled JSON as the deployed configuration source
- optionally keep Sheets as config authoring input only
- keep document templates and uploaded files in Google Drive
- move high-churn operational records to Firestore
- move indexed data source projections that affect runtime performance to Firestore
- move business audit data to Firestore as a first-class repository
- keep API-level ETag and `dataVersion` semantics consistent across stores

Why this hybrid split is the right first move:

- it improves the hottest read paths without forcing a full administrative migration
- the team keeps the existing fast bundled-config runtime
- Firestore removes the need for spreadsheet scans on record reads and list bootstrap
- the API seam remains reusable for future Postgres or Mongo clients

## Data model direction for Firestore

The Firestore design should optimize the flows that are currently slow:

- open home quickly
- fetch recent list pages quickly
- open a record by ID quickly
- resolve data source details without scans

Recommended collections:

- `forms/{formKey}/records/{recordId}`
- `forms/{formKey}/dataSources/{sourceId}/items/{itemKey}`
- `forms/{formKey}/audit/{eventId}`
- `forms/{formKey}/analytics/snapshots/{snapshotId}`
- `forms/{formKey}/archives/{archiveId}`

Recommended record document fields:

- `id`
- `formKey`
- `dataVersion`
- `createdAt`
- `updatedAt`
- `status`
- `values`
- `listProjection`
- `dedup`

Notes:

- `values` stores the full record payload
- `listProjection` stores the subset needed for list rendering and sorting
- `dedup` stores precomputed signatures so dedup checks stay indexed

This mirrors the intent of the current Sheet index work, but in a datastore that is designed for indexed retrieval.

## Audit model

The app already has business audit behavior in the current codebase through [`src/services/webform/submissions.ts`](/Users/a57321/Documents/Repos/community-kitchen/src/services/webform/submissions.ts). That must remain part of the design.

We need to distinguish two audit layers:

### Platform audit

Firestore already integrates with Google Cloud Audit Logs. That is useful for infrastructure visibility, admin activity, and access tracing.

### Business audit

Google Cloud Audit Logs are not a replacement for the app's existing business audit trail because they do not provide the app-specific before/after payloads, field-level changes, action IDs, and workflow semantics currently written by the product.

Updated decision:

- keep a custom `AuditRepository`
- for Community Kitchen, store business audit events in Firestore
- preserve the current concepts:
  - change rows
  - snapshot rows
  - action identifiers
  - device info

Recommended audit event fields:

- `eventId`
- `recordId`
- `formKey`
- `auditType`
- `actionId`
- `changedAt`
- `changedBy`
- `fieldPath`
- `beforeValue`
- `afterValue`
- `snapshot`
- `deviceInfo`

This keeps the product-level traceability independent from whichever backend or platform hosts the app later.

## Archival and storage-limit strategy

We also need a formal archive mechanism so the hot datastore stays small and the project can avoid storage growth surprises.

### Archive goals

- keep operational data in the hot path small
- preserve historical records outside the primary working collections
- support export to file-based storage before hitting free-tier or practical runtime limits

### Recommended archive model

Introduce an `ArchiveRepository` with two concrete outputs:

- `DriveArchiveRepository`
- `CloudStorageArchiveRepository`

For Community Kitchen, start with `DriveArchiveRepository` because it aligns with the existing shared-drive workflow and keeps archived data visible to the current operating model.

Important constraint:

- Firestore managed export targets Cloud Storage and requires billing enabled, so it should be treated as an optional later optimization rather than the default nonprofit archive path

### Archive units

Archive by:

- form
- time window, usually monthly or quarterly
- record status or age cutoff

Recommended file formats:

- `ndjson` for full-fidelity restore
- `csv` for simple human review
- optional manifest JSON with counts, schema version, and checksum

### Archive process

1. Select cold records older than the configured threshold.
2. Write them to archive files in Drive or Cloud Storage.
3. Write an archive manifest entry into the active datastore.
4. Delete or compact the archived records from the hot collection when retention policy allows.

Recommended manifest fields:

- `archiveId`
- `formKey`
- `fromDate`
- `toDate`
- `recordCount`
- `storageType`
- `storageLocation`
- `checksum`
- `createdAt`

This lets the app keep a searchable pointer to archive files without keeping all cold records in Firestore forever.

## Caching and consistency strategy

The new backend should keep the current strong ideas and drop the Sheets-specific limitations.

Keep:

- `dataVersion` for optimistic concurrency
- ETag-based list/bootstrap caching
- lightweight client memory caching

Change:

- replace sheet-wide scans with datastore-native indexed reads
- stop using row number as a cross-layer identity primitive except inside the legacy Sheets adapter
- move cache invalidation to API/resource semantics instead of sheet-etag semantics only

Recommended cache stack:

- browser memory cache for current session
- API response cache in memory initially
- optional Redis later for multi-instance deployments

Redis should remain optional. It is not needed for the Community Kitchen first production step, but the repository boundary should allow adding it later without redesigning the app.

## Migration plan

## Implementation plan for handoff

This section is the working implementation plan as of 2026-04-29. It exists so another conversation or agent can continue without re-deriving the architecture.

### Implementation objective

Build one repository that can produce:

- a complete Apps Script-only deployment with no Cloud Run dependency
- an optional `hybrid-drive-api` deployment where selected read calls are served by Cloud Run while the source data remains in existing Google Sheets and Google Drive
- an optional `hybrid-firestore-drive` deployment where operational records and projections move to Firestore while Drive remains available for templates, uploaded files, images, and application resources

The first implementation target is not a full datastore migration. The first target is a clean runtime boundary that lets the application decide, per function and per backend provider, whether a call goes to Apps Script, Cloud Run backed by Drive/Sheets, or Cloud Run backed by Firestore plus Drive.

Updated sequencing decision:

1. Finish transport normalization and deployment selection.
2. Implement the Drive-backed Cloud Run repositories first, because the data already exists in Google Sheets and Drive.
3. Complete Cloud Run support for the application's current Google Sheets and Google Drive read/write surface.
4. Use that mode to prove Cloud Run latency, deployment, permissions, monitoring, UI routing, and side-effect behavior with real staging data.
5. Implement Firestore repositories and seeding from Google Sheets only after the Drive-backed Cloud Run path can run the application end to end.
6. Keep Drive-backed files/resources available in both Cloud Run modes.

### Step 1: client transport normalization

Current status after the first implementation slice:

- `src/web/react/api.ts` exposes `AppsScriptTransport`, `HttpTransport`, and `HybridTransport`.
- Apps Script remains the default transport when no explicit backend mode is configured.
- Runtime backend config can be read from boot globals.
- `src/web/data/dataSources.ts` can use an injected fetcher, and the React API layer installs the active backend transport as that fetcher.
- Standalone data-source callers still have a direct Apps Script fallback until all call sites are fully migrated.
- `cloud-run/api/server.js` exposes the `/api/rpc` envelope, returns explicit "not implemented" errors for unsupported functions, and routes `fetchDataSource` through a Firestore-backed `DataSourceRepository`.

Alignment update:

- The existing Firestore-backed `DataSourceRepository` should be treated as early scaffolding for the later `hybrid-firestore-drive` mode.
- The next backend implementation slice should add Google Sheets / Google Drive API repositories and make `hybrid-drive-api` the first Cloud Run validation target.
- Do not add an Apps Script HTTP proxy as the primary Cloud Run data source path; that would preserve Apps Script as the bottleneck and would not prove the Cloud Run backend model.

Implementation:

- Keep `AppsScriptTransport` as the default.
- Add `HttpTransport` with a JSON RPC-style contract.
- Add `HybridTransport` that routes only configured function names to HTTP and leaves all other functions on Apps Script.
- Read optional runtime config from `window.__WEB_FORM_BOOTSTRAP__.backend`, `window.__CK_BACKEND_CONFIG__`, or equivalent globals.
- Route `src/web/data/dataSources.ts` through an injectable data-source fetcher so data source calls use the active backend transport when the React API layer is loaded.
- Preserve the direct Apps Script fallback for legacy/standalone callers until those modules are fully migrated.

Recommended default hybrid HTTP functions:

- `fetchBootstrapContext`
- `fetchBootstrapContextWithOptions`
- `fetchHomeBootstrap`
- `fetchFormConfig`
- `fetchFormCatalog`
- `fetchSubmissions`
- `fetchSubmissionsBatch`
- `fetchSubmissionsSortedBatch`
- `fetchSubmissionById`
- `fetchSubmissionByRowNumber`
- `fetchSummaryRecord`
- `fetchSubmissionsByRowNumbers`
- `getRecordVersion`
- `fetchDataSource`
- `prefetchTemplates`
- `renderHtmlTemplate`
- `renderMarkdownTemplate`
- `renderInlineHtmlTemplate`
- `renderSummaryHtmlTemplate`

Recommended backend-provider config:

```json
{
  "mode": "hybrid",
  "apiBaseUrl": "https://...",
  "rpcPath": "/api/rpc",
  "httpFunctions": ["fetchDataSource"],
  "dataBackend": "drive",
  "fileBackend": "drive"
}
```

Allowed backend provider values:

- `dataBackend: "appsScript"`: all operational data stays behind Apps Script services.
- `dataBackend: "drive"`: Cloud Run reads existing Sheets-backed data through Google Sheets API and related metadata through Google Drive API.
- `dataBackend: "firestore"`: Cloud Run reads operational data and projections from Firestore.
- `fileBackend: "appsScript"`: file/template/image operations stay behind deployed-user Apps Script authority.
- `fileBackend: "drive"`: Cloud Run reads Drive-hosted templates, uploaded files, images, and app resources through Google Drive API.

The default remains equivalent to `{ "mode": "appsScript", "dataBackend": "appsScript", "fileBackend": "appsScript" }`.

Do not route these to HTTP by default yet:

- standalone email-producing `triggerFollowup*` actions unless Cloud Run has Workspace Gmail delegation configured
- preview artifact cleanup unless `CK_PREVIEW_CLEANUP_SECRET` is configured for stateless Cloud Run cleanup tokens

Reason: email-producing actions and queued analytics exports require Workspace Gmail delegation before Cloud Run can send mail. Bundled HTML PDF templates are supported in Cloud Run through Drive API HTML-to-Doc conversion and PDF export, and Google Doc templates are supported through Drive copy plus Docs API placeholder mutation before export/preview. `SEND_EMAIL` follow-ups are supported in Cloud Run when the runtime service account has Workspace domain-wide delegation for `https://www.googleapis.com/auth/gmail.send` and `CK_GMAIL_DELEGATED_USER` is set. Until Gmail delegation is available, the React transport can still keep preceding non-email follow-up actions such as `CREATE_PDF` on Cloud Run, then call Apps Script only for `SEND_EMAIL` and pass the generated PDF file id for attachment. `queueAnalyticsPipelineRun` also falls back to Apps Script when Gmail delegation or Drive artifact writes are not available. `fetchAnalyticsDashboard` is safe to route to Cloud Run for read-only dashboard payloads backed by persisted `__CK_ANALYTICS__...` snapshot sheets and bundled pipeline metadata.

Current Cloud Run write status:

- `checkDedupConflict` is implemented for form-scoped dedup rules backed by the current Sheets destination tab.
- `saveSubmissionWithId` is implemented for staging-safe direct Sheets create/update calls that include `__ckSkipSubmitEffects=true`.
- Cloud Run `saveSubmissionWithId` preserves record id, row number, `dataVersion`, created/updated metadata, draft status, date normalization, line-item JSON serialization, file-upload URL replacement through Drive API, dedup checks, and optimistic-lock failures.
- Cloud Run `uploadFiles` is implemented for Drive-backed upload payloads and returns the same comma-separated URL string shape as Apps Script when the destination is a Shared Drive folder shared with the runtime service account. My Drive upload destinations remain Apps Script-owned because service accounts do not have Drive storage quota; the React client falls back upload saves to Apps Script when Cloud Run receives that Drive quota error.
- Cloud Run `saveSubmissionWithId` supports the Apps Script delete-on-key-change request shape (`__ckDeleteRecordId`) for forms that enable `dedupDeleteOnKeyChange` / `dedupRecreateOnKeyChange`, deleting the response row and best-effort aligned record-index row.
- Cloud Run `saveSubmissionWithId` creates/updates the aligned hidden record-index row (`__CK_INDEX__...`) after successful guarded Sheets saves, including `dataVersion`, timestamps, and reject-rule dedup signatures.
- Cloud Run `saveSubmissionWithId` writes configured business audit rows after successful non-noop guarded Sheets saves, including status-gated change rows, nested line-item diffs, snapshot rows, and device info.
- Cloud Run `previewUpdateRecordDependencies` and `applyUpdateRecordWithDependencies` are implemented for Drive-backed dependency guards. The apply path previews impacted target records, applies configured top-level and nested line-item mutations, saves affected target records through guarded Sheets writes, saves the source record with submit effects skipped, and attempts rollback if a target/source save fails.
- Cloud Run `upsertBankUtilisation` and `applyBankUtilisationPlan` are implemented for Drive-backed Sheets bank records and utilisation rows, including direct bank availability debits/credits, active/released utilisation states, conflict snapshots, and no-op plan replacement.
- Cloud Run `saveSubmissionWithId` now executes configured `createRecord` and `updateRecord` submit effects through the same guarded Sheets writer, including `runOn`, `when`, `forEachLineItem`, deterministic target record ids, generated-record metadata, and the computed helpers used by Meal Production leftover capture (`firstNonEmpty`, `ifPresent`, `filterCollection`, `flattenCollection`, and `lookupSetIntersection`).
- Cloud Run `triggerFollowupAction` and `triggerFollowupActions` are implemented for the Sheets-backed action `CLOSE_RECORD`, `CREATE_PDF` for bundled HTML PDF templates when the configured PDF folder is a Shared Drive folder writable by the runtime service account, and `SEND_EMAIL` when Workspace Gmail delegation is configured. Email follow-ups read the Drive email template, resolve datasource recipients, attach the generated PDF, send through Gmail API, and update record status/version metadata. The React transport falls back to Apps Script for `SEND_EMAIL` when Cloud Run Gmail delegation is not configured, and standalone `CREATE_PDF` falls back to Apps Script if Drive returns the service-account storage-quota error.
- Cloud Run `prefetchTemplates`, `renderHtmlTemplate`, `renderMarkdownTemplate`, `renderInlineHtmlTemplate`, `renderSummaryHtmlTemplate`, `fetchSummaryRecord`, `renderDocTemplate`, `renderDocTemplatePdfPreview`, `renderDocTemplateHtml`, `renderSubmissionReportHtml`, and `trashPreviewArtifact` are implemented for bundled HTML PDF templates, Drive-backed text/Markdown/HTML templates, and Google Doc template copy/placeholder mutation through Docs API. The Cloud Run deploy now generates a reusable template-renderer bundle from the existing TypeScript renderer so placeholder, data-source detail, line-item, subgroup, `FILES_ICON`, and summary-template behavior stays aligned with Apps Script.
- Cloud Run `fetchAnalyticsDashboard` and bootstrap analytics payloads are implemented for persisted Sheets analytics snapshots. The deploy bundles `analytics_page.json` so dashboard sections and analytics-page pipeline metadata can load from Cloud Run. Cloud Run also implements `queueAnalyticsPipelineRun` and `runQueuedAnalyticsPipelineJobs` by storing jobs in a hidden Sheets queue, creating temporary Google Sheets workbooks, exporting XLSX through Drive API, saving the artifact to Drive, and sending with Gmail API when delegated Gmail is configured.
- Cloud Run scheduled job endpoints are available for `runQueuedAnalyticsPipelineJobs`, `runDailyAnalyticsRecompute`, and `runDailyLifecycleRecompute` under `POST /api/jobs/<jobName>` with `CK_SCHEDULER_SECRET` authentication. `DEPLOY_ENV=staging npm run deploy:cloud-scheduler` creates or updates Cloud Scheduler HTTP jobs for the queue worker and the two daily recompute jobs.
- `saveSubmissionWithId`, `triggerFollowupAction(s)`, `fetchAnalyticsDashboard`, queued analytics exports, bundled HTML/Google Doc PDF render/preview functions, and template render functions can be included in `CK_HTTP_FUNCTIONS` for staging once the Cloud Run service account has editor/contributor access to the affected response sheets, template files/folders, PDF output folders, analytics export folders, and data-source spreadsheets. Include `uploadFiles` only after upload destinations are moved to Shared Drive folders shared with the runtime service account, or keep relying on the client fallback to Apps Script for service-account Drive quota errors.

Success criteria:

- With no backend config, the app behaves exactly as it does today.
- With backend config, selected read calls use HTTP.
- Tests can inject a transport without touching `google.script.run`.

### Step 2: runtime configuration and deployment selection

Implementation:

- Add a small backend config payload to the boot globals, eventually sourced from script properties, dashboard config, or bundled config.
- Recommended shape:

```json
{
  "mode": "appsScript",
  "apiBaseUrl": "",
  "rpcPath": "/api/rpc",
  "httpFunctions": [],
  "dataBackend": "appsScript",
  "fileBackend": "appsScript"
}
```

Mode behavior:

- `appsScript`: all calls use Apps Script.
- `http`: all calls use HTTP; use only for API-first deployments.
- `hybrid`: calls listed in `httpFunctions` use HTTP; everything else uses Apps Script.

Deployment examples:

- cost-sensitive client: omit backend config or set `{ "mode": "appsScript" }`
- Cloud Run-backed staging with existing Drive data: set `{ "mode": "hybrid", "apiBaseUrl": "https://...", "httpFunctions": ["fetchDataSource"], "dataBackend": "drive", "fileBackend": "drive" }`
- Cloud Run-backed staging with Firestore data: set `{ "mode": "hybrid", "apiBaseUrl": "https://...", "httpFunctions": ["fetchHomeBootstrap", "fetchDataSource", "..."], "dataBackend": "firestore", "fileBackend": "drive" }`

Success criteria:

- No Cloud Run service is required for normal Apps Script deployment.
- A bad/missing API URL falls back to Apps Script unless the explicit mode is `http`.
- The same React build can switch between `appsScript`, `hybrid-drive-api`, and `hybrid-firestore-drive` through runtime config only.

### Step 3: HTTP API contract

Implementation:

- Extend `cloud-run/api/server.js` from status-only bootstrap into the same RPC contract consumed by `HttpTransport`.
- Start with explicit route stubs and clear errors for unsupported functions.
- Add request validation before connecting real storage.
- Add response envelopes that preserve current client-visible shapes.

Recommended minimal contract:

```http
POST /api/rpc
content-type: application/json

{
  "fnName": "fetchDataSource",
  "args": [...]
}
```

Successful response:

```json
{ "ok": true, "result": { "...": "same shape as Apps Script" } }
```

Failed response:

```json
{ "ok": false, "error": { "message": "..." } }
```

Success criteria:

- The React app can call the HTTP API without special case code per endpoint.
- Unsupported API functions fail clearly instead of silently falling back inside the API.

### Step 4: backend repository extraction

Implementation:

- Introduce repository contracts before moving data:
  - `FormDefinitionRepository`
  - `RecordRepository`
  - `DataSourceRepository`
  - `TemplateRepository`
  - `FileRepository`
  - `AuditRepository`
  - `ArchiveRepository`
  - `AnalyticsRepository`
- Treat each backend as a concrete adapter:
  - `BundledConfigRepository`
  - `SheetsRecordRepository`
  - `SheetsDataSourceRepository`
  - `DriveTemplateRepository`
  - `DriveFileRepository`
  - `DriveResourceRepository`
  - `FirestoreRecordRepository`
  - `FirestoreDataSourceRepository`
  - `FirestoreAuditRepository`
  - `SheetsAuditRepository`
  - `SheetsAnalyticsRepository`
- Refactor `SubmissionService`, `ListingService`, and `DataSourceService` behind those contracts gradually.

Success criteria:

- Business services no longer need to know whether records come from Sheets, Firestore, Postgres, or another store.
- Existing Apps Script behavior stays unchanged while adapters are introduced.

### Step 5: first Cloud Run backend: Drive and Sheets API

Implementation:

- Add Google API clients in `cloud-run/api` for:
  - OAuth access token resolution from the Cloud Run metadata server
  - Google Sheets API `spreadsheets.values.get` / `batchGet`
  - Google Drive API file metadata and media reads
- Add Drive-backed repositories:
  - `GoogleSheetsDataSourceRepository`
  - `GoogleSheetsRecordRepository` / `GoogleSheetsSubmissionRepository`
  - `GoogleDriveFileRepository`
  - `GoogleDriveTemplateRepository`
  - `GoogleDriveResourceRepository`
- Reuse the existing Apps Script payload shapes for:
  - bundled `fetchFormConfig`, `fetchFormCatalog`, `fetchBootstrapContext`, and `fetchHomeBootstrap`
  - `fetchDataSource`
  - first-page list reads
  - sorted list reads
  - record-by-id reads
  - record-by-row-number reads
  - record-version reads
  - Drive file metadata/resource reads
- Complete the mutation/side-effect surface in controlled sub-slices:
  - `saveSubmissionWithId`, `checkDedupConflict`, `previewUpdateRecordDependencies`, and `applyUpdateRecordWithDependencies` through Sheets API with optimistic locking and equivalent dedup/index behavior
  - bank utilisation upsert/apply through the same Sheets-backed record repository
  - `uploadFiles` through Drive API with service-account folder access and returned URL semantics matching Apps Script
  - template prefetch/render/preview/cleanup through Drive/Docs export APIs where possible, with explicit fallback decisions for Apps Script-only capabilities
  - `triggerFollowupAction` / `triggerFollowupActions`, including PDF/email/archive side effects, only after generated artifacts and cleanup semantics are equivalent
- Add deployment/integration tests that:
  - confirm `npm run deploy:apps-script` can publish the Apps Script shell
  - confirm `npm run deploy:cloud-run` can publish the Cloud Run API
  - call Cloud Run `/api/rpc` for a Sheets-backed `fetchDataSource`
  - call Cloud Run `/api/rpc` for bundled form config/bootstrap, sorted list reads, record reads, and record-version checks
  - call Cloud Run `/api/rpc` for a Drive file/template/image metadata read
  - call Cloud Run `/api/rpc` for each migrated write/side-effect function against staging-safe test records
  - verify selected React calls use HTTP only when runtime config opts in

Permissions:

- Share the existing response spreadsheets, config/source spreadsheets, template folders, upload/resource folders, and image/resource folders with the Cloud Run runtime service account.
- Keep Apps Script as the authority for any Drive asset that cannot be shared with the service account.

Success criteria:

- The Cloud Run API can read real staging data from the current Google Sheets without Firestore seed data.
- The Cloud Run API can read real staging Drive metadata/resources for documents and images.
- The Cloud Run API can create/update staging-safe records in Google Sheets with the same record id, dataVersion, status, dedup, audit, and row-hint semantics the frontend expects.
- The Cloud Run API can upload files to the configured Drive folders and return URLs that the existing UI can save back to Sheets.
- The Cloud Run API can execute migrated template/follow-up side effects or intentionally leave specific Apps Script-only actions out of the HTTP routing list until parity is proven.
- Apps Script-only mode still works without a Cloud Run service.
- The performance comparison is meaningful because Cloud Run reads Drive/Sheets directly instead of proxying through Apps Script.

### Step 6: Firestore backend support and seeding

Implementation:

- Start only after `hybrid-drive-api` can run the application end to end for the selected staging workflows.
- Seed Firestore from the existing Google Sheets / Drive-backed Cloud Run repositories, not from ad hoc CSV-only fixtures.
- Firestore remains the recommended non-Sheets operational store for Community Kitchen because it fits record-by-id reads, list pages, precomputed projections, and data source lookup tables.
- Keep Google Drive for templates, uploads, images, application resources, and archive exports until the service account permission model and resource hosting model are intentionally migrated.

Suggested first migrated domains:

- data source projections
- record-by-id reads
- sorted list pages
- home bootstrap summaries

Suggested later domains:

- writes and dedup
- business audit
- analytics snapshots
- archives

Success criteria:

- Apps Script-only mode still works.
- `hybrid-drive-api` can read selected hot data from existing Sheets/Drive storage.
- `hybrid-firestore-drive` can read selected hot operational data from Firestore while still resolving Drive-hosted files/resources.
- The same UI build works in all three modes.

### Immediate code sequence

1. Done: add `HttpTransport` and `HybridTransport` in `src/web/react/api.ts`.
2. Done: add runtime backend config parsing in `src/web/react/api.ts`.
3. Done: add data-source fetcher injection in `src/web/data/dataSources.ts`.
4. Done: add focused tests for Apps Script default, HTTP transport, hybrid routing, and data source transport injection.
5. Done: add the `/api/rpc` envelope to `cloud-run/api/server.js` as contract scaffolding.
6. Done: introduce the Cloud Run `DataSourceRepository` contract and an early Firestore-backed implementation for `fetchDataSource`.
7. Done: add Cloud Run Google API clients for Sheets API and Drive API.
8. Done: implement `GoogleSheetsDataSourceRepository` and route `fetchDataSource` to it when `dataBackend` is `drive`.
9. Done: implement Drive file metadata reads through `GoogleDriveFileRepository`.
10. Done: deploy and run integration tests that validate Apps Script deployment, Cloud Run deployment, Sheets-backed RPC reads, and Drive-backed metadata reads.
11. Done: emit runtime backend config from Apps Script script properties so staging can route `fetchDataSource` through Cloud Run once hybrid script properties are set.
12. Done: add bundled form-config support and Sheets-backed Cloud Run read handlers for bootstrap, home lists, sorted list pages, record reads, row-number reads, row-batch reads, and record-version checks.
13. Done: implement staging-safe Sheets-backed `checkDedupConflict` and guarded `saveSubmissionWithId` in Cloud Run.
14. Done: implement Drive-backed `uploadFiles` and file-upload handling inside guarded Cloud Run `saveSubmissionWithId`.
15. Done: add Cloud Run support for Sheets-backed delete-on-key-change requests.
16. Done: add Cloud Run support for record-index updates after guarded Sheets saves.
17. Done: add Cloud Run support for configured business audit rows after guarded Sheets saves.
18. Done: add Cloud Run support for dependency update previews/applies backed by Google Sheets.
19. Done: add Cloud Run support for bank utilisation upsert/apply backed by Google Sheets.
20. Done: add Cloud Run support for `createRecord` and `updateRecord` submit effects backed by Google Sheets.
21. Done: add Cloud Run support for `triggerFollowupAction` / `triggerFollowupActions` for the Sheets-backed action `CLOSE_RECORD`, with client fallback to Apps Script for PDF/email/template actions.
22. Done: migrate Drive-backed non-Doc template reads/renders in Cloud Run (`prefetchTemplates`, `renderHtmlTemplate`, `renderMarkdownTemplate`, `renderInlineHtmlTemplate`, `renderSummaryHtmlTemplate`, and `fetchSummaryRecord`) using Drive media/export APIs and the generated shared renderer bundle.
23. Done: add Cloud Run support for bundled HTML PDF artifact generation, PDF preview bytes, preview Doc creation, preview cleanup, and standalone `CREATE_PDF` follow-up actions through Drive API conversion/export.
24. Done: add Cloud Run `SEND_EMAIL` parity for Drive-backed email templates, datasource recipients, bundled HTML PDF attachments, Gmail API delegated sending, and record status/version updates, with client fallback to Apps Script when Gmail delegation is not configured.
25. Done: add Cloud Run Google Doc template copy/placeholder mutation through Drive API + Docs API for `renderDocTemplate*` and submission report preview/export paths.
26. Done: add Cloud Run queued analytics XLSX/email exports and queued runner support, with React fallback to Apps Script when Gmail delegation or Drive artifact writes are not available.
27. Done: add Cloud Run scheduled job endpoints for queued analytics processing, daily analytics recompute, and daily lifecycle recompute.
28. Later: implement Firestore seeding from the completed Drive-backed repositories, then switch selected staging calls to `dataBackend: "firestore"` while keeping `fileBackend: "drive"`.

### Handoff guardrails

- Do not remove or degrade Apps Script-only deployment.
- Do not make Cloud Run a required dependency for the existing production app.
- Do not treat Firestore as the first Cloud Run proof path; first prove Cloud Run against the existing Sheets/Drive data.
- Do not proxy Cloud Run reads through Apps Script as the primary backend path.
- Do not move Drive-dependent writes or side-effect flows to Cloud Run until the Drive API permission model, locking model, and cleanup semantics are solved.
- Do not migrate writes before read-path routing and contract tests are stable.
- Do not treat Firestore setup scripts as proof that the app has committed to the API mode for every client.

### Phase 0: performance triage, shell minimization, and re-measurement

This phase follows the client's proposed working rule:

- treat the current problem as a performance-tuning investigation first, not a rebuild decision
- stabilize first
- measure second
- optimize third
- refactor only if forced by the evidence

Execution rule for this phase:

- pause non-essential feature work on the affected app while the investigation is running
- focus first on the Home page because it is the clearest user-visible bottleneck
- protect the current architecture unless measurement proves that the architecture itself is the limiting factor

Phase 0 work items:

1. Freeze and diagnose
   - record which screens are slow
   - record which actions are slow
   - note whether slowness is constant or intermittent
   - note whether the issue appears on mobile, desktop, or both
   - decompose the Home page into explicit load components such as:
     - page shell
     - today's required actions
     - recent activities
     - status counts
     - incomplete or missing-record logic
     - any other sections loaded automatically
   - identify which Home page element is expensive

2. Capture the baseline
   - refresh Lighthouse and scenario baselines in staging
   - document exact before numbers in `perf-results/`
   - document which data and bootstrap calls happen on first load today
   - classify each first-load operation as:
     - required for first paint
     - required for first usable screen
     - deferrable until after initial render

3. Apply the strict minimum-load rule
   - load only what the user needs immediately on the Home page
   - keep today's required actions in scope
   - keep only a tightly capped recent activity list in scope if needed
   - do not load full history, full record details, photos, PDFs, large lookup tables, or other tap-only data on first load

4. Instrument where time goes
   - measure time to read from Sheets
   - measure time to compute statuses
   - measure time to transform data
   - measure time to render or return the response
   - in Apps Script, time each server block
   - in Cloud Run later, time each API call and datastore query

5. Remove the usual waste first
   - read only the rows needed for the Home page
   - stop row-by-row and cell-by-cell reads
   - write once when possible instead of multiple range writes
   - stop recalculating statuses live on every Home load if they can be computed on create or update
   - hard-cap recent activity windows
   - defer non-essential sections until after initial render or user action

6. Introduce lightweight summary data
   - build a small summary or index layer for Home-page needs
   - precompute today's status summaries
   - precompute latest incomplete records
   - precompute recent activity slices
   - treat this as a performance buffer inside the current Sheets-based solution
   - the current implementation direction is summary-first Home loading, with the first Home bootstrap RPC started from the shell to overlap bundle load, bundled definitions reused from exported config when available, and analytics plus broader list hydration deferred until after the first usable state

7. Review spreadsheet design and archive early
   - review tabs, formulas, whole-column references, `QUERY` or `FILTER` chains, conditional formatting, and duplicated calculations
   - move operational logic out of formulas and into script where practical
   - archive old records early so active sheets remain small
   - ensure daily operational screens read only active data, not the full historical universe

8. Minimize the Apps Script shell
   - make `doGet()` and the initial Apps Script response as small as possible
   - keep bundled config as the runtime fast path
   - stop doing non-essential bootstrap work in the first response
   - avoid loading list data, record data, analytics, data sources, or heavy definition work before the first usable screen
   - defer non-critical fetches until after initial render
   - preserve current behavior and public URL

9. Re-test before backend decisions
   - run the same Lighthouse and scenario commands again after the load changes
   - compare the Home page and initial-load metrics against the baseline
   - decide whether the current architecture is still acceptable for Community Kitchen

Success criteria:

- the team has a committed and repeatable baseline
- first-load work is explicitly inventoried rather than inferred
- the Home page loads only the minimum required data
- the initial Apps Script shell contains only what is needed for first paint and first usable navigation
- status and summary logic are simplified where possible
- a re-measurement exists before any major rebuild decision is taken

### Phase 1: backend contract extraction inside the current codebase

- refactor Apps Script service calls behind an `AppsScriptTransport`
- introduce `HybridTransport` so specific calls can move backend-by-backend
- extract repository-style application services from the current Apps Script code
- treat current storage logic as adapters:
  - `BundledConfigAdapter`
  - `SheetsAdapter`
  - `DriveAdapter`
  - `AuditSheetAdapter` as temporary legacy audit adapter if needed

Success criteria:

- no user-facing change
- UI no longer imports `google.script.run` directly outside the transport layer
- the public URL remains unchanged

### Phase 2: thin HTTP API with Drive and Sheets parity

- stand up a Node API on Cloud Run
- implement the same functional endpoints first against repository adapters
- move only record, data source, analytics, and audit endpoints first
- implement read-only Sheets and Drive repositories against Google Sheets API and Google Drive API before Firestore is required
- keep Drive-dependent template rendering, uploads, cleanup, and follow-up side effects on Apps Script until equivalent Cloud Run Drive API behavior is deliberately implemented
- keep Google Sheets as the operational datastore at this stage if the measurement gate says datastore migration is not yet required

Important clarification:

- this HTTP API phase exists to decouple the frontend from Apps Script transport and to support multiple backend adapters
- it does not require Firestore to exist first
- the first implementation should adapt the current Sheets/Drive data model directly through Google APIs, not proxy through Apps Script as the primary backend path
- however, if the Node API is hosted on Cloud Run, a Google Cloud billing-enabled project is still required even if usage stays within free-tier quotas

Success criteria:

- the same React build can run against Apps Script transport, HTTP transport, or Hybrid transport
- staged measurements show whether transport alone improves TTFB and time-to-data
- Drive-backed read flows work through Cloud Run when resources are shared to the service account
- Drive-backed side-effect flows still behave with deployed-user Apps Script authority until migrated

### Phase 3: Firestore operational datastore plus Drive resources

- move records, dedup signatures, runtime data source projections, and business audit events into Firestore
- keep bundled config as runtime config
- keep templates, files, images, application resources, and archives in Google Drive unless and until those assets are deliberately migrated
- preserve `dataVersion` and current optimistic-lock behavior
- add archive jobs and archive manifests

Success criteria:

- record-by-id reads are datastore-native and scan-free
- home bootstrap and list fetch no longer depend on response-sheet scans
- Drive-hosted resources still resolve through `fileBackend: "drive"`
- scenario runner shows measurable improvement in list and record timings
- archive flow exists before free-tier storage becomes a problem

### Phase 4: optional enterprise adapters

- add `PostgresAdapter` for relational clients
- add `MongoAdapter` if a document-oriented enterprise client needs it
- add Redis-backed shared caching when multi-instance scale requires it

Success criteria:

- UI remains unchanged
- only transport configuration and backend adapter selection vary per client

## Performance targets for the rework

Primary target:

- reduce mobile `TTFB` below `2.5s` when feasible on the staging form used for baseline tests

If that target is not reachable because of platform/network constraints, the project must still deliver:

- a lower TTFB than the 2026-01-16 checked-in baseline
- materially lower `homeTimeToDataMs`
- materially lower record open time
- evidence from repeatable staged measurements

For this initiative, the most important success metric is not Lighthouse score alone. It is:

- how quickly the user sees the home screen
- how quickly the list data is usable
- how quickly a record opens

## Non-goals for this phase

- redesigning the UI
- changing business rules
- forcing authentication or account management changes
- moving every data domain off Sheets at once

## Final recommendation

Proceed with:

1. baseline measurement with the existing staging deployment
2. Apps Script shell minimization and load-logic cleanup
3. re-measurement against the same baseline scripts
4. transport abstraction in the client
5. a thin Cloud Run API if the project wants backend decoupling now, even before datastore migration
6. a `hybrid-drive-api` backend first, using Google Sheets API and Google Drive API against the existing staging data and Drive assets
7. Firestore as the first non-Sheets operational datastore only after the Drive-backed Cloud Run path is proven, or if post-optimization results still do not meet the agreed goals
8. Drive retained for templates, uploaded files, images, application resources, and archives in both hybrid modes unless those assets are deliberately migrated later

This is the lowest-risk path that satisfies both mandates:

- faster initial load and data retrieval
- a backend model that can later support Postgres, MongoDB, Redis, and other client-specific infrastructure
