# Community Kitchen – Initial Load Performance Solution Design

## 1. Goals & Non‑Goals

**Goals**
- Reduce perceived and actual time-to-first-UI when opening:
  - Recipe Form
  - Meal Production
  - Storage & Cleaning Checks
- Always render visible feedback within **1 second** of opening.
- Render an interactive UI shell quickly and load data **progressively**.
- Reduce synchronous work in `doGet()` and overall startup cost (frontend + Apps Script backend).
- Provide clear recovery paths (retry, error states) instead of leaving users on a blank screen.

**Non‑Goals**
- Full redesign of domain flows (recipes, production, checks).
- Deep UX rework beyond loading/initialization states.
- Changing Sheets data model.

---

## 2. Current Problem (Summary)

- Initial navigation to the app often shows a **blank or frozen screen for several seconds**.
- Behavior is consistent across all main apps; not tied to a single feature.
- Current startup is likely doing **expensive work in `doGet()`** (e.g. reading Sheets, building data structures) and/or **loading a large bundle**:
  - Current bundle size: `dist/Code.js -> raw 1407.5 kB, gzip 371.7 kB`.
- In a kitchen context, users assume the system is broken and close the tab, abandon tasks, or retry randomly.

---

## 3. Target Experience (User‑Facing)

### 3.1 Loading Feedback Behavior

**Within 1 second of app open** (ideally < 500ms):
- Show a full-screen **loading view** (or at minimum, app shell + prominent loading banner).
- Copy:
  - Title: `Loading…`
  - Message: `Please keep this page open. This may take a few seconds.`

**After 8 seconds of continuous loading**:
- Replace/extend message:
  - `Still loading… your connection may be slow. Don’t close the page.`

**After 10 seconds**:
- Display a primary **Retry** action.
- Retry should:
  - Re-run the data-loading sequence.
  - Avoid full browser reload when possible.

### 3.2 Progressive Shell + Data

- Initial navigation renders:
  - App header (title, main actions/navigation).
  - Skeleton placeholders for tables, forms, filters.
  - Global loading banner or spinner.
- Data for recipes, ingredients, checks, configuration is fetched **after** the shell is visible.
- For slow connections, user still perceives that the app is "there" and working.

---

## 4. High‑Level Architecture Changes

### 4.1 Frontend

- Introduce a **three-phase client state machine**:
  1. `bootstrapping` – JS bundle executing, initializing app, shell mounts with loading UI.
  2. `loadingData` – shell is visible, async data fetch in progress, skeletons rendered.
  3. `ready` / `error` – data available and UI interactive, or error state with retry.

- Extract a shared **`AppInitializer` / `Root` component** used by:
  - Recipe Form entry point.
  - Meal Production entry point.
  - Storage & Cleaning Checks entry point.

- Responsibilities of `AppInitializer`:
  - Render loading view immediately.
  - Start timers for 8s and 10s thresholds.
  - Kick off data loading via a dedicated client service.
  - Transition between states based on data-load outcome.

### 4.2 Backend (Apps Script `doGet()` and APIs)

- `doGet()` must return **minimal HTML + script tags** only:
  - Basic `<html>`/`<body>` with root `<div id="app">` and a **static inline shell placeholder** (optional) so users immediately see something even before JS hydration.
  - Script tag(s) referencing `dist/Code.js` and any chunk files.

- All **domain data** must be fetched via **Apps Script web APIs** after initial render:
  - E.g., `/api/config`, `/api/recipes`, `/api/meal-production`, `/api/checklists`.
- Heavy logic (Sheet reads, data shaping) is moved out of `doGet()` into these APIs.
- Use `CacheService` to cache configuration and reference data to limit Sheet reads and speed up responses.

---

## 5. Detailed Design – Frontend

### 5.1 State Machine & UX

Define a shared loading state machine (pseudo‑TypeScript):

```ts
export type AppPhase = 'bootstrapping' | 'loadingData' | 'ready' | 'error';

interface LoadingState {
  phase: AppPhase;
  startedAt: number;
  showSlowMessage: boolean; // >= 8s
  allowRetry: boolean;      // >= 10s or error
  errorMessage?: string;
}
```

`AppInitializer` behavior:

1. **Mount**
   - Initialize `state.phase = 'bootstrapping'`.
   - Immediately render loading screen (no data fetch yet).
   - `setTimeout` (or `setInterval`) to:
     - After 8s: `showSlowMessage = true`.
     - After 10s: `allowRetry = true` unless already `ready`.
2. **Start data loading**
   - Transition to `phase = 'loadingData'`.
   - Call `loadInitialData()` (see below).
3. **On success**
   - Hydrate global stores/context (recipes, config, etc.).
   - Set `phase = 'ready'` – render actual feature UI.
4. **On failure or timeout**
   - Set `phase = 'error'`, `allowRetry = true`, `errorMessage` with generic text.
   - Keep loading view but show error plus retry CTA.
5. **Retry**
   - Reset state (except maybe `startedAt` for analytics).
   - Re-run `loadInitialData()`.

### 5.2 Shared Loading Component

Create `src/components/LoadingScreen.tsx` (example):

- Props:
  - `showSlowMessage: boolean`.
  - `allowRetry: boolean`.
  - `onRetry?: () => void`.
  - `errorMessage?: string`.

- Behavior:
  - Always shows title `Loading…`.
  - Always shows: `Please keep this page open. This may take a few seconds.`
  - When `showSlowMessage` is true: append `Still loading… your connection may be slow. Don’t close the page.`
  - When `allowRetry` is true: show **Retry** button, wired to `onRetry`.
  - If `errorMessage` exists: show small error text below.

All three apps import and reuse this component.

### 5.3 App Shell First, Feature UI After

Each app entry (e.g., `src/entrypoints/recipes.tsx`) should:

- Render `AppInitializer` into `#app`.
- `AppInitializer`:
  - Always renders **header + skeleton** (app shell) first.
  - Shows `LoadingScreen` overlay while `phase !== 'ready'`.

Skeleton examples:
- Header bar with app title and main action buttons disabled.
- Table skeleton (grey rows) for Meal Production.
- Form skeleton for Recipes.

Skeletons can be implemented with a very light CSS-only approach to avoid extra runtime cost.

### 5.4 Data Loading Strategy

Introduce a **data loader** per app that exposes one main promise:

```ts
async function loadInitialData(): Promise<AppBootstrapData> {
  const configPromise = fetchJson('/api/config');
  const recipesPromise = isRecipesApp ? fetchJson('/api/recipes') : null;
  const checksPromise = isChecksApp ? fetchJson('/api/checklists') : null;
  const productionPromise = isProductionApp ? fetchJson('/api/meal-production') : null;

  const [config, recipes, checks, production] = await Promise.all([
    configPromise,
    recipesPromise,
    checksPromise,
    productionPromise,
  ]);

  return { config, recipes, checks, production };
}
```

Notes:
- Use `Promise.all` to parallelize API calls.
- Consider splitting **critical vs non‑critical** data:
  - Critical: minimal config + key entities needed to render first screen.
  - Non‑critical: secondary lists, rarely used options – can be lazy‑loaded after first interaction.

---

## 6. Detailed Design – Backend

### 6.1 `doGet()` Responsibilities (per recommendation 3)

`doGet()` for each web app should:

- Build a minimal HTML shell **without** reading Sheets:
  - Set basic `<title>` and meta tags.
  - Include root `<div id="app">` with a minimal, non‑JS loading message so users on very slow devices see something even before JS loads.
  - Include `<script>` tag(s) pointing to the compiled bundle and optional chunk files.
- Avoid:
  - Reading Google Sheets.
  - Building lists or performing heavy calculations.
  - Any logic that can be deferred to API endpoints.

If currently `doGet()` is returning a fully rendered HTML based on Sheets data, we will refactor so that:
- `doGet()` becomes a thin wrapper.
- All data logic moves to dedicated functions like `getConfig`, `getRecipes`, etc., exposed via web APIs.

### 6.2 Data API Endpoints

Define Apps Script web app endpoints (via `doPost(e)` with routing or separate scripts) such as:
- `GET /api/config`
- `GET /api/recipes`
- `GET /api/meal-production`
- `GET /api/checklists`

Implementation guidelines:
- Input: minimal parameters (e.g., kitchen id, date range) passed from client.
- Response shape optimized for UI; no heavy transformation on client side.
- Apply **`CacheService`** for read‑mostly reference data:
  - Caching keys by tenant/kitchen + resource type.
  - Cache TTL: e.g. 5–15 minutes for configs and reference lists.
- Read Sheets only when cache miss or cache is invalidated.

### 6.3 Error Handling & Retry Contract

API responses must be predictable so frontend can:
- Distinguish between "no data" vs "error".
- Show generic error message but know that retry is safe.

Standard response envelope:

```json
{
  "ok": true,
  "data": { /* ... */ }
}
```

or

```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong. Please try again."
  }
}
```

Frontend: when `ok === false` or network error:
- Set `phase = 'error'` and `allowRetry = true`.
- Use generic copy, avoid exposing low‑level errors.

---

## 7. Bundle Size Strategy & Targets

Current bundle:
- `dist/Code.js -> raw 1407.5 kB, gzip 371.7 kB`.

This is large for Apps Script web apps and contributes to slow **time-to-first-JS** execution, especially on low‑end devices and constrained networks.

### 7.1 Recommended Targets

For this type of internal web app with limited routes but performance‑sensitive context (kitchens):

- **Short term (this initiative)**
  - Target **gzip ≤ ~250 kB** for the initial bundle (≈ 25–35% reduction from 371.7 kB).
- **Medium term**
  - Target **gzip ≤ ~200 kB** for the initial bundle.

Raw size will naturally be ~3–4× the gzip size, but gzip is what primarily affects transfer time.

These are guidance values; the main KPI is user‑perceived TTFB/TTI rather than byte-perfect size, but shrinking bundle size will help significantly.

### 7.2 Tactics to Reduce Bundle Size

1. **Code‑split by app**
   - Ensure each entry point (Recipes, Meal Production, Checks) only loads code relevant to that app.
   - Use Webpack/Rollup code splitting or multiple bundles:
     - e.g., `recipes.js`, `mealProduction.js`, `checks.js`.
   - Shared utilities stay in a small `vendor`/`shared` chunk loaded on demand.

2. **Tree‑shaking and dead‑code elimination**
   - Ensure build is using production mode with tree‑shaking enabled.
   - Replace wildcard imports with scoped imports (e.g., `import debounce from 'lodash/debounce'` instead of `import _ from 'lodash'`).
   - Remove unused helpers / legacy code paths.

3. **Review UI libraries**
   - If a heavy component library is used, check if we can:
     - Import individual components instead of full bundle.
     - Replace heavy components with lighter custom ones for common cases.

4. **Avoid large static data in bundle**
   - If master data is embedded as JS constants, move them to Sheets or JSON served from backend.
   - Fetch them via APIs and cache client‑side instead.

5. **Minify and compress assets**
   - Compress SVGs and static images.
   - Use CSS instead of large icon fonts where possible.

6. **Analyze bundle**
   - Add a bundle analyzer (e.g., `webpack-bundle-analyzer`) to identify largest contributors.
   - Document a short report in `/docs/bundle-analysis.md` (optional but recommended).

---

## 8. Failure & Recovery Flows

### 8.1 Network Failure / API Error

- `loadInitialData()` catches fetch errors and returns a failure state.
- UI state:
  - Keep loading shell.
  - Show message like: `We couldn’t load the data. Please check your connection and try again.`
  - Show **Retry** button.
- **Retry** will re‑call `loadInitialData()`.

### 8.2 Long‑Running Load Without Explicit Error

- 8s timer triggers `showSlowMessage = true`.
- 10s timer enables `allowRetry = true`.
- Even if backend is still working, user has a recovery option.

### 8.3 Escalation UX (optional future work)

- If multiple retries fail, optionally:
  - Suggest user to contact support or supervisor.
  - Log a structured event for monitoring.

---

## 9. Implementation Plan & Phasing

### Phase 1 – Frontend Shell & Loading Experience

- [ ] Introduce `AppInitializer` and loading state machine.
- [ ] Implement shared `LoadingScreen` component with required copy.
- [ ] Render shell + skeletons for Recipes, Meal Production, Checks.
- [ ] Wire 8s/10s timers and Retry button (retry can initially just re-run the same data function; backend can remain as is during early testing).

### Phase 2 – Backend Refactor (`doGet()` + APIs)

- [ ] Refactor `doGet()` to minimal HTML shell only (no Sheet reads).
- [ ] Implement `/api/config`, `/api/recipes`, `/api/meal-production`, `/api/checklists`.
- [ ] Move existing Sheet/data logic to those APIs.
- [ ] Implement `CacheService` usage for reference data.

### Phase 3 – Bundle Size Optimization

- [ ] Enable/verify production mode and tree‑shaking.
- [ ] Implement per-app entrypoints and code splitting.
- [ ] Run bundle analysis and remove/replace heavy dependencies.
- [ ] Measure new bundle size (target: ≤ 250 kB gzip initial bundle).

### Phase 4 – Observability & Tuning (optional)

- [ ] Instrument basic timing metrics (e.g., log time from `doGet()` response to `ready` state).
- [ ] Tune cache TTLs and parallelization.
- [ ] UX polish based on user feedback from kitchens.

---

## 10. Open Questions / Decisions to Align On

1. **Exact routing & endpoints**
   - Preferred API shapes and versioning? (e.g., `/api/v1/config`).
2. **Where to store app‑level configuration**
   - Which parts go in Sheet vs hard‑coded config vs JSON blobs.
3. **Bundle targets per app**
   - Should we have different targets (e.g., Recipes allowed slightly bigger than Checks)?
4. **Analytics / logging**
   - Do we want to log load times (without PII) to monitor real‑world performance?

Once we align on this solution design, I can help derive a more concrete technical task breakdown (issues/PRs) per phase and app.
