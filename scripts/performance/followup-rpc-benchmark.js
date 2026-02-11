#!/usr/bin/env node

/**
 * Compare legacy sequential follow-up RPC calls vs batched follow-up RPC call.
 *
 * This script creates temporary staging records and deletes them at the end.
 */

const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch (_) {
  console.error('Missing dependency: playwright. Install with `npm i -D playwright`.');
  process.exit(1);
}

const { chromium } = playwright;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const i = arg.indexOf('=');
    if (i < 0) out[arg.slice(2)] = true;
    else out[arg.slice(2, i)] = arg.slice(i + 1);
  }
  return out;
}

async function waitForAppFrame(page, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const frame of page.frames().filter(f => f !== page.mainFrame())) {
      try {
        await frame.waitForSelector('body', { timeout: 500 });
        const marker =
          (await frame.locator('text=Recent activity').first().isVisible().catch(() => false)) ||
          (await frame.locator('text=Loading…').first().isVisible().catch(() => false));
        if (marker) return frame;
      } catch (_) {
        // keep polling
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Timed out waiting for app frame.');
}

async function runAppsScript(frame, fnName, ...args) {
  return frame.evaluate(
    ({ fnName, args }) =>
      new Promise((resolve, reject) => {
        const runner = globalThis?.google?.script?.run;
        if (!runner || typeof runner.withSuccessHandler !== 'function') {
          reject(new Error('google.script.run unavailable in frame.'));
          return;
        }
        try {
          runner
            .withSuccessHandler(resolve)
            .withFailureHandler(err => {
              const msg = (err && (err.message || (err.toString && err.toString()))) || 'Apps Script call failed.';
              reject(new Error(String(msg)));
            })[fnName](...args);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }),
    { fnName, args }
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urlRaw = args.url;
  if (!urlRaw) {
    console.error('Usage: node scripts/performance/followup-rpc-benchmark.js --url="https://..." [--formKey="Config: Meal Production"] [--actions=CLOSE_RECORD,CLOSE_RECORD] [--output=perf-results/followup-benchmark.json]');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = new URL(urlRaw);
  } catch (_) {
    console.error('Invalid --url value.');
    process.exit(1);
  }

  const formKey = (args.formKey || 'Config: Meal Production').toString();
  const actions = String(args.actions || 'CLOSE_RECORD,CLOSE_RECORD')
    .split(',')
    .map(x => x.trim().toUpperCase())
    .filter(Boolean);
  const outputPath = path.resolve(args.output || 'perf-results/followup-rpc-benchmark.json');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();

  const created = [];
  try {
    await page.goto(parsed.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const frame = await waitForAppFrame(page);

    const createSeed = async (prefix) => {
      const cfg = await runAppsScript(frame, 'fetchFormConfig', formKey);
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const dedupKeys = Array.from(
        new Set((((cfg?.dedupRules || [])[0]?.keys || []).map(v => (v || '').toString())))
      ).filter(Boolean);
      const payload = { formKey, language: 'EN', id };

      for (const q of Array.isArray(cfg?.questions) ? cfg.questions : []) {
        const qid = (q?.id || '').toString();
        if (!qid || q?.type === 'BUTTON') continue;
        if (q?.type === 'LINE_ITEM_GROUP') {
          payload[qid] = [];
          continue;
        }
        if (q?.type === 'DATE' || /date/i.test(qid)) {
          payload[qid] = futureDate;
          continue;
        }
        if (dedupKeys.includes(qid)) {
          payload[qid] = `${prefix}-${qid}`;
          continue;
        }
        payload[qid] = `${prefix}-${qid}`;
      }
      payload.__ckPerfRunTag = prefix;

      const save = await runAppsScript(frame, 'saveSubmissionWithId', payload);
      if (!save?.success) throw new Error(`Seed save failed (${prefix}): ${(save?.message || 'unknown').toString()}`);
      created.push(id);
      return id;
    };

    const deleteSeed = async (id) => {
      await runAppsScript(frame, 'saveSubmissionWithId', {
        formKey,
        language: 'EN',
        __ckDeleteRecordId: id
      });
    };

    const seqId = await createSeed('PERFSEQ');
    const seqStart = Date.now();
    const seqResults = [];
    for (const action of actions) {
      const started = Date.now();
      const result = await runAppsScript(frame, 'triggerFollowupAction', formKey, seqId, action);
      seqResults.push({ action, durationMs: Date.now() - started, success: !!result?.success, message: result?.message || null });
    }
    const seqTotalMs = Date.now() - seqStart;

    const batchId = await createSeed('PERFBAT');
    const batchStart = Date.now();
    const batchResult = await runAppsScript(frame, 'triggerFollowupActions', formKey, batchId, actions);
    const batchTotalMs = Date.now() - batchStart;

    for (const id of created) {
      try {
        await deleteSeed(id);
      } catch (_) {
        // best-effort cleanup
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      url: parsed.href,
      formKey,
      actions,
      sequential: { totalMs: seqTotalMs, results: seqResults },
      batched: { totalMs: batchTotalMs, result: batchResult },
      savingMs: seqTotalMs - batchTotalMs,
      savingPct: seqTotalMs > 0 ? ((seqTotalMs - batchTotalMs) / seqTotalMs) * 100 : null
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('followup-rpc-benchmark failed:', err);
    process.exit(1);
  });
}
