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
