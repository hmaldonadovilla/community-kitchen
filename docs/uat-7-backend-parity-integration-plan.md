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

Current large-file counts:

- `App.tsx`: 15,224 lines.
- `FormView.tsx`: 13,454 lines.
- `LineItemGroupQuestion.tsx`: 13,826 lines.

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
| Stage 2C: Stateful workflow decomposition | In progress | Extracted App viewport shell state, diagnostics, performance tools/bridge/navigation hooks, action-gate/action-bar hooks, autosave/dedup and status/unlock policy hooks, FormView overlay session/autosave-hold plus validation navigation/state-ref/visibility/blur/upload coordination, and source-first allocation display/sorting/selection/list/upload renderers with focused tests where practical. |
| Stage 3: Backend/domain separation follow-through | Complete for current refactor pass | Extracted Analytics queue/request helpers, follow-up action planning, template target collection, lifecycle rule evaluation, and Cloud Run scheduled-job guards into tested backend-domain modules while preserving Apps Script and Cloud Run adapters. |

## Open Questions

- Which staging validation flow should be mandatory after Stage 1: full Meal Production Playwright flow, manual record create/edit, or both.
- Whether Firestore support should wait until after Stage 3 or proceed in parallel once Drive/Sheets Cloud Run parity remains stable after the UAT 7 merge.
