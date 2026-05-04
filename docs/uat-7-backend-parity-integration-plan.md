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
| Stage 1: Merge and stabilize UAT 7 | Code merged; validation in progress | `release/uat-7` was merged without transport restructuring. Unit/build gates are green; staging/manual or Playwright validation is still pending. |
| Stage 2: Frontend/business logic separation | Pending | Work in small feature slices with targeted tests. |
| Stage 3: Backend/domain separation follow-through | Pending | Align Apps Script and Cloud Run around use-case boundaries. |

## Open Questions

- Which staging validation flow should be mandatory after Stage 1: full Meal Production Playwright flow, manual record create/edit, or both.
- Whether Firestore support should wait until after Stage 3 or proceed in parallel once Drive/Sheets Cloud Run parity remains stable after the UAT 7 merge.
