# Lighthouse performance runner (TTFB, FCP, LCP, TTI)

This document describes the `lighthouse-runner.js` helper used to collect web performance metrics for Community Kitchen forms (especially the Google Apps Script UIs like **Config: Recipes**).

## What it measures

The runner invokes Lighthouse programmatically and extracts a small, focused set of metrics from the `performance` category:

- **TTFB** – Time To First Byte<br/>
  Approximated via Lighthouse's `time-to-first-byte` / `server-response-time` audits.
- **FCP** – First Contentful Paint (`first-contentful-paint`)
- **LCP** – Largest Contentful Paint (`largest-contentful-paint`)
- **TTI** – Time To Interactive (`interactive`)
- **Performance score** – Lighthouse performance category score (0–1)

For each run it logs the raw values and then computes **avg / min / max** across multiple runs, which gives you a more stable view than a single measurement.

## Usage

From the repo root:

```bash
# First time only (if dependencies are not installed yet)
npm install

# Run Lighthouse against a specific URL
npm run perf:lighthouse -- \
  --url="https://script.google.com/macros/s/AKfycbwMWjWvXEeQLADuaEFq2hXUIn7IcU5lnd62WTFALTN7GnyHk4dIGEwGZl7eXEtZaIUJ/exec?app=recipes&form=Config:+Recipes" \
  --runs=3 \
  --output=./perf-results/community-kitchen-recipes.json
```

CLI options:

- `--url` (required): Target page to measure.
- `--runs` (optional, default `3`): Number of Lighthouse runs to perform (results are aggregated).
- `--output` (optional): Path to a JSON file with all runs and the aggregated summary.

Example console output per run:

```text
--- Run 1/3 ---
TTFB: 120 ms
FCP:  1800 ms
LCP:  2300 ms
TTI:  3500 ms
Perf score: 0.78
```

At the end, the script prints a JSON summary (avg/min/max per metric). When `--output` is provided, it writes a file like:

```json
{
  "url": "...",
  "runs": [
    { "run": 1, "metrics": { "ttfb": 120, "fcp": 1800, "lcp": 2300, "tti": 3500, "performanceScore": 0.78 } },
    { "run": 2, "metrics": { "ttfb": 130, "fcp": 1900, "lcp": 2400, "tti": 3600, "performanceScore": 0.79 } }
  ],
  "summary": {
    "ttfb": { "avg": 125, "min": 120, "max": 130, "unit": "ms" },
    "fcp":  { "avg": 1850, "min": 1800, "max": 1900, "unit": "ms" },
    "lcp":  { "avg": 2350, "min": 2300, "max": 2400, "unit": "ms" },
    "tti":  { "avg": 3550, "min": 3500, "max": 3600, "unit": "ms" },
    "performanceScore": { "avg": 0.785, "min": 0.78, "max": 0.79, "unit": "0-1" }
  }
}
```

## Chrome / environment requirements

The runner uses `chrome-launcher` under the hood, which expects a Chrome/Chromium executable to be installed and discoverable.

If your environment does not expose Chrome on the default path, set the `CHROME_PATH` environment variable:

```bash
export CHROME_PATH="/path/to/chrome"   # or chromium
npm run perf:lighthouse -- --url="..." --runs=3 --output=./perf-results/your-file.json
```

This script is intended for **local / CI performance investigations** only and has no impact on the shipped Apps Script bundles.

## Impact on application bundle

The extra NPM dependencies (`lighthouse`, `chrome-launcher`) are added under `devDependencies` and are only used by `scripts/performance/lighthouse-runner.js`.

- The build entrypoints for the deployed code remain:
  - `src/index.ts` → `dist/Code.js` (Apps Script backend)
  - `src/web/main.ts` → `dist/webform.js`
  - `src/web/react/main.tsx` → `dist/webform-react.js`
- None of these import `lighthouse` or `chrome-launcher`, so esbuild does **not** pull those packages into any of the app bundles.

Net effect:

- You get repeatable measurements for **TTFB, FCP, LCP, TTI** and performance score.
- Only `node_modules` / install time changes; the deployed Community Kitchen GAS code and bundle sizes remain unaffected.
