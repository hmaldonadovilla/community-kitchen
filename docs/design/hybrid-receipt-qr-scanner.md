# Hybrid receipt QR scanner

## Objective

Provide a continuous QR scanner that opens the camera immediately on Android and iOS, keeps the originating file overlay alive, validates scanned Drive files with authoritative Apps Script configuration, and persists accepted receipts efficiently without processing the same receipt more than once per scanner session.

The implementation uses Firebase Hosting for the scanner page and Apps Script for all session, Drive, and record operations. It must not depend on Cloud Run.

## User flow

1. The user opens the file overlay and selects **Scan QR**.
2. The application opens the Firebase scanner synchronously so the browser does not block the new tab. The scanner requests camera permission immediately.
3. Opening the scanner creates no Apps Script session. The first detected QR starts lazy record preparation, session creation, and token redemption.
4. Detected values enter a bounded queue. A short collection window groups up to three values into a micro-batch; detections arriving during an in-flight request form the next batch. The originating file overlay is locked only while one or more scan transactions are queued or in flight.
5. The client and server both coalesce candidates by canonical Drive file ID for the scanner session. URL variants or multiple ingredient stickers that refer to one delivery receipt therefore produce one Drive validation and, at most, one record append.
6. Apps Script validates each new canonical file once and appends all authorised links from the micro-batch in one atomic record mutation.
7. The origin applies the batch's single authoritative field value, links, and record version before reporting results to the scanner. **Accepted** therefore means **Added**, not “ready to add later.”
8. The camera continues and the scanner lists added, duplicate, rejected, and retryable results for multiple receipts.
9. On iOS the user returns with the native browser X. Android and desktop show one page-owned **Close** action. Neither action commits, cancels, reloads, or otherwise changes server data.
10. If the user returns while a scan transaction is unresolved, the file overlay shows the same non-dismissible wait overlay used for add/remove transactions until every queued scan settles, then displays the latest authoritative receipt list.

## Security and data integrity

- The launch session is created lazily from authoritative form configuration and a saved record version.
- The retained origin redeems the one-time launch token and keeps the derived scoped access token in memory.
- Apps Script calls remain in its own trusted iframe through `google.script.run` and an explicit RPC allowlist; the Firebase scanner cannot invoke them directly.
- QR parsing accepts only explicit HTTPS Google Drive or Docs file URL shapes.
- Apps Script checks access, trash state, configured captured-link file types, folder/shared-drive scope, duplicates, and maximum file count.
- An accepted batch first stores one compact pending intent, then appends only the target upload field once under the shared document lock, and finally advances the session's expected record version.
- Stable scanner `scanId` values plus a stable batch request ID make retries idempotent. A retry reconciles already durable links by Drive file ID rather than appending them twice.
- Origin messages require the configured Firebase origin and a matching cryptographically random request ID. A valid message may rebind the peer `WindowProxy` because mobile browsers can expose a different proxy for the same scanner surface.
- Raw rejected QR payloads and Drive scope identifiers are not logged.

## Configuration

The feature remains generic and is enabled per `FILE_UPLOAD` field through `uploadConfig.linkCapture`.

The existing `linkCapture.validation` object remains the source for authoritative Drive scope rules. Scanner settings include:

- `instruction`: localized, field-specific sentence shown above the camera.
- `sessionTtlMinutes`: bounded session lifetime, starting when the first QR is processed.
- `hideCloseOnIos`: retained configuration for hiding the scanner page's Close control; the incremental UI always relies on the native iOS X.
- `allowedMimeTypes`: optional captured-link MIME policy independent from uploads. An explicit list replaces upload MIME/extension restrictions for scanned Drive files; `*/*` permits any non-folder file that passes the Drive scope policy.
- `commitOnReturnOnIos`: accepted only for backward-compatible configuration and cached scanner URLs. The incremental flow does not infer native return or perform a batch commit.
- `waitMessages.scan` and `waitMessages.scanTitle`: optional localized copy for the originating form's blocking overlay while scan transactions are queued or in flight. A blank title hides the title line.

Existing labels and validation messages continue to be configuration-driven. Meal Production supplies the receipt-specific instruction.

On phone-width portrait screens, the rendered camera preview is capped at 32% of the dynamic viewport and 280 px, with a 180 px minimum. QR decoding continues to use the camera stream's intrinsic resolution, so the smaller display leaves more room for scan results without reducing decoder input quality.

Camera startup requests a high-detail rear stream with 1920 x 1080 as a non-blocking preference. Browsers that advertise detail content hints or continuous focus receive those settings; older Safari versions keep their native autofocus. Live decoding checks tight and medium source-resolution regions in the centre before periodically checking a bounded full-frame image. Standard black-on-white labels use the fast non-inverted path, while an occasional inverted pass preserves support for reversed codes without imposing its decoding cost on every frame.

The live loop retains a stable canvas per decode region to avoid repeated backing-store allocation on memory-constrained phones. A transient canvas or frame-decode failure is logged with bounded frequency and rescheduled with a short backoff instead of terminating the scanner. While the scanner interaction is active, record-freshness heartbeats use the configured quiet window rather than retrying and logging every second.

## Server performance safeguards

- Record mutations stay ordered and serialized. A micro-batch shares session authentication, authoritative target loading, pending-intent persistence, and one expected-version-checked record write.
- Canonical Drive identities are processed in first-seen order. Each unique new identity is authorised once per session; repeated identities receive a duplicate result without another Drive metadata request or record mutation.
- Hot-path session authentication reads only the requested ScriptProperties entry. Expired-session cleanup and capacity reclamation run when a session is created.
- Every newly processed unique file receives a fresh, field-limited Drive metadata request. Canonical repeats reuse the session outcome and do not issue another file request. Folder metadata used for destination-drive and ancestry checks may use the shared script cache for at most 60 seconds.
- With `CK_DEBUG` enabled, QR scanner diagnostics report total RPC duration, batch size, unique-candidate count, duplicate suppression, and the `sessionRead`, `targetRead`, `driveAuthorization`, state-write, append, and recovery stage durations without logging QR payloads or Drive scope identifiers.

## Failure and recovery behavior

- Camera startup is independent from server preparation. Opening the scanner or waiting before the first scan consumes no session and starts no expiry clock.
- A preparation or temporary validation failure affects only that scanned item. Retrying uses the same transaction semantics and the camera remains available. Retryable identities are not permanently suppressed, so they can be scanned again.
- Transport uncertainty is retried with the same scan and batch request IDs. If the immediate retries remain ambiguous, the origin retains that exact batch and reconciles it ahead of the next scan without merging new members into the request. If the record write succeeded but the response or final session update was lost, Apps Script returns the authoritative already-linked field without another append.
- Permanent rejection, duplicate, out-of-scope, unsupported, and maximum-file results do not mutate the record.
- Closing the scanner never calls `qrScanner.commit` or `qrScanner.cancel`. Focus, visibility, `window.closed`, heartbeat, and elapsed-time signals have no persistence meaning.
- A close message stops accepting new scans but does not interrupt queued work. The origin releases the pending overlay lock after each transaction, while the autosave hold stays active until the scanner closes and any in-flight transaction settles.
- If the scanner page or opener is discarded after a durable write, the record remains authoritative and a normal record reload shows the linked receipt.
- Expired credentials are discarded; a later scan can lazily create a fresh session from the origin's latest record version.

## Implementation slices

1. Keep the Apps Script session, validation, and whitelisted origin-side RPC dispatcher, add `qrScanner.addCandidates`, and retain `qrScanner.addCandidate` as a compatibility fallback.
2. Store one pending batch marker and reconcile same-request retries by Drive file ID.
3. Return ordered per-candidate results plus one complete authoritative upload-field state and data version for the batch while keeping the session active.
4. Open the scanner immediately, start session preparation only on the first scan, and micro-batch the bounded scan queue in groups of up to three.
5. Apply the aggregate authoritative update once before reporting **Added** results. Scope the file-overlay saving lock to queued work, but retain the autosave hold for the full active scanner interaction so an idle camera can safely submit another code.
6. Remove native-return inference, heartbeat, timeout cancellation, and generated Finish/Cancel actions while retaining legacy message parsing during rollout.
7. Cover batch idempotency and recovery, canonical session deduplication, multi-scan ordering, overlay blocking, platform close behavior, configuration, and generated scanner assets.

## Acceptance criteria

- The Scan QR action is enabled immediately when the file overlay opens.
- Camera permission is requested immediately after the scanner tab opens.
- Opening and closing without a scan performs no session, commit, or cancel RPC.
- Ten distinct receipts can be scanned without restarting the camera.
- Every receipt receives an authoritative user-facing result; **Added** means its link is already durable.
- Two or three new valid scans may share one `addCandidates` transaction, one record-version increment, and one authoritative field update; there is no scanner finish/commit transaction.
- Repeating the same canonical Drive file within one scanner session does not repeat Drive validation or record processing, even when its QR URL text differs.
- Returning while a transaction is in flight shows configurable blocking copy over only the relevant file overlay until every scan settles.
- iOS native X and Android/desktop Close do not reload or mutate the originating application.
- Android Chrome/Samsung Internet, iPhone browser surface, desktop Chromium, and desktop Firefox pass the lifecycle checks.
- Runtime traffic is limited to Firebase Hosting and Apps Script.
