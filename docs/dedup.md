# Dedup rules (duplicate prevention)

This document explains how **dedup rules** prevent users from creating duplicate records (e.g. same `DATE` + same `FREQUENCY`).

## Key concepts

- **Dedup rules** are configured in the sheet `<Config Sheet Name> Dedup`.
- A dedup rule is evaluated **only when all its key fields are populated**.
- In the UI we currently enforce “create-flow” dedup only for rules with `onConflict: reject`.
- The system uses a **server-side precheck** (`checkDedupConflict`) to avoid writing duplicates during draft autosave.

## Actors

- **User**: fills the form.
- **React App**: computes the dedup signature, calls precheck, blocks autosave/submit on conflicts.
- **Apps Script**: evaluates dedup rules against the Responses sheet.
- **Google Sheet**: stores records.

## Sequence: create new record → autosave draft → dedup keys set → conflict

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant UI as React App
  participant AS as Apps Script
  participant SH as Google Sheet

  U->>UI: Start "New record" / preset / copy
  UI->>UI: createFlowRef = true, recordId = ""

  U->>UI: Fill some fields (dedup keys not all set yet)
  UI->>AS: saveSubmissionWithId(payload __ckSaveMode="draft")
  AS->>SH: appendRow / updateRow
  AS-->>UI: { success:true, meta.id }
  UI->>UI: recordId = meta.id (draft exists)

  U->>UI: Set remaining dedup key fields (all keys now populated)
  UI->>UI: compute dedupSignature (reject rules only)
  UI->>AS: checkDedupConflict(payload)
  AS->>SH: read existing rows, evaluate rules
  AS-->>UI: { success:true, conflict:{...} }

  alt conflict found (onConflict = reject)
    UI->>UI: dedupConflict = conflict
    UI->>UI: Lock the form (only dedup key fields remain editable)
    UI->>UI: Cancel autosave + disable Submit
  else no conflict
    UI->>UI: dedupConflict = null
    UI->>UI: Resume autosave quickly (persist changes)
  end
```

## Sequence: create new record → dedup check running → autosave is held

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant UI as React App
  participant AS as Apps Script

  U->>UI: Change a dedup key field
  UI->>UI: dedupSignature becomes non-empty
  UI->>UI: dedupChecking = true (precheck scheduled)

  UI->>UI: Autosave timer fires
  UI->>UI: detect (createFlow && dedupChecking) => HOLD autosave
  UI->>UI: reschedule autosave shortly

  UI->>AS: checkDedupConflict(payload)
  AS-->>UI: { success:true, conflict:null }
  UI->>UI: dedupChecking=false, conflict=null
  UI->>UI: trigger autosave immediately (persist changes)
```

## Notes / constraints

- **Drafts**: server-side `saveSubmissionWithId` currently skips dedup enforcement for `__ckSaveMode="draft"`, so the client must hold autosave until the precheck completes.
- **DATE fields**: server normalizes `DATE` values to “date-only” cells (midnight local time) before writing, to avoid Sheets storing them as date-time.
