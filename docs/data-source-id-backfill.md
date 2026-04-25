# Data Source ID Backfill Runbook

Use this procedure after deploying datasource identity fields, such as
`*_SOURCE_ID` and `*_SOURCE_UPDATED_AT`, into an environment that already has
historical response rows.

The backfill is intentionally conservative:

- It fills only missing datasource identity fields.
- It does not overwrite visible user-facing values such as recipe names,
  ingredient names, categories, allergens, or quantities.
- It leaves unmatched or blank legacy values untouched.
- It writes audit rows during commit mode unless explicitly disabled.

## Prerequisites

1. Deploy the current Apps Script bundle to the target environment.
2. Confirm the target web app URL or deployment id is available in either:
   - `.env.deploy.<env>` as `CLASP_DEPLOYMENT_ID` or `CLASP_TARGET_WEB_APP_URL`
   - or the command line as `--deployment-id` / `--url`
3. Install dependencies locally:

   ```bash
   npm install
   ```

4. For commit mode only, create a random commit token and set it as a script
   property in the target Apps Script project:

   ```txt
   CK_BACKFILL_DATA_SOURCE_IDS_TOKEN=<random token>
   ```

   Preferred setup path:

   - Open the Apps Script project for the target environment.
   - Go to Project Settings.
   - Add script property `CK_BACKFILL_DATA_SOURCE_IDS_TOKEN`.
   - Use the same token locally through `CK_BACKFILL_DATA_SOURCE_IDS_TOKEN` or
     `--token`.

   Delete this script property after the one-off commit run is complete.

## Dry Run

Dry-run is the default mode. It scans all batches and reports what would be
filled without changing records.

```bash
npm run backfill:data-source-ids -- \
  --env staging \
  --form-key "Config: Meal Production" \
  --batch-size 50
```

Equivalent direct URL form:

```bash
npm run backfill:data-source-ids -- \
  --url "https://script.google.com/macros/s/<deploymentId>/exec" \
  --form-key "Config: Meal Production"
```

Review the totals before committing:

- `fieldUpdates`: fields that can be filled
- `changedRows`: destination rows that would be updated
- `alreadyFilled`: identity fields already present; this should increase in
  the post-check after a successful commit
- `skippedNoLegacyValue`: blank legacy values; these are expected to remain blank
- `skippedNoMatch`: legacy values that no longer match a source row; inspect if
  the count is unexpected. These rows are intentionally not guessed because the
  original name may have changed before an identity field existed.
- `skippedAmbiguous`: duplicate matches; do not commit until resolved unless the
  operator intentionally accepts leaving those fields untouched
- `skippedInvalidJson`: malformed line-item JSON; resolve before commit
- `skippedMissingSource`: datasource could not be read; resolve before commit

## Commit

Commit mode always performs a dry-run preflight first. It aborts by default if
the preflight has ambiguous, invalid JSON, or missing source skips.

```bash
CK_BACKFILL_DATA_SOURCE_IDS_TOKEN="<same token as script property>" \
  npm run backfill:data-source-ids -- \
  --env staging \
  --commit \
  --form-key "Config: Meal Production" \
  --batch-size 50
```

The commit pass:

1. Runs preflight dry-run.
2. Commits in row batches.
3. Writes audit rows to `Data Source ID Backfill Log`.
4. Runs a post-check dry-run and fails if fillable fields remain.

A successful post-check should report `fieldUpdates: 0` and `changedRows: 0`.
`skippedNoMatch` can remain non-zero when historical labels no longer exist in
the datasource; those rows need manual review if they must be linked.

Use `--start-row` to resume manually from a known row if a run is interrupted:

```bash
CK_BACKFILL_DATA_SOURCE_IDS_TOKEN="<token>" \
  npm run backfill:data-source-ids -- \
  --env staging \
  --commit \
  --start-row 152
```

## Other Environments

Create a matching env file for the environment:

```txt
.env.deploy.prod
DEPLOY_ENV=prod
CLASP_DEPLOYMENT_ID=<deployment id>
CLASP_TARGET_WEB_APP_URL=https://script.google.com/macros/s/<deployment id>/exec
```

Then run:

```bash
npm run backfill:data-source-ids -- --env prod --form-key "Config: Meal Production"
```

Commit mode still requires the target Apps Script project to have the matching
`CK_BACKFILL_DATA_SOURCE_IDS_TOKEN` script property.

## Safety Notes

- Do not use `clasp run` for this operation unless the target project is also
  deployed as an Apps Script API executable. This project is operated as a web
  app, so the runner calls the deployed web app through `google.script.run`.
- Do not create temporary deployments or admin web endpoints just to set the
  commit token. Prefer the Apps Script Project Settings script property flow so
  the migration does not leave extra executable surfaces behind.
- Keep batches small enough for Apps Script limits. `50` rows is the default and
  was used for the staging backfill.
- Keep the audit sheet until the migration has been reviewed.
- Remove `CK_BACKFILL_DATA_SOURCE_IDS_TOKEN` after the migration so commit mode
  cannot be triggered accidentally.

## Matching Scope Notes

- The backfill follows the same datasource identity configuration as the form
  runtime, including `when` clauses on source-sync fields.
- Meal Production cook rows are eligible for recipe and ingredient identity
  backfill only when they are actual `Cook` rows. Saved leftover/reheat rows are
  intentionally left as historical snapshots because their recipe and ingredient
  details must reflect what was cooked at the time.
- Backfill only adds missing identity metadata. It does not refresh labels,
  quantities, allergens, categories, or other user-visible values.
