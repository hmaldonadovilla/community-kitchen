# Close and Follow-up Transaction Performance

## Scope

This slice targets Meal Production milestone/final close latency, with generic changes that also apply to other forms using guided step milestones, final-submit reservation reconciliation, and submit effects.

## Implemented changes

- Guided close-only milestones now use the primary submit path instead of the follow-up batch path when the milestone has only `CLOSE_RECORD` as a blocking action and no background actions.
  - The client still waits for pending reservation draft sync before closing.
  - The close is persisted with `saveSubmissionWithId` in submit mode and the close status override.
  - The path skips the previous forced draft snapshot plus `triggerFollowupActions(["CLOSE_RECORD"])` round trip.

- Final-submit reservation reconciliation now batches its internal inventory and reservation-ledger saves.
  - Reconciliation queues touched inventory and ledger records with `InternalRecordSaveQueue`.
  - The queue is flushed once per reconciliation instead of saving each downstream record independently.

- Submit effects now batch deterministic downstream saves by target form.
  - `createRecord` / `updateRecord` effects with explicit target ids and fully resolved payload values are grouped into `saveTrustedSubmissionBatch`.
  - Effects that still need target auto-increment generation, have duplicate target ids, or otherwise need per-record semantics remain on the sequential path.

- Instrumentation was added around the slow backend phases.
  - `saveSubmission.reservationReconcile.done`
  - `inventoryReservation.reconcile.batchFlush.done`
  - `saveSubmission.submitEffects.done`
  - `submitEffects.batch.done`
  - `submitEffects.sequential.done`
  - `guidedStep.milestone.primaryClose.*`

- Cloud Run PDF follow-up status updates now use the same safe status-transition guard as email follow-ups.
  - This prevents a late `CREATE_PDF` completion from downgrading a record that has already reached the close status.

- Meal Production follow-up batches now split the independent final actions in the client.
  - `RECONCILE_RESERVATIONS` is sent through the reconciliation API.
  - `CREATE_PDF` remains a follow-up action.
  - Those two requests are started together and joined with `Promise.all`.
  - `SEND_EMAIL` only runs after both succeed.

- Cloud Run `triggerFollowupActions` now has a server-side fast path for the same safe final-report action shape.
  - A batch containing `RECONCILE_RESERVATIONS`, `CREATE_PDF`, and optional `SEND_EMAIL` runs reconciliation and PDF generation with `Promise.all`.
  - The email action is converted to an outbox enqueue after reconciliation and PDF generation succeed.
  - Apps Script still cannot run two service actions concurrently inside one execution; Apps Script parallelism comes from the frontend issuing the reconciliation and PDF requests as separate concurrent calls.

- Reservation reconciliation now skips when a guided step record has no reservation selections.
  - The guard applies to explicit `RECONCILE_RESERVATIONS`, guided close/final-submit reconciliation, and Cloud Run submit lifecycle reconciliation.
  - Forms without step-managed reservation row config keep the existing reconciliation behavior.

- Final report email is now queued instead of sent in the foreground.
  - Apps Script stores queued email work in script properties and schedules `runQueuedFollowupEmailJobs`.
  - Cloud Run stores queued email work in the `__CK_FOLLOWUP_EMAIL_OUTBOX` sheet and drains it from Cloud Scheduler.
  - The queue entry carries the generated PDF artifact, so the worker can send the already-created PDF instead of rendering a second PDF.
  - Failed sends retry up to three attempts before being marked failed.

- Bundled HTML PDF templates are cached server-side.
  - The template HTML is already embedded in the Apps Script / Cloud Run build artifact.
  - Follow-up rendering resolves bundled templates before Drive template reads.
  - The frontend does not fetch PDF templates; template warmup is server-side only and runs after home data has loaded.

## Expected impact

- Meal Production `Complete` no longer pays for a separate `triggerFollowupActions(CLOSE_RECORD)` call after saving the final snapshot.
- Reservation reconciliation and submit effects reduce repeated Google Sheet writes when multiple downstream records are touched in one transaction.
- Final follow-up no longer pays for email send latency in the user-visible close request.
- Reconciliation and PDF generation overlap when the batch contains only `RECONCILE_RESERVATIONS`, `CREATE_PDF`, and optional `SEND_EMAIL`.
- Records without reservation selections avoid the ledger/inventory reconciliation scan on the final path.
- The batching is conservative: records that require auto-generated ids continue to use the existing sequential code path.

## Verification

- `npx jest --runTestsByPath tests/WebFormService.test.ts --runInBand`
- `npx jest --runTestsByPath tests/config/stagingIntegrityDialogsAndLegend.test.ts tests/web/react/api.transport.test.ts --runInBand`
- `npx jest --runTestsByPath tests/WebFormService.test.ts tests/web/react/followupParallel.test.ts tests/cloudRunTemplateTargets.test.ts --runInBand`
- `npx jest --runTestsByPath tests/cloudRunSubmitEffectsRepository.test.ts tests/cloudRunApiServer.test.ts tests/cloudRunFollowupActionPlan.test.ts --runInBand`
- `npm run lint:changed`
- `npm run build`
- `npm run deploy:apps-script`
- `npm run deploy:cloud-run`
- `npm run deploy:cloud-scheduler`
- Temporary staging Playwright close-path validation against the deployed web app:
  - Opened Meal Production Belliard lunch at Leftovers.
  - Clicked `Complete`, confirmed, and returned to the list.
  - Observed close interaction duration: about `215 ms`.
  - Captured no close-time `triggerFollowupActions` RPC.

## Staging observation

A staging Apps Script follow-up trace on 2026-05-05 reported:

- `RECONCILE_RESERVATIONS`: `8887 ms`
- `CREATE_PDF`: `7522 ms`
- `SEND_EMAIL`: `4851 ms`
- RPC wall time: `32347 ms`

The action durations total about `21.3 s`, while the wall time was `32.3 s`. That confirms the final path was no longer a simple action-by-action sum, but the user-visible request was still waiting for email plus Apps Script/RPC overhead. The queued email change removes the `SEND_EMAIL` work from that foreground path; the expected foreground wait is now reconciliation/PDF plus enqueue overhead.

## Remaining work

- Cloud Run request-scoped Sheets unit of work is not included in this slice.
- Further follow-up lock shortening can be tackled separately if logs still show contention after this deploy.
