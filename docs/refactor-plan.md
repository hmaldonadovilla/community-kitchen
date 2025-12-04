# Web Form React Migration – Design and Implementation Plan

This plan keeps a single deployable `dist/Code.js` for Apps Script. We will prototype critical integrations, then refactor the backend for modularity, and finally swap in a React frontend.

## Goals

- Preserve current functionality (uploads, PDF generation, email, dedup, list/follow-up flows).
- Improve maintainability by modularizing backend logic and moving the web UI to React.
- Keep deployment unchanged: one bundled `Code.js` with the embedded web bundle.

## Constraints and Assumptions

- Runs in Apps Script HtmlService; bundle must be ES2019-compatible, IIFE/no dynamic imports.
- `google.script.run` is the bridge; file uploads must continue to flow through it.
- Drive/Docs/Gmail APIs remain the source for PDF/email features; scopes stay the same.
- Bundle size should stay reasonable for HtmlService (watch for inlined bundle growth).

## Phase 0: Prototype Critical Integrations

**Purpose:** De-risk core platform behaviors before large refactors.

- Build a minimal React page (single field + submit) bundled as IIFE and injected via HtmlService to validate:
  - `google.script.run` calls (submit, fetch) from React.
  - File upload path end-to-end.
  - PDF generation call + Drive write + Gmail send (stub button to trigger follow-up).
  - Reading/writing from Drive/Docs via server functions still works when invoked from React.
- Measure resulting bundle size and HtmlService rendering to ensure no blocking limits.
- Document findings and any required polyfills/shims.

## Phase 1: Backend Refactor (no UI change)

**Objective:** Slice `WebFormService` into cohesive modules with tests; keep existing template/UI.

- Create modules (names illustrative):
  - `definitionBuilder`: locate form, compute languages, build `WebFormDefinition`, list view config.
  - `dataSources`: fetch/paginate external sheets, projection/locale filtering, caching helpers.
  - `submissions`: destination sheet management, save with dedup, auto-increment, file handling.
  - `dedup`: rule parsing + conflict evaluation.
  - `records/listing`: list pagination, record fetch by id, caching/etag helpers.
  - `followup`: PDF generation, placeholder rendering, email send, status transitions.
  - `cache/etag`: cache keys, digesting, invalidation.
  - `uploads`: Drive folder resolution, blob conversion, validation.
  - `template`: thin wrapper that delegates to the web bundle (kept for now).
- Add focused Jest tests around the new modules (mock Apps Script services).
- Keep Apps Script entrypoints identical; `renderForm` still uses legacy template and bundle.
- Outcome: smaller files, clearer seams for the React UI to consume JSON endpoints.

## Phase 2: React Frontend Implementation

**Objective:** Replace the inlined legacy bundle with a React app that uses existing backend endpoints.

- Build a React entry (e.g., `src/web/react/main.tsx`) that:
  - Consumes `WebFormDefinition` JSON injected as `__WEB_FORM_DEF__`.
  - Renders form, list, summary, and follow-up views with state managed in React.
  - Reimplements behaviors: validation rules, filters/visibility, line items, totals, selection effects, dedup messaging, uploads.
  - Uses a small `api.ts` wrapper over `google.script.run` for submit, fetch submissions, fetch data sources, follow-up actions.
- Extract a shared form engine (validation, visibility, filters, selection effects, line-item totals/sync, data-source hydration) into framework-agnostic modules consumed by both legacy and React UIs.
- Revise `WebFormTemplate` to a minimal HTML shell (meta + root div + preload JSON + script tag for the bundled React IIFE). Styling moves to CSS/inline assets compiled into the bundle. React becomes the default; use `legacy=1` / `view=legacy` to force the classic iframe.
- React template injects `__WEB_FORM_DEF__`, `__WEB_FORM_KEY__`, and optional `__WEB_FORM_RECORD__` into `window` before loading the bundled IIFE (ES2019, no dynamic imports). Inline bundle is escaped/base64-safe for HtmlService.
- Continue bundling with esbuild to a single IIFE (`dist/webform.js`), embedded into `dist/Code.js` via the template step. A size budget gate now runs after every build (warn at ~1 MB, hard fail at ~1.2 MB gzipped) to catch HtmlService limits early.

**API contracts (React client ↔ Apps Script)**

- Transport: `google.script.run` with `withSuccessHandler/withFailureHandler`; all responses wrap `{ success: boolean; message?: string }`.
- Submit: `SubmissionPayload { formKey; language; values; id?; }` (uploads serialized as `{ name; type; dataUrl }[]`); result `{ success; message?; meta?: { id?; createdAt?; updatedAt? } }`.
- List: `ListRequest { formKey; projection?; pageSize?; pageToken? }`; `ListItem { id; createdAt?; updatedAt?; status?; pdfUrl?; [fieldId: string]: any }`; `ListResponse { items; nextPageToken?; totalCount?; etag? }`. Batch variant returns `{ list: ListResponse; records: Record<string, WebFormSubmission> }` for cache reuse.
- Data sources: `DataSourceRequest { source; locale?; projection?; limit?; pageToken? }`; `DataSourceResponse { items: any[]; nextPageToken?; totalCount? }`.
- Follow-up: `FollowupRequest { formKey; recordId; action: 'CREATE_PDF' | 'SEND_EMAIL' | 'CLOSE_RECORD' }`; `FollowupResult { success; message?; status?; pdfUrl?; fileId?; updatedAt? }`.
- Errors: failures always return `{ success: false, message }`; UI preserves prior state and surfaces the message. React list should honor `etag`/`records` to avoid refetch; invalidate on submit/follow-up.
- Continue bundling with esbuild to a single IIFE (`dist/webform.js`), embedded into `dist/Code.js` via the template step.

## Phase 3: Swap and Rollout

**Objective:** Ship React UI safely.

- Dual-boot controls: keep the query-param fallback (`legacy=1` / `view=legacy`) and/or a property flag while teams dogfood the React UI.
- Dogfood on non-critical forms; compare behavior and submissions for parity.
- Remove the legacy bundle entirely once parity is confirmed and we no longer rely on the fallback.

## Testing Strategy

- Unit tests: new backend modules (definition builder, dedup, data sources, placeholder rendering).
- Integration tests (Apps Script-mocked): submission save with dedup, auto-increment, follow-up status transitions, PDF/email placeholder substitution.
- Frontend tests: React component tests for validation, visibility/filtering, line-item totals, list view paging.
- Manual flows (per release): upload, PDF generation, email send, list/follow-up actions, multi-language labels.

## Risks and Mitigations

- **Bundle size/HtmlService limits:** Track bundle size; consider lightweight UI libs or splitting non-critical features; inline only what’s needed.
- **Upload handling in React:** Verify `File` serialization path in prototype; keep a tested bridge for `google.script.run`.
+- **Drive/Docs latency:** Keep caching/etag modules; avoid excessive reads in React flows.
- **Feature parity drift:** Dual-boot flag, side-by-side testing, and parity checklist per feature.

## Deliverables and Artifacts

- Single deployable `dist/Code.js` (unchanged deployment flow).
- New `/docs` plan (this file) and prototype notes.
- Refactored backend modules with tests.
- React bundle embedded via updated template, with a rollout flag.

## Milestones (high level)

1. Prototype completed; upload/PDF/email validated in React IIFE.
2. Backend modularized with tests; legacy UI still active.
3. React UI feature-complete; dual-boot enabled.
4. React default; legacy removed after parity sign-off.
