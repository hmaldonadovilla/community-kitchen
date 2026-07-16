# Hybrid receipt QR scanner

## Objective

Provide a continuous QR scanner that opens the camera immediately on Android and iOS, keeps the originating file overlay alive, validates every scanned Drive file with authoritative Apps Script configuration, and commits accepted receipts once.

The implementation uses Firebase Hosting for the scanner page and Apps Script for all session, Drive, and record operations. It must not depend on Cloud Run.

## User flow

1. The user opens the file overlay and selects **Scan QR**.
2. The application opens the Firebase scanner synchronously so the browser does not block the new tab. The scanner requests camera permission immediately.
3. The originating form prepares a saved record and an expiring, field-scoped Apps Script session in parallel.
4. QR values detected before the session is ready are kept in a bounded local queue and shown as waiting for verification.
5. The retained origin redeems the one-time launch token and submits queued and subsequent values to Apps Script. The scanner receives only bounded setup and result messages; it never receives Apps Script credentials.
6. The scanner shows a configured instruction, the camera, and one row per scanned receipt with checking, accepted, duplicate, rejected, or retryable feedback.
7. Android and desktop use **Finish and add receipts** to revalidate accepted files and perform one idempotent, field-scoped Apps Script append. **Cancel** writes nothing.
8. The scanner notifies the retained origin tab. The origin updates its local record and file overlay from the committed session result without navigating or reloading the application.
9. When `commitOnReturnOnIos` is enabled, iOS hides both page-owned completion actions. The user scans multiple receipts and uses the native browser X when done. Once the originating form is visible again, it reads the authoritative session and commits the accepted batch. Android and desktop keep explicit Finish and scripted close behavior.

## Security and data integrity

- The launch session is created from authoritative form configuration and a saved record version.
- The retained origin redeems the one-time launch token and keeps the derived scoped access token in memory.
- Apps Script calls remain in its own trusted iframe through `google.script.run` and an explicit RPC allowlist; the Firebase scanner cannot invoke them directly.
- QR parsing accepts only explicit HTTPS Google Drive or Docs file URL shapes.
- Apps Script checks access, trash state, configured file types, folder/shared-drive scope, duplicates, and maximum file count.
- Finish revalidates every accepted file and appends only the target upload field under the shared document lock.
- A stable commit request ID makes retries idempotent.
- Origin messages require the configured Firebase origin and a matching cryptographically random request ID. A valid message may rebind the peer `WindowProxy` because iOS can present a different proxy object for the same browser-owned scanner surface after suspension.
- Raw rejected QR payloads and Drive scope identifiers are not logged.

## Configuration

The feature remains generic and is enabled per `FILE_UPLOAD` field through `uploadConfig.linkCapture`.

The existing `linkCapture.validation` object remains the source for authoritative Drive scope rules. The following scanner settings are added to `linkCapture`:

- `instruction`: localized, field-specific sentence shown above the camera.
- `sessionTtlMinutes`: bounded session lifetime.
- `hideCloseOnIos`: hides only the scanner page's own Close control.
- `commitOnReturnOnIos`: hides Finish on iOS and commits the accepted batch when the originating form returns to the foreground.
- `allowedMimeTypes`: optional captured-link MIME policy independent from uploads. An explicit list replaces upload MIME/extension restrictions for scanned Drive files; `*/*` permits any non-folder file that passes the Drive scope policy.

Existing labels and validation messages continue to be configuration-driven. Meal Production supplies the receipt-specific instruction.

## Failure and recovery behavior

- If session preparation fails, the scanner stops the camera and tells the user to return to the form and open a fresh session. No candidate can be committed from a partially prepared session.
- If the opener is temporarily suspended, the scanner session and checked candidates remain in Apps Script. The origin reconciles on `message`, `focus`, and `pageshow`.
- Android and desktop Finish uses one stable idempotency key and is retried until the form acknowledges that commit processing has started or completed.
- Once Apps Script commits, the origin retains the terminal response briefly and resends it when the scanner repeats Finish or reconnects. The originating overlay is updated before the success response is sent.
- If the opener was discarded, no unsafe client-side save is attempted. The committed field remains authoritative and the normal record reload shows it.
- On configured iOS scanners, `pagehide` never sends Cancel or Closed. The foreground form waits for queued checks, reads the authoritative session, and commits it when at least one candidate is authorised. An empty session is cancelled.
- Origin-side visibility, focus, and pageshow events may repeat, but one stable request ID and the existing commit guard ensure a single field mutation.
- A lost commit response is reconciled with the same commit request ID.

## Implementation slices

1. Port the Apps Script session, validation, whitelisted origin-side RPC dispatcher, and field-scoped commit modules while retaining the existing `linkCapture` configuration model.
2. Replace the static scanner page with the continuous result-list UI and a waiting-for-launch bootstrap state.
3. Open the scanner immediately from the file overlay, prepare the session asynchronously, and add strict two-way window messaging.
4. Reconcile a successful field commit into the retained form state without a top-level navigation.
5. Remove the legacy embedded camera/photo/paste fallbacks for this configured flow and hide the page Close control on iOS.
6. Add domain, service, message-contract, UI-state, configuration, and build tests; then run changed-line lint, focused tests, the full build, and physical-device staging validation.

## Acceptance criteria

- The Scan QR action is enabled immediately when the file overlay opens.
- Camera permission is requested immediately after the scanner tab opens.
- Ten distinct receipts can be scanned without restarting the camera.
- Every receipt receives an authoritative user-facing result.
- Finish appends accepted receipts once on Android and desktop. On configured iOS scanners, returning with the native X appends the accepted batch once.
- Returning to a retained origin tab does not reload the application.
- Android Chrome/Samsung Internet, iPhone browser surface, desktop Chromium, and desktop Firefox pass the lifecycle checks.
- Runtime traffic is limited to Firebase Hosting and Apps Script.
