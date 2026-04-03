# Finalization And Background Follow-Ups

## Purpose

This note defines the next reliability and performance improvements for the Meal Production closeout flow.

The current implementation already supports:

- reservation-backed `2. Leftover bank`
- milestone follow-up actions from `5. Portioning`
- final closeout from `6. Leftovers`
- background PDF and email generation

The remaining weakness is orchestration.

Today the client still treats milestone and final closeout as a sequence of loosely-coupled saves and follow-up RPCs. That creates three classes of problems:

- the user waits for autosave even when the current form state is already available in memory
- background follow-ups can race with final close and leave the record at `Emailed` instead of `Closed`
- perceived performance is poor because one-way sync work is treated as blocking

## Design goals

- keep inventory and final reconciliation authoritative and blocking
- move one-way side effects to the background whenever correctness allows it
- avoid client-side status regressions after close
- allow the UI to advance immediately after the authoritative blocking work is done
- keep the behavior configurable and reusable for other forms
- keep users on the current step while required photo uploads are still running
- avoid pushing users forward and then pulling them back because a required upload failed later
- treat draft-save traffic as latest-wins background sync rather than a navigation blocker

## Blocking vs background work

### Blocking work

The following work must complete before the user advances or sees the final closed state:

- ensure a persisted record id exists
- validation for the configured step or submit scope
- inventory reservation reconciliation or finalization
- close-time submit effects such as new leftover creation
- the status transition to `Closed`
- uploads that are required to build the payload being finalized
- uploads that are required by the current guided step before `Next` or auto-navigation may continue

### Background work

The following work may continue after the user has already advanced:

- datasource cache refresh
- home/list refresh
- summary enrichment
- PDF generation
- email sending
- plain draft `saveSubmissionWithId` sync for newer in-memory form snapshots

Important dependency:

- if the email must include the generated PDF, `SEND_EMAIL` depends on `CREATE_PDF`
- these actions may both be background actions, but they are not parallel with each other

## Queue policy

Not all in-flight client work should block milestone or final submit.

The app needs a generic queue policy with three modes:

- `all`
  - wait for uploads and in-flight autosave
- `uploadsOnly`
  - wait only for uploads
  - ignore plain autosave, because the current in-memory form state will be submitted directly
- `none`
  - do not wait for either queue

Recommended use:

- `5. Portioning` milestone: `uploadsOnly`
- final submit from `6. Leftovers`: `uploadsOnly`

This still blocks on required file uploads but avoids making the user wait for draft autosave.

## Step transition gating for uploads

Guided-step navigation needs a separate rule from milestone and final submit orchestration.

When `Next` or automatic row-flow navigation is triggered:

- if the current step has required uploads in progress, the app must stay on the current step
- the screen must be blocked while waiting
- a configurable non-technical message must be shown to the user
- the default wording should mention `photos`, not `files`
- once required uploads complete successfully, the pending navigation should continue automatically
- if any required upload fails, the user must remain on the same step and see the actionable error there

This rule applies generically and is especially important for `Production` and `Food safety`, where downstream milestone and final actions depend on uploaded photos already being persisted.

### Waiting dialog requirements

The waiting message must be configurable at the guided-step level or through a shared default.

Required characteristics:

- non-technical wording
- no mention of files, blobs, or background jobs
- clear that the user should wait briefly

Example default:

- `Please wait while your photos finish uploading.`

## Draft save queue model

Draft persistence should no longer behave like an unbounded queue of pending saves.

Required model:

- at most one draft save may be in flight
- at most one newer draft save may be pending behind it
- if a fresher draft snapshot is queued, any older unsent queued draft is discarded
- plain draft saves must not block guided-step navigation once upload requirements are satisfied
- milestone and final actions must use the latest in-memory snapshot, not wait for a backlog of stale draft saves

This is effectively a single-slot latest-wins save queue.

### Consequences

- the client may still wait for an already in-flight draft save if reusing it avoids duplicate work
- older queued draft saves that have not yet been sent must be canceled or superseded
- after an in-flight save completes, the client should send only the latest pending snapshot, if one still exists

## Status regression guard

Once a record is closed, slower follow-up actions must not downgrade it back to an intermediate status.

Required rule:

- if the current record status already matches the configured close status, later follow-up actions must not apply `onPdf` or `onEmail` status transitions

This is generic and not Meal Production-specific.

Examples:

- `CREATE_PDF` may set `PDF ready` before close
- `SEND_EMAIL` may set `Emailed` before close
- after close, both actions may still run or complete, but the record must remain `Closed`

## Recommended execution model

### `5. Portioning`

1. Validate the configured milestone scope.
2. Ensure the record id exists.
3. Wait according to the configured queue policy.
4. Run blocking pre-actions:
   - reservation reconciliation when configured
5. Advance the UI to `6. Leftovers`.
6. Launch background actions:
   - `CREATE_PDF`
   - `SEND_EMAIL` after PDF if required
7. Show a configurable acknowledgement dialog.

### Final submit from `6. Leftovers`

1. Validate the configured submit scope.
2. Ensure uploads required by the submitted payload are complete.
3. Submit the current in-memory payload.
4. Run blocking pre-actions:
   - `CLOSE_RECORD`
   - close-time reservation finalization
   - close-time leftover creation
5. Immediately update the local record status to `Closed`.
6. Navigate to the configured destination.
7. Refresh shared caches in the background.

### `Next` and auto-navigation between intermediate steps

1. Detect whether the current step still has required uploads in progress.
2. If not, continue navigation immediately.
3. If yes:
   - remain on the current step
   - show the configurable waiting dialog
   - block interaction until required uploads finish or fail
4. If uploads succeed, continue the pending navigation automatically.
5. If uploads fail, dismiss the waiting dialog and keep the user on the current step with the relevant validation or upload error visible.

## Implementation sequence

1. Add the generic queue policy to guided milestones and `submissionAfterSubmit`.
2. Use `uploadsOnly` in Meal Production.
3. Add a generic status regression guard in follow-up handlers.
4. Add milestone `preActions` and `backgroundActions`, and persist the current in-memory snapshot before running follow-ups.
5. Replace the current client-side two-save final close pattern with a primary submit that already carries the close status when `preActions = ["CLOSE_RECORD"]`.
6. Update tests, schema, docs, and staging config.
7. Add generic upload-gated guided-step navigation with a configurable waiting dialog that mentions photos.
8. Replace the current draft-save queue with a single-slot latest-wins queue:
   - one in-flight save
   - one latest pending save
   - older queued saves discarded
9. Ensure milestone and final actions never wait on stale queued draft saves, only on required uploads and explicitly blocking operations.
10. In a later slice, replace the remaining client orchestration with one dedicated atomic finalization RPC if we still see race conditions.

## Next implementation focus

The next slice should address the following concrete issues:

- `Complete portioning` must not move the user away and then bounce them back because a required photo upload was still in progress or failed.
- Guided `Next` and auto-navigation must stay in place and show a waiting overlay until required uploads are complete.
- The waiting message must be configurable and non-technical, and should refer to `photos`.
- Draft `saveSubmissionWithId` traffic must stop blocking navigation.
- The client must coalesce draft saves so that only the latest unsent snapshot remains pending.
- Milestone and final actions must continue to block on reservations and other authoritative server-side checks.
- We should keep monitoring whether a later atomic finalization RPC is still needed after the queue/navigation rework lands.

## Out of scope for this slice

- a brand-new server API for atomic finalization
- migration of existing records
- redesign of PDF/email dependency orchestration beyond the queue/status guard changes
