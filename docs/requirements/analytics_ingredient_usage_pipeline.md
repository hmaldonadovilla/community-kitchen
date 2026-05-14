# Analytics Ingredient Usage Pipeline

## Goal

Add a reusable analytics-page export pipeline that lets an admin choose a past date, queue an ingredient-usage report, and receive the result by email as an `.xlsx` attachment.

## Scope

- Analytics page UI:
  - render configurable export pipelines
  - collect a past start date
  - queue the request and show an acknowledgement only
- Server:
  - queue jobs in script properties
  - schedule a one-off Apps Script trigger
  - aggregate ingredient usage for configured source forms
  - generate/save an `.xlsx` export
  - email the attachment to configured recipients
- Config:
  - dashboard-level `analytics.pipelines`
  - pipeline UI copy, aggregation rules, recipients, email copy, and attachment metadata

## Design

### Configuration model

Use `analytics.pipelines[]` under the existing per-form dashboard analytics config.

Current pipeline type:
- `ingredientUsageReport`

Key config areas:
- `ui`: date label/helper/button/queued notice
- `email`: recipients/subject/message/from/fromName
- `attachment`: format/fileNameTemplate/sheetName/folderId
- `report`: date field, closed statuses, nested line-item paths, grouped fields, lookup columns

This keeps the feature form-owned, schema-documented, and discoverable by the centralized analytics page without hardcoding Meal Production into the runtime.

### Execution model

Use a queue + one-off trigger instead of processing inside the browser RPC.

Reasoning:
- the user requirement is explicitly fire-and-forget
- workbook generation + email sending can take longer than a normal UI request
- the browser only needs a quick acknowledgement

Queue storage:
- script properties JSON array
- one property for the pending trigger id

Trigger handler:
- drain queued jobs
- resolve the owning form + source form
- run the configured pipeline
- log failures per job without blocking the rest

### Aggregation logic

For `ingredientUsageReport`:
- load all source records
- keep records whose configured date field is between the selected date and today
- keep only closed records
- traverse `mealGroupId -> prepGroupId -> ingredientGroupId`
- keep prep rows whose `prepTypeFieldId` matches the configured values
- group ingredient rows by ingredient + unit
- convert `Tbsp` quantities to `gr` when `tablespoonGramsLookupColumn` resolves a grams-per-Tbsp value
- convert `gr` quantities to `kg` when the aggregated value is greater than 1000
- sum quantity
- enrich category from row fields and/or ingredient datasource lookup columns

### Output

Generate a temporary Google Spreadsheet, fill it with:
- `Ingredients`
- `Unit`
- `Quantity`
- `Category`

Export that spreadsheet as `.xlsx`, save it to the configured/default Drive folder, attach it to the email, and trash the temporary spreadsheet.

Report filename, email subject, and email body date placeholders use `EEE,dd-mmm-yyyy` values for `{{START_DATE}}` and `{{END_DATE}}`. ISO values remain available as `{{START_DATE_ISO}}` and `{{END_DATE_ISO}}` for integrations that need them.

## Implementation slices

1. Type + schema surface
2. Dashboard parsing
3. Analytics dashboard payload + RPC surface
4. Queue + trigger orchestration
5. Ingredient usage aggregation + workbook/email generation
6. Analytics page UI
7. Tests, staging config, docs, deploy, Playwright validation
