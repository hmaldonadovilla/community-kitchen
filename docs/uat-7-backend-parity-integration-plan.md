# UAT 7 Integration and Backend Parity Refactor Plan

## Objective

Incorporate the latest frontend and business-logic changes from `release/uat-7` while preserving the backend separation work on this branch:

- Apps Script-only execution through the existing Apps Script transport.
- Centralized backend API execution through the current HTTP/hybrid transport.
- Multi-data-store backend enablement for Drive/Sheets first, then Firestore.
- Progressive separation of frontend business logic and backend domain logic.

This plan intentionally does **not** restructure the transport during the merge/stabilization phase. The existing transport abstraction is treated as already implemented; incoming UAT 7 code should be adapted to it only where needed.

## Guiding Decisions

- `release/uat-7` is the source of truth for the latest frontend behavior, staging configuration, and business workflow changes.
- This branch is the source of truth for backend transport, Cloud Run parity, Drive/Sheets repository work, scheduler endpoints, and future Firestore enablement.
- The first stabilization target is `appsScript` backend mode because the user has already validated record creation end to end in that mode.
- Transport restructuring is deferred. The merge phase should preserve behavior, not reorganize modules.
- Regression validation is required at every stage, but the scope is chosen case by case based on files touched and behavior affected.
- UI hygiene cleanup is out of scope unless the specific slice is primarily UI/visual consistency or the touched UI surface requires a local correction.

## Work Stages

### Stage 0: Protect Current Backend Work

Purpose: make the current backend parity work recoverable before merging.

Tasks:

- Create a safety branch or checkpoint for the current branch state.
- Commit or otherwise preserve the backend parity work in logical slices before merging.
- Confirm generated assets are reproducible and not masking untracked source changes.

Suggested checkpoint slices:

- Backend runtime transport and script property config.
- Cloud Run API server, RPC handlers, and Google API clients.
- Drive/Sheets repositories and data-source support.
- Submission writes, uploads, templates, PDF, follow-up, Gmail fallback, and analytics parity.
- Scheduler endpoints and deployment scripts.
- Tests and documentation.

Validation:

- `npm run lint:changed`
- `npm run build`
- Focused tests for changed backend/transport files.

Exit criteria:

- Backend work can be restored without relying on the dirty worktree.
- Current branch state is safe to merge with `release/uat-7`.

### Stage 1: Merge and Stabilize `release/uat-7`

Purpose: bring UAT 7 frontend/business changes into the backend-parity branch without restructuring transport.

Tasks:

- Merge `release/uat-7`.
- Resolve overlaps in:
  - `src/web/react/api.ts`
  - `src/services/WebFormService.ts`
  - `src/services/WebFormTemplate.ts`
  - `src/web/data/dataSources.ts`
  - `docs/config/exports/staging/config_meal_production.json`
  - tests and documentation
- Preserve the current transport behavior:
  - Apps Script mode routes through Apps Script transport.
  - HTTP/hybrid mode routes only configured/default supported functions through Cloud Run.
  - Cloud Run fallback behavior remains in place for Gmail delegation and Drive quota limitations.
- Adapt any incoming UAT 7 API calls to use the current transport wrappers.
- Do not split or reorganize transport files in this stage.

Validation, selected case by case:

- `npm run lint:changed`
- `npm run build`
- Full `npm test` after conflict resolution.
- Focused transport tests when `src/web/react/api.ts` changes.
- Focused Apps Script service tests when `WebFormService.ts` or `WebFormTemplate.ts` changes.
- Manual or Playwright Meal Production create/edit flow in `appsScript` mode.

Exit criteria:

- Apps Script backend mode works for record creation/editing, uploads, and relevant follow-up behavior.
- Unit tests and build are green.
- UAT 7 business behavior is preserved.
- Existing backend parity behavior is not removed.

### Stage 2: Frontend and Business Logic Separation

Purpose: reduce React component complexity by moving business logic into focused hooks, feature modules, and pure domain services.

Priority targets:

- `src/web/react/App.tsx`
- `src/web/react/components/FormView.tsx`
- `src/web/react/components/form/LineItemGroupQuestion.tsx`
- supporting logic currently spread across `src/web/react/app/*`, `src/web/effects/*`, and `src/web/data/*`

Target structure:

- `src/web/react/features/<feature>/components`
- `src/web/react/features/<feature>/hooks`
- `src/web/react/features/<feature>/domain`
- `src/web/react/features/<feature>/services`
- shared low-level UI stays in `src/web/react/components`
- shared pure rules stay in `src/web/domain` or existing equivalent domain folders

Candidate feature slices:

- Home list local cache extraction from `App.tsx` into a focused browser-storage boundary.
- Upload completed-value projection extraction from `App.tsx` into a focused upload domain boundary.
- Remaining no-deploy pure helper extraction from `App.tsx`: dedup precheck, data-source visibility keys, non-match warning discovery, Home list response annotation, and perf clock access.
- Data-source prefetch/cache coordination extraction from `App.tsx`: config lookups, freshness watch filtering, retry delays, and form-open refresh keys.
- Record load/save lifecycle and freshness.
- Upload queue and upload persistence.
- Guided step navigation and completion gates.
- Reservations and source-first allocation behavior.
- Data-source prefetch, cache mutation, and freshness.
- Line item row sorting, nested row behavior, and derived values.
- Follow-up action orchestration and result display.

Validation, selected case by case:

- Unit tests for extracted pure logic.
- Existing focused React tests for the affected feature.
- Playwright only when the slice touches user-visible guided flow, uploads, save/submit, or navigation.
- Full test suite after larger extraction batches.

Exit criteria:

- Components touched by the slice contain rendering and wiring, not core business decisions.
- Extracted logic is testable without DOM or Apps Script globals.
- No transport behavior changes are introduced by frontend refactors.

### Stage 2B: Component and Hook Decomposition

Purpose: physically reduce the largest React files after the first domain-helper extraction pass by moving cohesive rendering and UI-state boundaries out of monolithic components.

Primary targets:

- `src/web/react/components/form/LineItemGroupQuestion.tsx`
- `src/web/react/components/FormView.tsx`
- `src/web/react/App.tsx`

Target boundaries:

- Line item group rendering:
  - Extract row and subgroup table primitives into `src/web/react/features/lineItems/components`.
  - Extract compact/guided row summary rendering into focused components that receive already-resolved callbacks and values from the parent.
  - Extract repeated read-only field, warning, upload-failure, and action-button primitives where they can be reused without changing behavior.
  - Keep the complex reservation/source-first state machine in the parent until it can be moved behind a dedicated hook with focused tests.
- Form view orchestration:
  - Extract guided-step rendering shell and target rendering helpers where they only depend on resolved props.
  - Extract overlay/session controller helpers into hooks when they own a clear state machine and do not require transport or persistence access.
  - Extract upload overlay rendering and retry UI into components while keeping upload mutation callbacks injected from the parent.
- App shell orchestration:
  - Extract report preview overlay state/rendering helpers and custom-button action wiring into a hook/component boundary.
  - Extract dedup dialog rendering and detail building into a focused app component.
  - Extract home/list shell wiring where it can receive resolved handlers and cache state from the parent without moving transport calls.

Implementation rules:

- Preserve behavior first; avoid changing transport, persistence, or backend API routing in this stage.
- Prefer prop-injected presentational components before moving stateful hooks.
- Add focused unit tests for extracted pure helpers and focused React tests only when a user-visible rendering boundary changes.
- Commit each meaningful extraction independently.
- Run `npm run lint:changed`, focused tests, and `npm run build` before finalizing the stage. Use staging deploy and Playwright smoke only after user-visible component wiring changes are stable.

Exit criteria:

- Each primary target has at least one meaningful component or hook boundary extracted.
- Line counts decrease materially in all three target files.
- Existing Meal Production create/edit and guided line-item flows remain functionally unchanged in targeted validation.

First-pass results:

- `LineItemGroupQuestion.tsx`: extracted the renderer prop/type contract, upload-failure notice, and line-item action-button style helper. Current size: 16,078 lines, down from 16,352.
- `FormView.tsx`: extracted non-guided grouped section rendering and top-of-form status/warning notices into presentational components. Current size: 16,076 lines, down from 16,280.
- `App.tsx`: extracted App-level overlay shell, button-wrap DOM helper, and report preview style constants. Current size: 16,868 lines, down from 17,202.

Second-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow action controls, totals rendering, remove buttons, and overlay reset controls into `src/web/react/features/lineItems/components`. Current size: 15,939 lines.
- `FormView.tsx`: extracted guided step shell rendering, guided target-field parsing, and guided context-header parsing/rendering into `src/web/react/features/steps`. Current size: 15,910 lines.
- `App.tsx`: extracted app notice rendering, dedup dialog detail construction, and app header status rendering into focused app modules. Current size: 16,739 lines.

Completion-pass results:

- `LineItemGroupQuestion.tsx`: extracted the table totals footer renderer into `src/web/react/features/lineItems/components`. Current size: 15,916 lines.
- `FormView.tsx`: extracted guided target pairing and guided line-group config building into focused step modules. Current size: 15,695 lines.
- `App.tsx`: extracted action-bar notice/list legend state plus orientation and loading shell chrome. Current size: 16,678 lines.

### Stage 2C: Stateful Workflow Decomposition

Purpose: continue the component/hook decomposition beyond safe presentational helpers and move stateful workflow decisions behind focused domain, hook, and controller boundaries. The objective is maintainability and regression reduction first; line-count reduction is an expected side effect, not the only success measure.

Target boundaries:

- `LineItemGroupQuestion.tsx`
  - Split source-first allocation display helpers and panels into focused line-item modules.
  - Split guided compact row rendering into focused render components after compact display rules are isolated.
  - Split subgroup table rendering and overlay-open field rendering once their state inputs are explicit.
- `FormView.tsx`
  - Split overlay session snapshot capture/restore and scoped autosave hold coordination into hooks.
  - Split upload overlay controller and retry UI after the session boundary is isolated.
  - Split validation/error navigation into a focused hook with tests for guided and non-guided behavior.
- `App.tsx`
  - Split viewport/orientation shell state, then record load/save lifecycle, dedup dialog state, action/report orchestration, home/list cache orchestration, and guided reservation sync into hooks.

Implementation rules:

- Prefer extracting a cohesive state machine with explicit inputs over moving arbitrary blocks for line count.
- Add focused tests to each extracted domain helper or hook-facing utility when practical.
- Use Playwright/staging smoke for slices touching guided line items, overlays, record loading, save/submit, uploads, or navigation.
- Commit each meaningful slice independently.

Exit criteria:

- The three target files no longer own business decisions that can be tested outside the component.
- Source-first allocation, overlay session, autosave hold, viewport/orientation, validation navigation, and record lifecycle have named boundaries.
- Targeted regression validation passes for the affected user flows.

First-pass results:

- `App.tsx`: extracted viewport/orientation, header-height, visual viewport, and bottom action-bar CSS-variable coordination into `useAppViewportState`. Current size: 16,471 lines.
- `FormView.tsx`: extracted overlay session snapshot capture/restore and scoped autosave hold coordination into `useOverlaySessionController`. Current size: 15,600 lines.
- `LineItemGroupQuestion.tsx`: extracted source-first allocation display and compact text-part helpers into line-item presentation domain helpers. Current size: 15,804 lines.

Second-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first row sort label and ordering decisions into line-item presentation domain helpers. Current size: 15,791 lines.
- `FormView.tsx`: extracted validation navigation request/consumption state into `useValidationNavigationRequest`, centralizing request mode, overlay-open allowance, and diagnostics. Current size: 15,577 lines.

Third-pass results:

- `FormView.tsx`: extracted guided error-navigation target selection into `src/web/react/features/validation/domain/guidedErrorNavigation.ts`, covering active-step preference, reachable-step fallback, row filters, field scopes, and subgroup inclusion with focused unit tests. Current size: 15,388 lines.

Fourth-pass results:

- `FormView.tsx`: extracted validation error navigation orchestration into `useValidationErrorNavigation`, keeping guided step redirection, overlay opening, group/row expansion, and scroll/focus behavior behind a named hook boundary. Current size: 15,253 lines.

Fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first selection toggle patching into line-item presentation domain logic, covering selected flags, quantity max defaults, and mode defaults with focused unit tests. Current size: 15,734 lines.

Sixth-pass results:

- `App.tsx`: extracted dedup dialog presentation derivation into `useDedupDialogPresentation`, moving conflict selection, copy/details resolution, dialog message rendering, and dialog label choice out of the shell. Current size: 16,417 lines.

Seventh-pass results:

- `FormView.tsx`: extracted row/subgroup validation error indexing into `src/web/react/features/validation/domain/errorIndex.ts`, covering normal line-row errors and subgroup parent-row indexing with focused unit tests. Current size: 15,236 lines.
- `LineItemGroupQuestion.tsx`: extracted source-first sentence field validation error collection into line-item presentation domain logic, removing duplicated field-error mapping across source-first render paths. Current size: 15,713 lines.
- `App.tsx`: extracted header drawer/layout/back-navigation wiring into `useAppHeaderNavigation`, keeping landing URL construction and blocking-overlay navigation feedback out of the shell. Current size: 16,405 lines.

Eighth-pass results:

- `FormView.tsx`: extracted imperative validation-field navigation into `useImperativeFieldNavigation`, leaving the component to wire the callback ref while the hook owns the current request target.
- `LineItemGroupQuestion.tsx`: extracted source-first list scroll style resolution into line-item presentation domain logic.
- `App.tsx`: extracted system action gate evaluation, submit-gate enable dialog coordination, and action-bar state derivation into focused app hooks. Current size after this pass: 16,342 lines.

Ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted the repeated source-first selection checkbox renderer into `SourceFirstSelectionCheckbox`, preserving the allocation and row spacing variants. Current size: 15,652 lines after the slice.
- `FormView.tsx` and `LineItemGroupQuestion.tsx`: extracted shared add-overlay copy resolution into `src/web/react/features/lineItems/domain/addOverlayCopy.ts` with focused unit tests. Current sizes after the slice: `FormView.tsx` 15,132 lines, `LineItemGroupQuestion.tsx` 15,639 lines.
- `FormView.tsx`: reused the shared line-item action button style helper and the shared data-source visibility key helpers instead of keeping local copies. Current size: 15,126 lines.

Tenth-pass results:

- `App.tsx`: extracted browser performance mark/measure utilities into `useAppPerfTools`, keeping all existing timing call sites unchanged.
- `App.tsx`: extracted the performance-only `__CK_PERF_OPEN_RECORD_BY_ID__` global bridge into `useAppPerfOpenRecordBridge`, leaving record selection behavior in the App shell. Current size: 16,268 lines.

Eleventh-pass results:

- `FormView.tsx`: extracted derived-value blur dependency parsing, line-item overlay-header completeness, config-entry collection, dedup message formatting, and synchronized mutable state refs into focused modules with unit coverage for the pure helpers. Current size: 14,956 lines.
- `LineItemGroupQuestion.tsx`: extracted source-first allocation row chrome and source-first data-source row shell components, leaving reservation/edit callbacks in the parent while moving layout concerns out. Current size: 15,544 lines.
- `App.tsx`: extracted navigation performance refs/effects into `useAppNavigationPerf`, keeping navigation-start decisions in the shell and moving completion measurement out. Current size: 16,246 lines.

Twelfth-pass results:

- `FormView.tsx`: extracted guided step/data-source visibility coordination into `useGuidedStepVisibility`, pure form group/page-section construction into `buildFormGroupSections`, and document-level blur side effects into `useFormBlurCoordinator`. Current size: 14,677 lines.
- `LineItemGroupQuestion.tsx`: extracted source-first compact sentence controls plus the source-first allocation list renderer into line-item feature components, keeping data loading and reservation persistence injected from the parent. Current size: 14,763 lines.
- `App.tsx`: extracted debug-mode and diagnostic logging policy into `useAppDiagnostics`. Current size: 16,232 lines.

Thirteenth-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first compact data-source actions and inline source-first data-source row rendering into focused line-item feature components, keeping reservation sync and overlay state callbacks injected from the parent. Current size: 14,355 lines.
- `FormView.tsx`: replaced the inline overlay-pill line-item completeness algorithm with the existing tested `isLineItemGroupQuestionComplete` helper, removing a duplicate business-rule copy from the renderer. Current size: 14,479 lines.
- `App.tsx`: extracted system action gate and copy-current-record dialog state into `useAppDialogState`, leaving the shell to wire the modal callbacks. Current size: 16,133 lines.

Fourteenth-pass results:

- `App.tsx`: extracted autosave notice storage/display lifecycle into `useAutoSaveNotice`, including ingredient-create readiness gating and dismiss persistence. Current size after the slice: 16,080 lines.
- `FormView.tsx`: extracted the line-item open-in-overlay pill into `LineItemGroupOverlayPill`, keeping warning and overlay callbacks injected from the parent. Current size: 14,419 lines.
- `App.tsx`: extracted read-only file overlay state, inline URL parsing, file-upload field lookup, and diagnostics into `useReadOnlyFilesOverlay`. Current size: 16,028 lines.

Fifteenth-pass results:

- `App.tsx`: extracted the button text-wrap DOM observer into `useButtonTextWrapObserver`, keeping the shell responsible only for supplying the current view and language. Current size: 16,002 lines.
- `FormView.tsx`: extracted top-level and nested line/subgroup FILE_UPLOAD renderers into `src/web/react/features/uploads/components`, keeping upload persistence, ordered-entry validation, file-overlay state, and diagnostics injected by the parent. Current size: 14,132 lines.
- `LineItemGroupQuestion.tsx`: extracted list-style, pill-style, and table-cell line upload renderers into the uploads feature layer, preserving read-only rendering, table value display, overlay opening, and mutation callbacks. Current size: 13,852 lines.
- Validation for the pass used targeted upload/line-item tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixteenth-pass results:

- `FormView.tsx`: extracted the table-cell upload open-overlay control into the uploads feature layer, so subgroup table renderers pass field/row context instead of owning upload button/read-only display logic. Current size: 14,093 lines.
- `App.tsx`: extracted autosave dedup configuration into `useAppAutoSaveDedupConfig`, including autosave trigger field normalization, dedup precheck rules, field-id maps, and dedup progress dialog copy. Current size: 15,973 lines.
- Validation for the pass used targeted upload/line-item and autosave/dedup tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventeenth-pass results:

- `LineItemGroupQuestion.tsx`: extracted the compact full-width line FILE_UPLOAD overlay button field into the uploads feature layer, keeping row mutation and overlay state injected by the parent. Current size: 13,826 lines.
- `App.tsx`: extracted ready-for-production unlock bootstrap/status configuration into `useReadyForProductionUnlockConfig`, keeping the unlock transition side effect in the shell. Current size after this slice: 15,940 lines.
- `App.tsx`: extracted status-transition label and automatic view-routing policy into `useAppStatusTransitions`, keeping record state and navigation effects in the shell. Current size after this slice: 15,910 lines.
- Validation for the pass used targeted upload/line-item and app status/autosave tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Eighteenth-pass results:

- `FormView.tsx`: extracted file overlay state, drag counters, upload announcements, upload failure retry state, and overlay open/close/staging helpers into `useFormUploadController`, keeping the actual upload persistence callbacks injected by the form. Current size: 13,689 lines.
- Validation for the pass used targeted upload/line-item tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Nineteenth-pass results:

- `FormView.tsx`: extracted the file overlay renderer and save/remove orchestration into `FormFileOverlay`, keeping form value mutation and upload APIs injected from the parent. Current size: 13,454 lines.
- Validation for the pass used targeted upload/line-item tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twentieth-pass results:

- `App.tsx`: extracted custom button visibility, placement, action validation, and open-url disabled-state derivation into `useAppCustomButtons`, keeping the execution handlers in the shell. Current size: 15,824 lines.
- Validation for the pass used focused App/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-first-pass results:

- `App.tsx`: extracted PDF, Markdown, and HTML report preview generation into `useAppReportPreviewActions`, keeping custom button dispatch and record action routing in the shell. Current size: 15,404 lines.
- Validation for the pass used focused App/report-preview/API transport tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-second-pass results:

- `App.tsx`: extracted submit confirmation/progress dialog selection, label resolution, and dialog-template interpolation into `useAppSubmitDialogConfig`, keeping submit execution in the shell. Current size: 15,224 lines.
- Validation for the pass used focused App/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted repeated read-only field chrome, overlay-open replace field chrome, and inline overlay-open action buttons into `LineItemFieldChrome`, keeping row mutation and overlay action policies injected by the parent. Current size: 13,618 lines.
- Validation for the pass used focused line-item/upload tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-fourth-pass results:

- `App.tsx`: extracted configured create-record-preset execution into `useCreateRecordPresetAction`, keeping preset value coercion, dedup precheck/list duplicate prompting, and new-record context reset outside the main shell. Current size: 15,140 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-fifth-pass results:

- `App.tsx`: extracted the blank create/submit-another flow into `useCreateNewRecordAction` and consolidated shared create-flow reset wiring between blank and preset create actions. Current size: 15,089 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-sixth-pass results:

- `App.tsx`: extracted the update-record custom button pipeline into `useUpdateRecordButtonAction`, including confirmation, dependency preview, busy-state handling, and mutation execution. Current size: 14,910 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-seventh-pass results:

- `App.tsx`: extracted copy-current-record orchestration into `useDuplicateCurrentRecordAction`, keeping profile/drop-field application, destructive-change bypasses, dedup precheck, and draft-id creation outside the main shell. Current size: 14,748 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-eighth-pass results:

- `FormView.tsx`: extracted top-level read-only field chrome and overlay-open button chrome into `TopFieldChrome`, keeping value mutation and overlay reset orchestration in `FormView`. Current size: 13,409 lines.
- Validation for the pass used focused form/upload/line-item tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Twenty-ninth-pass results:

- `App.tsx`: extracted `openUrlField` custom button execution into `useOpenUrlFieldAction`, leaving the custom button handler responsible for routing only. Current size: 14,727 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirtieth-pass results:

- `LineItemGroupQuestion.tsx`: reused the shared `LineItemReadOnlyField` component for nested subgroup read-only field chrome, removing another local read-only renderer copy. Current size: 13,611 lines.
- Validation for the pass used focused line-item/upload tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-first-pass results:

- `App.tsx`: extracted pending follow-up batch wait/timeout normalization into `usePendingFollowupBatchWait`, keeping submit/navigation callers wired to a focused hook. Current size: 14,675 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-second-pass results:

- `App.tsx`: extracted duplicate-check progress dialog state, timer cleanup, and visibility policy into `useDedupProgressDialog`. Current size: 14,621 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-third-pass results:

- `App.tsx`: extracted server-generated top value adoption into `useServerGeneratedTopValues`, keeping save/submit response value merging outside the main shell. Current size: 14,595 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-fourth-pass results:

- `FormView.tsx`: extracted top-level choice-control variant rendering and one-time diagnostics into `useChoiceControlRenderer`, keeping field wiring in `FormView`. Current size: 13,200 lines.
- Validation for the pass used focused choice/form-rendering tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-fifth-pass results:

- `App.tsx`: extracted active draft-save wait/timeout handling into `waitForActiveDraftSaveTransactionsAction`, keeping autosave refs wired by the shell. Current size: 14,553 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first row eligibility and empty-state projection into `buildSourceFirstPresentationEntries`, keeping rendering and state wiring in the component. Current size: 13,582 lines.
- Validation for the pass used focused line-item presentation/helper tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-seventh-pass results:

- `App.tsx`: extracted field-change dialog input projection into `buildFieldChangeDialogInputsAction`, keeping dialog lifecycle and pending-change state in the shell. Current size: 14,457 lines.
- Validation for the pass used focused App/autosave/report-preview/choice tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-eighth-pass results:

- `App.tsx`: extracted dedup key-change delete/recreate orchestration into `triggerDedupDeleteOnKeyChangeAction`, leaving the shell as the state-ref wiring point. Current size: 14,246 lines.
- Validation for the pass used focused App/autosave/report-preview tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Thirty-ninth-pass results:

- `FormView.tsx`: extracted sticky-header-aware group scrolling and iOS correction behavior into `scrollFormGroupToTop`, leaving the component responsible for scheduling scrolls and collapsed group state. Current size: 12,907 lines.
- Validation for the pass used focused form-rendering tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fortieth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source row decoration, visibility accounting, and parent-scoped filtering into `stepDataSourceRows`, leaving React callback wiring in the component. Current size: 13,516 lines.
- Validation for the pass used focused line-item presentation/helper tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-first-pass results:

- `FormView.tsx`: extracted blur-derived top-level and line-item value comparison into `formValueComparison`, leaving recompute orchestration in the component. Current size: 12,862 lines.
- Validation for the pass used focused form comparison/form-rendering tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-second-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided virtual row preset token resolution into `virtualPreset`, keeping source-row, parent-row, and top-level projection as a tested pure helper. Current size: 13,449 lines.
- Validation for the pass used focused virtual preset and line-item presentation/helper tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided virtual row visibility context and field-rule validation into `virtualRowContext`, keeping callback wiring in the component. Current size: 13,437 lines.
- Validation for the pass used focused virtual row context, virtual preset, and line-item presentation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-fourth-pass results:

- `App.tsx`: extracted uploaded field override projection for submission payloads into the uploads domain helper, leaving the shell to pass the current override map. Current size: 14,188 lines.
- Validation for the pass used focused upload override/merge and form comparison tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided virtual numeric max-field and integer-only rule checks into `virtualRowContext`, leaving numeric control wiring in the component. Current size: 13,416 lines.
- Validation for the pass used focused virtual row context, virtual preset, and line-item presentation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-sixth-pass results:

- `FormView.tsx`: extracted root line-item and subgroup overlay validation definition builders into `overlayValidationDefinition`, keeping overlay validation orchestration in the component. Current size: 12,843 lines.
- Validation for the pass used focused overlay validation, form comparison, and line-item form helper tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided reservation quantity derivation into `reservationQuantity`, keeping data-source and reservation state wiring in the component. Current size: 13,372 lines.
- Validation for the pass used focused reservation quantity, virtual row context, and line-item presentation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-eighth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided virtual data-source row value projection and optimistic availability max/display derivation into `virtualDataSourceRowValues`, keeping live reservation-state callbacks injected by the component. Current size: 13,229 lines.
- Validation for the pass used focused virtual data-source row value, reservation quantity, and line-item presentation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Forty-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source optimistic availability cache mutation into `stepDataSourceAvailability`, leaving the component responsible only for cache mutation and refresh tick wiring. Current size: 13,182 lines.
- Validation for the pass used focused step data-source availability, virtual data-source row value, and reservation quantity tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fiftieth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source draft-state transitions into `stepDataSourceDrafts`, keeping the component responsible for ref synchronization only when a draft map changes. Current size: 13,168 lines.
- Validation for the pass used focused step data-source draft, availability, and virtual data-source row value tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-first-pass results:

- `FormView.tsx`: extracted guided-step scoped definition construction into `guidedStepDefinition`, keeping `FormView` responsible for active-step state and deduped diagnostics only. Current size: 12,642 lines.
- Validation for the pass used focused guided-step definition, line-group config, and target-field tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-second-pass results:

- `FormView.tsx`: extracted guided-step ordered-entry question projection and clear-on-change field ordering into `guidedStepQuestionOrder`, keeping guided config traversal out of the component. Current size: 12,600 lines.
- Validation for the pass used focused guided-step question order, definition, and target-field tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-third-pass results:

- `FormView.tsx`: extracted guided-step selection gate resolution into `guidedNavigation`, keeping timer/ref cleanup and state mutation in the component. Current size: 12,576 lines.
- Validation for the pass used focused guided navigation and guided-step question-order tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source exclusive-selection output row removal into `stepDataSourceExclusiveSelection`, keeping row sync orchestration in the component. Current size: 13,149 lines.
- Validation for the pass used focused step data-source exclusive-selection, draft, and availability tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-fifth-pass results:

- `FormView.tsx`: extracted guided auto-advance state transition resolution into `guidedNavigation`, keeping timer scheduling, DOM focus checks, and step selection side effects in the component. Current size: 12,524 lines.
- Validation for the pass used focused guided navigation and guided-step question-order tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-sixth-pass results:

- `FormView.tsx`: extracted guided auto-advance text-entry focus deferral detection into `guidedNavigation`, keeping the retry timer and diagnostic emission in the component. Current size: 12,509 lines.
- Validation for the pass used focused guided navigation and guided-step question-order tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-seventh-pass results:

- `FormView.tsx`: extracted guided action-bar UI state derivation into `guidedUiState`, keeping the component responsible for publishing the state to the app shell. Current size: 12,482 lines.
- Validation for the pass used focused guided UI state and guided navigation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-eighth-pass results:

- `FormView.tsx`: extracted guided back-action gate resolution into `guidedNavigation`, keeping the component responsible for wiring the imperative back action ref and applying select/block outcomes. Current size: 12,483 lines.
- Validation for the pass used focused guided navigation and guided UI state tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Fifty-ninth-pass results:

- `FormView.tsx`: extracted blur-derived definition detection and dependency-id collection into the derived-values domain, and reused the same helper from `valueMaps` to remove a duplicate traversal. Current size: 12,448 lines.
- Validation for the pass used focused derived blur dependency tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixtieth-pass results:

- `FormView.tsx`: extracted paragraph-disclaimer synchronization calculations into the paragraph-disclaimer app domain, keeping the component responsible for scheduling syncs and applying React state updates. Current size: 12,405 lines.
- Validation for the pass used focused paragraph disclaimer tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-first-pass results:

- `FormView.tsx`: extracted top-level group progress calculation into a focused form helper, keeping auto-collapse effects in the component while moving required-field completeness rules out of the renderer. Current size: 12,369 lines.
- Validation for the pass used focused group progress tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-second-pass results:

- `FormView.tsx`: extracted pure group auto-collapse decisions into the group progress helper, keeping focus handling, diagnostics, state application, and scrolling in the component. Current size: 12,318 lines.
- Validation for the pass used focused group progress tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted nested row-flow group-config resolution into the line-items domain, keeping the renderer responsible for memoization and field lookup only. Current size: 13,106 lines.
- Validation for the pass used focused row-flow group config tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted active row-flow field-path parsing and field-type resolution into the row-flow group config helper. Current size: 13,093 lines.
- Validation for the pass used focused row-flow group config tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first data-source output group and reservation-state calculations into `stepDataSourceRows`, keeping the component responsible for callback wiring and refs. Current size: 13,066 lines.
- Validation for the pass used focused step data-source row tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted matched source-first output-row mutation and nested child-row projection into `stepDataSourceRows`, keeping the renderer responsible for rule matching and recomputation side effects. Current size: 13,039 lines.
- Validation for the pass used focused step data-source row tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted source-first nested preset normalization collection, signature generation, and line-item application into `stepDataSourceRows`, leaving the component effect responsible only for lifecycle gating and state dispatch. Current size: 12,931 lines.
- Validation for the pass used focused step data-source row tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-eighth-pass results:

- `LineItemGroupQuestion.tsx`: extracted auto-add desired-row calculation and generated-row reconciliation into the line-items domain, preserving the component's auto-add effects while moving row mutation rules out of the renderer. Current size: 12,771 lines.
- Validation for the pass used focused auto-add row tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Sixty-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted subgroup auto-add single-option anchor autofill target collection and line-item mutation into the auto-add row domain helper. Current size: 12,715 lines.
- Validation for the pass used focused auto-add row tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventieth-pass results:

- `LineItemGroupQuestion.tsx`: replaced duplicate overlay group-override merge logic with the shared line-item tree override helper. Current size: 12,666 lines.
- Validation for the pass used focused line-item tree tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-first-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow segment display formatting into a line-items domain helper, keeping the component responsible for callback wiring and rendering only. Current size: 12,625 lines.
- Validation for the pass used focused row-flow display value tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-second-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow overlay context-header formatting into the row-flow display helper, leaving the component responsible for passing field lookup and display callbacks. Current size: 12,566 lines.
- Validation for the pass used focused row-flow display value tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted visible row-flow output segment selection into the row-flow output visibility helper. Current size: 12,554 lines.
- Validation for the pass used focused row-flow output visibility tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow output segment type, layout, tone, text style, and spacer style resolution into the row-flow display helper. Current size: 12,540 lines.
- Validation for the pass used focused row-flow display value tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow prompt label splitting, layout flags, and action partitioning into a focused row-flow prompt presentation helper. Current size: 12,533 lines.
- Validation for the pass used focused row-flow prompt presentation and row-flow display value tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted flattened overlay field-list normalization, placement normalization, and single target-row/field resolution into a line-item overlay helper shared by the duplicated overlay render paths. Current size: 12,521 lines.
- Validation for the pass used focused overlay flattened field tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted compact row source lookup, item collection coercion, and compact action-entry mapping into a compact row helper, and removed an unused local compact width resolver. Current size: 12,411 lines.
- Validation for the pass used focused compact line-item row and compact layout tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-eighth-pass results:

- `FormView.tsx`: extracted guided question lookup, render-as-label target resolution, and context-header target filtering into guided target helpers. Current size: 12,309 lines.
- Validation for the pass used focused guided target and guided step question-order tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, and `npm run build`.

Seventy-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow prompt rendering and row-flow output segment rendering into `RowFlowPromptRenderer` and `RowFlowOutputSegmentsRenderer`, moving prompt layout/action partitioning and output segment edit/display chrome out of the parent. Current size: 11,793 lines.
- Validation for the pass used focused row-flow display, prompt presentation, and output visibility tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eightieth-pass results:

- `FormView.tsx`: centralized repeated `LineItemGroupQuestion` context wiring behind a shared builder, so standard, guided, subgroup-overlay, and line-item-overlay render paths now declare only their behavioral overrides. Current size: 12,013 lines.
- Validation for the pass used focused guided target, guided step question-order, and overlay validation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eighty-first-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow field control rendering into `RowFlowFieldRenderer`, moving choice, checkbox, number, date, paragraph, file-upload, and text controls into the line-items feature layer while the parent keeps row-flow orchestration. Current size: 11,531 lines.
- Validation for the pass used focused row-flow display, prompt presentation, and output visibility tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eighty-second-pass results:

- `FormView.tsx`: extracted guided line-group target rendering into `GuidedLineGroupTargetRenderer`, moving section chrome, helper delegation, overlay pill behavior, and inline line-group wiring into the steps feature layer. Current size: 11,931 lines.
- Validation for the pass used focused guided target, guided step question-order, and overlay validation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eighty-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow row orchestration into `RowFlowRowRenderer`, moving row prompt/output assembly, row-flow diagnostics, prompt target resolution, and row-flow field rendering out of the parent branch. Current size: 11,404 lines.
- Validation for the pass used focused row-flow display, prompt presentation, and output visibility tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eighty-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted group-scoped row-flow output action rendering into `RowFlowGroupOutputActions`, keeping the parent responsible for action-scope resolution and selected row-flow state only. Current size: 11,375 lines.
- Validation for the pass used focused row-flow display, prompt presentation, and output visibility tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.

Eighty-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted the complete non-row-flow table-mode branch into `LineItemTableModeRenderer`, moving table cell controls, warning legend, remove column, totals footer, and table toolbars into the line-items feature layer. Current size: 10,720 lines.
- Validation for the pass used focused line-item presentation and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Eighty-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted subgroup open-stack rendering into `SubgroupOpenStackRenderer`, moving subgroup completeness, expand-gate checks, progress-pill state, and open diagnostics into the line-items feature layer. Current size: 10,579 lines.
- Validation for the pass used focused line-item presentation, row-flow, and overlay validation tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Eighty-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted progressive row toggle/progress rendering into `LineItemRowTogglePill` and guided header/body field partitioning into `guidedHeaderLayout`, with focused unit tests for header row grouping and compact-summary filtering. Current size: 10,360 lines.
- Validation for the pass used `tests/web/react/guidedHeaderLayout.test.ts`, focused line-item and overlay tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Eighty-eighth-pass results:

- `LineItemGroupQuestion.tsx`: removed the duplicated flattened overlay field renderer from the ordinary row field path and reused the shared flattened overlay renderer already available in the row scope. Current size: 9,881 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Eighty-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted the shared flattened overlay field renderer into `LineItemOverlayFlattenedFieldsRenderer`, moving single-row target resolution, flattened field controls, reset warnings, upload/file overlay buttons, and render diagnostics into the line-items feature layer. Current size: 9,469 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninetieth-pass results:

- `LineItemGroupQuestion.tsx`: extracted the non-header line-item body field renderer into `LineItemBodyFieldRenderer`, moving choice, checkbox, upload, numeric, date, paragraph, overlay-open reset, subgroup-open trigger, and tooltip rendering out of the shell. Current size: 8,838 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-first-pass results:

- `LineItemGroupQuestion.tsx`: extracted the collapsed/expanded body-field section into `LineItemBodyFieldsSection`, moving the collapsed grid, paired-field layout, visibility filtering, and required-field completeness checks into the line-items feature layer. Current size: 8,777 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-second-pass results:

- `LineItemGroupQuestion.tsx`: extracted repeated section-selector chrome into `LineItemSectionSelectorControl`, covering subgroup header selectors, subgroup bottom-toolbar selectors, selector-overlay multi-add mode, and the parent bottom-toolbar selector. Current size: 8,674 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted subgroup add-row behavior into `LineItemSubgroupAddButton`, moving selector-required blocking, anchor option loading, single-option autofill, overlay add launch, and add-button chrome into the line-items feature layer. Current size: 8,539 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted subgroup header and bottom-toolbar chrome into `LineItemSubgroupHeader` and `LineItemSubgroupToolbar`, moving selector/add/totals placement and collapse-button rendering out of the parent shell. Current size: 8,475 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted subgroup table mode into `LineItemSubgroupTableRenderer`, moving column resolution, table cell controls, read-only display, file buttons, numeric validation, and remove-column behavior into the line-items feature layer. Current size: 8,084 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted non-table subgroup field controls into `LineItemSubgroupFieldRenderer`, moving choice, checkbox, file upload, numeric/date/paragraph/text controls, read-only display, tooltips, helper text, and field-level validation rendering out of the parent shell. Current size: 7,699 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted non-table subgroup row rendering into `LineItemSubgroupRowsRenderer`, moving standard row layout, compact-row composition, compact display mapping, compact actions, and paired-field fallback rendering into the line-items feature layer. Current size: 6,464 lines.
- Validation for the pass used focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-eighth-pass results:

- `LineItemGroupQuestion.tsx`: extracted group-level selector/add controls into `useLineItemGroupControls` and progressive attention auto-expand policy into `useLineItemAttentionAutoExpand`, moving selector-overlay diagnostics, add-row overlay launch, and row-attention navigation policy into line-item feature hooks. Current size: 5,941 lines.
- Validation for the pass used direct ESLint on touched files, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Ninety-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted standard-row inline subgroup orchestration into `LineItemInlineSubgroupsRenderer`, moving subgroup row ordering, selector-overlay diagnostics, selector/add controls, table/list mode switching, totals, and subgroup collapse chrome into the line-items feature layer. Current size: 5,579 lines.
- Validation for the pass used direct ESLint on touched files, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundredth-pass results:

- `LineItemGroupQuestion.tsx`: extracted parent line-item row rendering into `LineItemGroupRowsRenderer`, moving standard row layout, row-flow row delegation, overlay-open action handling, guided header/body partitioning, source-first inline data-source rows, and inline subgroup wiring into the line-items feature layer. Current size: 3,719 lines.
- Validation for the pass used direct ESLint on touched files, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-first-pass results:

- `LineItemGroupQuestion.tsx`: extracted automatic line-item row creation and subgroup anchor autofill into `useLineItemAutoAddEffects`, moving parent auto-add reconciliation, subgroup auto-add batching, option priming, value-map recomputation, and diagnostics into a line-items feature hook. Current size: 3,472 lines.
- Validation for the pass used direct ESLint on touched files, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-second-pass results:

- `LineItemGroupQuestion.tsx`: extracted hydrated-row selection-effect initialization into `useLineItemSelectionEffectInit` and moved the pure selection-effect init collector from `components/form` to `features/lineItems/domain`. Current size: 3,424 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-third-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source bootstrap/cache coordination into `useGuidedStepDataSourceState`, moving refresh scheduling, loading counters, bootstrap fetches, cache event handling, reservation draft queue flushing, source-first diagnostics, availability patching, and shared reservation refs into a line-items feature hook. Current size: 2,973 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-fourth-pass results:

- `LineItemGroupQuestion.tsx`: extracted group presentation state into `useLineItemGroupPresentationState`, moving warning-mode normalization, non-match warning filtering, table-field projection, totals splitting, toolbar visibility, and add-placement diagnostics into a line-items feature hook. Current size: 2,896 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-fifth-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow group output state into `useRowFlowGroupOutputState`, moving group-scoped output action resolution, synthetic group-row state, action-scope diagnostics, and output segment/action layout diagnostics into a line-items feature hook. Current size: 2,841 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-sixth-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow runtime state into `useRowFlowRuntimeState`, moving row-flow enablement, subgroup ids, action maps, parent-row maps, group/field config resolvers, active-field metadata, and per-row flow state into a line-items feature hook. Current size: 2,781 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-seventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted row-flow action orchestration into `useRowFlowActionController`, moving action execution, confirmation handling, overlay opening, prompt auto-actions, selector-overlay auto-open, row-flow display lookup, and overlay group override wiring into a line-items feature hook. Current size: 2,215 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-eighth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source reservation draft controls into `useStepDataSourceReservationDrafts`, moving deferred autosave holds, deferred timer cancellation, committed reservation seeding, staged draft patching, and pending deferred-change checks into a line-items feature hook. Current size: 2,037 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-ninth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source availability reconciliation into `useStepDataSourceAvailabilityReconciliation`, moving live availability event handling, stale source-row output cleanup, rejected-reservation rollback, and committed reservation snapshot updates into a line-items feature hook. Current size: 1,778 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-tenth-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided step data-source output synchronization into `useStepDataSourceOutputSync`, moving source-row output mutation, optimistic reservation availability updates, immediate/debounced reservation API sync, conflict rollback handling, and source-first ancestor value-map recomputation into a line-items feature hook. Current size: 1,112 lines.
- Validation for the pass used direct ESLint on touched files, selection-effect init tests, focused guided-header, line-item, overlay, and row-flow tests, `npm run lint:changed`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-eleventh-pass results:

- `LineItemGroupQuestion.tsx`: extracted guided data-source row projection into `useStepDataSourceRowProjection`, moving virtual row context, preset resolution, source-first presentation entries, supplemental-helper hiding, output-group lookup, reservation state lookup, and virtual numeric constraints into a line-items feature hook. Current size: 869 lines.
- Validation for the pass used direct ESLint on touched files, `npx tsc --noEmit --pretty false`, focused guided-header, line-item, overlay, row-flow, and selection-effect tests, `npm run lint:changed`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-twelfth-pass results:

- `FormView.tsx`: extracted guided-step content rendering into `GuidedContentRenderer`, moving guided header construction, target filtering/pairing, question/line-group target resolution, and line-group override diagnostics into the steps feature layer. Current size: 11,829 lines.
- Validation for the pass used direct ESLint on touched files, `npx tsc --noEmit --pretty false`, focused guided/line-item tests, `npm run lint:changed`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

One-hundred-thirteenth-pass results:

- `FormView.tsx`: extracted top-level question rendering into `topQuestionRenderer`, moving button, text/paragraph/number/date, choice, checkbox, file-upload, overlay-open, and line-item-group field branches out of the shell while keeping state mutation callbacks injected from `FormView`. Current size: 11,172 lines.
- Validation for the pass used direct ESLint on touched files, `npx tsc --noEmit --pretty false`, focused guided/line-item/form tests, `npm run lint:changed`, `git diff --check`, and `npm run build`.
- `App.tsx` was intentionally left untouched because the performance fix workstream is ongoing there.

Current large-file counts:

- `App.tsx`: 14,188 lines.
- `FormView.tsx`: 11,172 lines.
- `LineItemGroupQuestion.tsx`: 869 lines.

### Stage 3: Backend and Domain Separation Follow-through

Purpose: reduce pressure on `WebFormService.ts` and align Apps Script and Cloud Run around clearer domain/use-case boundaries.

Priority targets:

- `src/services/WebFormService.ts`
- `src/services/WebFormTemplate.ts`
- `src/services/webform/followup/*`
- `cloud-run/api/repositories/*`
- future shared use cases for Drive/Sheets and Firestore backends

Target structure:

- domain logic: pure functions and typed models
- application/use cases: record save, submit effects, follow-up action execution, analytics recompute, queue processing
- infrastructure adapters: Apps Script Spreadsheet/Drive/Mail services, Cloud Run Sheets/Drive/Gmail/Firestore clients
- config normalization and validation at boundaries

Candidate backend slices:

- Submission save use case shared conceptually between Apps Script and Cloud Run.
- Follow-up action planning vs execution adapters.
- Template render model and artifact persistence.
- Analytics recompute and queued export use cases.
- Data-source read normalization across Sheets and Firestore.

Validation, selected case by case:

- Unit tests for pure domain modules.
- Apps Script service tests for adapter behavior.
- Cloud Run API tests for repository/use-case behavior.
- Staging validation only for slices that affect runtime persistence, Drive artifacts, Gmail, scheduler, or production-like config.

Exit criteria:

- New backend logic is not embedded directly in monolithic service methods when a focused use case/module is practical.
- Apps Script and Cloud Run behavior remain aligned through tests.
- Firestore can be introduced as an adapter without rewriting frontend/business logic.

## Regression Strategy

Regression scope is selected per slice:

- Documentation-only: no runtime validation unless docs reveal a config/script issue.
- Pure domain extraction: focused unit tests and build.
- React feature extraction: focused React tests, then Playwright if the flow is user-visible.
- Transport/API changes: transport tests, Apps Script mode smoke, hybrid/Cloud Run RPC smoke when configured.
- Persistence or artifact changes: unit tests plus staging validation against the affected spreadsheet/folder.
- Scheduler/Gmail/Drive side effects: staging validation only when required env vars and permissions are present.

Baseline gates for code changes:

- `npm run lint:changed`
- `npm run build`
- focused tests for the touched area

Full gates for milestone completion:

- `npm test`
- staging deploy when appropriate
- manual or Playwright validation for affected critical flows

## Tracking

| Stage | Status | Notes |
| --- | --- | --- |
| Stage 0: Protect backend work | Complete | Backend parity work was checkpointed on `integration/uat7-backend-parity` before merging. |
| Stage 1: Merge and stabilize UAT 7 | Complete | `release/uat-7` was merged without transport restructuring. Unit/build gates, staging deploy, and targeted Meal Production smoke validation completed during the stabilization slices. |
| Stage 2: Frontend/business logic separation | Complete for current refactor pass | Slices extracted Home list cache behavior, upload completed-value projection, pure helper logic, data-source prefetch/cache coordination, record lifecycle/version-check helpers, upload queue coordination, guided step gates, line-item row/presentation helpers, and shared list/condition helpers into focused modules with targeted unit coverage. |
| Stage 2B: Component/hook decomposition | Complete | Added guided-step, line-item control/footer, app notice/header/chrome, and dedup dialog boundaries; final targeted validation and staging smoke completed for the phase. |
| Stage 2C: Stateful workflow decomposition | In progress | Extracted App viewport shell state, diagnostics, performance tools/bridge/navigation hooks, action-gate/action-bar hooks, autosave/dedup and status/unlock policy hooks, FormView overlay session/autosave-hold plus validation navigation/state-ref/visibility/blur/upload coordination, guided target resolution, guided line-group rendering, guided content rendering, and top-level question rendering, source-first allocation display/sorting/selection/list/upload renderers, row-flow runtime/prompt/output/field/row/action/render/output-state/action-controller renderers and hooks, line-item table/body-field/group-row rendering, guided data-source bootstrap/cache coordination, guided reservation draft controls, availability reconciliation, output synchronization, and row projection, line-item group presentation state, subgroup selector/add/table/field/row/open-stack/inline-subgroup rendering, group selector/add controls, automatic line-item row effects, hydrated-row selection-effect initialization, progressive attention auto-expand policy, guided row toggle/header layout, flattened overlay target helpers/rendering, and compact row source mapping with focused tests where practical. |
| Stage 3: Backend/domain separation follow-through | Complete for current refactor pass | Extracted Analytics queue/request helpers, follow-up action planning, template target collection, lifecycle rule evaluation, and Cloud Run scheduled-job guards into tested backend-domain modules while preserving Apps Script and Cloud Run adapters. |

## Open Questions

- Which staging validation flow should be mandatory after Stage 1: full Meal Production Playwright flow, manual record create/edit, or both.
- Whether Firestore support should wait until after Stage 3 or proceed in parallel once Drive/Sheets Cloud Run parity remains stable after the UAT 7 merge.
