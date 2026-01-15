#!/usr/bin/env node

/**
 * Simple performance automation runner for Community Kitchen forms.
 *
 * Collects key Web Vitals using Lighthouse:
 *  - TTFB (approximated via server-response-time / time-to-first-byte)
 *  - FCP  (first-contentful-paint)
 *  - LCP  (largest-contentful-paint)
 *  - TTI  (interactive)
 *
 * Usage:
 *   node scripts/performance/lighthouse-runner.js \
 *     --url="https://script.google.com/macros/..." \
 *     --runs=3 \
 *     --output=./perf-results.json
 */

const fs = require('fs');
const path = require('path');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

/**
 * Very small CLI argument parser: --key=value → { key: value }
 */
function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eqIndex = arg.indexOf('=');
    let key;
    let value;

    if (eqIndex === -1) {
      // Flag without explicit value, e.g. "--verbose"
      key = arg.substring(2);
      value = true;
    } else {
      // "--key=value" → key: substring after "--" up to "=", value: everything after "="
      key = arg.substring(2, eqIndex);
      value = arg.substring(eqIndex + 1);
    }

    args[key] = value;
  }
  return args;
}

async function runLighthouseOnce(url, options = {}, config = null) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const lhOptions = {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
      ...options,
    };

    const runnerResult = await lighthouse(url, lhOptions, config);
    const lhr = runnerResult.lhr;

    const metrics = extractMetrics(lhr);
    return { metrics, rawLhr: lhr };
  } finally {
    await chrome.kill();
  }
}

/**
 * Extract key metrics from Lighthouse result.
 */
function extractMetrics(lhr) {
  const audits = lhr.audits;

  // Times are in milliseconds.
  const fcp = audits['first-contentful-paint']?.numericValue ?? null;
  const lcp = audits['largest-contentful-paint']?.numericValue ?? null;
  const tti = audits['interactive']?.numericValue ?? null;

  // TTFB approximations: Lighthouse exposes a few related audits.
  const serverResponseTime = audits['server-response-time']?.numericValue ?? null;
  const timeToFirstByte = audits['time-to-first-byte']?.numericValue ?? serverResponseTime;

  return {
    url: lhr.requestedUrl,
    fetchTime: lhr.fetchTime,
    performanceScore: lhr.categories?.performance?.score ?? null,
    ttfb: timeToFirstByte,
    serverResponseTime,
    fcp,
    lcp,
    tti,
  };
}

function summarizeMetrics(runs) {
  const fields = ['ttfb', 'serverResponseTime', 'fcp', 'lcp', 'tti', 'performanceScore'];
  const summary = {};

  for (const field of fields) {
    const values = runs
      .map((r) => r.metrics[field])
      .filter((v) => typeof v === 'number');

    if (!values.length) {
      summary[field] = null;
      continue;
    }

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    summary[field] = {
      avg,
      min,
      max,
      unit: field === 'performanceScore' ? '0-1' : 'ms',
    };
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = args.url || args.u;
  if (!url) {
    console.error('Usage: node scripts/performance/lighthouse-runner.js --url="<target-url>" [--runs=3] [--output=./perf-results.json]');
    process.exit(1);
  }

  const runsRaw = args.runs ?? '3';
  const runs = Number(runsRaw);
  if (!Number.isInteger(runs) || runs <= 0) {
    console.error(`Invalid value for --runs: "${runsRaw}". Expected a positive integer (e.g., --runs=3).`);
    process.exit(1);
  }
  const outputPath = args.output || null;

  console.log(`Running Lighthouse performance audit for: ${url}`);
  console.log(`Number of runs: ${runs}`);

  const allRuns = [];

  for (let i = 0; i < runs; i++) {
    console.log(`\n--- Run ${i + 1}/${runs} ---`);
    const { metrics } = await runLighthouseOnce(url);
    allRuns.push({ run: i + 1, metrics });

    console.log(`TTFB: ${metrics.ttfb} ms`);
    console.log(`FCP:  ${metrics.fcp} ms`);
    console.log(`LCP:  ${metrics.lcp} ms`);
    console.log(`TTI:  ${metrics.tti} ms`);
    console.log(`Perf score: ${metrics.performanceScore}`);
  }

  const summary = summarizeMetrics(allRuns);
  const result = { url, runs: allRuns, summary };

  if (outputPath) {
    const abs = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\nSaved detailed results to: ${abs}`);
  } else {
    console.log('\nSummary:');
    console.log(JSON.stringify(summary, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error running Lighthouse:', err);
    process.exit(1);
  });
}
