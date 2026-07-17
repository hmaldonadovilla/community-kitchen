# Google Apps Script Setup Instructions (TypeScript)

This project uses TypeScript. You need to build the script before using it in Google Sheets.

## 1. Prerequisites

- Node.js installed on your machine.

## 2. Build the Script

1. Open a terminal in this directory.
2. Run `npm install` to install dependencies.
3. Run `npm test` to run unit tests (Optional).
4. Run `npm run lint` to run the repository lint and typecheck flow (Optional).
5. Run `npm run lint:changed` before opening a PR to fail only on new lint issues introduced by your changes.
   - By default this compares against commit `7228fc2c7f1f550fa36bf2d7368779ba1adf48d6`.
   - Use `LINT_BASE_REF=<git-ref> npm run lint:changed` to compare against a different base branch or commit.
6. Run `npm run build` to compile the TypeScript code.
   - This will generate a `dist/Code.js` file.

## 2b. Optional: Bundle a Config Export (sheetless override)

If you want the Apps Script runtime to read config from JSON instead of the Sheets tabs:

1. Export a config JSON from your deployed web app:

   ```bash
   npm run export:config -- --url "<appScriptWebAppUrl>" --form "Config: Meal Production"
   # optional env-aware export
   npm run export:config -- --url "<appScriptWebAppUrl>" --form "Config: Meal Production" --env staging
   ```

   This writes a `FormConfigExport` JSON file under `docs/config/exports/`.
   - Alternative: set `CK_APP_URL` and `CK_FORM_KEY` in `.env` (see `.env.example`) and run `npm run export:config`.
   - For staging/prod bundles, set `CK_CONFIG_ENV=staging|prod` (or pass `--env`) to write into `docs/config/exports/<env>/`.

2. Re-run the build:

   ```bash
   npm run build
   ```

   The build embeds `docs/config/exports/*.json` into `dist/Code.js` (or `docs/config/exports/<env>/*.json` when `CK_CONFIG_ENV` is set). When present, the bundled config overrides reading from the dashboard + config sheets.

## 2c. Optional: Apps Script CI/CD (clasp)

This repo can deploy to Apps Script automatically using `clasp` (locally or via GitHub Actions).

Local (no GitHub compute):

1. Copy `.clasp.json.example` → `.clasp.json` and set your Apps Script **scriptId**.
   - Optional multi-env: copy `.clasp.staging.json.example` → `.clasp.staging.json` (and/or create `.clasp.prod.json`)
     with the respective **scriptId** values.
2. Run `npx clasp login` once to generate `~/.clasprc.json` (clasp auth token).
3. Deploy:

   ```bash
   npm run deploy:apps-script
   ```
   - To skip tests: `SKIP_TESTS=1 npm run deploy:apps-script`
   - Optional: use `.env.deploy` (or `.env.deploy.staging` / `.env.deploy.prod`) to store local deploy variables (see `.env.deploy.example`).
   - Set `DEPLOY_ENV=staging|prod` to auto-load the env-specific file, export `CK_CONFIG_ENV`,
     and swap `.clasp.<env>.json` into `.clasp.json` during deploy.
   - If exactly one `.env.deploy.<env>` file exists locally, the deploy script auto-detects it even when `DEPLOY_ENV` is not exported.

Local deploy env variables (optional):

- `SKIP_TESTS=1` — skip unit tests
- `CLASP_DEPLOYMENT_ID=...` — update a specific `/exec` deployment
- `CLASP_CREATE_DEPLOYMENT=1` — create a new deployment if no ID is provided
- `CLASP_DEPLOY_DESCRIPTION="..."` — custom deployment description
- `DEPLOY_ENV=staging|prod` — selects `.env.deploy.<env>` and the matching config bundle folder
- `CLASP_TARGET_WEB_APP_URL="https://script.google.com/macros/s/<deploymentId>/exec?...` — optional guard; deploy fails if URL deployment id and `CLASP_DEPLOYMENT_ID` do not match
- `CLASP_WEBAPP_ACCESS` + `CLASP_WEBAPP_EXECUTE_AS` — optional but recommended pair; writes `webapp` manifest settings during deploy to keep deployment behavior in web app mode (for example `ANYONE_ANONYMOUS` + `USER_DEPLOYING`)

If `npm run deploy:apps-script` reports that the deployment is not `WEB_APP`, repair the existing deployment (same id) in Apps Script UI:
- Deploy → Manage deployments → edit the existing deployment id → set type to **Web app**.
- Do not create a new deployment id unless explicitly requested.

CI (GitHub Actions):

1. Add GitHub secrets:
   - `CLASP_SCRIPT_ID` = your Apps Script scriptId
   - `CLASP_TOKEN` = contents of `~/.clasprc.json`
   - Optional: `CLASP_DEPLOYMENT_ID` to update a specific web app deployment
2. Run the **Deploy Apps Script** workflow (manual `workflow_dispatch`).

## 2d. Optional: Firebase Hosting for React JS Assets

Use this when the Apps Script bundle is approaching size limits. Apps Script still serves the HTML shell and backend calls; Firebase Hosting serves the static React JS files.

1. Create an env file:

   ```bash
   cp .env.firebase.example .env.firebase.staging
   ```

2. Update `.env.firebase.<env>`:
   - `DEPLOY_ENV=staging|prod`
   - `FIREBASE_PROJECT_ID=<gcp-project-id>` (or rely on `GCP_PROJECT_ID` from `.env.gcp.<env>`)
   - `FIREBASE_HOSTING_SITE_ID=<unique-hosting-site-id>`
   - `FIREBASE_HOSTING_TARGET=web-assets`
   - `CK_WEB_ASSET_MODE=external`
   - `CK_WEB_ASSET_BASE_URL=https://<site-id>.web.app` or your Firebase custom domain

3. Authenticate Firebase CLI once:

   ```bash
   npx firebase-tools@latest login
   ```

   The signed-in account needs permission to add Firebase to the GCP project (`firebase.projects.update`, `resourcemanager.projects.get`, `serviceusage.services.enable`, and `serviceusage.services.get`) and Firebase Hosting Admin access to create/deploy the Hosting site. If Firebase has already been added by an owner/admin, you can rerun setup with `SKIP_FIREBASE_PROJECT_ENABLE=1`.

4. Provision the Firebase Hosting site and local target mapping:

   ```bash
   DEPLOY_ENV=staging npm run firebase:setup
   ```

5. Deploy the hashed JS assets:

   ```bash
   DEPLOY_ENV=staging npm run deploy:firebase-hosting
   ```

6. Deploy Apps Script after the assets are live:

   ```bash
   DEPLOY_ENV=staging npm run deploy:apps-script
   ```

   `deploy:apps-script` loads `.env.firebase` / `.env.firebase.<env>` automatically, so the Apps Script bundle is built as a small HTML/backend shell that points to Firebase Hosting.

For a single local command that deploys assets first and then Apps Script:

```bash
DEPLOY_ENV=staging npm run deploy:firebase-web-app
```

Rollback: run `CK_WEB_ASSET_MODE_OVERRIDE=embedded npm run deploy:apps-script` to force an embedded build even when `.env.firebase` exists. You can also set `CK_WEB_ASSET_MODE=embedded` or remove the Firebase env file, then rerun `npm run deploy:apps-script`. The existing Apps Script bundle route remains available in embedded builds.

## 2e. Optional: Backfill Data Source Identity Fields

When datasource-backed fields gain hidden identity columns such as
`*_SOURCE_ID` or `*_SOURCE_UPDATED_AT`, historical rows may need a one-time
backfill before old records can be copied reliably.

Run a dry-run first:

```bash
npm run backfill:data-source-ids -- \
  --env staging \
  --form-key "Config: Meal Production" \
  --batch-size 50
```

Commit mode requires the target Apps Script project to have a script property
named `CK_BACKFILL_DATA_SOURCE_IDS_TOKEN`, and the same value must be provided
locally:

```bash
CK_BACKFILL_DATA_SOURCE_IDS_TOKEN="<token>" \
  npm run backfill:data-source-ids -- \
  --env staging \
  --commit \
  --form-key "Config: Meal Production"
```

The runner performs a dry-run preflight, commits in batches, writes audit rows,
and performs a post-check dry-run. Delete the script property after the one-off
commit run. Full procedure: `docs/data-source-id-backfill.md`.

## 2f. Optional: Cloud Run multi-backend API bootstrap

Use this only as optional backend preparation so a Cloud Run API can be provisioned and deployed from the CLI in the same env-driven style as `clasp`.

Important positioning:

- `apps-script-only` remains the safe default and does not require Cloud Run
- `hybrid-drive-api` is the first Cloud Run validation mode; it reads existing Google Sheets data and Drive file metadata through Google APIs
- `hybrid-firestore-drive` is the later mode where Firestore stores operational data/projections while Drive remains available for templates, uploads, images, and resources

1. Install Google Cloud CLI:
   - macOS: `brew install --cask google-cloud-sdk`
   - Other platforms: follow the official installer instructions at `https://cloud.google.com/sdk/docs/install`
2. Authenticate the CLI:

   ```bash
   gcloud auth login
   gcloud auth login --update-adc
   ```
   - If you are on a machine without a browser, use `gcloud auth login --no-browser --update-adc`.
   - If Google Cloud CLI warns that your Application Default Credentials quota project does not match the active project, fix it with:

     ```bash
     gcloud auth application-default set-quota-project <your-project-id>
     ```

3. Create a local env file:

   ```bash
   cp .env.gcp.example .env.gcp.staging
   ```
   - Repeat with `.env.gcp.stage-two` or `.env.gcp.prod` for additional environments.

4. Update `.env.gcp.<env>` with your Google Cloud values:
   - `DEPLOY_ENV=staging|stage-two|prod`
   - `GCP_PROJECT_ID=<your-project-id>`
   - `GCP_REGION=europe-west1`
   - `GCP_FIRESTORE_DATABASE=(default)`
   - `GCP_FIRESTORE_LOCATION=eur3`
   - `GCP_CLOUD_RUN_SERVICE=community-kitchen-api-<env>`
   - `GCP_CLOUD_RUN_SOURCE_DIR=cloud-run/api`
   - `GCP_RUNTIME_SERVICE_ACCOUNT_ID=<runtime-service-account-id>`
   - `GCP_ALLOW_UNAUTHENTICATED=1`
   - `CK_DATA_BACKEND=drive`
   - `CK_FILE_BACKEND=drive`
   - Optional: `CK_DEFAULT_SPREADSHEET_ID=<spreadsheet-id>` when data source ids refer to tabs in one default spreadsheet instead of `<spreadsheetId>::<tabName>`
   - Optional: `CK_PREVIEW_CLEANUP_SECRET=<random-secret>` when preview Doc cleanup is routed to Cloud Run across multiple instances
   - Example values used in this repo:
     - staging: `GCP_CLOUD_RUN_SERVICE=community-kitchen-api-staging`, `GCP_RUNTIME_SERVICE_ACCOUNT_ID=community-kitchen-api-staging`
     - stage-two: `GCP_CLOUD_RUN_SERVICE=community-kitchen-api-stage-two`, `GCP_RUNTIME_SERVICE_ACCOUNT_ID=ck-api-stage-two`
     - prod: `GCP_CLOUD_RUN_SERVICE=community-kitchen-api-prod`, `GCP_RUNTIME_SERVICE_ACCOUNT_ID=community-kitchen-api-prod`
   - Keep service account IDs within Google Cloud's length limit. `community-kitchen-api-stage-two` is too long, which is why the `stage-two` environment uses `ck-api-stage-two`.

5. Provision the backend resources:

   ```bash
   DEPLOY_ENV=staging npm run gcp:setup
   ```

   This command:
   - enables the required Google Cloud APIs, including Cloud Run, Cloud Scheduler, Firestore, Sheets API, Drive API, Docs API, Gmail API, and IAM Credentials API
   - creates the Firestore database if it does not exist
   - creates the Cloud Run runtime service account if it does not exist
   - grants `roles/datastore.user` to the runtime service account
   - enables Gmail / IAM Credentials APIs and grants the runtime service account permission to sign delegated Gmail JWTs
   - grants `roles/run.builder` to the project's default build service account
   - Run the setup commands sequentially per environment. `gcloud config set project ...` changes the active project globally, so parallel runs can report the wrong project state.
   - For `hybrid-drive-api`, share the required spreadsheets, template folders, upload/resource folders, and image/resource folders with the Cloud Run runtime service account. Cloud Run does not inherit the deployed Apps Script user's Drive permissions.
   - Viewer access is enough for read validation. Sheets-backed Cloud Run writes require editor access on the target spreadsheet. Drive uploads through a service account require a Shared Drive upload folder with contributor/editor access, or else uploads should remain routed to Apps Script.

6. Deploy the optional Cloud Run API service:

   ```bash
   DEPLOY_ENV=staging npm run deploy:cloud-run
   ```

   The service source is in `cloud-run/api/` and returns JSON from `/` and `/status`. It also exposes `POST /api/rpc`; implemented RPC functions include bundled form config/bootstrap reads, Sheets-backed list and record reads, staging-safe `checkDedupConflict`, guarded `saveSubmissionWithId` with `createRecord` / `updateRecord` submit effects, dependency guard previews/applies (`previewUpdateRecordDependencies`, `applyUpdateRecordWithDependencies`), bank utilisation upsert/apply and guided draft sync (`upsertBankUtilisation`, `applyBankUtilisationPlan`, `syncGuidedStepUtilisationDraft`), supported follow-up batches (`triggerFollowupAction`, `triggerFollowupActions`) for `CLOSE_RECORD`, bundled-HTML `CREATE_PDF`, and delegated-Gmail `SEND_EMAIL`, Drive-backed `uploadFiles`, non-Doc template reads/renders (`prefetchTemplates`, `renderHtmlTemplate`, `renderMarkdownTemplate`, `renderInlineHtmlTemplate`, `renderSummaryHtmlTemplate`, `fetchSummaryRecord`), bundled HTML PDF rendering and Google Doc template copy/placeholder mutation (`renderDocTemplate`, `renderDocTemplatePdfPreview`, `renderDocTemplateHtml`, `renderSubmissionReportHtml`, `trashPreviewArtifact`), analytics dashboard/snapshot reads and recompute (`fetchAnalyticsDashboard`, bootstrap `analytics`, `runDailyAnalyticsRecompute`), non-production queued analytics XLSX export support (`queueAnalyticsPipelineRun`, `runQueuedAnalyticsPipelineJobs`), scheduled lifecycle recompute (`runDailyLifecycleRecompute`), `fetchDataSource`, and `fetchDriveFileMetadata`. Unsupported RPC functions return a clear `501` response.
   - With `CK_DATA_BACKEND=drive`, Cloud Run reads existing Google Sheet tabs directly through Google Sheets API.
   - With `CK_DATA_BACKEND=firestore`, `fetchDataSource` reads the Firestore data-source collection.
   - Viewer access on the spreadsheet is enough for read validation. Sheets-backed Cloud Run writes require editor access on the target spreadsheet for the Cloud Run runtime service account. Guarded Cloud Run saves also create/update the hidden `__CK_INDEX__...` row used for record id lookup and indexed dedup, plus configured audit rows, when editor access is available.
   - Drive uploads through a Cloud Run service account require a Shared Drive folder. My Drive folders can be read/shared with a service account, but the service account cannot create owned files there because it has no Drive storage quota. If a `FILE_UPLOAD` field has no `uploadConfig.destinationFolderId`, Cloud Run resolves the first parent folder of `CK_DEFAULT_SPREADSHEET_ID`; set `CK_UPLOAD_FOLDER_ID` to one Shared Drive folder instead. Until then, keep `uploadFiles` off `CK_HTTP_FUNCTIONS` or rely on the client fallback to Apps Script for service-account quota errors.
   - Cloud Run `SEND_EMAIL` requires Google Workspace domain-wide delegation for the runtime service account. In Google Admin console, authorize the service account OAuth client ID for `https://www.googleapis.com/auth/gmail.send`, then set `CK_GMAIL_DELEGATED_USER` to the mailbox that should send the message. The delegated user must be allowed to send as `followupConfig.emailFrom` when configured as a Gmail alias. Analytics export requests are intentionally queued and sent through Apps Script so production can run reports without Cloud Run.
   - Queued analytics XLSX exports use `CK_REPORT_SPREADSHEET_LOCALE` to choose the temporary spreadsheet locale. The default is `nl_BE`, which renders quantities with Belgian-style separators while the underlying Sheets API format pattern remains locale-neutral.
   - Google Doc template rendering through Cloud Run uses Drive API to copy the template and Docs API `batchUpdate` to replace placeholders in the copied document before exporting or previewing it. The runtime service account needs reader access to template docs and contributor/editor access to the PDF/preview output folder.
   - Scheduled job endpoints are available at `POST /api/jobs/runQueuedAnalyticsPipelineJobs`, `POST /api/jobs/runDailyAnalyticsRecompute`, and `POST /api/jobs/runDailyLifecycleRecompute`. Set `CK_SCHEDULER_SECRET` on Cloud Run and send it as `Authorization: Bearer <secret>` or `x-ck-scheduler-secret: <secret>` from Cloud Scheduler. After the Cloud Run deploy, run `DEPLOY_ENV=staging npm run deploy:cloud-scheduler` to create or update the staging Cloud Scheduler jobs. In production, analytics report requests must stay on Apps Script; `queueAnalyticsPipelineRun` writes the Apps Script queue and schedules the Apps Script `runQueuedAnalyticsPipelineJobs` trigger itself.
   - `CK_API_RPC_MAX_BODY_MB` controls the JSON RPC request body limit for upload payloads. The default is `25`.
   - `saveSubmissionWithId`, template rendering, bundled HTML/Google Doc PDF rendering, analytics dashboard reads, and `triggerFollowupAction(s)` can be routed through `CK_HTTP_FUNCTIONS` on staging once the Cloud Run service account has editor/contributor access to the affected response sheets, template files/folders, PDF output folders, analytics export folders, and data-source spreadsheets. Add `uploadFiles` only when the upload destination is a Shared Drive folder shared with the runtime service account; otherwise the client falls back upload saves to Apps Script when Drive returns the service-account storage-quota error. Cloud Run currently supports `CLOSE_RECORD`, bundled-HTML/Google-Doc `CREATE_PDF`, and `SEND_EMAIL` when `CK_GMAIL_DELEGATED_USER` is configured with Workspace domain-wide delegation for `https://www.googleapis.com/auth/gmail.send`. Without Gmail delegation, the React transport keeps preceding non-email follow-up actions such as `CREATE_PDF` on Cloud Run, then sends only the email through Apps Script using the generated PDF file id as the attachment source; when `emailDispatchMode: "direct"` is configured, the fallback calls Apps Script `SEND_EMAIL` directly rather than treating outbox queueing as success. Do not add `queueAnalyticsPipelineRun` to `CK_HTTP_FUNCTIONS`; analytics export requests must stay on Apps Script.
   - When `GCP_ALLOW_UNAUTHENTICATED=1`, the deploy script uses `--no-invoker-iam-check` rather than `allUsers` IAM binding. This avoids the common Workspace org-policy failure where public IAM members are blocked.
   - On the first deploy in a fresh project, `gcloud` prompts to create the `cloud-run-source-deploy` Artifact Registry repository in the selected region. Confirm with `y`.
   - Verify the deployed API service after deploy:
     - copy the `Service URL` printed by the command
     - run `curl <service-url>/`

7. Enable hybrid routing in the Apps Script web app by setting Apps Script script properties:

   - `CK_BACKEND_MODE=hybrid`
   - `CK_API_BASE_URL=<cloud-run-service-url>`
   - `CK_HTTP_FUNCTIONS=fetchBootstrapContext,fetchBootstrapContextWithOptions,fetchHomeBootstrap,fetchFormConfig,fetchFormCatalog,fetchAnalyticsDashboard,fetchSubmissions,fetchSubmissionsBatch,fetchSubmissionsSortedBatch,fetchSubmissionById,fetchSubmissionByRowNumber,fetchSummaryRecord,fetchSubmissionsByRowNumbers,getRecordVersion,fetchDataSource,saveSubmissionWithId,uploadFiles,prefetchTemplates,renderHtmlTemplate,renderMarkdownTemplate,renderInlineHtmlTemplate,renderSummaryHtmlTemplate,renderDocTemplate,renderDocTemplatePdfPreview,renderDocTemplateHtml,renderSubmissionReportHtml,trashPreviewArtifact,previewUpdateRecordDependencies,applyUpdateRecordWithDependencies,upsertBankUtilisation,applyBankUtilisationPlan,syncGuidedStepUtilisationDraft,triggerFollowupAction,triggerFollowupActions`
   - `CK_DATA_BACKEND=drive`
   - `CK_FILE_BACKEND=drive`

   Set these in **Apps Script → Project settings → Script properties** for the target staging script. Leave these properties unset, or set `CK_BACKEND_MODE=appsScript`, to keep Apps Script-only transport. For Cloud Run `SEND_EMAIL`, set `CK_GMAIL_DELEGATED_USER` in the Cloud Run environment and authorize the runtime service account for Workspace domain-wide delegation; without that setting the React transport falls back email sending to Apps Script. Set `CK_PREVIEW_CLEANUP_SECRET` on Cloud Run if multiple instances need stateless preview cleanup tokens. Set `CK_REPORT_SPREADSHEET_LOCALE` in Apps Script script properties when the default `nl_BE` report number format locale is not appropriate.

8. Inspect the backend status:

   ```bash
   DEPLOY_ENV=staging npm run gcp:status
   ```
   - For this repository's environments:
     - `DEPLOY_ENV=staging npm run gcp:status`
     - `DEPLOY_ENV=stage-two npm run gcp:status`
     - `DEPLOY_ENV=prod npm run gcp:status`

9. Validate the Drive-backed Cloud Run path against existing Drive data:

   ```bash
   DEPLOY_ENV=staging npm run test:hybrid-drive-api -- \
     --data-source-id "<spreadsheetId>::<tabName>" \
     --drive-file-id "<driveFileId>"
   ```

   Use the same spreadsheet id for `--drive-file-id` when you only need to verify Drive metadata access to the spreadsheet itself. Use a template, document, image, or resource file id when validating a broader Drive permission grant.

10. Optional: seed a Firestore data source for API testing:

   ```bash
   DEPLOY_ENV=staging node scripts/seed-firestore-data-source.js --file path/to/data-source.json
   ```

   The JSON file should contain:

   ```json
   {
     "source": { "id": "Recipes Data", "formKey": "Config: Recipes" },
     "items": [{ "id": "recipe-1", "sortKey": "recipe-1", "Name": "Soup" }]
   }
   ```

   Use `--id` or `--form-key` to override values from the file. The script writes to `/dataSources/{id}/items` or `/forms/{formKey}/dataSources/{id}/items`, matching the API repository lookup path.

11. Keep using `npm run deploy:apps-script` for the public Apps Script web app. The Cloud Run deploy is an optional backend-preparation step and does not replace the existing staging Apps Script deployment flow.

## 2g. Performance measurement baseline

Use the performance scripts together so you capture both web-vitals metrics and the concrete initial-load buckets visible in browser DevTools.

1. Capture Lighthouse metrics:

   ```bash
   npm run perf:lighthouse -- \
     --url="<web-app-url>" \
     --runs=3 \
     --output=./perf-results/lighthouse.json
   ```

   This reports:
   - `ttfb`
   - `fcp`
   - `lcp`
   - `tti`

2. Capture Home-page load buckets:

   ```bash
   npm run perf:scenario -- \
     --url="<web-app-url>" \
     --formKey="Config: Meal Production" \
     --runs=1 \
     --preset=mobile-4g \
     --output=./perf-results/scenario.json
   ```

   This reports:
   - `documentTtfbMs`: time until the Apps Script document starts responding
   - `documentRequestMs`: total Apps Script document request time
   - `serverDocumentMeasuredMs`: server-side measured time inside `doGet -> renderForm -> buildHtml`
   - `serverDocumentGapMs`: unattributed portion of the document request (primarily Apps Script/platform startup plus minor transport overhead)
   - `bundleLoadMs`: React bundle load time
   - `firstPageDataLoadMs`: first Home-page callback/XHR load time
   - `pageUsableMs`: wall-clock time until the Home page is usable
   - the scenario runner now stops after the initial Home-load path is measured; record-open and submit flows are no longer part of this baseline script

   In staging-like environments it also reports app-level Home timings:
   - `serverTimingSteps`
   - `homeTimeToDataMs`
   - `homeBootstrapRpcMs`
   - `listFetchRpcMs`
   - `listRecordsPrefetchRpcMs`

   Notes:
   - append `?timing=1` to a staging web-app URL, or use an `admin=true` URL, when you want to inspect `window.__CK_SERVER_TIMINGS__` directly in DevTools
   - `npm run perf:scenario` now auto-adds `timing=1` unless the target URL already includes an explicit timing/admin flag

   Current Home load strategy:
   - the first Home request returns a lightweight summary-first payload for recent activity
   - the shell starts the first Home bootstrap RPC inline so it can overlap with the React bundle load
   - bundled runtime exports that include `definition` plus `cacheFingerprint` now reuse that embedded definition directly on the initial render path, and only fall back to rebuild/cache when the embedded runtime definition is absent
   - analytics widgets for the Home/List view are fetched only after the first Home data is ready
   - broader recent-activity hydration, row snapshot prefetching, and data-source prefetching are deferred so they do not block the first usable Home state

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

## 5b. Optional: Environment tag in the web app header

If you want a discrete environment label (e.g., "Staging") to appear in the web app header:

1. Open the Apps Script editor for your spreadsheet.
2. Go to **Project Settings** → **Script properties**.
3. Add a property named `CK_UI_ENV_TAG` with the label you want to display (for example, `Staging`).
4. Save the property and refresh the web app.

## 5c. Config cache invalidation (performance)

The web app caches form definitions in the browser (localStorage) using a cache-version key so most visits do not need to re-fetch configuration.

- The cache version is bumped automatically when you run `createAllForms()` (it calls `WebFormService.invalidateServerCache('createAllForms')`).
- After running `createAllForms()`, refresh the web app to force clients onto the new cache version.

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
      >- The app header now uses a **`← Apps` back button**, a **centered form title**, and an optional **title-open sidebar** for refresh/language/build tools.
      >- Legacy `"header": true` is deprecated but still supported; it is mapped to `group: { header: true, title: "Header", collapsible: true }`.
      >- When `group.collapsible` is enabled, the section header shows a **progress pill** `completed/required` (required fields only). Clicking the pill expands/collapses the section.

    - **Page sections (visual grouping)**: You can optionally wrap multiple group cards inside a higher-level **page section** (Edit view only) by adding `group.pageSection`.
      This is purely for visual guidance: it renders a section title and an optional **info text on the right** (no impact on validation or submission payloads).

      Example: put the `Freezers` and `Fridges` groups under a `Storage` section with a reminder:

      ```json
      {
        "group": {
          "id": "freezers",
          "title": "Freezers",
          "pageSection": {
            "id": "storage",
            "title": "Storage",
            "infoText": "These checks are done at the beginning of the shift."
          }
        }
      }
      ```

      > **Notes:**
      >- To group multiple cards under the same section, set the same `pageSection.id` (recommended) or `pageSection.title` on each group.
      >- Page sections are created from **consecutive** group cards (the app preserves your overall question order).

    - **Field pairing (2‑up layout)**: Use `pair` to control which fields appear next to each other on the same row. If `pair` is not set (or no matching pair is found), the field takes the full row.

        ```json
        { "pair": "qty_temp" }
        ```

    - **Label/control layout override**: Default behavior is label+control inline on full-width rows, and stacked label+control inside 2-up grids. To force stacked label+control even when a field takes the full row:

        ```json
        { "ui": { "labelLayout": "stacked" } }
        ```

    - **Hide/remove a field label**: To visually hide a field label (kept for accessibility), set `ui.hideLabel: true`.

        By default this hides the label in:
        - the **Edit (form) view**, and
        - the **native Summary view** (React summary / `ReportLivePreview`).

        ```json
        { "ui": { "hideLabel": true } }
        ```

        **Override for native Summary**: Use `ui.summaryHideLabel`:

        - Hide label in Edit, but show label in native Summary:

        ```json
        { "ui": { "hideLabel": true, "summaryHideLabel": false } }
        ```

        - Show label in Edit, but hide label in native Summary:

        ```json
        { "ui": { "summaryHideLabel": true } }
        ```

        Works for both top-level questions and line-item fields. Note: custom **HTML Summary templates** control labels via the template HTML itself (this setting does not modify template markup).

    - **Field helper text (localized)**:
      - Legacy single helper mode: add `ui.helperText` and place it with `ui.helperPlacement` (`belowLabel` or `placeholder`).
      - Dual helper mode: set `ui.helperTextBelowLabel` and `ui.helperTextPlaceholder` to render both texts at once.

        ```json
        {
          "ui": {
            "helperTextBelowLabel": {
              "en": "Name must be minimum 2 characters, no special characters allowed except dash"
            },
            "helperTextPlaceholder": {
              "en": "Enter the name of the ingredient"
            }
          }
        }
        ```

    - **DATE input bounds**: Constrain date entry with `ui.minDate` / `ui.maxDate`.
      - Supported values:
        - `today`
        - explicit `YYYY-MM-DD`
      - If the user enters a date outside the allowed range, the client automatically snaps it back to the nearest allowed date and shows a short notice below the field.
      - Use `ui.dateCorrectionMessages.min` / `ui.dateCorrectionMessages.max` when a form needs custom helper copy after that automatic correction.

        ```json
        {
          "ui": {
            "minDate": "today"
          }
        }
        ```

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

    - **Field-level guarded changes (`changeDialog`)**: You can pause autosave and require confirmation before applying a change when a condition matches. This works on top-level questions and line-item fields. Optional `inputs` let you update peer fields, parent fields, or selection-effect rows. Optional `confirmUpdates` let you apply literal values or type-aware clears on confirm.

        ```json
        {
          "changeDialog": {
            "when": { "fieldId": "STATUS", "equals": "Closed" },
            "title": { "en": "Confirm close", "fr": "Confirmer la fermeture", "nl": "Sluiting bevestigen" },
            "message": { "en": "Please review the related fields.", "fr": "Veuillez vérifier les champs liés.", "nl": "Controleer de gekoppelde velden." },
            "dedupMode": "auto",
            "inputs": [
              {
                "id": "close_note",
                "label": { "en": "Close note", "fr": "Note de fermeture", "nl": "Sluitingsnotitie" },
                "target": { "scope": "top", "fieldId": "CLOSE_NOTE" }
              },
              {
                "id": "row_qty",
                "target": { "scope": "row", "fieldId": "QTY" }
              },
              {
                "id": "effect_qty",
                "target": { "scope": "effect", "effectId": "add_ingredients", "fieldId": "QTY" }
              }
            ],
            "confirmUpdates": [
              {
                "target": { "scope": "top", "fieldId": "PHOTO_EVIDENCE" },
                "clear": true
              }
            ]
          }
        }
        ```

        Notes:
        - `target.scope: "parent"` updates the parent row when used inside a subgroup (falls back to top-level for non-subgroups).
        - `target.scope: "effect"` applies to rows created by the matching `selectionEffects[].id`.
        - `confirmUpdates[].clear: true` chooses the right empty value for the target field type (`[]` for file uploads, `false` for a single checkbox, `[]` for multi-checkboxes, `''` otherwise).
        - `primaryAction: "cancel"` makes the Cancel button the primary/default action (useful when confirming a destructive change).
        - `cancelAction: "discardDraftAndGoHome"` makes Cancel revert the change, discard local draft edits, and return to Home/List.

    - **Summary view field visibility**: By default, the Summary view only shows fields that are currently visible in the Form view (i.e., not hidden by `visibility`). You can override this per field (and per line-item field/subgroup field) via `ui.summaryVisibility`:

        ```json
        { "ui": { "summaryVisibility": "always" } }
        ```

        Supported values:
        - `inherit` (default): follow normal `visibility` rules
        - `always`: show even if hidden by `visibility`
        - `never`: never show in summary

    - Optional: add a `List View?` column (to the right of Validation Rules). Mark `TRUE` on the fields you want to show in the list view; if at least one is `TRUE`, the form starts in list mode automatically. Labels come from the question text. You can also define the default sort for a given column by adding `"listViewSort": { "direction": "desc", "priority": 1 }` to that question’s Config JSON.
      - Lower `priority` numbers are evaluated first.
      - If multiple fields have `listViewSort`, they are applied as **tie-breakers in priority order** (priority 1 = primary, priority 2 = secondary, etc).
      - When nothing is specified we fall back to `updatedAt desc`.
    - Want the list view to show system fields like Created/Updated/Status/PDF URL? Add `"listViewMetaColumns": ["updatedAt", "status", "pdfUrl"]` to the **Follow-up Config (JSON)** column on the dashboard. Supported values are `createdAt`, `updatedAt`, `status`, and `pdfUrl`; the columns appear in the order you list them, and users can click any column header to sort ascending/descending (optional: disable header sorting via `listView.headerSortEnabled: false`).
      - Recommended (consolidated): use `listView.metaColumns` instead:

      ```json
      { "listView": { "metaColumns": ["updatedAt", "status", "pdfUrl"] } }
      ```

      Optional: disable header-click sorting (headers become non-interactive table headers; list still uses `defaultSort`):

      ```json
      { "listView": { "headerSortEnabled": false } }
      ```

      Optional: hide the table header row (for compact mobile list tables):

      ```json
      { "listView": { "hideHeaderRow": true } }
      ```

      Optional: disable row/card container click so only icons/buttons open records:

      ```json
      { "listView": { "rowClickEnabled": false } }
      ```

    - Want to change the **list view title**? Set `listView.title`:

      ```json
      { "listView": { "title": { "en": "My Records" } } }
      ```

    - Want to show computed analytics on Home/List and on a dedicated analytics page? Use the trigger-based `analytics.widgets` module (recommended):

      ```json
      {
        "analytics": {
          "widgets": [
            {
              "id": "portions_delivered",
              "label": { "en": "portions delivered" },
              "placements": ["listView", "analyticsPage"],
              "maximumFractionDigits": 0,
              "calculation": {
                "type": "aggregate",
                "aggregate": "sum",
                "groupId": "MP_MEALS_REQUEST",
                "fieldId": "FINAL_QTY",
                "when": { "fieldId": "status", "equals": "Closed" }
              }
            }
          ]
        }
      }
      ```

      Notes:
      - Supported calculation types: `aggregate`, `arithmetic`, `script`.
      - Custom scripts must be named server functions with prefix `analytics_` (for example `analytics_mealKpi`).
      - Trigger policy: recompute on save/edit/follow-up actions + daily reconciliation trigger (`runDailyAnalyticsRecompute`).
      - Legacy `listView.metric` / `listViewMetric` are still runtime-compatible but deprecated.
      - `analytics.pipelines` can add fire-and-forget export actions to the centralized analytics page. Reusable pipeline types include:
        - `ingredientUsageReport`: accepts a past start date, filters closed source records between that date and today, aggregates nested ingredient rows by ingredient + unit, can convert `Tbsp` to `gr` with `report.tablespoonGramsLookupColumn`, then converts `gr` to `kg` when the aggregated quantity is greater than or equal to 1000.
        - `recordTableReport`: accepts a past start date and exports configured record-level columns from matching source records.
        - `generatedBankReport`: accepts a past start date and exports multi-tab `.xlsx` workbooks for records generated into a shared bank/repository while preserving source record and source row linkage fields. For generated single-item rows, configure `singleSourceGroupId` plus `singleSourceNameFieldId`, `singleSourceQuantityFieldId`, `singleSourceUnitFieldId`, and `singleSourceStorageFieldId` when the report must prefer immutable source-record generation values before falling back to the bank record.
        - All pipeline types queue the work server-side, email the attachment to the configured recipients, and resolve `{{START_DATE}}` and `{{END_DATE}}` in email/file templates as `EEE,dd-mmm-yyyy`; use `{{START_DATE_ISO}}` / `{{END_DATE_ISO}}` for ISO dates.

      Example:

      ```json
      {
        "analytics": {
          "pipelines": [
            {
              "id": "ingredients_analysis",
              "type": "ingredientUsageReport",
              "title": { "en": "Ingredients analysis" },
              "ui": {
                "dateLabel": { "en": "Start date" },
                "submitLabel": { "en": "Email ingredients report" },
                "queuedNotice": { "en": "The ingredients report has been queued. The spreadsheet will be sent by email." }
              },
              "email": {
                "recipients": ["ops@example.com"],
                "subject": { "en": "Ingredients analysis | {{START_DATE}} to {{END_DATE}}" },
                "message": { "en": "Closed meal productions: {{RECORD_COUNT}}\nAggregated ingredients: {{ROW_COUNT}}" }
              },
              "attachment": {
                "format": "xlsx",
                "fileNameTemplate": "Ingredients analysis {{START_DATE}} to {{END_DATE}}.xlsx",
                "sheetName": "Ingredients analysis"
              },
              "report": {
                "dateFieldId": "MP_PREP_DATE",
                "statusFieldId": "Status",
                "closedStatuses": ["Closed"],
                "mealGroupId": "MP_MEALS_REQUEST",
                "prepGroupId": "MP_TYPE_LI",
                "ingredientGroupId": "MP_INGREDIENTS_LI",
                "prepTypeFieldId": "PREP_TYPE",
                "prepTypeValues": ["Cook"],
                "ingredientFieldId": "ING",
                "quantityFieldId": "QTY",
                "unitFieldId": "UNIT",
                "categoryFieldId": "CAT",
                "tablespoonGramsLookupColumn": "TBSP_GRAMS"
              }
            }
          ]
        }
      }
      ```

    - Open the dedicated analytics page for a form with:

      ```text
      ?form=<ConfigSheetName>&page=analytics
      ```

    - Open the central form landing page by visiting the base web-app URL without `form`:

      ```text
      <web-app-url>/exec
      ```

      Admin aliases are accepted (`?admin-true` or `?admin=1|true|yes|on`) and links are propagated with canonical `admin=true`.
      Landing-page settings are export-owned in `docs/config/exports/<env>/landing_page.json`; update that file when the launcher needs its own header logo source (`appHeader.logoFormKey` or `appHeader.logoUrl`), hero copy, section labels, app grouping/renames, or per-card art (`apps[].imagePath`).
      Keep `copy.pendingNavigationMessage` aligned with the single app-opening wait message. Landing-page app links add `ckNav=open-app` to the target URL so the destination shell does not show a second wait instruction while booting.
      Central analytics dashboard settings are export-owned in `docs/config/exports/<env>/analytics_page.json`; update that file when the dashboard card copy/art, header logo source, or widget composition should change.

    - Want to replace the default keyword search with **search by date**? Set `listView.search`:

      ```json
      { "listView": { "search": { "mode": "date", "dateFieldId": "DATE" } } }
      ```

      Notes:
      - `dateFieldId` should usually be a `DATE` question id.
      - The list view automatically fetches this field for filtering even if it is not shown as a visible column.
      - Recent rows are still prefetched for fast initial load. If the searched date is older than, or exactly equal to, the oldest currently prefetched date, the app automatically falls back to a server-side date query so older records remain reachable.
      - Optional: add `listView.search.helperText` to show helper copy below the date picker.
      - Optional: add `listView.search.initialValue` when the date picker should start with a visible preset date (for example `{ "relativeDate": "today" }`).
      - Optional: add `listView.defaultWhen` to apply a default row filter before the user starts searching.
      - Optional: add `listView.dateHeading` to show headings such as `Wed, 04-Feb-2026 activities` above the results.

    - Want a Gmail-like **multi-field advanced search**? Set `listView.search.mode: "advanced"` and provide `fields` (the filterable field ids):

      ```json
      { "listView": { "search": { "mode": "advanced", "fields": ["Q1", "status", "createdAt"] } } }
      ```

      Notes:
      - `fields` can include **question ids** and meta columns like `createdAt`, `updatedAt`, `status`, `pdfUrl`.
      - In advanced mode, the list only filters **after the user performs a search** (press Enter or tap Search).

    - Want an alternative **non-table list UI** that only shows results after searching? Set `listView.view`:

      ```json
      { "listView": { "view": { "mode": "cards" } } }
      ```

      Optional: show a toggle to switch between **Table** and **List** (and set the default):

      ```json
      { "listView": { "view": { "toggleEnabled": true, "defaultMode": "cards" } } }
      ```

    - Want **quick search presets** under the search bar? Add a BUTTON question with `button.action: "listViewSearchPreset"`:

      ```json
      {
        "id": "PRESET_ACTIVE",
        "type": "BUTTON",
        "label": { "en": "Active recipes" },
        "button": {
          "action": "listViewSearchPreset",
          "mode": "text",
          "keyword": "Active"
        }
      }
      ```

      Optional: add an inline title before the preset buttons:

      ```json
      { "listView": { "search": { "presetsTitle": { "en": "View recipes:" } } } }
      ```

    - Want to reorder the major **Home/List** sections without hardcoding a form-specific page? Set `listView.layout.sections`:

      ```json
      {
        "listView": {
          "layout": {
            "sections": ["metric", "search", "dateHeading", "results", "presets", "pagination"],
            "metricAlign": "center"
          }
        }
      }
      ```

      Notes:
      - Supported section ids are `title`, `metric`, `search`, `dateHeading`, `results`, `presets`, and `pagination`.
      - When omitted, the UI keeps the legacy order.
      - `metricAlign` only affects standalone metric sections (not the legacy title row).

      Advanced mode example (filters):

      ```json
      {
        "id": "PRESET_STATUS",
        "type": "BUTTON",
        "label": { "en": "Closed (status)" },
        "button": {
          "action": "listViewSearchPreset",
          "mode": "advanced",
          "fieldFilters": { "status": "Closed" }
        }
      }
      ```

      Notes:
      - Presets can apply advanced `fieldFilters` even when the main list search mode is `text`.
      - Use `showIn: ["table"]` or `showIn: ["cards"]` to control which list-view modes render the preset button.
      - Use `target: "overlay"` to open a full-screen overlay instead of applying the preset inline.
      - Overlay presets can add extra filtering via `when`, rolling past/future date windows via `dateFieldId` + `lookbackDays` / `lookaheadDays` + `includeToday`, and a dedicated column set via `resultColumns`.
      - Set `overlay.clearSearchOnClose: true` when closing the overlay should reset the current search and restore the Home/List results to the configured default filter.
      - Overlay presets can also render grouped expandable lists:

      ```json
      {
        "id": "PRESET_LAST_7_DAYS",
        "type": "BUTTON",
        "label": { "en": "Last 7 days" },
        "button": {
          "action": "listViewSearchPreset",
          "showIn": ["table"],
          "target": "overlay",
          "resultColumns": ["DATE", "SERVICE", "action"],
          "dateFieldId": "DATE",
          "lookbackDays": 7,
          "includeToday": false,
          "overlay": {
            "presentation": "groupedList",
            "groupByFieldId": "CUSTOMER",
            "groupTitleSuffix": { "en": "last 7 days" },
            "defaultExpanded": false
          }
        }
      }
      ```

      Future windows use the same model:

      ```json
      {
        "id": "PRESET_NEXT_7_DAYS",
        "type": "BUTTON",
        "label": { "en": "Today and next 7 days" },
        "button": {
          "action": "listViewSearchPreset",
          "showIn": ["table"],
          "target": "overlay",
          "resultColumns": ["DATE", "SERVICE", "action"],
          "dateFieldId": "DATE",
          "lookaheadDays": 7,
          "includeToday": true
        }
      }
      ```

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

      Optional: **per-case open targets** + make **row clicks** honor the same target.

      - You can set `openView` (and `openButtonId`) on each `cases[]` entry.
      - You can also use an object form for `openView` to enable row-wide behavior: `{ "target": "summary", "rowClick": true }`.

      Example: Closed records open **Summary** (and clicking any cell on the row does the same); other records open **Form**:

      ```json
      {
        "listView": {
          "columns": [
            {
              "type": "rule",
              "fieldId": "action",
              "label": { "en": "Action" },
              "openView": { "target": "form", "rowClick": true },
              "cases": [
                { "when": { "fieldId": "status", "equals": "Closed" }, "text": "View", "style": "link", "openView": { "target": "summary", "rowClick": true } },
                { "when": { "fieldId": "status", "notEquals": "Closed" }, "text": "Edit", "style": "link" }
              ]
            }
          ]
        }
      }
      ```

      Optional: instead of opening Form/Summary, you can make a rule column run a **custom BUTTON action** (preview) by using:
      - `"openView": "button"`
      - `"openButtonId": "<BUTTON_QUESTION_ID>"` (or the encoded id containing `__ckQIdx=` when needed)

      Additional open targets:
      - `"openView": "copy"`: triggers the app's **Copy record** action for that row (opens a new draft in the form view).
      - `"openView": "submit"`: triggers the app's **Submit** action for that row (navigates to form on validation errors; to summary on success).

      Example: clicking the cell opens a configured HTML template preview button:

      ```json
      {
        "listView": {
          "columns": [
            {
              "type": "rule",
              "fieldId": "report",
              "label": { "en": "Report" },
              "openView": "button",
              "openButtonId": "BTN_REPORT_HTML",
              "cases": [
                { "text": "Open report", "style": "link", "icon": "view" }
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

      Optional: show a **legend in the sticky bottom bar** to explain icons / table elements. The legend is **only shown when you define it** (recommended when you use `icon` in rule columns). Legend text supports basic inline Markdown (`**bold**`, `*italic*`, `code`, and links):

      ```json
      {
        "listView": {
          "legend": [
            { "icon": "warning", "text": { "en": "**Needs attention** (e.g. Missing DATE)" } },
            { "icon": "check", "text": { "en": "**OK:** ready for *Meal Production*" } },
            { "pill": { "text": { "en": "Draft" }, "tone": "muted" }, "text": { "en": "Not submitted yet." } },
            { "text": { "en": "Click Action to open the record." } }
          ]
        }
      }
      ```

      Supported icons: `warning`, `check`, `error`, `info`, `external`, `lock`, `edit`, `copy`, `view`.
      Pill tones: `default`, `muted`, `strong` (neutral palette).

      Optional: set legend columns (for dense legends):

      ```json
      { "listView": { "legendColumns": 2 } }
      ```

      Optional: hide action labels (icon-only cells) and render multiple inline actions in a single rule cell:

      ```json
      {
        "listView": {
          "columns": [
            {
              "type": "rule",
              "fieldId": "action",
              "label": { "en": "Action" },
              "cases": [
                {
                  "when": { "fieldId": "status", "equals": "Closed" },
                  "text": "Actions",
                  "hideText": true,
                  "actions": [
                    { "text": "View", "hideText": true, "icon": "view", "openView": "summary" },
                    { "text": "Copy", "hideText": true, "icon": "copy", "openView": "copy" }
                  ]
                }
              ]
            }
          ]
        }
      }
      ```

      Optional: show a column only in **table** or only in **cards** view via `showIn`:

      ```json
      {
        "listView": {
          "columns": [
            { "type": "rule", "fieldId": "action", "label": { "en": "Actions" }, "showIn": "cards", "cases": [ { "text": "Edit", "style": "link" } ] },
            { "fieldId": "createdAt", "showIn": "table" }
          ]
        }
      }
      ```

      Optional: customize (or remove) the search placeholder text:

      ```json
      { "listView": { "search": { "placeholder": { "en": "Find recipes…" } } } }
      ```

      Set an empty string to remove the placeholder:

      ```json
      { "listView": { "search": { "placeholder": "" } } }
      ```

      Optional: hide the list heading entirely by setting `listView.title` to `""`:

      ```json
      { "listView": { "title": "" } }
      ```

    - Want a **Re-open** button on the Summary view for Closed records? Use a `BUTTON` question with `button.action: "updateRecord"` and a visibility rule on `status`.

      Example: show a "Re-open" button only when the record status is Closed; on click, confirm, set status back to In progress, then navigate to Form:

      ```json
      {
        "button": {
          "action": "updateRecord",
          "placements": ["summaryBar"],
          "set": { "status": "In progress" },
          "navigateTo": "form",
          "confirm": {
            "title": { "en": "Re-open record" },
            "message": { "en": "Re-open this record so it can be edited again?" },
            "confirmLabel": { "en": "Re-open" },
            "cancelLabel": { "en": "Cancel" }
          }
        },
        "visibility": { "when": { "fieldId": "status", "equals": "Closed" } }
      }
      ```

      **UX note**: After the user confirms, the UI shows a **full-screen blocking overlay** (spinner + message) and locks interaction until the update completes.
      Use `button.progressDialog` to configure that blocking overlay. If the overlay is sufficient feedback for the action, set `button.suppressStatusFeedback: true` so the form-level Saving/Saved banner is not shown after the update succeeds; validation and error messages still appear.

      Optional: add a reusable downstream dependency check before the update is applied.
      Use `button.dependencyGuard` when changing the current record would invalidate data on other forms that still reference it.

      Example: before deactivating a Recipe, block the update when the recipe is used by an in-progress Meal Production record for today. Future records are not mutated here; their recipe datasource sync can refresh or clear recipe details when the user enters the relevant guided step.

      ```json
      {
        "button": {
          "action": "updateRecord",
          "placements": ["summaryBar"],
          "set": { "status": "Disabled" },
          "navigateTo": "form",
          "confirm": {
            "title": { "en": "Please confirm" },
            "message": { "en": "This recipe will stop appearing in the Meal Production form. Do you want to proceed?" }
          },
          "dependencyGuard": {
            "targetFormKey": "Meal Production",
            "mode": "block",
            "when": {
              "all": [
                { "fieldId": "status", "equals": "In progress" },
                { "fieldId": "MP_PREP_DATE", "isToday": true },
                {
                  "lineItems": {
                    "groupId": "MP_MEALS_REQUEST",
                    "subGroupId": "MP_TYPE_LI",
                    "when": {
                      "all": [
                        { "fieldId": "PREP_TYPE", "equals": "Cook" },
                        { "fieldId": "RECIPE", "equals": "{{source.QFTD5RD2EM}}" }
                      ]
                    }
                  }
                }
              ]
            },
            "dialog": {
              "title": { "en": "Recipe used in meal production" },
              "message": {
                "en": "This recipe is currently used in today’s meal production and cannot be deactivated. Select another recipe in Meal Production first, or return after today’s production is completed. Concerned records:\n{{recordsList}}"
              },
              "confirmLabel": { "en": "OK" },
              "cancelLabel": { "en": "Cancel" },
              "showCancel": false,
              "recordList": {
                "template": {
                  "en": "- {{target.MP_DISTRIBUTOR}} | {{target.MP_SERVICE}}"
                }
              }
            }
          }
        }
      }
      ```

      Notes:
      - `dependencyGuard.when` reuses the standard `WhenClause` DSL, including `all` / `any` / `not`, date comparisons, and `lineItems` conditions.
      - String values can reference the current source record via `{{source.FIELD_ID}}`, `{{source.id}}`, `{{source.status}}`, `{{source.createdAt}}`, and `{{source.updatedAt}}`.
      - The dedicated `dependencyGuard.dialog` only appears when impacted downstream records are found. If there are no matches, the normal `confirm` dialog (if configured) is used.
      - `dependencyGuard.mode: "block"` prevents the source update from being saved when matches are found. Use `dialog.recordList.template` with `{{recordsList}}` to show the concerned target records; target placeholders use `{{target.FIELD_ID}}`.
      - `mutations.type: "setRecord"` updates top-level fields on each impacted target record.
      - `mutations.type: "setLineItemValues"` updates matching rows inside a line-item group or subgroup path. Use `clearSubGroups` to empty direct child subgroup arrays on those matched rows.

    - Want a guided-step order lock from the `Order` step? Add an inline BUTTON with `button.action: "updateRecord"` that sets a dedicated lock flag (for example `ORDER_LOCKED = "Yes"`), and add a form-level `fieldDisableRules` rule scoped to `__ckStep`. Prefer a flag over status when the record should stay in the same operational status.

      Example:

      ```json
      {
        "steps": {
          "mode": "guided",
          "items": [
            {
              "id": "orderInfo",
              "include": [
                { "kind": "question", "id": "MP_DISTRIBUTOR" },
                { "kind": "question", "id": "MP_PREP_DATE" },
                { "kind": "question", "id": "MP_SERVICE" },
                { "kind": "question", "id": "MP_COOK_NAME" },
                { "kind": "question", "id": "MP_READY_FOR_PRODUCTION" }
              ]
            }
          ]
        },
        "fieldDisableRules": [
          {
            "id": "ready-for-production-order-lock",
            "when": {
              "all": [
                { "fieldId": "ORDER_LOCKED", "equals": "Yes" },
                { "fieldId": "__ckStep", "equals": "orderInfo" }
              ]
            },
            "bypassFields": [],
            "unlockSet": { "ORDER_LOCKED": "" }
          }
        ]
      }
      ```

      Example button question:

      ```json
      {
        "id": "MP_READY_FOR_PRODUCTION",
        "type": "BUTTON",
        "qEn": "Lock Order information",
        "button": {
          "action": "updateRecord",
          "placements": ["form"],
          "tone": "primary",
          "set": { "values": { "ORDER_LOCKED": "Yes" } },
          "navigateTo": "form",
          "progressDialog": {
            "title": { "en": "" },
            "message": { "en": "Do not leave this page while we lock order information" }
          },
          "suppressStatusFeedback": true,
          "confirm": {
            "message": {
              "en": "Lock order details?\\nCustomer, date, service, responsible cook, and ordered portions cannot be changed if you lock. Do you wish to continue?"
            },
            "confirmLabel": { "en": "Yes, lock order details" },
            "cancelLabel": { "en": "No, do not lock order details" },
            "primaryAction": "cancel"
          }
        },
        "visibility": {
          "showWhen": {
            "all": [
              { "fieldId": "__ckStep", "equals": "orderInfo" },
              { "fieldId": "__ckStepValid_orderInfo", "equals": "true" },
              { "not": { "fieldId": "ORDER_LOCKED", "equals": "Yes" } }
            ]
          }
        }
      }
      ```

      Admin unlock button (recommended):
      - Add a Summary `updateRecord` button that clears the lock flag and sets `navigateTo: "form"`.
      - Gate the button with `visibility.showWhen` using:
        - `{ "fieldId": "ORDER_LOCKED", "equals": "Yes" }`
        - `{ "fieldId": "__ckRequestParam_admin", "equals": ["true", "1", "yes"] }`
      - Then only users opening the app with `?admin=true` can see the unlock button.

      Optional emergency unlock:
      - Add `?unlock=<record_id>` to the web-app URL to bypass the `ready-for-production-order-lock` rule for that record.
      - This override is intentionally scoped to that specific lock-rule id and matching record id.
      - If that rule defines `unlockSet` (for example `{ "ORDER_LOCKED": "" }`), the app automatically applies that field patch once the unlocked record is opened in form view.

    - Want to **disable the title-open sidebar** for a form? Set `appHeader.sidebarEnabled: false` in the dashboard “Follow-up Config (JSON)” column. Users can still force-enable the sidebar for troubleshooting with `?dev-mode=true`:

      ```json
      { "appHeader": { "sidebarEnabled": false } }
      ```

    - Want to keep **logo metadata** with the form config? Set `appHeader.logo` in the dashboard “Follow-up Config (JSON)” column. You can provide a Google Drive file id, a Drive share URL, or a direct `https://...` image URL:

      ```json
      { "appHeader": { "logo": "https://drive.google.com/file/d/<ID>/view?usp=sharing" } }
      ```

      Note:
      - The React form shell no longer renders the form logo directly in the sticky header; it now uses a `← Apps` back button plus a centered title.
      - This dashboard setting still applies to individual form apps and can be reused by launcher surfaces as artwork metadata.
      - The central landing page uses `docs/config/exports/<env>/landing_page.json` for its own brand logo source, copy, and card artwork.
      - The centralized analytics dashboard uses `docs/config/exports/<env>/analytics_page.json` for its landing tile, header brand source, and cross-form widget layout.

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

    - Want the **native Summary view** to keep sections **expanded** (no default-collapsed groups)? Set:

      ```json
      { "groupBehavior": { "summaryExpandAll": true } }
      ```

    - Want a **guided multi-step Edit view** (stepper + progressive disclosure, reusable per form)? Set `steps` on the dashboard JSON:

      ```json
      {
        "steps": {
          "mode": "guided",
          "defaultForwardGate": "whenValid",
          "defaultAutoAdvance": "onValid",
          "stateFields": { "prefix": "__ckStep" },
          "header": {
            "include": [
              { "kind": "question", "id": "CUSTOMER" },
              { "kind": "question", "id": "PRODUCTION_DATE" }
            ]
          },
          "items": [
            {
              "id": "order",
              "label": { "en": "Order" },
              "include": [{ "kind": "question", "id": "SERVICE" }],
              "navigation": {
                "autoAdvanceWhen": { "fieldId": "ORDER_LOCKED", "equals": "Yes" }
              }
            },
            {
              "id": "meals",
              "label": { "en": "Meals" },
              "render": { "lineGroups": { "mode": "inline" } },
              "include": [
                {
                  "kind": "lineGroup",
                  "id": "MP_MEALS_REQUEST",
                  "presentation": "liftedRowFields",
                  "fields": ["meal_type", "quantity"],
                  "collapsedFieldsInHeader": true
                }
              ]
            }
          ]
        }
      }
      ```

      **Notes:**
      - Steps can mix **top-level questions** and **line item groups**.
      - Use `helpText` on a step to display guidance above the step content (e.g., food safety confirmation + per-pot photo instructions).
      - Use step-level `includeWhen` / `excludeWhen` to hide entire steps dynamically. Hidden steps are removed from the stepper and from guided validation/advancement.
      - Line groups can be rendered **inline** or via a **full-page overlay** (`displayMode: "overlay"` or step `render.lineGroups.mode`).
      - You can filter visible rows per step using `rows.includeWhen` / `rows.excludeWhen` (e.g., `quantity > 0`) and scope subgroups via `subGroups.include`.
      - If you need to **show all rows** but only **validate/advance based on a subset** (e.g., ignore rows where `QTY < 1` while still displaying them), use `validationRows.includeWhen` / `validationRows.excludeWhen` on the step target.
      - When a step is blocked, **field-level error messages** are shown inline; there is no step-level validation banner.
      - For **progressive** line item groups in guided steps, set `collapsedFieldsInHeader: true` on the step target to:
        - show the configured `lineItemConfig.ui.collapsedFields` in the **row header**
        - keep rows **always expanded** (no toggle/pill indicator)
        - hide the row body when the step only includes collapsed fields (row disclaimer shows as a footer)
      - For a compact progressive row header that stays visible in both collapsed and expanded states, set `lineItemConfig.ui.rowHeaderSummaryTemplate`, for example `{MEAL_TYPE} | {ORD_QTY}`.
      - For table-rendered line item groups/subgroups, set `lineItemConfig.ui.emptyText` (or subgroup `ui.emptyText`) to customize the empty-state copy, for example `{ "en": "No ingredient selected" }`.
      - For compact sentence-style line item rows, enable `lineItemConfig.ui.compactRows: true` and define:
        - `ui.compactHeadlineRows` for the first display line
        - `ui.compactDetailRows` for secondary inline summary text such as ingredient lists
        - `ui.compactSentenceRows` for the inline sentence/control line
        - `ui.compactActions` for optional row actions such as opening a read-only subgroup overlay
        - `ui.persistRows: false` when the compact rows are UI-only selector state and must not be saved back into the record
        - compact-row actions can set `overlayLabel` separately from the button label when the overlay should not repeat the button text as a title
        - use local hydrated fields for compact-row text when the selector already copied bank data into the row; reserve `sourceFieldId + sourcePath` for true datasource lookups
        - use `type: "sourceListSummary"` inside compact headline/detail parts when the row should summarize a nested datasource list inline (for example, comma-separated ingredient names)
        - set `sourceListSummary.sort: "alphabetical"` when those nested values should be sorted alphabetically before joining
        - use `selectionEffects.addLineItems` with `replaceExistingByEffectId: true` when compact-row edits must immediately regenerate one downstream normalized line item
        - when a compact row lives inside a subgroup and needs to regenerate a sibling subgroup for the same parent row, point `selectionEffects[].groupId` at the sibling subgroup id; the runtime resolves it relative to the current parent row automatically
        - use `selectionEffects.type: "addLineItemsFromFieldPayload"` when the downstream line items should be hydrated from a serialized payload already stored on the current row
        - for datasource-backed allocation screens that must render each shared source row once and allocate it into multiple parent rows, set the datasource-row config `presentation: "sourceFirstAllocations"` and optionally add `presentationWhen`, `hideParentRowsWhenPresentationActive`, `allocationLabelFieldId`, `sourceMatchFieldIds` (fallback match fields checked in order), `ui.emptyStateMessage` when filtering leaves no compatible source rows, and `ui.noSourceRowsMessage` when the datasource itself returns no rows
        - set `ui.sourceFirstRowSort: "alphabetical"` when those rendered source rows should be sorted by their resolved compact headline text instead of datasource order
        - when a `sourceFirstAllocations` row should still show its per-parent allocation label even if only one compatible parent row is visible, set `ui.allocationLabelVisibility: "always"`
        - for form-backed datasources with legacy rows missing derived fields, use `dataSource.backfill` to declare a repair pass in config. Point it at the source form/record/row fields, define root/nested `scopes`, and map `values` from those scopes; the server only applies the backfill when one of `whenMissingAnyFieldIds` is empty on the fetched datasource row
      - Compact headline parts can read directly from a datasource-backed selector by setting `sourceFieldId`, `sourcePath`, optional `lookupField`, and optional `suffixSourcePath`. This keeps compact rows configuration-driven and avoids duplicating the same display values into hidden fields only for presentation.
      - **Row flow (steps)**: Use `rowFlow` on a step line-group target to render an output line + a single active prompt per row.

        ```json
        {
          "kind": "lineGroup",
          "id": "MP_MEALS_REQUEST",
          "rowFlow": {
            "output": { "segments": [{ "fieldRef": "MEAL_TYPE" }, { "fieldRef": "QTY" }] },
            "prompts": [{ "id": "reheat", "fieldRef": "MP_IS_REHEAT", "hideWhenFilled": true }]
          }
        }
        ```

        - `output.segments` defines the text line (supports labels, list formatting, `format.unique`, `format.sort`, static `type: "text"` segments, `type: "spacer"` to push later inline content toward the row end, `layout: "block"` for full-width lines, display-only references to hidden helper / derived fields, and `showWhen`).
        - Newlines in row-flow text, labels, and list delimiters are preserved, so `format.listDelimiter: "\n"` can render one referenced value per line.
        - Use `renderAs: "control"` to place a field inline in the output row; combine with `controlStyle: "compact"` plus `minWidth` / `maxWidth` / `paddingChars` when the control should read like part of a sentence. Compact row-flow controls support NUMBER, CHOICE, and boolean CHECKBOX inputs, which is useful for mobile-friendly sentence rows such as leftover freeze toggles.
        - `output.segments[].editAction` (single) or `editActions` (array) renders one or more action icons next to a segment.
        - `output.actions` lets you place row actions at the start/end of the output line; use `output.actionsLayout: "below"` to render them on a separate row. Use `output.actionsScope: "group"` (or per-action `scope: "group"`) to render actions once after all rows.
        - `prompts` controls the input order (`completedWhen`, `hideWhenFilled`, `keepVisibleWhenFilled`), allows label overrides via `input.label`, and supports `input.labelLayout` (`stacked` | `inline` | `hidden`).
        - `onCompleteActions` triggers action ids once a prompt becomes complete (useful to auto-open overlays after a selection).
        - `actionsLayout` controls prompt action placement (`below` | `inline`) to keep prompts on a single row.
        - `actions` can edit values, delete rows (`deleteRow`), add rows, close overlays, or open overlays. Use `enabledWhen` / `disabledWhen` on an action to keep the button visible while preventing execution until the row context satisfies the configured condition.
        - `openOverlay` effects accept the same options as `LineItemOverlayOpenActionConfig` (row filters, overrides, flattening, rowFlow override, `hideCloseButton`, `closeButtonLabel`, `closeConfirm`) plus `overlayContextHeader` for per-action headers and `overlayHelperText` for helper copy shown below the overlay list.
        - `rowFlow.overlayContextHeader.fields` shows a default context line in overlays opened from row flow actions.
      - Navigation/back labels and controls:
        - Use `steps.stepSubmitLabel` for the non-final step action label (defaults to “Next”), and per-step `navigation.submitLabel` overrides when needed. Final steps always use `submitButtonLabel`.
        - The Back button can be customized globally (`steps.backButtonLabel`, `steps.showBackButton`) or per-step (`navigation.backLabel`, `navigation.showBackButton`) and is disabled when `allowBack: false`.
        - Use `navigation.autoAdvanceWhen` when the step should become locally complete first but should only navigate after an extra runtime condition matches, for example `{ "fieldId": "ORDER_LOCKED", "equals": "Yes" }`.
        - Use `contextHeader.parts` to render a bold title line above the step body. Parts can be field ids or objects like `{ "id": "CUSTOMER", "displayField": "FULL_NAME" }` when the guided title should show a richer datasource field but the rest of the app should keep the stored compact label.
        - Use `navigation.milestoneAction` when a non-final step must trigger configured follow-up actions before the user continues. The current reusable option is `type: "followupBatch"`, which can:
          - run blocking follow-up actions first (`preActions`), then launch non-blocking ones (`backgroundActions`)
          - ensure a persisted draft record id exists (`ensureRecordId`)
          - choose which client queues to wait for before starting (`waitForQueue: "all" | "uploadsOnly" | "none"`)
          - legacy alias: `waitForBackgroundSaves: true` maps to `waitForQueue: "all"`
          - validate the current step, all visible steps through the current step, or the full form before starting (`validationScope`)
          - run the configured `backgroundActions` in background (`runInBackground`)
          - require actual email dispatch before success with `emailDispatchMode: "direct"` when a `SEND_EMAIL` action must be confirmed before the user can continue; use `queued` only when background outbox delivery is acceptable
          - serialize follow-up execution per record on the server so later milestone batches wait behind earlier in-flight batches for the same record
          - stop the batch after the first failed action so later actions do not run against a partially failed state
          - retry transient lock-contention failures during utilisation upserts and utilisation sync before surfacing the error to the user
          - auto-advance to the next step after the batch starts (`advanceAfterStart`)
          - redirect to another view after success (`navigateToAfterSuccess: "current" | "form" | "summary" | "list"`)
          - show configurable dialogs before/after start (`confirmationDialog`, `confirmationDialogCases[]`, `progressDialog`, `progressDialogCases[]`, `feedbackDialog`); set a localized `title` value to `""` to hide the title line instead of using the fallback title
          - choose the confirmation or progress overlay copy per record state with ordered `confirmationDialogCases[]` / `progressDialogCases[]`
          - show a generated-records dialog after success (`generatedRecordsDialog`) when matching `submitEffects` created downstream records
          - optionally attach a generic dialog button action with `feedbackDialog.confirmAction` / `feedbackDialog.cancelAction`, supporting `{ "type": "guidedStepMilestone", "stepId": "..." }` to run another step's configured milestone action from the dialog or `{ "type": "formSubmit" }` to invoke the same submit flow as the action bar submit button
      - Read-only labels in steps:
        - Top-level step targets accept `renderAsLabel: true` to show the value as a label instead of an input.
        - Line item + subgroup step targets support **step-scoped label rendering** in two equivalent ways:
          - Use `readOnlyFields` (and subgroup `include[].readOnlyFields`) to render selected fields as read-only labels in guided steps.
          - Or, in `fields`, use object entries like `{ "id": "QTY", "renderAsLabel": true }` (instead of a plain `"QTY"` string).
        - Progressive header collapsed fields respect `collapsedFields[].showLabel` (stacked when shown) and honor `readOnlyFields`, with layout controlled by standard `pair` keys.
      - The UI exposes virtual step fields (default prefix `__ckStep`) so existing `visibility.showWhen` rules can gate fields/buttons:
        - `__ckStepValid_<STEP_ID>` / `__ckStepComplete_<STEP_ID>`
        - `__ckStepMaxValidIndex` / `__ckStepMaxCompleteIndex`
      - Datasource-backed visibility can use the virtual field format `__ckDataSourceCount.<DATA_SOURCE_ID>` to hide steps/buttons when a datasource currently has no cached rows.
      - Selection effects: you can give any `selectionEffects[]` rule an `id`, and auto-created rows will be tagged with `__ckSelectionEffectId = "<id>"` so row-level `visibility` / `validationRules` / `rowDisclaimer` can reference the originating rule.
      - Full design details live in `docs/guided-steps-edit-mode-design.md`.

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

      **UX note**: After the user confirms, the UI shows a **full-screen blocking overlay** (spinner + message) and locks interaction until submission (and post-submit follow-up actions) finish.

    - Want to **override the submit confirmation dialog button labels**? Set `submissionConfirmationConfirmLabel` and/or `submissionConfirmationCancelLabel` (localized). When omitted, the UI falls back to:
      - confirm: the resolved Submit button label
      - cancel: system strings (e.g. “Cancel”)

      ```json
      {
        "submissionConfirmationConfirmLabel": { "en": "Yes, submit" },
        "submissionConfirmationCancelLabel": { "en": "Not yet" }
      }
      ```
    - Need **submit-time background follow-up**? Configure `submissionAfterSubmit` so some actions complete before navigation and others continue after redirect.
      - `preActions`: follow-up action ids that must complete before navigation
      - `backgroundActions`: follow-up action ids that can continue after navigation
      - `waitForQueue`: `all` | `uploadsOnly` | `none`
      - `navigateTo`: `auto` | `form` | `summary` | `list`
      - `confirmationDialog`: optional confirmation dialog shown before final submit starts
      - `confirmationDialogCases[]`: ordered conditional confirmation dialogs; first match wins and falls back to `confirmationDialog`
      - `progressDialog`: optional blocking-overlay copy shown immediately while submit work is running. Set `title.en` to `""` to hide the title line.
      - `progressDialogCases[]`: ordered conditional progress dialogs; first match wins and falls back to `progressDialog`
      - `generatedRecordsDialog`: optional single-action dialog shown after successful `preActions` when matching submit effects created downstream records; `itemTemplate` supports `{{FIELD_ID}}`, `{{A || B}}` fallbacks, and formatters such as `label`, `appendField`, `pluralize`, and `date`
      - `feedbackDialog`: optional acknowledgement dialog shown after background actions start. Its confirm/cancel buttons may include `confirmAction` or `cancelAction`; use `{ "type": "guidedStepMilestone", "stepId": "leftovers" }` to let a dialog button run the target step's configured milestone action, or `{ "type": "formSubmit" }` when the button should run the same submit flow as the action bar submit button.
      - same-record follow-up batches are serialized on the server, so final-submit `preActions` wait behind any earlier in-flight milestone batch for that record

      Example:
      ```json
      {
        "submissionAfterSubmit": {
          "preActions": ["CLOSE_RECORD"],
          "waitForQueue": "uploadsOnly",
          "backgroundActions": ["CREATE_PDF", "SEND_EMAIL"],
          "navigateTo": "summary",
          "feedbackDialog": {
            "title": { "en": "Background actions started" },
            "message": { "en": "PDF creation and email delivery are running in the background." },
            "confirmLabel": { "en": "OK" },
            "showCancel": false,
            "showCloseButton": false,
            "dismissOnBackdrop": false
          }
        }
      }
      ```

    - Want to **customize the duplicate-record dialog** shown when dedup rules block a record? Set `dedupDialog` in the same dashboard JSON. The dialog body automatically lists the dedup key labels + values between `intro` and `outro`. Use `cancelLabel` to control the list-view cancel action (when a duplicate is detected before opening the form).

      ```json
      {
        "dedupDialog": {
          "title": {
            "en": "Creating duplicate record for the same customer, service and date is not allowed."
          },
          "intro": {
            "en": "A meal production record already exists for:"
          },
          "outro": {
            "en": "What do you want to do?"
          },
          "changeLabel": {
            "en": "Change customer, service or date"
          },
          "cancelLabel": {
            "en": "Cancel"
          },
          "openLabel": {
            "en": "Open existing record"
          }
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

    - Want **ordered submit validation** (required fields must be completed in order + Submit disabled until valid)? Configure `submitValidation` in the dashboard JSON:

      ```json
      {
        "submitValidation": {
          "enforceFieldOrder": true,
          "submitTopErrorMessage": {
            "en": "Please complete the required fields above before submitting."
          },
          "lineItemGroupNeedsAttentionMessage": {
            "en": "Please review this group before continuing."
          }
        }
      }
      ```

      - In guided steps, **Next** remains clickable once the step forward gate is satisfied.
      - `hideSubmitTopErrorMessage: true` hides the top submit-error banner in edit view (field-level inline errors still show).
      - `submitTopErrorMessage` customizes the top error banner shown after a submit attempt (localized) and overrides system key `validation.fixErrors` for that form.
      - `lineItemGroupNeedsAttentionMessage` customizes the helper shown under line-item group pills when they still need attention (localized).

    - Want to **override the Summary button label**? Set `summaryButtonLabel` (localized). Useful when “Summary” should read like “Checklist”.

      ```json
      {
        "summaryButtonLabel": {
          "en": "Checklist",
          "fr": "Liste",
          "nl": "Checklist"
        }
      }
      ```

    - Want draft autosave while editing? Add `"autoSave": { "enabled": true, "debounceMs": 2000, "status": "In progress" }` to the same dashboard JSON column. Draft saves run in the background without validation and update the record’s `Updated At` + `Status`. Records with `Status = Closed` are treated as read-only and are not auto-saved. The first time a user opens Create/Edit/Copy, they’ll see a one-time autosave explainer overlay (copy lives in `autosaveNotice.*` in `src/web/systemStrings.json`).
      - Optional decoupling: use `autoSave.enableWhenFields` for autosave enablement gates and `autoSave.dedupTriggerFields` for dedup trigger fields.
      - Optional dedup popup copy: use `autoSave.dedupCheckDialog` to configure the checking/available/duplicate modal text and auto-close timings. Set a title value to `""` to hide the title line; set both `availableTitle` and `availableMessage` to `""` to skip the success popup after the check completes.
      - The web app fingerprints draft payloads and coalesces repeated autosave / ensure-draft / explicit draft-save requests for the same unchanged record before calling `saveSubmissionWithId`.
    - Want dedup-key edits to delete the current record instead of mutating it? Add `"dedupDeleteOnKeyChange": true` in the same dashboard JSON column. When enabled, if a user changes a top-level field that participates in a reject dedup rule, the current record is deleted immediately (after confirm/blur + selection effects). Then standard create-flow dedup/autosave rules apply.
    - Want a confirmation dialog when users press **Home** with incomplete required data? Add:
      - `actionBars.system.home.dedupIncompleteDialog` for legacy dedup-key guards, or
      - `actionBars.system.home.incompleteFieldsDialog` for flexible field-based guards.
      On confirm, the app leaves the form and (by default) deletes the current persisted record first.

      ```json
      {
        "actionBars": {
          "system": {
            "home": {
              "incompleteFieldsDialog": {
                "criteria": "fieldIds",
                "fieldIds": ["INGREDIENT_NAME", "CREATED_BY"],
                "message": {
                  "en": "A record can only exist when all required fields are filled in."
                },
                "confirmLabel": {
                  "en": "Continue and delete the record"
                },
                "cancelLabel": {
                  "en": "Cancel and continue editing"
                },
                "primaryAction": "cancel",
                "deleteRecordOnConfirm": true
              }
            }
          }
        }
      }
      ```
      - `criteria` supports `dedupKeys` (default for legacy key), `fieldIds`, or `either`.
      - Set `title` to an empty string to remove the dialog title line.
    - Want to conditionally disable editing for most fields? Add `fieldDisableRules` in the same dashboard JSON column. When a rule matches, all fields become read-only except ids in `bypassFields`.

      ```json
      {
        "fieldDisableRules": [
          {
            "id": "future-date-lock",
            "when": { "fieldId": "DATE", "isInFuture": true },
            "bypassFields": ["COOK"]
          }
        ]
      }
      ```
    - **Status**: Set to "Active" to include in the form, or "Archived" to remove it (keeping data).
    - **Line items**: Set `Type` to `LINE_ITEM_GROUP` and use the `Config (JSON/REF)` column with JSON or `REF:SheetName` pointing to a line-item sheet (columns: ID, Type, Label EN, Label FR, Label NL, Required?, Options (EN), Options (FR), Options (NL), Config JSON). Line-item field types can be DATE, TEXT, PARAGRAPH, NUMBER, CHOICE, CHECKBOX, FILE_UPLOAD.
        - Line-item fields also support `group`, `pair`, and `ui` (including `ui.control` and `ui.labelLayout`) the same way top-level questions do.
        - Header controls:
          - `ui.showItemPill`: show/hide the items pill in the line-item header (default: true)
          - `ui.addButtonPlacement`: where the Add button appears (`top`, `bottom`, `both`, `hidden`; default: `both`)
          - `ui.openInOverlay`: when `true`, the line-item group editor opens in a **full-page overlay** (like subgroup overlays) and the main form shows a compact “Open” card instead of rendering the full table inline
          - `ui.closeButtonLabel`: optional label override for the overlay close button (used when `ui.openInOverlay: true`)
          - `ui.closeConfirm`: optional close confirmation dialog (simple confirm or conditional cases via `OverlayCloseConfirmConfig`; used when `ui.openInOverlay: true`)
          - `ui.choiceSearchEnabled`: default type-to-search behavior for CHOICE selects inside this group (can be overridden per field via `field.ui.choiceSearchEnabled`). Search indexes include extra columns from `optionsRef`/data sources when available.
          - `ui.mode: "table"`: render line items as a compact table (also supported on subgroups)
          - `ui.tableColumns`: ordered list of field ids to show as table columns (defaults to the line-item field order)
          - `ui.tableColumnWidths`: optional per-column widths map. Keys can be field ids plus action keys
           (`__remove`, `__view`, `__edit` and `_remove`, `_view`, `_edit` for overlay header action columns).
           Example: `{ "ING": "50%", "QTY": "25%", "UNIT": "25%", "__remove": "44px" }`
          - `ui.readOnlyAppendFieldId`: when a table field is read-only (`readOnly: true` or `ui.renderAsLabel: true`), append a sibling field value in parentheses from the same row (example: `Bulgur (Gluten)`).
          - `ui.readOnlyAppendHideValues`: optional appendix values to suppress (case-insensitive exact match), e.g. `["None"]`.
          - `ui.nonMatchWarningMode`: choose how optionFilter non-match warnings show in the table legend (`descriptive`, `validation`, or `both`)
          - `ui.tableHideUntilAnchor`: when true (default), hide non-anchor columns until the anchor field has a value
          - `ui.needsAttentionMessage`: localized override for the “Needs attention” helper shown when this line item group or subgroup requires review
          - `ui.allowRemoveAutoRows`: when `false`, hides the **Remove** button for rows marked `__ckRowSource: "auto"`
          - `ui.saveDisabledRows`: when `true`, includes disabled progressive rows in the submitted payload (so they can appear in downstream PDFs)
        - `dedupRules`: optional row-level de-duplication rules for this group or subgroup. Each rule lists field ids that must be unique together; the check runs once all listed fields have values. The `message` supports a `{value}` placeholder (replaced with the first dedup field’s value).
        - `removeGuard`: optional row-removal guard for this group or subgroup. Use `{ "minRows": 1, "message": { "en": "At least one row must remain." } }` to block deleting the final row and show a dialog.
          Example:
          ```json
          {
            "dedupRules": [
              {
                "fields": ["ING", "UNIT"],
                "message": {
                  "en": "This ingredient already exists with the same unit.",
                  "fr": "Cet ingrédient existe déjà avec la même unité.",
                  "nl": "Dit ingrediënt bestaat al met dezelfde eenheid."
                }
              }
            ]
          }
          ```
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
       - Conditions (`when`) support **compound logic** using `all` (AND), `any` (OR), and `not` (NOT). This same compound `when` syntax also works for `visibility.showWhen/hideWhen` and `validationRules[].when`.
       - Guided steps: the **active step id** is exposed as a virtual field at the step state prefix. With the default `steps.stateFields.prefix = "__ckStep"`, you can reference the current step via `"fieldId": "__ckStep"`.
         Example: show a row disclaimer only for selection-effect rows, except on specific steps:

       ```json
       {
         "ui": {
           "rowDisclaimer": {
             "cases": [
               {
                 "when": {
                   "all": [
                     { "fieldId": "__ckSelectionEffectId", "equals": "leftover" },
                     { "not": { "fieldId": "__ckStep", "equals": ["foodSafety", "portioning"] } }
                   ]
                 },
                 "text": { "en": "Update Requested portions if required" }
               }
             ]
           }
         }
       }
       ```
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
      - Optional: customize the overlay copy per group (or via `groupOverride` on overlay openers) with:
        - `addOverlay.title` (localized)
        - `addOverlay.helperText` (localized)
        - `addOverlay.placeholder` (localized)
   - Selector overlay add flow (search + multi-select): use `addMode: "selectorOverlay"` with `anchorFieldId` and a `sectionSelector` label. The selector becomes the search input + multi-select results list (no separate **Add** button), and search indexes include extra columns from `optionsRef` / data sources so typing a category or dietary label surfaces matching items.
      - Optional: `sectionSelector.placeholder` and `sectionSelector.helperText` customize the search input placeholder and helper copy for the selector overlay.
    - Auto add flow (no overlay): use `addMode: "auto"` with `anchorFieldId` pointing to a CHOICE line-item field that has an `optionFilter.dependsOn` (one or more controlling fields). When all `dependsOn` fields are filled, the form will automatically create one row per allowed anchor option (same filtering logic as overlay). If the controlling fields change later, auto-generated rows are recomputed and overwritten; manual rows are preserved.
      - Progressive + expand gate: if you also set `"ui": { "mode": "progressive", "expandGate": "collapsedFieldsValid", "collapsedFields": [...] }` then:
        - Auto-generated rows treat the anchor field as the row title and it is not editable (it’s system-selected).
        - Auto-generated rows created by `addLineItemsFromDataSource` selection effects also lock the anchor field and render it as the row title when `anchorFieldId` is set (works for subgroups too).
        - Rows that are still “disabled” (collapsed fields not yet valid) are ignored for validation, so you can submit with unfinished rows.
        - If the LINE_ITEM_GROUP question is marked `required: true`, at least one enabled+valid row is still required (disabled rows don’t satisfy required).
      - Compact selector tables:
        - Set `ui.maxVisibleRows` to cap the visible table height before the table body scrolls.
        - Set `ui.hideRemoveColumn: true` to hide the trailing trash/remove column when the table is being used as a selector rather than a manually managed list.
        - On iOS-heavy flows, combine `ui.maxVisibleRows` with a compact `ui.rowHeaderSummaryTemplate` so the parent row keeps more vertical space available for the scrollable table body.
      - Inline subgroup reveal:
        - Set `ui.inlineSubgroupsWhenExpanded: true` when a progressive parent row should reveal its subgroup table immediately after expansion instead of showing the fallback subgroup opener pill.
        - Combine this with `subGroups[].ui.defaultCollapsed: false` when the subgroup itself should already be open the first time the parent row expands.
      - Exclusive selection:
        - Set `field.ui.exclusiveLineSelection` on a line-item field when the same external item can only be active once.
        - Use `scope: "sameSubgroupAcrossRoot"` when the exclusivity should apply across the same subgroup under different parent rows.
        - `clearFieldIds` and `clearSubGroupIds` let you clear dependent values when the previous selection is deselected automatically.

        Example:

        ```json
        {
          "id": "LEFTOVER_SELECTED",
          "type": "CHECKBOX",
          "ui": {
            "exclusiveLineSelection": {
              "keyFieldId": "LEFTOVER_ID",
              "scope": "sameSubgroupAcrossRoot",
              "clearFieldIds": ["LEFTOVER_USE_QTY", "LEFTOVER_USAGE_MODE"],
              "clearSubGroupIds": ["MP_LEFTOVER_USAGE_INGREDIENTS_LI"]
            }
          }
        }
        ```
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
      - `warningMessages.maxFilesPartial`: optional localized popup shown after a successful blocking upload when only the first `maxFiles` selected files were added
      - `helperText`: optional localized helper text shown under the upload control (falls back to system strings)
      - `waitMessages.title` / `waitMessages.saveTitle` / `waitMessages.removeSelectedTitle` / `waitMessages.scanTitle` / `waitMessages.save` / `waitMessages.removeSelected` / `waitMessages.scan`: optional localized title and wait copy for blocking upload, remove, and in-flight QR scan transactions. Set a title value to `""` to hide the title line. When omitted, the UI falls back to the generic wait title and generic file-based system strings.
      - `linkLabel`: optional localized label template used for file links in Summary/PDF (e.g. `"Photo {n}"`)
      - `linkCapture`: optional QR/link capture for existing Drive files. Use `{ "enabled": true, "mode": "driveQr", "allowManualPaste": true, "dedupeBy": "driveFileId" }` when users should scan or paste a Google Drive/Docs file link instead of uploading a new file. In `driveQr` mode, non-Drive QR content is rejected and repeated scans of the same Drive file are stored once.
        Set `allowedMimeTypes` inside `linkCapture` when captured links need a different type policy from uploaded files. It replaces the upload MIME/extension rules for link capture only. Use `["*/*"]` to accept any non-folder file that passes Drive scope validation.
        Add `validation: { "requireServerValidation": true, "includeUploadDestinationDrive": true, "includeUploadDestinationFolder": true, "rejectTrashed": true }` when captured links must belong to the same customer Drive/folder as `destinationFolderId`. Apps Script resolves this policy from the authoritative form configuration and verifies Drive metadata before a scanner result can be committed. Add `validation.messages` to customize failures such as `notDriveFile`, `notAccessible`, `trashed`, and `outOfScope`; omitted values fall back to `files.linkCapture.validation.*` system strings.
        Configure `instruction` with the localized sentence shown above the camera and `sessionTtlMinutes` with an integer from 1 to 30. Set `hideCloseOnIos: true` to remove the page-owned Close action on iOS. Android and desktop retain their page-owned Close action. Each accepted scan is added immediately; `commitOnReturnOnIos` remains a compatibility key and no longer controls persistence.

        ```json
        {
          "enabled": true,
          "mode": "driveQr",
          "allowManualPaste": false,
          "dedupeBy": "driveFileId",
          "allowedMimeTypes": ["*/*"],
          "instruction": {
            "en": "Point the camera at each QR code on the ingredient receipts."
          },
          "sessionTtlMinutes": 15,
          "hideCloseOnIos": true,
          "commitOnReturnOnIos": true,
          "validation": {
            "requireServerValidation": true,
            "includeUploadDestinationFolder": true,
            "rejectTrashed": true
          }
        }
        ```

        The continuous scanner opens its Firebase-hosted top-level page synchronously and requests camera access immediately. The first detected code lazily prepares the expiring, field-scoped Apps Script session; detected codes wait in a bounded queue and are sent to Apps Script in micro-batches of up to three, while the same camera stream stays active for multiple receipts. Repeated codes that resolve to the same canonical Drive file are coalesced for the lifetime of that scanner session. This supports putting the same delivery-receipt QR on several ingredient stickers without repeating Drive validation or record processing. Each scanner row still shows an authoritative or locally coalesced result. The scanner requests high-detail rear video and continuous focus when the browser exposes it, then decodes centered source-resolution regions before periodically checking the complete frame. For small printed labels, keep one QR code steady in the centre and move the phone far enough away for the camera to focus rather than filling the preview with the sticker.
        Every batch validates each unique file once and durably appends all accepted canonical links in one idempotent record mutation. iOS users return with the native browser X; Android and desktop users use the page-owned Close action. Closing never commits, cancels, or interrupts queued work. If the user returns while scans are still processing, the originating file overlay shows its configured `waitMessages.scan` blocker until all relevant transactions settle.
        This runtime uses Firebase Hosting and Apps Script only. For staging, deploy it with `npm run deploy:firebase-web-app` so the hosted scanner assets and Apps Script shell are updated together. Do not deploy or configure Cloud Run for the scanner; no billing-enabled Google Cloud project is required.
      - `discardChangesConfirm`: optional localized confirmation shown when the user closes the photo overlay with unsaved add/remove changes. Use simple wording for field-specific photo flows; when omitted, the UI falls back to `files.discardChangesConfirm`.
      - `ui.variant`: optional UI variant; set to `"progressive"` to show slots + checkmarks based on `minFiles`
      - `ui.slotIcon`: `"camera"` | `"clip"` (optional; controls the icon used in progressive slots)
      - `blockUntilSaved`: optional boolean. Set to `true` when the user must wait until the upload-and-save transaction has completed (for example step-based Meal Production photo gates). Leave omitted/false for single-submit forms where background saving is acceptable.
      - `compression`: optional client-side **image** compression (videos are uploaded as-is; prefer size limits)
      Uploads are persisted through the queued record mutation lane so Drive file creation and record URL updates happen in one save request. The React UI renders compact upload controls and a dedicated “Files (n)” overlay for managing selections. With `blockUntilSaved: true`, each photo add/remove action is saved immediately and the user is blocked until the transaction completes. Without blocking, photo and manually pasted link changes stay local until the user clicks **Save photos**, which sends one upload-and-save transaction. Continuous scanner results are applied from each scan's authoritative server response. If an upload transaction fails, the local file changes remain in the form and the field shows **Try saving photos again** so the same transaction can be retried.
      - File uploads are also supported inside line items and subgroups by setting a line-item field’s `type` to `FILE_UPLOAD` (with optional per-field `uploadConfig`).
      - When `CK_DEBUG` is enabled you’ll also see `[ReactForm] upload.*` events in DevTools that describe every add/remove/drop/save action for troubleshooting.
    - **Dynamic data sources (options/prefills)**: For CHOICE/CHECKBOX questions, you can set `dataSource` in the Config JSON: `{ "dataSource": { "id": "BANK_PRODUCTS", "mode": "options" } }`. The backend `fetchDataSource(id, locale, projection, limit, pageToken)` Apps Script function is included in `dist/Code.js` and used by the web UI. Use this when options need to stay in sync with another form or sheet.
      - **Header convention (recommended)**: Use `Label [KEY]` headers in the source tab (e.g., `Supplier [SUPPLIER]`, `Email [EMAIL]`) so config can reference stable keys. `projection` / `mapping` can use either raw header text or the bracket key.
      - **Record status filter (optional)**: If your source table includes a `status` column and you only want certain rows (e.g., only “Active” recipes), set `dataSource.statusAllowList`:

        ```json
        { "dataSource": { "id": "RECIPES", "mode": "options", "statusAllowList": ["Active"] } }
        ```

      - **Datasource cache policy (optional)**: Stable lookup sources such as customers, ingredients, recipes, and template lookup tables can set `dataSource.cachePolicy: "versioned"` so the browser reuses the persisted datasource cache across refreshes until the app/server cache version changes. Use the default short TTL for transactional data, or `cachePolicy: "none"` when local persistence should be disabled.
      - **Datasource force-refresh cache reuse (optional)**: Stable master-data sources can set `dataSource.forceRefreshMaxCacheAgeMs` (or `forceRefreshMaxCacheAgeMinutes`) so generic sync paths that request `forceRefresh` still reuse a fresh cached response. Use this only for slow-changing data that was already prefetched, such as customers or recipes; leave it unset for transactional sources. The default reuse scope is the exact datasource signature. Set `forceRefreshCacheScope: "dataSource"` only when another fresh projection for the same datasource id/language/cache version is acceptable, for example stable customer data used by both option fields and email recipient lookups.
      - **Home/list datasource prefetch override (optional)**: Datasources with `statusAllowList` or `backfill` are skipped by default during home/list prefetch because they are often transactional. If a datasource-backed count/visibility rule must already be available before the form opens, set `dataSource.prefetchOnHome: true` on the specific datasource config that should drive that check. Stable `versioned` datasources can also set `prefetchOnHome: true` so customer/recipe/ingredient lookups are warmed once at the start of the session.

        ```json
        {
          "dataSource": {
            "id": "Leftover Bank Data",
            "formKey": "Config: Leftover Bank",
            "mode": "options",
            "statusFieldId": "LEFTOVER_STATUS",
            "statusAllowList": ["available", "used"],
            "prefetchOnHome": true
          }
        }
        ```

      - **HTML render cache**: Summary, inline, and button HTML render results are cached locally by form, record, payload signature, and app/server cache version. Reopening the same record/template with unchanged values can reuse rendered HTML immediately after a browser refresh; changing the cache version invalidates old entries.
      - **Past-record local cache (optional)**: Date-search list views hydrate full record snapshots when the searched date is before today and store those snapshots in the browser under the current app/server cache version. The exact historical date-search response is cached too, so repeating that search can render rows immediately before any server call. Opening the same past record later reuses the cached snapshot, and the normal record version check still runs in the background when `dataVersion` is available. Override with top-level `recordLocalCache` when needed:

        ```json
        {
          "recordLocalCache": {
            "enabled": true,
            "dateFieldId": "MP_PREP_DATE",
            "maxAgeDays": 365,
            "maxEntries": 250
          }
        }
        ```

    - **Choice UI controls (iOS-style)**: For `CHOICE` questions (and line-item `CHOICE` fields), you can optionally set `ui.control` in the Config JSON to influence which control is rendered:
      - `auto` (default): `<= 3` options → segmented, `<= 6` → radio list, else → native dropdown. Boolean-like non-required choices (e.g., YES/NO) may render as an iOS switch.
      - `select`, `radio`, `segmented`, `switch`: force a specific variant.

      Example:

      ```json
      { "ui": { "control": "segmented" } }
      ```

      For long option lists, the web UI also supports **type-to-search** for `CHOICE` selects:
      - `ui.choiceSearchEnabled: true` forces the searchable input
      - when omitted, the UI enables search automatically for large option sets

      For `CHECKBOX` fields with options (multi-select), you can also set:
      - `ui.control: "select"` to render a native multi-select dropdown (`<select multiple>`).
      - `ui.multiSelectCheckboxSizePx` (range `16..40`) to increase checkbox size/hit area in that dropdown.
        Example: `{ "ui": { "control": "select", "multiSelectCheckboxSizePx": 32 } }`

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

      Leave the field empty in the UI and the backend will emit `MP-AA000001`, `MP-AA000002`, etc. Counters are stored in script properties, so numbering persists across deployments. Use `"propertyKey": "MEAL_RUN"` when you need isolated counters within the same form. Set `"padLength": 0` when you want variable-width ids such as `MI-1`, `MI-2`, `MI-10`.
      When one shared table needs different id prefixes by record kind, use `prefixByValue`:

      ```json
      {
        "autoIncrement": {
          "padLength": 0,
          "prefixByValue": {
            "fieldId": "LEFTOVER_KIND",
            "map": {
              "Multi-ingredient": "MI-",
              "Single-ingredient": "SI-"
            },
            "defaultPrefix": "LX-"
          }
        }
      }
      ```

      The backend keeps a separate counter per resolved prefix, so `MI-000001` and `SI-000001` can advance independently from the same field definition.
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
      - **Target nested subgroups**: Use `targetPath` to point to a nested subgroup relative to the triggering row (dot-delimited string or array). Example: `"targetPath": "INGREDIENTS"` or `"targetPath": ["INGREDIENTS"]`.
      - You can also **copy values** into the new row using reference strings in `preset`:
        - `$row.FIELD_ID` copies from the originating **line-item row** (when the effect is triggered inside a line item)
        - `$top.FIELD_ID` copies from **top-level** record values
      - **Optional condition gating**: Use `when` to gate effects with visibility-style conditions (e.g., numeric comparisons for NUMBER fields).

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

      - **Set values directly**: Use `type: "setValue"` to update a field in the current line-item row (when triggered inside a line item) or at the top level. `value` supports literals, `$row.FIELD_ID`, `$top.FIELD_ID`, and `null` to clear the field.

      ```json
      {
        "selectionEffects": [
          { "type": "setValue", "fieldId": "LEFTOVER_INFO", "value": "No left over" }
        ]
      }
      ```

      - **Hydrate the current row from a shared table**: Use `type: "setValuesFromDataSource"` when the selected value should copy fields from a matched external record into the current row or top-level form without creating child rows.

      ```json
      {
        "selectionEffects": [
          {
            "type": "setValuesFromDataSource",
            "dataSource": {
              "id": "Config: Leftover Bank",
              "tabName": "Leftover Bank Data"
            },
            "lookupField": "LEFTOVER_ID",
            "fieldMapping": {
              "RECIPE": "LEFTOVER_RECIPE",
              "PREP_QTY": "LEFTOVER_PORTIONS",
              "LEFTOVER_STATUS": "LEFTOVER_STATUS"
            },
            "clearOnNoMatch": true
          }
        ]
      }
      ```

      Notes:
      - `fieldMapping` keys are target form field ids; values are source row keys or dot-paths.
      - When the effect runs inside a line-item row, the mapped values are written into that row.
      - When it runs at the top level, the mapped values are written into top-level form values.
      - `clearOnNoMatch: true` clears the mapped targets if the selected value no longer matches any data-source row.

      Example: keep a single auto row in a subgroup while a NUMBER is > 0, and clear it when the value is 0:

      ```json
      {
        "selectionEffects": [
          {
            "id": "mp_to_cook_sync",
            "type": "deleteLineItems",
            "groupId": "MP_TYPE_LI"
          },
          {
            "id": "mp_to_cook_sync",
            "type": "addLineItems",
            "groupId": "MP_TYPE_LI",
            "when": { "fieldId": "MP_TO_COOK", "greaterThan": 0 },
            "preset": { "PREP_QTY": "$row.MP_TO_COOK", "PREP_TYPE": "Cook" },
            "hideRemoveButton": true
          }
        ]
      }
      ```

      - **Hide "Remove" for effect-created rows**: Set `hideRemoveButton: true` on the effect to suppress the UI Remove action for rows it creates.
      - **Parent/child row relationships (cascade delete)**: When an effect runs inside a line-item row, the generated rows are automatically tagged with:
        - `__ckParentGroupId` (the originating group key)
        - `__ckParentRowId` (the originating row id)
        This relationship is persisted in the submitted line-item JSON payload, and deleting a parent row will also delete its children (no orphan rows).

      - **Inverse rule: delete child rows**: Use `type: "deleteLineItems"` to delete rows created by an earlier rule (typically the inverse of `addLineItems`). In the common Yes/No case:

      ```json
      {
        "selectionEffects": [
          {
            "id": "leftover",
            "type": "addLineItems",
            "groupId": "MP_MEALS_REQUEST",
            "triggerValues": ["Yes"],
            "hideRemoveButton": true,
            "preset": { "MEAL_TYPE": "$row.MEAL_TYPE", "QTY": "$row.QTY" }
          },
          {
            "id": "leftover",
            "type": "deleteLineItems",
            "groupId": "MP_MEALS_REQUEST",
            "triggerValues": ["No"]
          }
        ]
      }
      ```

      `deleteLineItems` will remove any child rows under the current row that were tagged with `__ckSelectionEffectId = "leftover"`, and will cascade delete any of their children as well.

      - **Option filter enforcement on generated rows**: Selection effects respect the target line-item/subgroup fields’ `optionFilter` rules.
        If an effect generates a row (or data-driven entry) where a mapped CHOICE/CHECKBOX value is *not* allowed by that field’s `optionFilter` in the current context, the row is skipped.
        This is useful for cases like recipes that include “Salt” by default: if your subgroup field `ING` has an `optionFilter` that excludes `"Salt"` for `MEAL_TYPE = "No-salt"`, then `addLineItemsFromDataSource` will not create the Salt ingredient row.

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
        - **Composite dependencies**: `keyColumn` can also be an array of columns; values are joined with `||` in order to match `dependsOn: [...]`.
        - **Splitting keys**: when the key column itself contains a comma-separated list (e.g. `dietaryApplicability = "Vegan, Vegetarian, No-salt"`), set `splitKey: true` so each key is treated as a separate mapping entry (no need to duplicate rows).

        ```json
        {
          "optionFilter": {
            "dependsOn": "Supplier",
            "optionMapRef": { "ref": "REF:Supplier_Map", "keyColumn": "Supplier", "lookupColumn": "Allowed options" }
          }
        }
        ```

        ```json
        {
          "optionFilter": {
            "dependsOn": ["Product", "Supplier"],
            "optionMapRef": { "ref": "REF:Composite_Map", "keyColumn": ["Product", "Supplier"], "lookupColumn": "Allowed options" }
          }
        }
        ```

        ```json
        {
          "optionFilter": {
            "dependsOn": "DISH_TYPE",
            "optionMapRef": {
              "ref": "REF:IngredientsOptions",
              "keyColumn": "dietaryApplicability",
              "lookupColumn": "optionEn",
              "splitKey": true
            }
          }
        }
        ```

      - Data-source-driven filters: when a field’s options come from a `dataSource`, you can filter those options by comparing the `dependsOn` value(s) against a column in each data-source row. Set `dataSourceField` to the column name and optionally `dataSourceDelimiter` to split multi-value cells (defaults to comma/semicolon/newline; use `"none"` to disable splitting).

        ```json
        {
          "optionFilter": {
            "dependsOn": "DIETARY_APPLICABILITY",
            "dataSourceField": "dietaryApplicability",
            "dataSourceDelimiter": ","
          }
        }
        ```

      - Bypass values: if any `dependsOn` value matches `bypassValues`, option filtering is skipped and the full option list is shown.

        ```json
        {
          "optionFilter": {
            "dependsOn": "MEAL_TYPE",
            "bypassValues": ["All"]
          }
        }
        ```

      - Composite filters and cross-scope dependencies:
        - `dependsOn` can be a single ID or an array (for multi-field filters). When you provide an array, join dependency values with `||` in `optionMap` keys, plus `*` as a fallback.
        - For DATE dependencies in composite keys (for example `MP_PREP_DATE`), you can add weekday-specific keys such as `Belliard||Lunch||Sunday`. If no weekday key matches, the filter falls back to the non-date composite key (for example `Belliard||Lunch`).
        - Line-item filters can depend on top-level fields; reference the parent field ID directly.

        ```json
        { "optionFilter": { "dependsOn": ["Supplier", "Delivery type"], "optionMap": { "VDS||Fresh vegetables": ["Chilled"], "VDS": ["Dry"], "*": ["Dry", "Chilled"] } } }
        ```

        ```json
        { "optionFilter": { "dependsOn": "Delivery type", "optionMap": { "Frozen": ["Freezer"], "*": ["Fridge", "Freezer"] } } }
        ```

      - Partial matches for multi-select dependencies (e.g., dietary restrictions): set `"matchMode": "or"` to union allowed options.
        Rows that don’t satisfy all selected keys are tagged with `__ckNonMatchOptions` and show warnings during editing.

        ```json
        {
          "optionFilter": {
            "dependsOn": "DIET",
            "matchMode": "or",
            "optionMap": {
              "Vegan": ["Beans", "Rice"],
              "Vegetarian": ["Beans", "Rice", "Cheese"],
              "*": []
            }
          }
        }
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

        Supported conditions: `equals` (string/array), `greaterThan`, `lessThan`, `notEmpty`, `isEmpty`, `isToday`, `isInPast`, `isInFuture`. Actions: `required` true/false, `min`, `max`, `minFieldId`, `maxFieldId`, `allowed`, `disallowed`.
        Date notes: `YYYY-MM-DD` is treated as a local date (not UTC). Empty/invalid dates do not match `isToday`/`isInPast`/`isInFuture`.
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
            - `addDays`: date math in days (offset can be negative). Defaults to `"when": "always"` (recomputes when dependencies change).
            - `addMonths`: date math in months (offset can be negative). Defaults to `"when": "always"` and is useful for retention or freezer-expiry rules such as “6 months from prep date”.
              - Optional: `"overrideFieldId": "FIELD_ID"` lets a separate non-empty field override the computed DATE while the derived field remains the effective value for summaries, PDFs, and submit effects.
            - `today`: prefill a DATE field with today’s local date. Defaults to `"when": "empty"` (only sets when the target is empty).
            - `timeOfDayMap`: map time-of-day to a value via thresholds. Defaults to `"when": "empty"`.
            - `copy`: copy another field’s value into the target. Defaults to `"when": "empty"` (behaves like a default; allows user overrides) and applies on `"applyOn": "blur"` (so it doesn’t change mid-typing).
              - Optional: `"applyOn": "change"` to apply on every keystroke/change.
              - Optional: `"copyMode": "allowIncrease" | "allowDecrease"` (only with `"when": "always"`) to allow operator overrides in one direction and clamp back to the source value on blur.
            - `template`: compose a text value from other fields using `{FIELD_ID}` tokens. Defaults to `"when": "empty"` and is useful for compact readonly helper labels such as meal headers.
            - `calc`: compute numeric expressions using `{FIELD_ID}` tokens and `SUM(GROUP.FIELD)` aggregates. Defaults to `"when": "always"`.
              - Optional: `"lineItemFilters"` to filter rows included in a specific aggregate.

          - Example: prefill a DATE field with today (local):

            ```json
            { "derivedValue": { "op": "today" } }
            ```

          - Example: compute a freezer expiration date 6 months after prep:

            ```json
            { "derivedValue": { "op": "addMonths", "dependsOn": "MP_PREP_DATE", "offsetMonths": 6, "hidden": true } }
            ```

          - Example: allow a hidden manual override field to replace an otherwise computed expiration date:

            ```json
            {
              "derivedValue": {
                "op": "addDays",
                "dependsOn": "MP_PREP_DATE",
                "offsetDays": 3,
                "overrideFieldId": "MP_EXP_DATE_OVERRIDE",
                "hidden": true
              }
            }
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

          - Example: compose a readonly text header from two fields:

            ```json
            { "derivedValue": { "op": "template", "template": "{MEAL_TYPE} | {ORD_QTY}", "when": "always" } }
            ```

          - Example: compute a line-item field using a subgroup sum with a filter:

            ```json
            {
              "derivedValue": {
                "op": "calc",
                "expression": "{QTY} - SUM(MP_TYPE_LI.PREP_QTY)",
                "lineItemFilters": [
                  { "ref": "MP_TYPE_LI.PREP_QTY", "when": { "fieldId": "PREP_TYPE", "equals": ["Full Dish"] } }
                ]
              }
            }
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
    - **Visibility & reset helpers**: Add `visibility` to show or hide a question/line-item field based on another field (`showWhen`/`hideWhen`). Conditions support `equals`, `greaterThan`, `lessThan`, `notEmpty`, `isEmpty`, `isToday`, `isInPast`, `isInFuture`. Add `clearOnChange: true` to a question to clear all other fields and line items when it changes (useful when a top selector drives all inputs).
      - **Post-submit experience (summary)**: After a successful submit, the React app automatically runs the configured follow-up actions (Create PDF / Send Email / Close record when configured) and then shows the Summary screen with timestamps + status. The UI no longer includes a dedicated Follow-up view.
      - **Data list view**: The React web app includes a Records list view backed by Apps Script. It uses `fetchSubmissions` for lightweight row summaries (fast list loads) and `fetchSubmissionById` to open a full record on demand. `listView.pageSize` defaults to 10 and is capped at 50; you can optionally hide the UI paging controls via `listView.paginationControlsEnabled: false`. Search runs client-side for keyword filtering and for dates that are fully covered by the prefetched recent rows. When a date search reaches the oldest prefetched boundary, the app automatically switches to a server-side exact-date query so older matching records are still returned. Header sorting is enabled by default (click a column header to sort), and can be disabled with `listView.headerSortEnabled: false` (recent-list prefetch is capped at 200 rows).
    - **Line-item selector & totals**: In a line-item JSON config you can add `sectionSelector` (with `id`, labels, and `options` or `optionsRef`) to render a dropdown above the rows so filters/validation can depend on it. Add `totals` to display counts or sums under the line items, for example: `"totals": [ { "type": "count", "label": { "en": "Items" } }, { "type": "sum", "fieldId": "QTY", "label": { "en": "Qty" }, "decimalPlaces": 1 } ]`.
    - **Line-item table mode**: To render line items as a compact table, set `"ui": { "mode": "table" }` in the line-item config (also supported for subgroups). You can control column order with `"ui": { "tableColumns": ["ING", "QTY", "UNIT"] }`, set column widths with `"ui": { "tableColumnWidths": { "ING": "50%", "QTY": "25%", "UNIT": "25%", "__remove": "44px" } }` (action keys supported: `__remove`, `__view`, `__edit` and `_remove`, `_view`, `_edit`), sort rendered rows without changing saved row order with `"ui": { "rowSort": { "fieldId": "ING" } }`, and hide non-anchor columns until the anchor value is chosen with `"ui": { "tableHideUntilAnchor": true }` (default).
    - **True nesting (subgroups inside subgroups)**: Line-item groups can contain subgroups, and subgroups can themselves contain nested subgroups. Reference nested groups with dot-delimited paths (example: `"MEALS.INGREDIENTS"`). For visibility rules, use `subGroupPath` with `*`/`**` wildcards when you need to match any depth.
    - **Overlay detail layout (header + body)**: For full-page overlays, you can render a header table of parent rows and a body area for nested rows. Configure this inside the line-item group JSON:

      ```json
      {
        "ui": {
          "overlayDetail": {
            "enabled": true,
            "header": {
              "tableColumns": ["TYPE", "RECIPE", "NOTES"],
              "tableColumnWidths": { "TYPE": "25%", "RECIPE": "45%", "NOTES": "30%" },
              "addButtonPlacement": "top"
            },
            "rowActions": {
              "viewLabel": { "en": "View" },
              "editLabel": { "en": "Edit" },
              "editPlacement": "body"
            },
            "body": {
              "subGroupId": "INGREDIENTS",
              "edit": { "mode": "table", "tableColumns": ["ING", "QTY", "UNIT"] },
              "view": {
                "mode": "html",
                "templateId": { "en": "bundle:Leftovers_Detail" },
                "hideTabTargets": ["instructions"]
              }
            }
          }
        }
      }
      ```

      Notes:
      - `subGroupId` currently targets the immediate subgroup only.
      - `view.mode` requires a bundled HTML template id (`bundle:...`).
      - `rowActions.editPlacement: "body"` hides the header Edit action; add a button in the HTML template with `data-ck-action="edit"` to switch to edit mode.
      - `body.view.hideTabTargets` hides tab targets in bundled HTML templates that use `data-tab-target`/`data-tab-panel`.
      - `header.tableColumnWidths` supports action keys `__view`, `__edit`, `__remove` (and `_view`, `_edit`, `_remove` aliases) for fixed-width icon columns.
    - **Field-driven overlay open actions**: Any question can act as an overlay opener by adding `ui.overlayOpenActions`.
      When the `when` clause matches, the field renders as a button that opens the target line-item group overlay.
      Use `rowFilter` to show only matching header rows, and `groupOverride` to customize columns, actions,
      add buttons, or subgroups for this specific opener.

      ```json
      {
        "id": "MP_IS_REHEAT",
        "type": "CHOICE",
        "qEn": "Reheat?",
        "options": ["No", "Yes"],
        "ui": {
          "control": "select",
          "overlayOpenActions": [
            {
              "groupId": "MP_TYPE_LI",
              "when": { "fieldId": "MP_IS_REHEAT", "equals": "Yes" },
              "label": { "en": "Open reheats" },
              "rowFilter": { "includeWhen": { "fieldId": "PREP_TYPE", "equals": "Reheat" } },
              "flattenFields": ["PREP_QTY", "RECIPE"],
              "groupOverride": {
                "minRows": 1,
                "maxRows": 1,
                "ui": {
                  "overlayDetail": {
                    "enabled": true,
                    "header": {
                      "tableColumns": ["PREP_TYPE", "PREP_QTY", "RECIPE"],
                      "tableColumnWidths": { "PREP_TYPE": "20%", "PREP_QTY": "20%", "RECIPE": "60%", "_view": "44px", "_edit": "44px", "_remove": "44px" }
                    }
                  }
                },
                "addButtonLabel": { "en": "Add reheat" }
              }
            }
          ]
        }
      }
      ```

      - `renderMode: "replace"` (default) replaces the field control with a button. Use `"inline"` to keep the control and show a separate button below.
      - `resetValue` sets the field value when the trash/reset icon is confirmed, so the field reverts to its original control.
      - `groupOverride.minRows` seeds blank rows when the overlay opens; `groupOverride.maxRows` disables the Add button (and selector overlay) once the limit is reached.
      - `flattenFields` surfaces specific line-item fields inline when the target group is single-row (`maxRows: 1`).
      - `flattenPlacement` controls where flattened fields render relative to the opener: `"left" | "right" | "below"` (default).
      - `hideTrashIcon: true` hides the reset icon on the opener button.
      - `closeConfirm` controls the close dialog shown when the user tries to leave the overlay. It accepts either:
        - a simple `RowFlowActionConfirmConfig` object, or
        - an `OverlayCloseConfirmConfig` object with conditional `cases` that can run `onConfirmEffects` (for example, delete incomplete rows before exiting).

        Example (allow exit even when invalid, with two cases + discard behavior):

        ```json
        {
          "closeConfirm": {
            "allowCloseFromEdit": true,
            "cases": [
              {
                "when": {
                  "not": {
                    "lineItems": { "groupId": "MEALS", "subGroupPath": ["MEAL_TYPES", "INGREDIENTS"], "match": "any" }
                  }
                },
                "title": { "en": "Missing ingredients" },
                "body": { "en": "No ingredients have been added. Do you want to exit?" },
                "confirmLabel": { "en": "Yes" },
                "cancelLabel": { "en": "No, continue editing" },
                "validateOnReopen": true
              },
              {
                "when": {
                  "lineItems": {
                    "groupId": "MEALS",
                    "subGroupPath": ["MEAL_TYPES", "INGREDIENTS"],
                    "when": { "any": [{ "fieldId": "QTY", "notEmpty": false }, { "fieldId": "UNIT", "notEmpty": false }] },
                    "match": "any"
                  }
                },
                "title": { "en": "Missing quantity/unit" },
                "body": { "en": "One or more ingredients do not have a quantity and/or unit." },
                "confirmLabel": { "en": "Close, data will be lost" },
                "cancelLabel": { "en": "Continue editing" },
                "highlightFirstError": true,
                "validateOnReopen": true,
                "onConfirmEffects": [
                  {
                    "type": "deleteLineItems",
                    "groupId": "INGREDIENTS",
                    "rowFilter": { "includeWhen": { "any": [{ "fieldId": "QTY", "notEmpty": false }, { "fieldId": "UNIT", "notEmpty": false }] } }
                  }
                ]
              }
            ]
          }
        }
        ```
      - When the overlay detail view is enabled, overlayOpenActions auto-select the first row (view mode if available; otherwise edit).
      - When overlay detail is enabled, completing all header fields auto-opens the detail panel (view if available; otherwise edit).
      - If multiple actions are provided, the first matching `when` clause is used.
    - **Quick recipe for the new features**:
      - *Section selector (top-left dropdown in line items)*: In the LINE_ITEM_GROUP JSON, add:

        ```json
        {
          "sectionSelector": {
            "id": "ITEM_FILTER",
            "labelEn": "Category",
            "optionsRef": "REF:SelectorOptions", // or inline: "options": ["Veg", "Dairy"], "optionsFr": [...]
            "required": true
          },
          "fields": [ ...your existing line-item fields... ]
        }
        ```

       Use `ITEM_FILTER` in line-item `optionFilter.dependsOn` or validation `when.fieldId` so options/rules react to the selector.
      If `required: true`, the **Add line** button is disabled until the selector has a value (prevents adding empty rows in `addMode: "inline"`).
      Set `choiceSearchEnabled: true` on the selector to always show the searchable input (search indexes include extra `optionsRef` columns).
      Set `placeholder` (or `placeholderEn`/`placeholderFr`/`placeholderNl`) to override the selector search placeholder text.
      Set `hideLabel: true` to hide the selector label (placeholder only).
      For multi-select search without a separate Add button, set `addMode: "selectorOverlay"` and `anchorFieldId`; the selector becomes the search + multi-select list.

       You can also filter the selector options themselves with an `optionFilter` (supports `optionMapRef`, including composite key columns):

        ```json
        {
          "sectionSelector": {
            "id": "ITEM_FILTER",
            "labelEn": "Item",
            "optionsRef": "REF:IngredientsOptions",
            "optionFilter": {
              "dependsOn": ["CATEGORY", "SUPPLIER"],
              "optionMapRef": { "ref": "REF:IngredientFilter_Map", "keyColumn": ["CATEGORY", "SUPPLIER"], "lookupColumn": "Allowed options" }
            }
          }
        }
        ```

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
      - *Line-item aware visibility*: Use a `lineItems` clause inside `showWhen`/`hideWhen` to evaluate row-level conditions across a line-item group (or subgroup).

        Example: show an "Ingredients needed" BUTTON only when any meal row has a recipe and `MP_IS_REHEAT = "No"`:

        ```json
        {
          "visibility": {
            "showWhen": {
              "lineItems": {
                "groupId": "MEALS",
                "when": {
                  "all": [
                    { "fieldId": "RECIPE", "notEmpty": true },
                    { "fieldId": "MP_IS_REHEAT", "equals": "No" }
                  ]
                }
              }
            }
          }
        }
        ```

        Example: show an "Ingredients needed" BUTTON when there is at least one `MP_TYPE_LI` row with `PREP_TYPE = "Cook"` **or** a `PREP_TYPE = "Full"` row that has at least one child `MP_INGREDIENTS_LI` subrow marked as manual:

        ```json
        {
          "visibility": {
            "showWhen": {
              "any": [
                {
                  "lineItems": {
                    "groupId": "MP_MEALS_REQUEST",
                    "subGroupId": "MP_TYPE_LI",
                    "when": {
                      "all": [
                        { "fieldId": "PREP_TYPE", "equals": "Cook" },
                        { "fieldId": "RECIPE", "notEmpty": true }
                      ]
                    }
                  }
                },
                {
                  "lineItems": {
                    "groupId": "MP_MEALS_REQUEST",
                    "subGroupPath": "MP_TYPE_LI.MP_INGREDIENTS_LI",
                    "parentWhen": { "fieldId": "PREP_TYPE", "equals": "Full" },
                    "when": { "fieldId": "__ckRowSource", "equals": "manual" }
                  }
                }
              ]
            }
          }
        }
        ```

        Add `subGroupPath` (or legacy `subGroupId` for a single level) to scan subgroup rows with the same row-level `when` shape.
        `subGroupPath` supports dot-delimited paths (e.g., `"MEALS.INGREDIENTS"`) and wildcards (`*`, `**`) for any depth.
        Row-level `when` reads only row/subgroup values; put top-level conditions outside the `lineItems` clause.
        To require both a parent row condition and a child row condition, use `parentWhen` (subgroup only).
        Add `parentScope: "ancestor"` to match any ancestor in the path (default is immediate parent):

        ```json
        {
          "visibility": {
            "showWhen": {
              "lineItems": {
                "groupId": "MEALS",
                "subGroupId": "INGREDIENTS",
                "parentWhen": {
                  "all": [
                    { "fieldId": "RECIPE", "notEmpty": true },
                    { "fieldId": "MP_IS_REHEAT", "equals": "No" }
                  ]
                },
                "when": { "fieldId": "__ckRowSource", "equals": "manual" }
              }
            }
          }
        }
        ```
      - *Clear-on-change reset*: On a controlling question add `clearOnChange: true` in Config JSON. When that field changes, all other fields and line items clear, then filters/visibility reapply. Handy for “mode” or “category” selectors.
      - *List view (start on list)*: Add a `List View?` column to the config sheet and mark `TRUE` on the fields you want to display in the list. If at least one is `TRUE`, the form definition includes `listView` and `startRoute: "list"` so the app opens in list mode showing those fields plus `createdAt`/`updatedAt` with pagination (optional: hide paging controls via `listView.paginationControlsEnabled: false`).
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
   - `lookupSourceFieldId`: optional current-row/top-level field whose value should be used as the primary lookup token. Use this when the triggering field is a quantity/mode/checkbox but the datasource row should still be matched by a stable id such as `LEFTOVER_ID`.
   - `lookupFields`: optional ordered fallback list for source sync. Put the immutable source id first, followed by legacy natural keys such as names so older records can backfill the id on their next open.
   - `parentFieldMapping`: optional map of current row/top-level fields to matched source row keys. Use it to persist `*_SOURCE_ID`, `*_SOURCE_UPDATED_AT`, and refreshed display names before generated child rows are rebuilt.
     - `sourceSync`: optional datasource synchronization controls:
     - `refreshOnInit: true` replays the effect when opening/hydrating an existing record, even if generated rows are already populated.
     - `forceRefresh: true` bypasses the client datasource cache for the source fetch.
     - `forceRefreshMaxCacheAgeMs` lets a `forceRefresh` effect reuse a fresh datasource response instead of issuing another server fetch. Use it for relatively stable master data that was just prefetched before the user edit; leave it unset for sources that must always be live. For datasource configs, `forceRefreshCacheScope: "dataSource"` may also reuse a sibling projection for the same datasource id when that is safe.
     - `stopWhen` freezes synchronization while a `WhenClause` matches, for example `{ "fieldId": "status", "equals": "Closed" }`.
   - `dataField`: column that contains a JSON array/object describing the rows to add (e.g., `Ingredients` = `[{"ING":"Carrots","QTY":"2","UNIT":"kg"}]`).
  - `lineItemMapping`: map of line-item field ids → keys/paths in each JSON entry. Dot notation is supported for nested objects.
     - Prefix a path with `$row.` to copy values from the originating line-item row (the row whose fields triggered the effect). Example: `"lineItemMapping": { "ING": "ING", "QTY": "QTY", "UNIT": "UNIT", "RECIPE": "$row.RECIPE" }` copies the row’s `RECIPE` field into each generated ingredient line so you can keep track of the source dish; add that field to `aggregateBy` if you need separate buckets per recipe.
  - `preset`: optional literal field values to merge into each generated row. For datasource-backed rows this also supports `$row.FIELD_ID` and `$source.FIELD_PATH`, which is useful when the generated row must combine current row state with values coming from the matched external record.
   - `aggregateBy`: non-numeric fields used to build a dedupe key. Identical values across these fields are merged into a single row.
   - `aggregateNumericFields`: numeric fields that should be summed when aggregation occurs. All line-item fields typed as NUMBER are automatically included.
   - `scaleNumericFields`: optional explicit list of fields whose numeric values should be multiplied by the scale factor. If omitted, it reuses `aggregateNumericFields`, then NUMBER fields.
   - `clearGroupBeforeAdd`: defaults to `true`. Set to `false` to append instead of rebuilding.
   - `preserveManualRows`: defaults to `true`. Set to `false` to delete existing manual rows in the target group when refreshing data-driven rows.

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
     "pdfFileNameFieldId": "MP_ID",
     "emailTemplateId": {
       "EN": "1EmailDocEn",
       "FR": "1EmailDocFr"
     },
     "emailSubject": {
       "en": "Meal production summary",
       "fr": "Synthèse production"
     },
     "emailFrom": "kitchen@example.com",
     "emailFromName": "Community Kitchen",
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
      "inProgress": "In progress",
      "reOpened": "Re-opened",
       "onPdf": "PDF ready",
       "onEmail": "Emailed",
       "onClose": "Closed"
     },
     "autoSave": {
       "enabled": true,
       "debounceMs": 2000,
       "status": "In progress"
     },
     "dedupDeleteOnKeyChange": true
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
   - `pdfFileNameFieldId` (optional): field id used to name generated PDFs + email attachments. Supports question ids or meta fields (`id`, `createdAt`, `updatedAt`, `status`, `pdfUrl`).
   - `emailTemplateId`: Google Doc containing the email body. Same structure as `pdfTemplateId` (string, language map, or `cases` selector). Tokens work the same as in the PDF template.
   - `emailFrom` (optional): sender email address for follow-up emails. Apps Script can only send from the script owner or a configured Gmail alias.
   - `emailFromName` (optional): sender display name for follow-up emails.
   - `emailRecipients`: list of addresses. Entries can be plain strings (placeholders allowed) or objects describing a data source lookup:
     - `recordFieldId`: the form/line-item field whose submitted value should be used as the lookup key.
     - `dataSource`: standard data source config (sheet/tab reference, projection, limit, etc.).
     - `lookupField`: column in the data source to match against the submitted value.
     - `valueField`: column containing the email address to use.
     - `fallbackEmail` (optional): used when the lookup fails.
   - `emailCc` / `emailBcc`: same structure as `emailRecipients`, useful for copying chefs/managers automatically.
   - `statusFieldId` (optional): question ID to overwrite when actions run. If omitted we use the auto-generated `Status` column in the response tab.
  - `statusTransitions`: status values written by follow-up actions and used by the web app. Supports localized values.
    - `inProgress`: value for draft/in-progress records (used by autosave/list view defaults).
    - `reOpened`: value written when explicitly re-opening a closed record.
    - `onPdf`, `onEmail`, `onClose`: values written when `CREATE_PDF`, `SEND_EMAIL`, or `CLOSE_RECORD` complete.
 - `autoSave` (optional): enables draft autosave while editing in the web app (no validation). On any change, the app saves in the background after `debounceMs` and writes `autoSave.status` (or `statusTransitions.inProgress`, default `In progress`). If the record’s status matches `statusTransitions.onClose`, the edit view becomes read-only and autosave stops. If the record was modified by another user (Data Version changed), autosave is blocked and the UI synchronizes the latest snapshot before the user continues. The first time a user opens Create/Edit/Copy, a one-time autosave explainer overlay is shown (customize via `autosaveNotice.*` in `src/web/systemStrings.json`).
   - `enableWhenFields` (optional): top-level field ids that must be non-empty before create-flow autosave is allowed.
   - `dedupTriggerFields` (optional): top-level field ids that trigger create-flow dedup prechecks.
   - `dedupCheckDialog` (optional): form-level non-dismissible dedup progress popup copy (`checking*`, `available*`, `duplicate*`) plus `availableAutoCloseMs` and `duplicateAutoCloseMs`. Set a title value to `""` to hide the title line; set both `availableTitle` and `availableMessage` to `""` to skip the success popup after the check completes.
 - `recordFreshness` (optional): lightweight background freshness checks for existing records in the React edit view. Defaults to enabled with a `30000ms` quiet window, so open records are revalidated when there has been no successful record-related server activity for 30 seconds.
   - `enabled` (optional): set to `false` to disable background freshness checks for the form.
   - `quietWindowMs` (optional): wait this long after the last successful record-related server activity before calling `getRecordVersion`. Minimum `5000`, maximum `600000`.
   - When the server version changes and there is no local record mutation in flight, the app reloads the latest snapshot automatically and shows a synchronization notice so the user can review the updated step.
   - `dataSourceWatches` (optional): guided-step datasource freshness watches that refresh datasource-backed rows in the background without triggering visible loading notices.
     - `stepId`: guided step id where the watch becomes active.
     - `dataSourceId` / `dataSourceIds`: datasource id(s) to refresh while that step stays open.
     - `quietWindowMs` (optional): background refresh quiet window for this watch. Defaults to `30000` and follows the same min/max bounds as record freshness.
     - `stopWhen` (optional): `WhenClause` that stops the datasource watch, for example when `status` is `Closed`.
     - `dialog` (optional): message shown when the refreshed datasource rows differ from the cached rows. Supports `title`, `message`, `confirmLabel`, `cancelLabel`, `showCancel`, `showCloseButton`, `dismissOnBackdrop`, and `primaryAction`.
 - `scheduledAlerts` (optional): config-driven email alerts that run automatically from Apps Script time triggers. Each alert checks only today's records for its `dateFieldId`, filters by `statusValues` and optional `filters`, and emails all matches in one message. After adding or changing alerts, run **Community Kitchen → Install Triggers (Options + Response indexing + Daily analytics + Daily lifecycle + Scheduled alerts)** so trigger times are recreated from config.
   - `id`: stable alert id used in logs and same-day dedupe.
   - `schedule.hour` / `schedule.minute`: script-local run time. Apps Script time triggers are approximate; the runtime treats the configured time as due for the configured hour unless `windowMinutes` is set.
   - `sourceFormKey` (optional): source form to query. Defaults to the form that owns the alert config.
   - `dateFieldId`: date field used to keep the scope to today's records.
   - `statusFieldId` (optional): status field to read. Defaults to `followupConfig.statusFieldId`, then the system Status column.
   - `statusValues`: statuses that should trigger the alert, for example `["In progress", "In production"]`.
   - `filters`: additional field filters, for example `{ "fieldId": "MP_SERVICE", "equals": ["Lunch"] }`.
   - `fields`: token-to-field mapping used by `email.lineTemplate`.
   - `email`: recipients, optional cc/bcc/from/fromName, subject, body `message`, and per-record `lineTemplate`.

   Example:

   ```json
   {
     "scheduledAlerts": [
       {
         "id": "meal-production-lunch-incomplete",
         "type": "recordEmail",
         "schedule": { "hour": 13, "minute": 0 },
         "sourceFormKey": "Config: Meal Production",
         "dateFieldId": "MP_PREP_DATE",
         "statusFieldId": "Status",
         "statusValues": ["In progress", "In production"],
         "filters": [{ "fieldId": "MP_SERVICE", "equals": ["Lunch"] }],
         "fields": {
           "PRODUCTION_DATE": "MP_PREP_DATE",
           "CUSTOMER": "MP_DISTRIBUTOR",
           "SERVICE": "MP_SERVICE",
           "RESPONSIBLE_COOK": "MP_COOK_NAME"
         },
         "email": {
           "recipients": ["operations.manager@example.com"],
           "from": "operations@communitykitchen.be",
           "fromName": "Community Kitchen Operations",
           "subject": "Meal Production report(s) not completed – action required",
           "lineTemplate": "- {{PRODUCTION_DATE}}, {{CUSTOMER}}, {{SERVICE}} created by {{RESPONSIBLE_COOK}} is incomplete",
           "message": "Meal Production record(s) for:\n\n{{RECORD_LINES}}\n\nPlease review, record all required information and photos to create and send the final report before {{TODAY_DATE}} midnight.\n\nRemember to record leftover(s) and generate ID(s) if applicable."
         }
       }
     ]
   }
   ```
 - `dedupDeleteOnKeyChange` (optional): when `true`, edits to top-level fields that are part of reject dedup rules delete the current record row immediately after confirm/blur + field automations. This setting is deletion-only; after delete, normal create-flow dedup precheck + autosave behavior applies.
- `submitEffects` (optional): declarative shared-table writes that run after the source record saves.
  - Supported types: `createRecord`, `updateRecord`
  - Use this to create or update a downstream record in another form, for example a shared bank row
  - Optional `id` gives the effect a stable name so milestone dialogs can target the generated records from specific effects
  - Use `recordId` when the downstream row should be updated in place on later source saves instead of creating duplicates
  - `recordId` is required for `updateRecord`
  - Optional `sourceLink` describes which target fields store the originating source record id / form key; this lets later UI/template flows look up the generated downstream records from the saved source record
  - String values support `{{source.FIELD_ID}}`, `{{source.id}}`, `{{source.status}}`, `{{source.createdAt}}`, and `{{source.updatedAt}}`
  - `createRecord.forEachLineItem` and `updateRecord.forEachLineItem` can write one downstream record per matched source line-item row
  - Inside a `forEachLineItem` effect, templates can also use `{{row.FIELD_ID}}`, `{{parent.FIELD_ID}}`, and `{{lineItem.index}}`
  - `runOn` controls whether the effect runs on source create, source update, or both
  - Exact template tokens can resolve to arrays/objects, so a top-level line-item payload can be copied directly into another form field when needed
  - Object-valued computed expressions may derive nested values and collections:
    - `firstNonEmpty`: take the first resolved non-empty value
    - `case`: choose the first matching `cases[].value` using a `when` clause, otherwise use `default`
    - `ifPresent`: branch between `then` / `else` based on a source path
    - `filterCollection`: filter a collection with `when` / `rowFilter`
    - `flattenCollection`: flatten a nested collection path such as `parent.MP_TYPE_LI[*].MP_INGREDIENTS_LI`
    - `lookupSetIntersection`: intersect lookup-backed labels for a resolved collection

   Example:

   ```json
   {
     "submitEffects": [
       {
         "id": "captureProducedLeftovers",
         "type": "createRecord",
         "targetFormKey": "Config: Leftover Bank",
         "runOn": "create",
         "recordId": "leftover::{{source.id}}",
         "status": "Available",
         "auditAction": "mealProduction:leftoverCreate",
         "when": {
           "fieldId": "HAS_LEFTOVERS",
           "equals": "Yes"
         },
         "values": {
           "SOURCE_RECORD_ID": "{{source.id}}",
           "SOURCE_FORM_KEY": "Config: Meal Production",
           "LEFTOVER_KIND": "{{source.LEFTOVER_KIND}}",
           "LEFTOVER_NOTES": "{{source.LEFTOVER_NOTES}}"
         },
         "sourceLink": {
           "sourceRecordIdFieldId": "SOURCE_RECORD_ID",
           "sourceFormKeyFieldId": "SOURCE_FORM_KEY"
         }
       }
     ]
   }
   ```

   Fan-out example from source line items:

   ```json
   {
     "submitEffects": [
       {
         "id": "captureProducedLeftovers",
         "type": "createRecord",
          "targetFormKey": "Config: Leftover Bank",
         "runOn": "both",
         "recordId": "leftover::{{source.id}}::{{lineItem.rowId}}",
         "status": "Available",
         "forEachLineItem": {
           "groupId": "MP_LEFTOVERS_LI",
           "when": {
             "fieldId": "LEFTOVER_SELECTED",
             "equals": "Yes"
           }
         },
         "values": {
           "LEFTOVER_SOURCE_RECORD_ID": "{{source.id}}",
           "LEFTOVER_SOURCE_FORM_KEY": "Config: Meal Production",
           "LEFTOVER_KIND": "{{row.LEFTOVER_KIND}}",
           "LEFTOVER_NAME": "{{row.LEFTOVER_NAME}}",
           "LEFTOVER_QTY": "{{row.LEFTOVER_QTY}}",
           "LEFTOVER_SEQ": "{{lineItem.index}}"
         },
         "sourceLink": {
           "sourceRecordIdFieldId": "LEFTOVER_SOURCE_RECORD_ID",
           "sourceFormKeyFieldId": "LEFTOVER_SOURCE_FORM_KEY"
         }
       }
     ]
   }
   ```

   Nested collection example:

   ```json
   {
     "LEFTOVER_INGREDIENTS_LI": {
       "op": "flattenCollection",
       "collectionPath": "parent.MP_TYPE_LI",
       "nestedCollectionPath": "MP_INGREDIENTS_LI",
       "rowFilter": {
         "includeWhen": {
           "any": [
             { "fieldId": "PREP_TYPE", "equals": ["Cook", "Single-ingredient", "Part dish"] },
             {
               "all": [
                 { "fieldId": "PREP_TYPE", "equals": ["Multi-ingredient", "Entire dish"] },
                 { "fieldId": "PREP_QTY", "equals": 0 }
               ]
             }
           ]
         }
       },
       "pickFields": ["ING", "QTY", "UNIT", "CAT", "ALLERGEN"]
     }
   }
   ```

   Meal Production now uses this pattern for the first leftover bank slice:
   - Portioning captures produced leftovers in a dedicated `MP_LEFTOVER_CAPTURE_LI` group
   - Each row writes to `Config: Leftover Bank` through `submitEffects.createRecord`
   - `recordId: "leftover::{{source.id}}::{{lineItem.rowId}}"` keeps the downstream bank row stable across autosave and later edits
   - `sourceLink` lets the Leftovers step and summary template recover the generated `Config: Leftover Bank` rows later from the Meal Production record
   - Derived helper fields can resolve chilled vs frozen expiry in the source record first, then `submitEffects` can copy both storage mode and the final expiration date into the shared bank record
   - Final bank usage updates can still be handled through `submitEffects.updateRecord`, but active leftover selection is now expected to use the dedicated utilisation utilisation flow instead of a status-only toggle

   Utilisation-backed bank flow:
   - Use a shared bank form such as `Config: Leftover Bank` for the current authoritative availability. The quantity field on each bank row is the available quantity.
   - Add a dedicated internal form such as `Config: Leftover Utilisation` to track `active` and `released` utilisations per source row.
   - Keep the UI read path on the bank datasource only; do not query the utilisation form just to render availability. If the bank record status moves to `used` when the available quantity reaches zero, include both `available` and `used` in the selector datasource `statusAllowList`; use `sourceRows.includeWhen` to hide fully used rows unless the current record already has an active selection for that bank row.
   - Write utilisation changes through one atomic server endpoint. Selecting a bank item immediately subtracts quantity from the bank row, and editing or clearing that usage gives quantity back to the bank row.
   - For guided leftover-selection steps that should avoid per-keystroke utilisation writes, set `utilisation.commitMode: "step"` on the datasource-row config. The app updates availability locally first, then live-syncs one batched step utilisation plan on valid selection edits and quantity blur, replacing stale utilisations in the managed step scopes.
   - If a step should only enter with a fresh datasource fetch and should not queue advance-time utilisation sync when the user taps `Next`, set `navigation.backgroundUtilisationSyncOnAdvance: false` on that step.
   - If a later guided step reads shared bank that can still be changing because another step just edited utilisation-managed output rows, set `dataSourceBootstrap.waitForGuidedUtilisationSync: true` on that step's line-group target.
   - If the step reads shared bank that can be created or updated by follow-up actions still running in the current app session, also set `dataSourceBootstrap.waitForSharedDataMutations: true`.
   - Optional: define `utilisation.conflictDialog` on the datasource-backed selector config so concurrency conflicts explain what changed. Immediate utilisation writes can offer choices such as using the remaining authoritative availability or cancelling the attempted change. For `commitMode: "step"` conflicts, the app shows the configured dialog, returns the user to that guided step after acknowledgement, applies the fresh availability snapshot, and deselects rejected rows so dependent cook quantities recalculate.

   Example conflict dialog copy:

   ```json
   {
     "utilisation": {
       "enabled": true,
       "utilisationFormKey": "Config: Leftover Utilisation",
       "commitMode": "step",
       "resourceRecordIdFieldId": "LEFTOVER_RECORD_ID",
       "allowedStatuses": ["available"],
       "conflictDialog": {
         "title": {
           "en": ""
         },
         "message": {
           "en": "Leftover availability changed before you completed your selection. Your selected quantity is no longer available. Please adjust your selections before continuing"
         },
         "confirmLabel": {
           "en": "OK"
         },
         "cancelLabel": {
           "en": "Cancel"
         },
         "showCancel": false,
         "showCloseButton": false,
         "dismissOnBackdrop": false
       }
     }
   }
   ```

   Supported placeholders in `utilisation.conflictDialog.message`:
   - `{itemLabel}`
   - `{itemId}`
   - `{available}`
   - `{unit}`
   - `{availableWithUnit}`
   - `{requested}`
   - `{current}`

- Run **Community Kitchen → Create/Update All Forms** from the Google Sheet menu.
- This bumps a template-cache “epoch”, so the next render/prefetch reads the latest template from Drive.

### Record indexing + Data Version (performance + consistency)

For large datasets (10k–100k+ rows), the app relies on **indexed lookups** instead of scanning sheets.

What is added/maintained:

- **Destination tab meta column**: `Data Version`
  - Server-owned, monotonic integer (starts at 1 and increments on each update).
  - Used by the web app to validate cached records (`getRecordVersion` + banner prompting the user to refresh if stale).
  - Used for **optimistic locking**: draft autosave and submit are rejected when the client’s version is behind the sheet’s current version (prevents last-write-wins overwrites).
  - Unchanged updates now return `operation: "noop"` and do **not** bump `Data Version`, `Updated At`, audit logs, or home/analytics cache revisions.
- **Hidden index sheet per destination tab**: `__CK_INDEX__...`
  - Aligns by row number with the destination tab.
  - Stores: record id, row number, data version, timestamps, and per-rule dedup signatures.
  - Used for **fast record id → row** resolution and **indexed dedup checks**.
- **Record mutation lane**
  - Record writes are serialized per `(formKey, recordId)` on the server.
  - This applies to `saveSubmissionWithId`, internal record saves, dependency-guard writes, and submit-effect record writes.
  - Same-record mutations wait their turn instead of racing; unrelated records are unaffected.

Recommended steps after deploying a new bundle:

- Run **Community Kitchen → Create/Update All Forms** (ensures columns exist).
- Run **Community Kitchen → Rebuild Indexes (Data Version + Dedup)** (backfills existing rows).
- Run **Community Kitchen → Install Triggers (Options + Response indexing + Daily analytics + Daily lifecycle + Scheduled alerts)**:
  - Installs `onEdit` triggers to keep options + `Data Version` + indexes consistent when users manually edit sheets.
  - Installs a daily time-based trigger for `runDailyAnalyticsRecompute` to reconcile analytics snapshots.
  - Installs a daily time-based trigger for `runDailyLifecycleRecompute` at `2am` to evaluate config-driven lifecycle rules (for example `available -> expired` on `Leftover Bank` when `LEFTOVER_EXP_DATE <= today`).
  - Recreates daily time-based triggers for every configured `scheduledAlerts[].schedule` entry so operational alert checks run automatically.
  - CLI deployers can run `installScheduledRecordAlertTriggers` after deployment to refresh only scheduled alert triggers without opening the spreadsheet menu.

### UI tips (React edit + Summary)

- **PARAGRAPH fields (textarea height)**: You can increase the visible height of a paragraph field in the edit view by setting:
  - `ui.paragraphRows` (integer, 2–20; default 4)
- **PARAGRAPH field disclaimers**: Use `ui.paragraphDisclaimer` to append a disclaimer section that summarizes `__ckNonMatchOptions` from a line-item group (useful with `optionFilter.matchMode: "or"`).  
  - Defaults to a non-editable footer below the textarea; set `paragraphDisclaimer.editable: true` to render it inside the textarea for editing.

  ```json
  {
    "ui": {
      "paragraphDisclaimer": {
        "sourceGroupId": "ING",
        "title": { "en": "Pay attention to:" },
        "listMessage": { "en": "For {key}, do not use: {items}." },
        "message": { "en": "Remember to add salt only after reserving non-salt portions." }
      }
    }
  }
  ```

#### Example: PDF preview button

```json
{
  "button": {
    "action": "renderDocTemplate",
    "templateId": { "EN": "DOC_ID_EN", "FR": "DOC_ID_FR", "NL": "DOC_ID_NL" },
    "loadingLabel": { "en": "Creating PDF…", "fr": "Création du PDF…", "nl": "PDF maken…" },
    "placements": ["form", "formSummaryMenu", "summaryBar", "topBarSummary"],
    "folderId": "OPTIONAL_DRIVE_FOLDER_ID"
  }
}
```

`templateId` supports the same structure as `pdfTemplateId` / `emailTemplateId` (string, language map, or `cases` selector).
Markdown preview buttons with `"cacheScope": "template"` are pre-rendered into the client cache after the app loads so static instructions open without a first-click render delay. Use record-scoped caching only when the Markdown output depends on the current record values.

#### Example: Markdown preview button

```json
{
  "button": {
    "action": "renderMarkdownTemplate",
    "templateId": { "EN": "MARKDOWN_FILE_ID_EN", "FR": "MARKDOWN_FILE_ID_FR", "NL": "MARKDOWN_FILE_ID_NL" },
    "cacheScope": "template",
    "placements": ["form", "formSummaryMenu", "summaryBar", "topBarSummary"]
  }
}
```

#### Example: HTML preview button

```json
{
  "button": {
    "action": "renderHtmlTemplate",
    "templateId": { "EN": "bundle:checklist_am.summary.html" },
    "cacheScope": "template",
    "placements": ["form", "formSummaryMenu", "summaryBar", "topBarSummary"]
  }
}
```

#### Example: open a saved URL from a field

```json
{
  "button": {
    "action": "openUrlField",
    "fieldId": "pdfUrl",
    "placements": ["summaryBar", "formSummaryMenu"]
  }
}
```

`openUrlField` opens as a real new-tab link when the browser supports it. On iOS standalone/PWA installs, saved `pdfUrl` reports open in the app's PDF preview overlay because PWAs do not expose normal browser tabs.

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
  - The current UI opens a new tab and navigates it directly to the generated PDF blob (no Drive PDF file is written).

- **Placements**:
  - `form`: render inline as a normal field in the edit form (**PDF/Markdown preview**).
  - `formSummaryMenu`: appear inside the Summary button menu while editing.
  - `summaryBar`: appear in the Summary view bottom action bar (menu if multiple).
  - `topBar`: appear in the global action bar directly under the header (**all views**).
  - `topBarList`: appear in the top action bar on the List view.
  - `topBarForm`: appear in the top action bar on the Form (edit) view.
  - `topBarSummary`: appear in the top action bar on the Summary view.
  - `listBar`: appear in the List view bottom action bar (menu if multiple).
  - `htmlTemplate`: do not render in action bars; allow a bundled HTML template to invoke the button with `data-ck-action`.

## UI Navigation & Shell

- The web app uses an app-like shell:
  - Header shows a **left `← Apps` back button**, a **centered form title**, and the environment/save state on the right.
  - When `appHeader.sidebarEnabled` is not `false`, tapping the **form title** opens a **left drawer** with **Refresh**, **Language** (only when enabled / 2+ languages), and **Build**.
  - Adding `?dev-mode=true` to the form URL still enables the drawer even when `appHeader.sidebarEnabled: false`.
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

Example (render **Create + Copy** as **inline buttons** instead of a menu on Form/Summary views):

```json
{
  "actionBars": {
    "bottom": {
      "form": {
        "items": ["home", { "type": "system", "id": "create", "menuBehavior": "inline" }, { "type": "system", "id": "summary" }],
        "primary": ["submit"]
      },
      "summary": {
        "items": ["home", { "type": "system", "id": "create", "menuBehavior": "inline" }, "edit"]
      }
    }
  }
}
```

- **Optional: gate system actions (hide/disable + dialog)**:
  - In the dashboard “Follow-up Config (JSON)” column, set `actionBars.system.gates` to apply config-driven rules to system actions.
  - Gates use the standard `when` engine and can reference:
    - regular fields (e.g. `MP_PREP_DATE`)
    - guided steps virtual fields (e.g. `__ckStep`)
    - system/meta fields (e.g. `status`)
    - runtime UI virtual field `__ckView` (`list` | `form` | `summary`)
  - Example (disable guided Next on a future prep date, hide Submit on Summary for closed records, hide Copy unless the record is closed on Summary):

```json
{
  "actionBars": {
    "system": {
      "gates": {
        "submit": [
          {
            "id": "blockNextIfFutureDate",
            "when": {
              "all": [
                { "fieldId": "__ckView", "equals": ["form"] },
                { "fieldId": "__ckStep", "equals": ["deliveryForm"] },
                { "fieldId": "MP_PREP_DATE", "isInFuture": true }
              ]
            },
            "disable": true,
            "dialogTrigger": "onEnable",
            "dialog": {
              "message": { "en": "Ingredients receipt evidence, food safety, portioning, and leftovers can only be recorded on the production date." },
              "confirmLabel": { "en": "OK" },
              "showCancel": false,
              "showCloseButton": false,
              "dismissOnBackdrop": false
            }
          },
          {
            "id": "hideClosedSubmit",
            "when": { "all": [{ "fieldId": "__ckView", "equals": ["summary"] }, { "fieldId": "status", "equals": ["Closed"] }] },
            "hide": true
          }
        ],
        "copyCurrentRecord": [
          {
            "id": "onlyClosedSummary",
            "when": {
              "any": [
                { "not": { "fieldId": "__ckView", "equals": ["summary"] } },
                { "not": { "fieldId": "status", "equals": ["Closed"] } }
              ]
            },
            "hide": true
          }
        ]
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

- **Optional: replace the Summary view with an HTML template**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"summaryHtmlTemplateId"` to either:
    - a **Drive** HTML template id, or
    - a **bundled** template key: `bundle:<filename>` (loads `/docs/templates/<filename>` embedded into the deployment bundle at build time; rendered client-side; may fetch dataSource projections as needed)
  - `summaryHtmlTemplateId` supports the same structure as other template id configs (string, language map, or `cases` selector).
    - `cases` can use fixed date cutoffs such as `{ "fieldId": "MP_PREP_DATE", "beforeDate": "2026-05-20" }` to keep a legacy Summary template for historical records while newer records use the default template.
  - When set, the Summary view renders the HTML template (with placeholders) instead of the built-in Summary UI.
  - Bundled Summary HTML can invoke a template-only `BUTTON` by setting `data-ck-action="<BUTTON_ID>"` on a button/control. For `updateRecord` actions, add `data-ck-action-value-field="<FIELD_ID>"` and `data-ck-action-value-source="<selector>"` to pass a runtime top-level scalar value patch from an input in the template; use `data-ck-action-value-required="true"` to block empty selections client-side. When the visible template control needs custom validation before saving, keep the `data-ck-action` button hidden and trigger it only after the template script accepts the input.
  - If template rendering fails, the app shows an error and falls back to the built-in Summary view.

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

- **Optional: customize Create/Copy labels**:
  - In the dashboard “Follow-up Config (JSON)” column, set:
    - `"createButtonLabel": { "en": "New" }` (label for Create / New record)
    - `"copyCurrentRecordLabel": { "en": "Duplicate" }` (label for Copy current record)

- **Optional: drop fields when copying a record**:
  - In the dashboard “Follow-up Config (JSON)” column, set `"copyCurrentRecordDropFields"` to a list of **field ids** to clear on copy.
  - Dropped fields stay explicitly blank in the copied draft, so normal `defaultValue` prefills do not immediately restore them.
  - Example (force DATE + SHIFT to be re-entered on the copied record):

```json
{ "copyCurrentRecordDropFields": ["DATE", "SHIFT"] }
```

- **Optional: copy only a curated subset of values**:
  - If you need “Copy current record” to copy only specific fields (instead of copying everything and then dropping fields), set `"copyCurrentRecordProfile"`.
  - Nested relative subgroup rows can also be copied via `"subGroups"` when you want to keep selected child rows (for example recipes) without copying deeper ingredient or evidence rows.
  - Example (copy Customer + Service + Responsible cook + requested portions + selected cook recipes):

```json
{
  "copyCurrentRecordProfile": {
    "values": ["MP_DISTRIBUTOR", "MP_SERVICE", "MP_COOK_NAME"],
    "lineItems": [
      {
        "groupId": "MP_MEALS_REQUEST",
        "fields": ["MEAL_TYPE", "ORD_QTY"],
        "includeWhen": { "fieldId": "ORD_QTY", "greaterThan": 0 },
        "subGroups": [
          {
            "groupId": "MP_TYPE_LI",
            "fields": ["PREP_TYPE", "PREP_QTY", "RECIPE"],
            "includeWhen": {
              "all": [
                { "fieldId": "PREP_TYPE", "equals": ["Cook"] },
                { "fieldId": "RECIPE", "notEmpty": true }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

- **Optional: show an informational dialog after copy**:
  - To show a message after copying a record into a new draft, set `"copyCurrentRecordDialog"`.
  - Example (single OK button):

```json
{
  "copyCurrentRecordDialog": {
    "title": { "en": "Copying record" },
    "message": {
      "en": "Select the production date and verify the customer, service and requested portions information. All changes will be auto-saved and copied record will be created."
    },
    "confirmLabel": { "en": "OK" },
    "showCancel": false,
    "showCloseButton": false,
    "dismissOnBackdrop": false
  }
}
```

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
