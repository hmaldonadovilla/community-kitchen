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
  - Script tag(s) referencing the appropriate bundle(s), see Section 6.2.

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

Each app entry (e.g., `src/web/react/entrypoints/<app>.tsx`) should:

- Render `AppInitializer` into `#app`.
- `AppInitializer`:
- Always renders **header + skeleton** (app shell) first.
- Uses a single loading view (shell + card) until `phase === 'ready'` (no extra overlay swap).
  
**Maintainer note**: entrypoints are optional and can be **local‑only**. If you want app‑specific bundles without committing them, add files under `src/web/react/entrypoints` and ignore them locally via `.git/info/exclude`:

- `src/web/react/entrypoints/*`

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

`doGet()` for the Community Kitchen web app should:

- Keep using the **same published URL** (no change for testers).
- Interpret the existing **query parameters** to decide which form/app to render, e.g.:
  - `?page=recipes`
  - `?page=meal-production`
  - `?page=checks`

Behavior:
- Build a minimal HTML shell **without** reading Sheets:
  - Set basic `<title>` and meta tags.
  - Include root `<div id="app">` with a minimal, non‑JS loading message so users on very slow devices see something even before JS loads.
  - Depending on the `page` query parameter, include exactly **one** main bundle script:
    - `recipes.bundle.js` for `page=recipes`.
    - `mealProduction.bundle.js` for `page=meal-production`.
    - `checks.bundle.js` for `page=checks`.

Pseudo‑code:

```js
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'recipes';

  var template = HtmlService.createTemplateFromFile('index');
  template.page = page;
  return template.evaluate()
    .setTitle('Community Kitchen')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

In `index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <base target="_top" />
    <title>Community Kitchen</title>
  </head>
  <body>
    <div id="app">
      <!-- Minimal static placeholder -->
      <h1>Loading…</h1>
      <p>Please keep this page open. This may take a few seconds.</p>
    </div>

    <? if (page === 'recipes') { ?>
      <script src="<?= getRecipesBundleUrl() ?>"></script>
    <? } else if (page === 'meal-production') { ?>
      <script src="<?= getMealProductionBundleUrl() ?>"></script>
    <? } else if (page === 'checks') { ?>
      <script src="<?= getChecksBundleUrl() ?>"></script>
    <? } ?>
  </body>
</html>
```

`getRecipesBundleUrl()` / etc. can return the Apps Script‑served bundle URLs (e.g. from `ContentService`) as you do today, but split per app.

**Key point:** we keep **one deployment URL**, but load **different bundles** based on query parameters.

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

### 6.4 WebFormDefinition caching (server‑side)

To keep `doGet()` lean for production, we cache **form definitions** on the server:

- Cache location:
  - Apps Script `CacheService` + `DocumentProperties` (via `CacheEtagManager`).
- What is cached:
  - `WebFormDefinition` per form key (`Config: Recipes`, etc.), including
    - questions, options, visibility/validation rules, list view config, app header, steps, dedup rules.
  - **No submission data** (no responses rows, no per-record values).
- Cache key:
  - `DEF:${cacheVersion}:${formKey}` where `cacheVersion` is managed by `CacheEtagManager`.
- Lifetime:
  - Long‑lived; definitions stay cached until `cacheVersion` is bumped (e.g. by `createAllForms`) or TTL expires.
  - `CacheService` TTL set to ~24h for definitions; versioning is the primary invalidation mechanism.

Implementation outline (in `WebFormService`):

```ts
private getOrBuildDefinition(formKey?: string): WebFormDefinition {
  const keyBase = (formKey || '').toString().trim() || '__DEFAULT__';
  const formCacheKey = this.cacheManager.makeCacheKey('DEF', [keyBase]);
  const startedAt = Date.now();

  try {
    const cached = this.cacheManager.cacheGet<WebFormDefinition>(formCacheKey);
    if (cached) {
      debugLog('definition.cache.hit', { formKey: keyBase, elapsedMs: Date.now() - startedAt });
      return cached;
    }
  } catch (_) {
    // Fall through to build
  }

  const def = this.buildDefinition(formKey);
  try {
    this.cacheManager.cachePut(formCacheKey, def, 60 * 60 * 24); // 24h TTL
    debugLog('definition.cache.miss', {
      formKey: keyBase,
      title: def.title,
      questionCount: def.questions?.length || 0,
      elapsedMs: Date.now() - startedAt
    });
  } catch (_) {
    // Ignore cache write failures
  }
  return def;
}

public renderForm(formKey?: string, _params?: Record<string, any>): GoogleAppsScript.HTML.HtmlOutput {
  debugLog('renderForm.start', { requestedKey: formKey, mode: 'react' });
  const def = this.getOrBuildDefinition(formKey);
  const targetKey = formKey || def.title;
  const bootstrap = null; // list data fetched later via API/client
  const html = buildReactTemplate(def, targetKey, bootstrap);
  // ...
}
```

Bumping cache version (invalidating definitions) is handled by `WebFormService.invalidateServerCache`, which is already called from `FormGenerator.createAllForms` after `Create/Update All Forms` runs.

### 6.5 Definition warm‑up trigger

To avoid slow first hits after deployments, we provide a warm‑up entrypoint:

- `WebFormService.warmDefinitions()`:
  - Iterates over all forms from `Dashboard.getForms()`.
  - Calls `getOrBuildDefinition(form.configSheet || form.title)` to populate the definition cache.
- Exposed in `src/index.ts` as:

```ts
export function warmDefinitions(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const service = new WebFormService(ss);
  service.warmDefinitions();
}
```

Operations:
- Attach a **time‑based trigger** to `warmDefinitions` (e.g. nightly/hourly in production) so definitions are prebuilt at low‑traffic times.
- Run `Create/Update All Forms` when config changes; it:
  - Regenerates forms and updates dashboard app URLs.
  - Calls `WebFormService.invalidateServerCache('createAllForms')` to bump cache version and clear old definitions.
  - After this, the next scheduled `warmDefinitions` (or first request) rebuilds definitions under the new version.

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

1. **Code‑split by app via query params (no URL change)**
   - Keep the current deployment URL and query parameters that testers already use.
   - In the bundler, define separate entrypoints:
     - `recipes`: imports Recipes components, templates, and helpers.
     - `mealProduction`: imports Meal Production‑specific code.
     - `checks`: imports Storage & Cleaning Checks code.
   - Map `?page=...` to the right bundle in `index.html` as shown in Section 6.1.

2. **Tree‑shaking and dead‑code elimination**
   - Ensure build is using production mode with tree‑shaking enabled.
   - Replace wildcard imports with scoped imports (e.g., `import debounce from 'lodash/debounce'` instead of `import _ from 'lodash'`).
   - Remove unused helpers / legacy code paths.

3. **Review UI libraries and embedded templates**
   - Where possible, only import templates used by a given app into that app’s entrypoint.
   - If some templates are extremely large and rarely used, consider loading them via API instead of bundling.

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

- [x] Introduce `AppInitializer` (`Root`) and loading state machine.
- [x] Implement shared `LoadingScreen` component with required copy.
- [x] Render shell + skeleton entry (single loading view, no overlay swap).
- [x] Wire 8s/10s timers and Retry button (retry currently re-runs the boot state machine; next phases will hook real data reload).

### Phase 2 – Backend Refactor (`doGet()` + APIs + Definition Cache)

- [x] Stop server-side list/bootstrap prefetch in `doGet()` (no list pagination in `renderForm`).
- [x] Implement server-side `WebFormDefinition` caching via `CacheService` + `CacheEtagManager`.
- [x] Expose `warmDefinitions()` Apps Script entrypoint for scheduled warm-up.
- [ ] Implement `/api/config`, `/api/recipes`, `/api/meal-production`, `/api/checklists` for client-driven data loading.
- [ ] Move remaining heavy data reads from `doGet()` to those APIs.
- [ ] Implement `CacheService` usage for reference data in the new APIs.

### Phase 3 – Bundle Size Optimization

- [x] Enable/verify production mode and tree‑shaking.
- [x] Implement per-app entrypoints and code splitting driven by query params.
- [ ] Convert entrypoints into **real** per-app bundles (avoid importing the full app in each entry).
- [ ] Run bundle analysis and remove/replace heavy dependencies.
- [ ] Measure new bundle size (target: ≤ 250 kB gzip initial bundle).

### Phase 4 – Observability & Tuning (optional)

- [ ] Instrument basic timing metrics (e.g., log time from `doGet()` response to `ready` state).
- [ ] Tune cache TTLs and parallelization.
- [ ] UX polish based on user feedback from kitchens.

### Phase 5 – Next Steps to Improve LCP Further

- [ ] **Real per‑app splits**: entrypoints should import only the app flow they need, not `main`.
- [ ] **Lazy‑load heavy features**: list view, overlays (file/markdown/html previews), report rendering.
- [ ] **Reduce bootstrap payload**: defer non‑critical sections of `WebFormDefinition` (e.g., list view config) until after first paint.
- [ ] **Preload critical assets**: keep `preload` for the JS bundle; add `preconnect` to Apps Script + Drive if not already.
- [ ] **Cache bootstrap on the client**: session cache for definition + list metadata to skip redundant fetches.
- [ ] **Tighten render path**: minimize work before first paint (avoid heavy computations in initial React render).

---

## 10. Open Questions / Decisions to Align On

1. **Exact routing & endpoints**
   - Confirm final query parameter names / values for each app (e.g., `page=recipes`, `page=meal-production`, `page=checks`) so we align with current URLs.
2. **Where to store app‑level configuration**
   - Which parts go in Sheet vs hard‑coded config vs JSON blobs.
3. **Bundle targets per app**
   - Should we have different targets (e.g., Recipes allowed slightly bigger than Checks)?
4. **Analytics / logging**
   - Do we want to log load times (without PII) to monitor real‑world performance?

Once we align on this solution design, we can derive a concrete technical task breakdown (issues/PRs) per phase and per app.


---

## 11. Updated recommendations based on measurements & current implementation

This addendum consolidates the latest measurements (Lighthouse runs) and the implementation work already in place, and refines the initial-load solution design accordingly.

### 11.1 Observed performance (Recipes Config form)

Based on `perf-results/community-kitchen-recipes*.json`:

- **TTFB (time-to-first-byte)**
  - v1 (3 runs): avg ~3.75s (min ~2.53s, max ~5.67s).
  - v2 (10 runs): avg ~2.93s (min ~2.43s, max ~4.35s).
- **FCP/LCP/TTI**
  - FCP avg ~2.6–3.0s.
  - LCP/TTI avg ~2.6–3.3s.
- **Lighthouse performance score**
  - v1: ~0.81 avg.
  - v2: ~0.87 avg.

Interpretation:
- **TTFB dominates the overall latency**: most of the wait is before the first byte. Once HTML/JS arrives, the additional client work to FCP/LCP/TTI is relatively small (~200–400ms).
- The current client design (shell + list prefetch) is in a good place; further wins come primarily from:
  - Keeping backend bootstrap fast and well-cached.
  - Ensuring non-critical client work runs after the first screen is usable.

### 11.2 What is already implemented (and should be treated as baseline)

These elements in the original design are now **implemented** and should be treated as the baseline, not future work:

- **Paginated list fetch with progressive rendering**
  - The React client fetches list data via `fetchSortedBatch` with:
    - Configurable `pageSize` (capped at 50).
    - Aggregation across pages until `totalCount` or a fixed upper cap (currently ~200 items).
  - The **first page is rendered as soon as it arrives**, and additional pages are fetched in the background.
  - Result: above-the-fold list content appears early, while the rest of the list hydrates progressively.

- **Definition warm-up (`warmDefinitions`) scheduled hourly**
  - The `WebFormService.warmDefinitions()` Apps Script entrypoint is wired and scheduled as an hourly trigger in production.
  - This pre-populates form definitions in the server-side cache, reducing cold-start latency for definition building.

- **Sheet indexes for `formKey → row`**
  - `ConfigSheet` / related services already maintain an index from `formKey` (or config sheet name/title) to row number.
  - This avoids full-sheet scans on each request.

- **Summary and custom HTML templates fetched in the background**
  - The React client uses `renderSummaryHtmlTemplateApi` / `renderHtmlTemplateApi` and `renderBundledHtmlTemplateClient` in **background flows**:
    - Summary HTML is prefetched in `applyRecordSnapshot` once a record is opened.
    - HTML/button templates are cached client-side (`htmlRenderCache` / `htmlRenderInflight`).
  - These calls are intentionally **decoupled from the critical list-load path**.

These items should no longer be listed as "to-be-done" steps in implementation plans; instead, future work should focus on tuning and extending them.

### 11.3 Refined priorities for initial-load performance

Given the current state and metrics, the priorities are:

1. **Keep Apps Script bootstrap work small and well-cached**
   - `doGet` should remain a thin shell, relying on:
     - Definition cache + `warmDefinitions` for form metadata.
     - Dedicated data APIs (`fetchBootstrapContext`, `fetchSubmissionsSortedBatch`, etc.) for runtime data.
   - Action item: **verify that the `formKey → row` index itself is cached**, not rebuilt on every `getOrBuildDefinition()` or data API call.
     - If `ConfigSheet.getForms()` recomputes this mapping per request, move it into `CacheService` so repeated lookups are O(1) without fresh scans.

2. **Respect the existing progressive list fetch, but keep it bounded and non-blocking**
   - The current behavior (first page → render, then background pagination) matches the original design.
   - Tuning knobs:
     - For heavy forms like Config: Recipes, ensure `listView.pageSize` is modest (10–20) and the aggregated cap (currently 200) is sufficient but not excessive.
     - Consider a smaller cap for mobile (e.g. 100 items) if you observe client-side slowness on low-end devices.

3. **Ensure template prefetch is strictly background and parallel to list fetch**
   - In the current `App.tsx`, `prefetchTemplatesApi(formKey)` runs in a `useEffect` keyed only by `formKey`, which may fire very early.
   - Refined behavior (to keep first paint fast while still prefetching templates):
     - Trigger `prefetchTemplatesApi(formKey)` **only after**:
       - The first list page has rendered, and
       - The user is in a context where templates matter (`view` is `form` or `summary`).
     - Start template prefetch and any summary/custom HTML prefetch **in parallel** with ongoing background list pagination, but never as a hard precondition for showing the first page.

   This matches your intent: *"summary and custom html templates should be fetched but on the background, and in parallel to data fetch of 1st page of list view data"*.

### 11.4 Additional client-side optimizations consistent with current design

These refinements keep the architecture intact and focus on micro-optimizations that align with the existing implementation:

1. **Template prefetch gating**
   - Update the `prefetchTemplatesApi` effect in `App.tsx` to include `view` in the dependency list and gate prefetch to relevant views:
     - `view === 'form'` or `view === 'summary'`.
   - Defer execution slightly (e.g. `requestIdleCallback` or `setTimeout(1500)`) so it doesn’t compete with the very first paint.

2. **Summary HTML prefetch tuning**
   - Keep the current strategy (prefetch after `applyRecordSnapshot`), but:
     - Optionally short-circuit when `summaryViewEnabled === false`.
     - Consider skipping prefetch for very large records or forms where summary is rarely used, based on config.

3. **iOS viewport & layout effects**
   - The complex iOS zoom-stabilization and header/bottom measurement effects should:
     - Short-circuit early on desktop/non-iOS to avoid unnecessary work.
     - Optionally be guarded behind an experimental flag if you measure a meaningful impact on initial render.

4. **Data-source caching**
   - In addition to the in-memory Map in `dataSources.ts`, consider **optional persistence** (versioned `localStorage`) for stable data sources.
   - This does not change the initial-load design but can significantly reduce follow-up Apps Script calls and perceived latency when returning to a form.

### 11.5 Summary of what remains to be done

Taking into account the current codebase and the measured perf:

- **Done / baseline:**
  - Progressive paginated list fetch and first-page rendering.
  - `warmDefinitions` scheduled as an hourly trigger.
  - `formKey → row` index implemented.
  - Background fetching and caching of summary and custom HTML templates.

- **To refine:**
  1. Confirm and, if needed, cache the `formKey → row` index via `CacheService` to avoid recomputing it per request.
  2. Gate `prefetchTemplatesApi` and summary/HTML prefetch to **background, view-aware flows** so they never delay first paint of the list.
  3. Keep list prefetch caps and `pageSize` tuned to balance responsiveness vs. completeness, especially on mobile.
  4. Optionally extend client caches (data sources, list snapshots, HTML templates) with lightweight persistence to improve repeat loads.

These refinements sit on top of the solution design in Sections 3–10 and should be treated as incremental improvements rather than fundamental architectural changes.