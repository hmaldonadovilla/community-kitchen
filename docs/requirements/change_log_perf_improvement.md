# ListView table mode optimization

## Meal Production - Row-level actions

### Incomplete records with production date = today's date

- show icon ✏️ , remove the text label Edit.
- If production date is not today's date and status is incomplete, do not allow edit and do not show ✏️but show 👁  instead.

### Completed records

- show both icons 👁 and ⧉
- do not show the text label View and Copy. Both icons must appear in the same column, side by side. Do not add a column otherwise the line will be too long

### Icon legend (no training required for the user to understand the icons)

At the bottom of the Home page, display a simple legend:

- ✏️Edit (not allowed for past records)
- 👁 View
- ⧉ Copy order information

## Home page actions

### Replace Home page actions by these icon triggered actions in all other relevant forms

For Recipe Form:

- ✏️ Edit
- 👁 View
- ⧉ Copy

For Storage & Cleaning Checks:

- ✏️ Edit (not allowed for past record)
- 👁 View
- ⧉  Copy is not needed for Storage & Cleaning checks app and therefore the legend must not include ⧉ Copy icon.

## Implementation guidelines

- For list view lengends that have a lot of elements, define the legend section on two columns
- Create a setting to hide the header row of the list view table
- Perform configuration changes in the relevant files in the /docs/config/exports/staging folder
- Implement changes on the staging environment and test via playwright
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.

--

Pending tasks:

# You are a senior performance engineer and full-stack maintainer.

## Goal - Improve perceived and actual performance for

1) Home page load (time to first meaningful content)
2) Navigation back to Home
3) Submit / Activate actions

Primary target:
The goal is to decrease the TTFB time to under 2.5 seconds, on a mid-range Android phone and average 4G / Wi-Fi. It is really important to reduce the time that it takes to display records from the database. So users can search and use accurate data. We are willing to do very aggressive caching on elements that are reliant on frequent google sheet reads.

Important:
If <2.5s cannot be reached for a flow due to unavoidable network or platform constraints, you must:

- ⁠Propose a “best achievable” target
- ⁠Justify it with concrete measurements
- ⁠Provide a clear, realistic improvement plan

Non-negotiables:

- ⁠Do NOT change business logic, calculations, labels, workflows, or domain behavior.
- ⁠Do NOT change UX or layout beyond strictly performance-related adjustments (no redesign).
- ⁠Do NOT change database schemas unless absolutely required for performance.
  - If required, propose a minimal migration plan first.
- ⁠Do NOT add authentication or user accounts.
- ⁠Keep changes minimal, safe, and reversible.
- ⁠Prefer small, incremental changes over refactors.
- ⁠Every change must be measured before and after and tied to a specific bottleneck.

## What you must do (iterative loop until stable improvement):

### Baseline & instrumentation (mandatory first step)

1. Measure current performance for using the `lighthouse-runner.js` script:
   - Extend script measurements as needed to cover all relevant pages and actions.
   - Home page: TTFB, FCP/LCP, time-to-data, time-to-interactive
   - Back to Home: route transition time, data fetch time
   - Submit / Activate: tap → success feedback latency
   - All Lighthouse runs must use mobile emulation and throttling settings that approximate:
     - mid-tier mobile CPU
     - 4G network (and optionally a Wi‑Fi profile for comparison)
     - record and report the exact Lighthouse throttling configuration used.
2.⁠ ⁠Add lightweight instrumentation if missing:
   - performance.mark / performance.measure around:
     - data fetch
     - rendering
     - selectors / derived state
     - submit pipelines
   - Log timings to console in staging builds only.
   - Performance instrumentation is not a ‘new feature’; do not add UI-visible logs; console-only in staging.
3.⁠ ⁠Produce a concise “Performance Baseline” report including:
   - Metrics table (before)
   - Top 3–5 bottlenecks with evidence (network traces, timings, call paths)

### Fix strategy (apply in this priority order)

Work from highest impact / lowest risk:

1.⁠ ⁠Network & I/O
    - Remove redundant requests
    - Prevent refetch loops
    - Batch or parallelize safely
    - Cache aggressively where correct (ETag, memoized fetch, local cache)

2.⁠ ⁠Data shaping
    - Fetch only what Home actually needs
    - Avoid loading historical data unnecessarily
    - Prefer server-side filtering; otherwise cached client-side indexes

3.⁠ ⁠Rendering
    - Eliminate unnecessary re-renders
    - Stabilize props and keys
    - Memoize expensive computations
    - Virtualize long lists if applicable

4.⁠ ⁠Submit / Activate pipeline
    - Prevent *accidental* double submits during the same in-flight request (e.g., rapid double tap causing duplicate network calls).
    - Do not block intentional separate submissions after the first has completed.
    - Prefer idempotency on the request path over UX changes.

5.⁠ ⁠Photos
    - Ensure image handling does not block rendering
    - Avoid repeated blob reads
    - Compress or resize only if already required and safe

### Implement & validate (repeat per iteration)

For each iteration:
1.⁠ ⁠Make a small, focused change set
2.⁠ ⁠Deploy to staging
3.⁠ ⁠Run the test script simulating:
    - Open Home
    - Open a record
    - Navigate back to Home
    - Submit / Activate once
4.⁠ ⁠Collect and compare timings against baseline
5.⁠ ⁠Report:
    - Before / after metrics
    - What changed
    - Why it helped
    - Any risk or trade-off
6.⁠ ⁠If correctness or UX regresses, revert immediately and propose an alternative

### Output format (mandatory for each iteration)

- ⁠Findings
- ⁠Change set
- ⁠How to test
- ⁠Results
- ⁠Next step

Critical constraints:

- ⁠App is used by 1–2 users concurrently.
  Optimize for latency and perceived speed, not throughput.
- ⁠Prefer caching and incremental loading over aggressive recomputation.

### Implementation guidelines

- Proceed step by step.
- Do not jump to large refactors.
- Follow `.cursor/rules/dev_rules.mdc` and `.cursor/rules/style_guide.mdc` rules strictly.
- Implement and deploy changes on the staging environment and test via playwright
- Use the `lighthouse-runner.js` script to measure performance before and after each change.
- You are running autonomously and self-contained. You may not ask me for guidance on implementation choices. If and only if you are blocked by missing secrets/credentials/deployment IDs, stop and report exactly what is missing. Do not guess or regenerate deployment IDs/URLs.

## Implementation advice

### What usually causes 3.5s+ TTFB in this stack

#### Touching Sheets during the initial request (or on every Home bootstrap)

Calls into `SpreadsheetApp` / `getRange().getValues()` are slow relative to in-process JS, and Google explicitly recommends **minimizing calls to other services** and **batching reads/writes** because the service calls dominate runtime.

#### Multiple `google.script.run` calls

Even if your server functions are fast, each `google.script.run` round-trip has overhead. Community guidance puts published web-app latency per call roughly in the **400–1500ms** range depending on payload and complexity.
So if Home requires 3–5 calls (records + options + audit + …), you can easily burn ~1.2–7.5s just in RPC overhead.

#### Recomputing “indexes” from Sheets repeatedly

If you rebuild indexes or re-shape large datasets on every request, you’ll pay the Sheets read cost + the JS shaping/serialization cost every time.

---

### The highest-leverage pattern: “Revision + Conditional Payload” (accurate *and* fast)

You want aggressive caching **but** you also want users searching on accurate data.

The cleanest approach in Apps Script is to make *data freshness cheap to check*:

#### Core idea

1. Maintain a **monotonic data revision** (an integer) in `PropertiesService` (script-level).
2. Every time *your app* writes to any of the relevant tabs (forms output, index, audit), call `bumpDataRevision()`.
3. Add a lightweight `onEdit(e)` trigger (scoped to those tabs) to bump revision if humans edit directly in the spreadsheet (optional but recommended if manual edits happen).
4. Home bootstrap endpoint becomes:

**`getHomeBootstrap(clientRev)` →**

* if `clientRev === serverRev`: return `{ notModified: true, rev: serverRev }` quickly (no Sheets reads)
* else return `{ notModified: false, rev: serverRev, payload: … }` using server cache

This is basically an **ETag / If-None-Match** equivalent, but implemented inside Apps Script.

### Why this works well here

* “Is data current?” becomes **cheap** (read a script property).
* Heavy work (Sheets reads + shaping) only happens when revision changed *or* cache expired/evicted.
* Users can keep **accurate** local copies (IndexedDB/localStorage) keyed by `rev`, and only refresh when server rev changes.

---

### Aggressive server caching that’s safe in Apps Script

#### CacheService constraints you need to design around

* **Max value size per key: 100KB**
* Default expiration is **600s (10 minutes)**
* Expiration can be set up to **21600s (6 hours)** (best-effort; can be evicted sooner)
* Cache item cap: **1000 entries**

So for “records index” payloads that exceed 100KB, you need **chunking** (or you need to reduce the payload).

#### Recommended cache layout

Use `CacheService.getScriptCache()` (shared; good for 1–2 users) and key by revision:

* `home:rev:${rev}:meta` → `{ chunks: N }`
* `home:rev:${rev}:chunk:${i}` → string chunk i

Then:

* On read: load meta, then `getAll()` chunk keys, join, JSON.parse.
* On write: `putAll()` chunks + meta.

This stays within the 100KB limit.

---

### Make the “records index” small enough to be fast

If your goal is “display records quickly + search accurately”, the best compromise is:

#### Home should load a “search/list index”, not full records

For the Home list + search you usually only need:

* record id
* display title/name
* key searchable tokens/fields (maybe normalized)
* status
* updatedAt / createdAt
* maybe 1–2 secondary fields shown in the list

Then:

* when user opens a record, fetch full details for that one record.

This is **data shaping**, and it’s explicitly in your original fix priority order.

It reduces:

* Sheets read size (fewer columns)
* server JSON serialization time
* client parse + render time

---

### If you still need faster Sheets reads: consider Sheets API `values.batchGet`

If your current implementation relies heavily on `SpreadsheetApp.getRange().getValues()`, you can often shave time by switching reads to the **Advanced Sheets Service** (`Sheets.Spreadsheets.Values.batchGet`) and pulling multiple ranges/tabs in one call.

A well-known benchmark report found that for reading values, **Sheets API reduced process cost vs Spreadsheet service by ~35%** in their measurements (trend-level guidance, not a guarantee).

This is especially useful when Home currently reads:

* Index tab
* Audit tab (or last N)
* DataSource tab(s)
  …in separate SpreadsheetApp calls.

BatchGet can grab them together.

---

### Concrete blueprint you can hand to Codex

#### Single bootstrap call (reduce RPC overhead)

Aim for **one** call from client for Home data:

* records index
* datasources/options needed for rendering/search
* anything else required for initial screen

Because multiple `google.script.run` calls can easily stack into seconds.

#### Add revision tracking

Server-side:

```ts
const REV_KEY = 'DATA_REV';

function getDataRev_(): number {
  const props = PropertiesService.getScriptProperties();
  return Number(props.getProperty(REV_KEY) || '0');
}

function bumpDataRev_(): number {
  const props = PropertiesService.getScriptProperties();
  const next = getDataRev_() + 1;
  props.setProperty(REV_KEY, String(next));
  return next;
}
```

* Call `bumpDataRev_()` at the end of any write pipeline that affects records/options.

Optional but good if humans edit sheets:

* `onEdit(e)` checks edited sheet name; if it’s one of your DB tabs, call `bumpDataRev_()`.

### 3) Bootstrap endpoint with conditional payload

```ts
type BootstrapResponse =
  | { notModified: true; rev: number }
  | { notModified: false; rev: number; payload: HomePayload; cache: 'hit' | 'miss' };

function getHomeBootstrap(clientRev?: number): BootstrapResponse {
  const rev = getDataRev_();
  if (clientRev === rev) return { notModified: true, rev };

  const payload = getHomePayloadCached_(rev); // uses CacheService + chunking
  return { notModified: false, rev, payload, cache: payload.__cacheHit ? 'hit' : 'miss' };
}
```

#### CacheService chunking helper (because 100KB/key)

CacheService has strict per-key size limits.

Use chunking:

```ts
const CACHE_TTL_SEC = 600; // start with 10 minutes; can go higher up to 6h :contentReference[oaicite:7]{index=7}
const CHUNK_SIZE = 95 * 1024; // keep margin under 100KB

function cachePutLarge_(baseKey: string, value: string, ttlSec: number) {
  const cache = CacheService.getScriptCache();
  const chunks: Record<string, string> = {};
  let i = 0;

  for (let off = 0; off < value.length; off += CHUNK_SIZE) {
    chunks[`${baseKey}:chunk:${i}`] = value.slice(off, off + CHUNK_SIZE);
    i++;
  }
  chunks[`${baseKey}:meta`] = JSON.stringify({ chunks: i });

  cache.putAll(chunks, ttlSec);
}

function cacheGetLarge_(baseKey: string): string | null {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(`${baseKey}:meta`);
  if (!metaRaw) return null;

  const meta = JSON.parse(metaRaw) as { chunks: number };
  const keys = Array.from({ length: meta.chunks }, (_, i) => `${baseKey}:chunk:${i}`);
  const got = cache.getAll(keys);

  // If any chunk missing, treat as cache miss (eviction can happen). :contentReference[oaicite:8]{index=8}
  let out = '';
  for (const k of keys) {
    const part = got[k];
    if (!part) return null;
    out += part;
  }
  return out;
}
```

#### Stampede protection (LockService)

If cache misses happen, avoid 2 users recomputing simultaneously:

* Try lock
* Re-check cache after lock
* Compute once
* Store to cache
* Release lock

This keeps your “worst-case” bounded.

---

## A realistic performance target for this platform

Without seeing your traces, here’s what is *usually* achievable:

* If you eliminate Sheets reads from the critical path on repeat visits (revision matches) and keep it to **one** bootstrap call:

  * **Warm path** (cache hit + small payload): often **< 2s** end-to-end is realistic.
* If data changed and you must read/rebuild from Sheets:

  * **Cold/miss path** may still exceed 2s depending on sheet size and how many ranges you read.

Given Apps Script is a managed serverless-ish environment, you should plan targets by percentile, not just “best run”:

* **P50** (typical): aim **< 2.0s**
* **P95** (cold start / cache eviction / big sheet): you may need a “best achievable” target like **2.5–3.0s**, justified by timings.

---

### The first 3 changes I’d implement (highest impact, lowest risk)

1. **Collapse Home into a single server call**

   * Measure before/after.
   * This alone can save seconds if you currently do multiple `google.script.run`.

2. **Revision + conditional payload**

   * Avoid hitting Sheets when data didn’t change.
   * Preserves accuracy (assuming revision is bumped on all writes / edits).

3. **Cache the shaped “records index” keyed by revision**

   * Chunk if needed (100KB/key).
   * Lock to prevent stampede.
   * Only read minimal columns needed for list/search.

Then, if misses are still too slow:

* switch reads to `Sheets.Spreadsheets.Values.batchGet` and compare with your current SpreadsheetApp approach (often faster in practice).
