# Leftover Bank Implementation Plan

## Objective

Use the client's terminology consistently:

- `Leftover Bank data` is the repository of available leftover items.
- `Leftover Utilisation data` tracks source-record usage of those items.
- A bank item's quantity field is the authoritative current availability.

## Flow

1. Meal Production reads available rows from `Leftover Bank data`.
2. When a user chooses a bank item, the utilisation service immediately subtracts the chosen quantity from the bank row.
3. When a user reduces or clears that usage, the same service gives the quantity back to the bank row.
4. If the bank quantity reaches zero, the bank row status becomes `used`; otherwise it remains `available`.
5. The daily lifecycle trigger still expires leftover bank rows by date.

There is no final-close closeout step for active utilisations. The UI action that changes usage is the event that changes bank availability.

## Data Model

Bank rows keep the visible business data and availability fields:

- `LEFTOVER_ID`
- `LEFTOVER_STATUS`
- `LEFTOVER_KIND`
- `LEFTOVER_QTY` / `LEFTOVER_UNIT` for partial dishes
- `LEFTOVER_PORTIONS` for entire dishes
- source trace fields such as `SOURCE_RECORD_ID`

Utilisation rows keep the usage audit trail:

- `UTILISATION_ID`
- `RESOURCE_FORM_KEY`
- `RESOURCE_RECORD_ID`
- `RESOURCE_ITEM_ID`
- `RESOURCE_KIND`
- `RESOURCE_QTY_FIELD_ID`
- `RESOURCE_STATUS_FIELD_ID`
- `RESOURCE_UNIT_FIELD_ID`
- `UTILISED_QTY`
- `UTILISED_UNIT`
- `STATUS`: `active` or `released`
- source form, record, parent row, output row, and output key fields

## Runtime Rules

- Availability is computed from the bank row's current quantity.
- The utilisation service validates requested quantity against current bank quantity plus the current active quantity for the same utilisation row.
- Batch step sync replaces managed scopes: missing desired rows are released and their quantity is returned to the bank.
- Conflict responses return the refreshed bank availability snapshot so the UI can offer the authoritative available quantity.
- Follow-up actions close records, generate PDFs, and send email; they do not adjust bank utilisation.

## Verification

The core coverage should include:

- direct utilisation upsert debits bank quantity
- editing a utilisation updates bank quantity by delta
- clearing a utilisation returns quantity to the bank
- managed-scope batch replacement releases removed rows
- Cloud Run and Apps Script paths return the same availability snapshots
- staging UI shows `Leftover Bank` / `Leftover Utilisation` terminology throughout
