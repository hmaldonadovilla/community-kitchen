#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

const DEFAULT_FORM_KEY = 'Config: Meal Production';
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_START_ROW = 2;
const DEFAULT_SAMPLE_LIMIT = 5;
const DEFAULT_MAX_BATCHES = 100;
const DEFAULT_TIMEOUT_MS = 180000;

const HELP = `
Run the datasource identity-field backfill through a deployed Apps Script web app.

Usage:
  npm run backfill:data-source-ids -- [options]

Safe dry-run:
  npm run backfill:data-source-ids -- --env staging --form-key "Config: Meal Production"

Commit after setting the matching Apps Script script property:
  CK_BACKFILL_DATA_SOURCE_IDS_TOKEN="..." \\
    npm run backfill:data-source-ids -- --env staging --commit --form-key "Config: Meal Production"

Options:
  --env <name>                       Load .env.deploy.<name> and target that deployment.
  --url <webAppUrl>                  Web app /exec URL. Overrides env-derived URL.
  --deployment-id <id>               Build the /exec URL from a deployment id.
  --form-key <key>                   Form config sheet key. Default: ${DEFAULT_FORM_KEY}
  --start-row <number>               First destination sheet row to scan. Default: ${DEFAULT_START_ROW}
  --batch-size <number>              Rows per Apps Script call. Default: ${DEFAULT_BATCH_SIZE}
  --max-batches <number>             Safety cap for batch loop. Default: ${DEFAULT_MAX_BATCHES}
  --source-max-rows <number>         Max datasource rows loaded by the server.
  --sample-limit <number>            Server sample rows per batch. Default: ${DEFAULT_SAMPLE_LIMIT}
  --commit                           Mutate records. Omitted means dry-run only.
  --token <value>                    Commit token. Otherwise reads CK_BACKFILL_DATA_SOURCE_IDS_TOKEN.
  --skip-preflight                   In commit mode, skip the dry-run preflight.
  --allow-unsafe-skips               Allow commit when preflight has ambiguous, invalid JSON, or missing source skips.
  --no-post-check                    Skip the post-commit dry-run verification.
  --no-audit                         Disable audit log rows for commit mode.
  --honor-status-allow-list          Honor datasource statusAllowList while matching legacy rows.
  --headful                          Run browser visibly.
  --timeout-ms <number>              Per Apps Script call timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                             Show this help.
`;

function camelCaseFlag(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    if (arg === '--help') {
      flags.help = true;
      continue;
    }
    if (arg.startsWith('--no-')) {
      flags[camelCaseFlag(arg.slice(5))] = false;
      continue;
    }
    const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s);
    const name = camelCaseFlag(rawName);
    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    i += 1;
  }
  return flags;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function detectSingleDeployEnv() {
  const names = fs.readdirSync(process.cwd())
    .map(name => /^\.env\.deploy\.([^.]+)$/.exec(name))
    .filter(Boolean)
    .map(match => match[1])
    .filter(name => name !== 'example');
  return names.length === 1 ? names[0] : '';
}

function loadEnvironment(flags) {
  let env = { ...process.env, ...parseEnvFile('.env.deploy') };
  const deployEnv = (
    flags.env ||
    env.DEPLOY_ENV ||
    env.CK_ENV ||
    env.CK_CONFIG_ENV ||
    detectSingleDeployEnv()
  ).toString().trim();
  if (deployEnv) {
    env = { ...env, ...parseEnvFile(`.env.deploy.${deployEnv}`) };
  }
  return { env, deployEnv };
}

function toPositiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function resolveWebAppUrl(flags, env) {
  if (flags.url) return flags.url.toString().trim();
  const deploymentId = (flags.deploymentId || env.CLASP_DEPLOYMENT_ID || '').toString().trim();
  if (deploymentId) {
    return `https://script.google.com/macros/s/${deploymentId}/exec`;
  }
  return (env.CK_APP_URL || env.CLASP_TARGET_WEB_APP_URL || '').toString().trim();
}

function buildOptions(config, dryRun, startRow) {
  const options = {
    dryRun,
    startRow,
    maxRows: config.batchSize,
    sampleLimit: config.sampleLimit
  };
  if (config.sourceMaxRows) options.sourceMaxRows = config.sourceMaxRows;
  if (config.logSheetName) options.logSheetName = config.logSheetName;
  if (config.honorStatusAllowList) options.honorStatusAllowList = true;
  if (!dryRun) {
    options.commitToken = config.token;
    options.writeAuditLog = config.writeAuditLog;
  }
  return options;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, error: `${label} timed out after ${ms}ms` }), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

async function findAppsScriptFrame(page) {
  const started = Date.now();
  while (Date.now() - started < 90000) {
    for (const frame of page.frames()) {
      const hasGoogleRun = await frame.evaluate(() => !!window.google?.script?.run).catch(() => false);
      if (hasGoogleRun) return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Could not find the Apps Script userHtmlFrame with google.script.run.');
}

async function runAppsScript(frame, timeoutMs, functionName, ...args) {
  return withTimeout(
    frame.evaluate(({ functionName: fnName, args: fnArgs }) => new Promise(resolve => {
      if (!window.google?.script?.run) {
        resolve({ ok: false, error: 'google.script.run is unavailable.' });
        return;
      }
      const runner = window.google.script.run
        .withSuccessHandler(value => resolve({ ok: true, value }))
        .withFailureHandler(error => resolve({ ok: false, error: error && (error.message || error.toString()) }));
      runner[fnName](...fnArgs);
    }), { functionName, args }),
    timeoutMs,
    functionName
  );
}

function addTotals(totals, result) {
  const keys = [
    'scannedRows',
    'changedRows',
    'fieldUpdates',
    'alreadyFilled',
    'skippedNoLegacyValue',
    'skippedNoMatch',
    'skippedAmbiguous',
    'skippedInvalidJson',
    'skippedMissingSource',
    'auditRows'
  ];
  for (const key of keys) {
    totals[key] = (totals[key] || 0) + Number(result?.[key] || 0);
  }
}

function formatBatch(phase, batchNumber, result) {
  return [
    `[${phase}] batch ${batchNumber}`,
    `rows ${result.startRow}-${result.endRow}`,
    `updates=${result.fieldUpdates}`,
    `changedRows=${result.changedRows}`,
    `noMatch=${result.skippedNoMatch}`,
    `ambiguous=${result.skippedAmbiguous}`,
    result.nextStartRow ? `next=${result.nextStartRow}` : 'done'
  ].join(' | ');
}

async function runPass(frame, config, dryRun, phase) {
  const totals = { batches: 0 };
  const samples = [];
  let startRow = config.startRow;
  for (let i = 0; i < config.maxBatches; i += 1) {
    const options = buildOptions(config, dryRun, startRow);
    const response = await runAppsScript(frame, config.timeoutMs, 'backfillDataSourceIds', config.formKey, options);
    if (!response.ok) {
      return { ok: false, error: response.error || 'Apps Script call failed.', totals, samples };
    }
    const result = response.value || {};
    totals.batches += 1;
    addTotals(totals, result);
    for (const sample of result.samples || []) {
      if (samples.length < config.sampleOutputLimit) samples.push(sample);
    }
    console.log(formatBatch(phase, totals.batches, result));
    if (result.done || !result.nextStartRow) {
      return { ok: true, totals, samples };
    }
    startRow = result.nextStartRow;
  }
  return {
    ok: false,
    error: `Stopped after ${config.maxBatches} batches without done=true.`,
    totals,
    samples
  };
}

function unsafeSkipCount(totals) {
  return Number(totals.skippedAmbiguous || 0) +
    Number(totals.skippedInvalidJson || 0) +
    Number(totals.skippedMissingSource || 0);
}

function printSummary(label, pass) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(pass.totals, null, 2));
  if (pass.samples.length) {
    console.log('Sample log entries:');
    console.log(JSON.stringify(pass.samples, null, 2));
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP.trim());
    return;
  }

  const { env, deployEnv } = loadEnvironment(flags);
  const config = {
    deployEnv,
    url: resolveWebAppUrl(flags, env),
    formKey: (flags.formKey || DEFAULT_FORM_KEY).toString(),
    startRow: toPositiveInteger(flags.startRow, DEFAULT_START_ROW, '--start-row'),
    batchSize: toPositiveInteger(flags.batchSize, DEFAULT_BATCH_SIZE, '--batch-size'),
    maxBatches: toPositiveInteger(flags.maxBatches, DEFAULT_MAX_BATCHES, '--max-batches'),
    sampleLimit: toPositiveInteger(flags.sampleLimit, DEFAULT_SAMPLE_LIMIT, '--sample-limit'),
    sampleOutputLimit: toPositiveInteger(flags.sampleOutputLimit, 10, '--sample-output-limit'),
    timeoutMs: toPositiveInteger(flags.timeoutMs, DEFAULT_TIMEOUT_MS, '--timeout-ms'),
    sourceMaxRows: flags.sourceMaxRows ? toPositiveInteger(flags.sourceMaxRows, 0, '--source-max-rows') : undefined,
    token: (flags.token || env.CK_BACKFILL_DATA_SOURCE_IDS_TOKEN || '').toString().trim(),
    commit: flags.commit === true,
    skipPreflight: flags.skipPreflight === true,
    postCheck: flags.postCheck !== false,
    writeAuditLog: flags.audit !== false,
    allowUnsafeSkips: flags.allowUnsafeSkips === true,
    honorStatusAllowList: flags.honorStatusAllowList === true,
    headful: flags.headful === true,
    logSheetName: flags.logSheetName ? flags.logSheetName.toString() : ''
  };

  if (!config.url) {
    throw new Error('Missing web app URL. Pass --url, --deployment-id, or configure CLASP_DEPLOYMENT_ID.');
  }
  if (config.commit && !config.token) {
    throw new Error('Commit mode requires --token or CK_BACKFILL_DATA_SOURCE_IDS_TOKEN.');
  }

  console.log(`Target: ${config.url}`);
  console.log(`Form: ${config.formKey}`);
  console.log(`Mode: ${config.commit ? 'commit' : 'dry-run'}`);
  if (config.deployEnv) console.log(`Environment: ${config.deployEnv}`);

  const browser = await chromium.launch({ headless: !config.headful });
  try {
    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(5000);
    const frame = await findAppsScriptFrame(page);

    if (!config.commit) {
      const dryRun = await runPass(frame, config, true, 'dry-run');
      if (!dryRun.ok) throw new Error(dryRun.error);
      printSummary('Dry-run totals', dryRun);
      return;
    }

    if (!config.skipPreflight) {
      const preflight = await runPass(frame, config, true, 'preflight');
      if (!preflight.ok) throw new Error(preflight.error);
      printSummary('Preflight totals', preflight);
      const unsafeSkips = unsafeSkipCount(preflight.totals);
      if (unsafeSkips > 0 && !config.allowUnsafeSkips) {
        throw new Error(
          `Preflight found ${unsafeSkips} unsafe skip(s). Resolve them or pass --allow-unsafe-skips.`
        );
      }
    }

    const commit = await runPass(frame, config, false, 'commit');
    if (!commit.ok) throw new Error(commit.error);
    printSummary('Commit totals', commit);

    if (config.postCheck) {
      const postCheck = await runPass(frame, config, true, 'post-check');
      if (!postCheck.ok) throw new Error(postCheck.error);
      printSummary('Post-check totals', postCheck);
      if (Number(postCheck.totals.fieldUpdates || 0) > 0) {
        throw new Error('Post-check still found fillable datasource identity fields.');
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(`[backfill:data-source-ids] ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});
