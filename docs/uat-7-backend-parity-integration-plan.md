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

Remaining decomposition opportunities:

- `LineItemGroupQuestion.tsx`: split guided compact row rendering, subgroup table rendering, overlay-open field rendering, and source-first allocation panels.
- `FormView.tsx`: split guided target rendering, line-item overlay/session controller, upload overlay controller, and validation/error navigation.
- `App.tsx`: split record load/save lifecycle, dedup dialog state, action/report orchestration, home/list cache orchestration, and guided reservation sync into hooks.

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
| Stage 2B: Component/hook decomposition | Complete for first pass | Extracted component/type/style/helper boundaries from `LineItemGroupQuestion.tsx`, `FormView.tsx`, and `App.tsx`; all three target files now have measured line-count reductions and focused validation coverage. |
| Stage 3: Backend/domain separation follow-through | Complete for current refactor pass | Extracted Analytics queue/request helpers, follow-up action planning, template target collection, lifecycle rule evaluation, and Cloud Run scheduled-job guards into tested backend-domain modules while preserving Apps Script and Cloud Run adapters. |

## Open Questions

- Which staging validation flow should be mandatory after Stage 1: full Meal Production Playwright flow, manual record create/edit, or both.
- Whether Firestore support should wait until after Stage 3 or proceed in parallel once Drive/Sheets Cloud Run parity remains stable after the UAT 7 merge.
