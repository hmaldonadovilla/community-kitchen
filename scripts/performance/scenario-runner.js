#!/usr/bin/env node

/**
 * Scenario performance runner for staged mobile UX flows.
 *
 * Flow per run:
 * 1) Load Home
 * 2) Seed one test record (clone existing row, unique id/date tag)
 * 3) Open first record
 * 4) Navigate back to Home
 * 5) Attempt Submit/Activate
 * 6) Delete all records created by this run (teardown)
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

const { chromium, devices } = playwright;

const PRESET_MOBILE_4G = {
  id: 'mobile-4g',
  description: 'Mid-tier Android + average 4G (simulated)',
  cdp: {
    latencyMs: 150,
    downloadKbps: 1600,
    uploadKbps: 750,
    cpuSlowdownMultiplier: 4,
    connectionType: 'cellular4g'
  }
};

const PRESET_MOBILE_WIFI = {
  id: 'mobile-wifi',
  description: 'Mid-tier Android + typical Wi-Fi (simulated)',
  cdp: {
    latencyMs: 40,
    downloadKbps: 10000,
    uploadKbps: 5000,
    cpuSlowdownMultiplier: 3,
    connectionType: 'wifi'
  }
};

const PRESETS = {
  [PRESET_MOBILE_4G.id]: PRESET_MOBILE_4G,
  [PRESET_MOBILE_WIFI.id]: PRESET_MOBILE_WIFI
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const i = arg.indexOf('=');
    if (i < 0) {
      out[arg.slice(2)] = true;
      continue;
    }
    out[arg.slice(2, i)] = arg.slice(i + 1);
  }
  return out;
}

function toPositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function msFromKbps(kbps) {
  return (kbps * 1024) / 8;
}

async function waitForAppFrame(page, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const main = page.mainFrame();
    const frames = page
      .frames()
      .sort((a, b) => {
        if (a === main) return 1;
        if (b === main) return -1;
        return b.url().length - a.url().length;
      });
    for (const candidate of frames) {
      try {
        await candidate.waitForSelector('body', { timeout: 500 });
        const looksLikeApp =
          (await candidate.locator('text=Recent activity').first().isVisible().catch(() => false)) ||
          (await candidate.locator('button:has-text("View")').first().isVisible().catch(() => false)) ||
          (await candidate.locator('button:has-text("Open menu")').first().isVisible().catch(() => false)) ||
          (await candidate.locator('text=Loading…').first().isVisible().catch(() => false)) ||
          (await candidate.locator('text=Loading...').first().isVisible().catch(() => false));
        if (looksLikeApp) return candidate;
      } catch (_) {
        // continue scanning
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Timed out waiting for app iframe.');
}

async function waitForHomeReady(frame, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready =
      (await frame.locator('button:has-text("View")').first().isVisible().catch(() => false)) ||
      (await frame.locator('button:has-text("Copy")').first().isVisible().catch(() => false)) ||
      (await frame.locator('table button').first().isVisible().catch(() => false)) ||
      (await frame.locator('text=Recent activity').first().isVisible().catch(() => false));
    if (ready) return;
    await frame.waitForTimeout(300);
  }
  throw new Error('Home list did not become ready in time.');
}

async function runAppsScript(frame, fnName, ...args) {
  const timeoutMs = 45000;
  let timeoutHandle;
  try {
    const rpcPromise = frame.evaluate(
      ({ fnName, args }) =>
        new Promise((resolve, reject) => {
          const runner = globalThis?.google?.script?.run;
          if (!runner || typeof runner.withSuccessHandler !== 'function') {
            reject(new Error('google.script.run unavailable in frame.'));
            return;
          }
          try {
            runner
              .withSuccessHandler((res) => resolve(res))
              .withFailureHandler((err) => {
                const msg = (err && (err.message || err.toString && err.toString())) || 'Apps Script call failed.';
                reject(new Error(String(msg)));
              })[fnName](...args);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }),
      { fnName, args }
    );

    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Apps Script RPC timed out after ${timeoutMs}ms: ${fnName}`));
      }, timeoutMs);
    });

    return await Promise.race([rpcPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function createConsoleCollector(page) {
  const events = [];
  page.on('console', async msg => {
    const args = [];
    for (const h of msg.args()) {
      try {
        args.push(await h.jsonValue());
      } catch (_) {
        args.push(null);
      }
    }
    events.push({
      ts: Date.now(),
      type: msg.type(),
      text: msg.text(),
      args
    });
  });
  return events;
}

function findPerfDuration(events, name) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const a0 = ev.args?.[0];
    const a1 = ev.args?.[1];
    const a2 = ev.args?.[2];
    if (a0 === '[ReactForm][perf]' && a1 === name && a2 && typeof a2.durationMs === 'number') {
      return Number(a2.durationMs);
    }
    if (typeof ev.text === 'string' && ev.text.includes(name)) {
      const m = ev.text.match(/durationMs[:=]\s*(\d+(?:\.\d+)?)/i);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function findPerfDurationFirst(events, name) {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const a0 = ev.args?.[0];
    const a1 = ev.args?.[1];
    const a2 = ev.args?.[2];
    if (a0 === '[ReactForm][perf]' && a1 === name && a2 && typeof a2.durationMs === 'number') {
      return Number(a2.durationMs);
    }
    if (typeof ev.text === 'string' && ev.text.includes(name)) {
      const m = ev.text.match(/durationMs[:=]\s*(\d+(?:\.\d+)?)/i);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function findRpcDuration(events, fnName, mode = 'last') {
  const picks = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const a0 = ev.args?.[0];
    const a1 = ev.args?.[1];
    const a2 = ev.args?.[2];
    if (a0 === '[ReactForm][perf]' && a1 === 'rpc' && a2 && a2.fnName === fnName && typeof a2.durationMs === 'number') {
      picks.push(Number(a2.durationMs));
    }
  }
  if (!picks.length) return null;
  return mode === 'first' ? picks[0] : picks[picks.length - 1];
}

function hasLogEvent(events, name) {
  return events.some(ev => {
    const a1 = ev.args?.[1];
    return a1 === name || (typeof ev.text === 'string' && ev.text.includes(name));
  });
}

function findReactEventPayload(events, name, mode = 'last') {
  const matches = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const a0 = ev.args?.[0];
    const a1 = ev.args?.[1];
    const a2 = ev.args?.[2];
    if (a0 === '[ReactForm]' && a1 === name) {
      matches.push({
        ts: ev.ts,
        payload: a2 && typeof a2 === 'object' ? a2 : null
      });
    }
  }
  if (!matches.length) return null;
  return mode === 'first' ? matches[0] : matches[matches.length - 1];
}

function findPerfEventTs(events, name, mode = 'last') {
  const matches = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const a0 = ev.args?.[0];
    const a1 = ev.args?.[1];
    if (a0 === '[ReactForm][perf]' && a1 === name) {
      matches.push(ev.ts);
    }
  }
  if (!matches.length) return null;
  return mode === 'first' ? matches[0] : matches[matches.length - 1];
}

async function waitForAnySelector(frame, selectors, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    await frame.waitForTimeout(200);
  }
  return null;
}

async function resolveVisibleActionButton(frame, selectors, timeoutMs = 12000, preferEnabled = true) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let fallback = null;
    for (const selector of selectors) {
      const locator = frame.locator(`${selector}:visible`);
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const candidate = locator.nth(i);
        const disabled = await candidate.isDisabled().catch(() => false);
        if (!disabled) return candidate;
        if (!fallback) fallback = candidate;
      }
    }
    if (!preferEnabled && fallback) return fallback;
    await frame.waitForTimeout(200);
  }
  return null;
}

async function collectActionButtons(frame) {
  return frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons
      .map(btn => ({
        text: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
        ariaLabel: (btn.getAttribute('aria-label') || '').trim(),
        title: (btn.getAttribute('title') || '').trim(),
        disabled: Boolean((btn).disabled || btn.getAttribute('aria-disabled') === 'true'),
        visible: !!(btn.offsetParent || btn.getClientRects().length),
      }))
      .filter(entry => entry.visible)
      .filter(entry => {
        const label = `${entry.text} ${entry.ariaLabel} ${entry.title}`.toLowerCase();
        return (
          label.includes('submit') ||
          label.includes('activate') ||
          label.includes('edit') ||
          label.includes('form') ||
          label.includes('yes')
        );
      })
      .slice(0, 30);
  });
}

async function clickDialogPrimary(frame) {
  return frame.evaluate(() => {
    const textOf = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const isVisible = node => !!(node && (node.offsetParent || node.getClientRects?.().length));
    const isDisabled = node => !!(node?.disabled || node?.getAttribute?.('aria-disabled') === 'true');
    const isCancelLike = text => /(cancel|annuler|annuleren|close|fermer|sluiten|back|retour)/i.test(text || '');

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .ck-confirm, .ck-dialog'));
    for (const dialog of dialogs) {
      const buttons = Array.from(dialog.querySelectorAll('button')).filter(btn => isVisible(btn) && !isDisabled(btn));
      if (!buttons.length) continue;
      const preferred = buttons.find(btn => !isCancelLike(textOf(btn))) || buttons[buttons.length - 1];
      if (!preferred) continue;
      preferred.click();
      return textOf(preferred) || 'clicked';
    }
    return null;
  });
}

async function clickSubmitConfirmationIfPresent(frame) {
  const confirmSelectors = [
    '[role="dialog"] button:has-text("Yes, activate")',
    '[role="dialog"] button:has-text("Yes, submit")',
    '[role="dialog"] button:has-text("Confirm")',
    '[role="dialog"] button:has-text("Submit")',
    '[role="dialog"] button:has-text("Activate")',
    '[role="dialog"] button:has-text("OK")',
    '[role="dialog"] button:has-text("Continue")',
    'button:has-text("Yes, activate")',
    'button:has-text("Yes, submit")',
    'button:has-text("Confirm")',
    'button:has-text("OK")'
  ];
  const confirmBtn = await resolveVisibleActionButton(frame, confirmSelectors, 6000, true);
  if (confirmBtn) {
    await confirmBtn.click({ timeout: 5000 });
    return true;
  }
  const clicked = await clickDialogPrimary(frame).catch(() => null);
  return Boolean(clicked);
}

async function dismissBlockingDialogs(frame) {
  const closeSelectors = [
    'button[aria-label="Close dialog"]',
    'button[title="Close"]',
    '[role="dialog"] button:has-text("Close")',
    '[role="dialog"] button:has-text("Fermer")',
    '[role="dialog"] button:has-text("Sluiten")',
    '[role="dialog"] button:has-text("OK")'
  ];
  let dismissed = 0;
  for (let i = 0; i < 3; i += 1) {
    let clicked = false;
    for (const selector of closeSelectors) {
      const btn = await resolveVisibleActionButton(frame, [selector], 500, false);
      if (!btn) continue;
      await btn.click({ timeout: 2000 }).catch(() => {});
      clicked = true;
      dismissed += 1;
      await frame.waitForTimeout(120);
      break;
    }
    if (!clicked) break;
  }
  return dismissed;
}

async function clickWithOverlayRecovery(frame, locator, timeout = 5000) {
  try {
    await locator.click({ timeout });
    return;
  } catch (_) {
    await dismissBlockingDialogs(frame).catch(() => 0);
    await frame.waitForTimeout(150);
    await locator.click({ timeout, force: true });
  }
}

async function openRecordByPerfHook(frame, recordId, openView = 'form', timeoutMs = 22000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await frame
      .evaluate(
        ({ recordId, openView }) => {
          const fn = globalThis?.__CK_PERF_OPEN_RECORD_BY_ID__;
          if (typeof fn !== 'function') return { ok: false, reason: 'hookMissing' };
          try {
            const ok = !!fn(recordId, openView);
            return { ok, reason: ok ? 'opened' : 'recordNotFound' };
          } catch (err) {
            return {
              ok: false,
              reason: (err && (err.message || (err.toString && err.toString()))) || 'hookError',
            };
          }
        },
        { recordId, openView }
      )
      .catch(() => ({ ok: false, reason: 'evalFailed' }));
    if (result?.ok) return result;
    await frame.waitForTimeout(350);
  }
  return { ok: false, reason: 'timeout' };
}

async function autoFillEditableFields(frame, mode = 'emptyOnly') {
  return frame.evaluate(({ mode }) => {
    const now = new Date();
    const yyyy = String(now.getFullYear()).padStart(4, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const shouldFill = (value) => mode === 'force' || value === undefined || value === null || `${value}`.trim() === '';

    let touched = 0;

    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    const radioTouched = new Set();
    for (const el of inputs) {
      const tag = (el.tagName || '').toLowerCase();
      const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.readOnly);
      if (disabled) continue;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') continue;

      if (tag === 'select') {
        const select = el;
        if (!select.options || !select.options.length) continue;
        if (!shouldFill(select.value)) continue;
        const option = Array.from(select.options).find(opt => !opt.disabled && `${opt.value || ''}`.trim() !== '');
        if (!option) continue;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (type === 'radio') {
        const name = el.getAttribute('name') || '__default__';
        if (radioTouched.has(name)) continue;
        radioTouched.add(name);
        const escapeName = (() => {
          try {
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(name);
          } catch (_) {
            // ignore
          }
          return name.replace(/["\\]/g, '\\$&');
        })();
        const group = Array.from(document.querySelectorAll(`input[type="radio"][name="${escapeName}"]`)).filter(r => !r.disabled);
        const checked = group.some(r => r.checked);
        if (checked && mode !== 'force') continue;
        const target = group.find(r => !r.disabled) || group[0];
        if (!target) continue;
        target.checked = true;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (type === 'checkbox') {
        if ((el.checked && mode !== 'force')) continue;
        if (mode === 'emptyOnly' && el.checked) continue;
        el.checked = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (tag === 'textarea') {
        if (!shouldFill(el.value)) continue;
        el.value = 'perf';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (type === 'date') {
        if (!shouldFill(el.value)) continue;
        el.value = today;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (['number', 'range'].includes(type)) {
        if (!shouldFill(el.value)) continue;
        el.value = '1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        touched += 1;
        continue;
      }

      if (!shouldFill(el.value)) continue;
      el.value = 'perf';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      touched += 1;
    }
    return { touched };
  }, { mode });
}

async function applyThrottling(context, page, preset) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: preset.cdp.latencyMs,
    downloadThroughput: msFromKbps(preset.cdp.downloadKbps),
    uploadThroughput: msFromKbps(preset.cdp.uploadKbps),
    connectionType: preset.cdp.connectionType
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: preset.cdp.cpuSlowdownMultiplier });
  return session;
}

function withFormQuery(urlRaw, formKey) {
  const parsed = new URL(urlRaw);
  const form = (formKey || '').toString().trim();
  if (form) parsed.searchParams.set('form', form);
  return parsed.toString();
}

async function runScenarioOnce({ url, formKey, preset, cleanup = true }) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  const page = await context.newPage();
  const consoleEvents = createConsoleCollector(page);
  const createdRecordIds = [];

  try {
    console.log('[scenario] open target url');
    const targetUrl = withFormQuery(url, formKey);
    await applyThrottling(context, page, preset);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

    console.log('[scenario] wait for home frame and readiness');
    let frame = await waitForAppFrame(page);
    await waitForHomeReady(frame, 90000);
    console.log('[scenario] load config and seed template');
    const formConfig = await runAppsScript(frame, 'fetchFormConfig', formKey).catch(() => null);
    const defaultSortFieldId = ((((formConfig || {}).definition || {}).listView || {}).defaultSort || {}).fieldId || '';
    const defaultSortDirection = (((((formConfig || {}).definition || {}).listView || {}).defaultSort || {}).direction || 'desc')
      .toString()
      .trim()
      .toLowerCase();
    const dedupKeys = Array.from(new Set(((formConfig || {}).dedupRules || []).flatMap(rule => (rule?.keys || []).map(v => (v || '').toString()))))
      .map(v => v.trim())
      .filter(Boolean);
    const statusFieldId = ((((formConfig || {}).form || {}).followupConfig || {}).statusFieldId || '').toString().trim();
    const openStatus =
      (((((formConfig || {}).form || {}).autoSave || {}).status ??
        (((((formConfig || {}).form || {}).followupConfig || {}).statusTransitions || {}).inProgress) ??
        'In progress')
        .toString()
        .trim()) || 'In progress';
    const questionById = new Map(
      Array.isArray(formConfig?.questions) ? formConfig.questions.map(q => [(q?.id || '').toString(), (q?.type || '').toString().toUpperCase()]) : []
    );

    const runTag = `perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdId = `PERF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const todayDate = new Date().toISOString().slice(0, 10);
    const applySortBias = target => {
      const sortField = (defaultSortFieldId || '').toString().trim();
      if (!sortField) return;
      const qType = (questionById.get(sortField) || '').toUpperCase();
      const desc = defaultSortDirection !== 'asc';
      if (qType === 'DATE' || qType === 'DATETIME' || /date/i.test(sortField)) {
        // Keep today's date to preserve form-editability scenarios for submit metrics.
        return;
      }
      if (qType === 'NUMBER' || qType === 'INTEGER' || qType === 'DECIMAL') {
        target[sortField] = desc ? '999999999' : '-999999999';
        return;
      }
      target[sortField] = desc ? `zzzz-${runTag}` : `0000-${runTag}`;
    };
    const seeded = await runAppsScript(frame, 'fetchSubmissionsBatch', formKey, [], 50, null, false, []);
    const seededItems = (((seeded || {}).list || {}).items || []);
    const templateItem =
      seededItems.find(item => /closed/i.test((((item || {}).status || '') + '').toString())) ||
      seededItems.find(item => /emailed|pdf ready/i.test((((item || {}).status || '') + '').toString())) ||
      seededItems[0];
    const firstId = (templateItem || {}).id;
    let seedPayload;

    if (firstId) {
      const template = await runAppsScript(frame, 'fetchSubmissionById', formKey, firstId);
      if (template && template.values) {
        const clonedValues = { ...(template.values || {}) };
        Object.keys(clonedValues).forEach(key => {
          if (/date/i.test(key)) clonedValues[key] = todayDate;
          if (/status/i.test(key) && typeof clonedValues[key] === 'string') {
            clonedValues[key] = openStatus;
          }
        });
        clonedValues.__ckPerfRunTag = runTag;
        applySortBias(clonedValues);
        if (statusFieldId) clonedValues[statusFieldId] = openStatus;
        seedPayload = {
          formKey,
          language: (template.language || 'EN').toString().toUpperCase(),
          id: createdId,
          status: openStatus,
          __ckSaveMode: 'draft',
          __ckStatus: openStatus,
          ...clonedValues
        };
      }
    }

    if (!seedPayload) {
      const cfg = await runAppsScript(frame, 'fetchFormConfig', formKey);
      const fallbackDedupKeys = Array.from(new Set(((cfg?.dedupRules || [])[0]?.keys || []).map(v => (v || '').toString()))).filter(Boolean);
      const dedupKeysForFallback = dedupKeys.length ? dedupKeys : fallbackDedupKeys;
      const minimal = {};
      const questions = Array.isArray(cfg?.questions) ? cfg.questions : [];
      for (const q of questions) {
        const qid = (q?.id || '').toString();
        if (!qid || q?.type === 'BUTTON') continue;
        if (q?.type === 'LINE_ITEM_GROUP') {
          minimal[qid] = [];
          continue;
        }
        if (q?.type === 'DATE' || /date/i.test(qid)) {
          minimal[qid] = todayDate;
          continue;
        }
        if (dedupKeysForFallback.includes(qid)) {
          minimal[qid] = `${runTag}-${qid}`;
          continue;
        }
        if (q?.type === 'CHECKBOX') {
          minimal[qid] = [];
        } else {
          minimal[qid] = `${runTag}-${qid}`;
        }
      }
      minimal.__ckPerfRunTag = runTag;
      applySortBias(minimal);
      if (statusFieldId) minimal[statusFieldId] = openStatus;
      seedPayload = {
        formKey,
        language: 'EN',
        id: createdId,
        status: openStatus,
        __ckSaveMode: 'draft',
        __ckStatus: openStatus,
        ...minimal
      };
    }

    console.log('[scenario] seed record');
    let saveRes = await runAppsScript(frame, 'saveSubmissionWithId', seedPayload);
    if (!saveRes?.success && dedupKeys.length) {
      const fallback = { ...(seedPayload || {}) };
      const firstNonDateKey = dedupKeys.find(k => {
        const t = (questionById.get(k) || '').toUpperCase();
        return t !== 'DATE' && t !== 'DATETIME' && !/date/i.test(k);
      });
      if (firstNonDateKey) {
        fallback[firstNonDateKey] = `${runTag}-${firstNonDateKey}`;
      }
      saveRes = await runAppsScript(frame, 'saveSubmissionWithId', fallback);
      seedPayload = fallback;
    }
    if (!saveRes?.success) throw new Error(`Seed save failed: ${(saveRes?.message || 'unknown').toString()}`);
    createdRecordIds.push(createdId);

    // Force seeded records into a non-closed status so the submit CTA is enabled in automation runs.
    const seededSnapshot = await runAppsScript(frame, 'fetchSubmissionById', formKey, createdId).catch(() => null);
    const seededStatus = ((seededSnapshot || {}).status || '').toString().trim().toLowerCase();
    if (seededStatus && seededStatus.includes('closed')) {
      const values = { ...((seededSnapshot || {}).values || {}) };
      if (statusFieldId) values[statusFieldId] = openStatus;
      await runAppsScript(frame, 'saveSubmissionWithId', {
        formKey,
        language: ((seededSnapshot || {}).language || 'EN').toString().toUpperCase(),
        id: createdId,
        status: openStatus,
        __ckSaveMode: 'draft',
        __ckStatus: openStatus,
        __ckAllowClosedUpdate: true,
        values,
        ...values
      }).catch(() => null);
    }

    // Reload so list prefetch/sort catches the seeded record.
    console.log('[scenario] reload for home list');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    frame = await waitForAppFrame(page);
    await waitForHomeReady(frame, 90000);

    console.log('[scenario] open seeded record');
    let openedViaHook = false;
    const openViaHook = await openRecordByPerfHook(frame, createdId, 'summary', 25000).catch(() => ({ ok: false, reason: 'failed' }));
    if (openViaHook?.ok) {
      openedViaHook = true;
      await frame.waitForTimeout(1200);
    } else {
      let targetRowIndex = -1;
      try {
        const sortHint = defaultSortFieldId
          ? { fieldId: defaultSortFieldId, direction: defaultSortDirection === 'asc' ? 'asc' : 'desc' }
          : null;
        const sorted = await runAppsScript(frame, 'fetchSubmissionsSortedBatch', formKey, [], 50, null, false, [], sortHint);
        const items = (((sorted || {}).list || {}).items || []);
        targetRowIndex = items.findIndex(row => ((row || {}).id || '').toString() === createdId);
      } catch (_) {
        targetRowIndex = -1;
      }

      const listActionSelectors = [
        'button:has-text("View")',
        'button:has-text("Voir")',
        'button:has-text("Bekijken")',
        'button:has-text("Edit")',
        'button:has-text("Modifier")',
        'button:has-text("Bewerken")',
        'button:has-text("Actions")',
        'button:has-text("Action")',
        'button:has-text("Acties")',
        'table button'
      ];
      let resolvedTargetButton = null;
      if (targetRowIndex >= 0) {
        const priorityLocators = [
          frame.locator('button:has-text("View")'),
          frame.locator('button:has-text("Voir")'),
          frame.locator('button:has-text("Bekijken")'),
          frame.locator('button:has-text("Edit")'),
          frame.locator('button:has-text("Modifier")'),
          frame.locator('button:has-text("Bewerken")'),
          frame.locator('table button')
        ];
        const started = Date.now();
        while (!resolvedTargetButton && Date.now() - started < 25000) {
          for (const locator of priorityLocators) {
            const count = await locator.count().catch(() => 0);
            if (targetRowIndex < count) {
              resolvedTargetButton = locator.nth(targetRowIndex);
              break;
            }
          }
          if (!resolvedTargetButton) {
            await frame.waitForTimeout(300);
          }
        }
      }
      if (!resolvedTargetButton) {
        resolvedTargetButton = await resolveVisibleActionButton(frame, listActionSelectors, 12000, true);
      }
      if (!resolvedTargetButton) throw new Error('No list action button found after seeding.');
      await resolvedTargetButton.click({ timeout: 10000 });
      await frame.waitForTimeout(1200);
    }

    const submitSelectors = [
      'button:has-text("Activate")',
      'button:has-text("Activer")',
      'button:has-text("Activeren")',
      'button:has-text("Submit")',
      'button:has-text("Soumettre")',
      'button:has-text("Indienen")'
    ];
    const formModeSelectors = [
      'button:has-text("Edit")',
      'button:has-text("Modifier")',
      'button:has-text("Bewerken")',
      'button:has-text("Form")',
      'button:has-text("Back to form")'
    ];
    const summaryModeSelectors = [
      'button:has-text("Summary")',
      'button:has-text("Résumé")',
      'button:has-text("Samenvatting")'
    ];
    let submitBtn = await resolveVisibleActionButton(frame, submitSelectors, 8000, true);
    if (!submitBtn) {
      submitBtn = await resolveVisibleActionButton(frame, submitSelectors, 4000, false);
    }
    let switchedToForm = false;
    if (!submitBtn || (await submitBtn.isDisabled().catch(() => false))) {
      const formViewBtn = await resolveVisibleActionButton(frame, formModeSelectors, 6000, true);
      if (formViewBtn) {
        await formViewBtn.click({ timeout: 5000 });
        switchedToForm = true;
        await frame.waitForTimeout(800);
        submitBtn = await resolveVisibleActionButton(frame, submitSelectors, 8000, true);
        if (!submitBtn) {
          submitBtn = await resolveVisibleActionButton(frame, submitSelectors, 4000, false);
        }
      }
    }

    console.log('[scenario] attempt submit');
    let submitAttempted = false;
    let submitBlockedDisabled = false;
    let autoFilledFields = 0;
    let actionButtonsSample = await collectActionButtons(frame).catch(() => []);
    if (submitBtn) {
      let disabled = await submitBtn.isDisabled().catch(() => false);
      if (disabled) {
        const firstPass = await autoFillEditableFields(frame, 'emptyOnly').catch(() => ({ touched: 0 }));
        autoFilledFields += Number(firstPass?.touched || 0);
        await frame.waitForTimeout(400);
        submitBtn = (await resolveVisibleActionButton(frame, submitSelectors, 2000, true))
          || (await resolveVisibleActionButton(frame, submitSelectors, 1000, false))
          || submitBtn;
        disabled = await submitBtn.isDisabled().catch(() => false);
      }
      if (disabled) {
        if (!switchedToForm) {
          const formViewBtn = await resolveVisibleActionButton(frame, formModeSelectors, 3000, true);
          if (formViewBtn) {
            await formViewBtn.click({ timeout: 5000 });
            switchedToForm = true;
            await frame.waitForTimeout(600);
          }
        }
        const secondPass = await autoFillEditableFields(frame, 'force').catch(() => ({ touched: 0 }));
        autoFilledFields += Number(secondPass?.touched || 0);
        await frame.waitForTimeout(400);
        submitBtn = (await resolveVisibleActionButton(frame, submitSelectors, 2000, true))
          || (await resolveVisibleActionButton(frame, submitSelectors, 1000, false))
          || submitBtn;
        disabled = await submitBtn.isDisabled().catch(() => false);
      }
      if (!disabled) {
        submitAttempted = true;
        await submitBtn.click({ timeout: 5000 });
        await frame.waitForTimeout(450);
        await clickSubmitConfirmationIfPresent(frame).catch(() => false);
        await frame.waitForTimeout(1600);

        const validationFailedInSummary = hasLogEvent(consoleEvents, 'summary.submit.validationFailedNavigateForm');
        if (validationFailedInSummary) {
          const toFormBtn = await resolveVisibleActionButton(frame, formModeSelectors, 2500, true);
          if (toFormBtn) {
            await toFormBtn.click({ timeout: 5000 });
            switchedToForm = true;
            await frame.waitForTimeout(600);
          }
          const retryFill = await autoFillEditableFields(frame, 'force').catch(() => ({ touched: 0 }));
          autoFilledFields += Number(retryFill?.touched || 0);
          await frame.waitForTimeout(1000);

          const toSummaryBtn = await resolveVisibleActionButton(frame, summaryModeSelectors, 4000, true);
          if (toSummaryBtn) {
            await clickWithOverlayRecovery(frame, toSummaryBtn, 5000);
            await frame.waitForTimeout(800);
          }

          submitBtn = (await resolveVisibleActionButton(frame, submitSelectors, 6000, true))
            || (await resolveVisibleActionButton(frame, submitSelectors, 1500, false))
            || submitBtn;
          const retryDisabled = submitBtn ? await submitBtn.isDisabled().catch(() => true) : true;
          if (submitBtn && !retryDisabled) {
            await submitBtn.click({ timeout: 5000 });
            await frame.waitForTimeout(450);
            await clickSubmitConfirmationIfPresent(frame).catch(() => false);
          } else {
            submitBlockedDisabled = true;
          }
        }

        await frame.waitForTimeout(5000);
      } else {
        submitBlockedDisabled = true;
        actionButtonsSample = await collectActionButtons(frame).catch(() => actionButtonsSample);
      }
    }

    // Navigate back home after submit attempt to capture route-back timing.
    console.log('[scenario] navigate back home');
    let navBackManualMs = null;
    const homeBtn = await waitForAnySelector(frame, ['button:has-text("Home")', 'button:has-text("Back")'], 10000);
    if (homeBtn) {
      const navBackStartedAt = Date.now();
      await homeBtn.click({ timeout: 5000 });
      await waitForHomeReady(frame, 30000);
      navBackManualMs = Date.now() - navBackStartedAt;
    }

    const homeTimeToDataRaw = findPerfDuration(consoleEvents, 'ck.home.timeToData');
    const homeBootstrapRpcMs = findPerfDurationFirst(consoleEvents, 'ck.home.bootstrap.rpc');
    const listFetchRpcMs = findPerfDurationFirst(consoleEvents, 'ck.list.fetch.rpc');
    const listRecordsPrefetchRpcMs = findPerfDurationFirst(consoleEvents, 'ck.list.records.prefetch.rpc');
    const recordFetchRpcMs = findRpcDuration(consoleEvents, 'fetchSubmissionByRowNumber', 'last');
    const homeTimeToDataMs =
      typeof homeTimeToDataRaw === 'number' && homeTimeToDataRaw > 0
        ? homeTimeToDataRaw
        : (listFetchRpcMs ?? homeBootstrapRpcMs);
    const submitAttemptedResolved =
      submitAttempted ||
      hasLogEvent(consoleEvents, 'submit.begin') ||
      hasLogEvent(consoleEvents, 'summary.submit.fire') ||
      hasLogEvent(consoleEvents, 'list.openView.submit.fire');
    const homeReadyPerfTs = findPerfEventTs(consoleEvents, 'ck.home.timeToData', 'first');
    const templatePrefetchStart = findReactEventPayload(consoleEvents, 'templates.prefetch.start', 'first');
    const templatePrefetchDone = findReactEventPayload(consoleEvents, 'templates.prefetch.ok', 'last');
    const templatePrefetchFailed = findReactEventPayload(consoleEvents, 'templates.prefetch.failed', 'last');
    const templatePrefetchStartAfterHomeDataMs =
      templatePrefetchStart && typeof templatePrefetchStart.payload?.startedAfterHomeDataMs === 'number'
        ? Number(templatePrefetchStart.payload.startedAfterHomeDataMs)
        : homeReadyPerfTs && templatePrefetchStart?.ts
          ? templatePrefetchStart.ts - homeReadyPerfTs
          : null;
    const templatePrefetchOverlapHomeLoad =
      typeof templatePrefetchStartAfterHomeDataMs === 'number' ? templatePrefetchStartAfterHomeDataMs < 0 : null;
    console.log('[scenario] collect metrics');
    const metrics = {
      homeTimeToDataMs,
      homeBootstrapRpcMs,
      listFetchRpcMs,
      listRecordsPrefetchRpcMs,
      recordFetchRpcMs,
      navOpenRecordMs: findPerfDuration(consoleEvents, 'ck.nav.openRecord'),
      navBackToHomeMs: findPerfDuration(consoleEvents, 'ck.nav.backToHome'),
      navBackManualMs,
      submitPipelineMs: findPerfDuration(consoleEvents, 'ck.submit.pipeline'),
      submitRpcMs: findPerfDuration(consoleEvents, 'ck.submit.rpc'),
      submitFollowupRpcMs: findPerfDuration(consoleEvents, 'ck.submit.followup.rpc'),
      submitAttempted: submitAttemptedResolved,
      submitBlockedDisabled,
      autoFilledFields,
      templatePrefetchStarted: Boolean(templatePrefetchStart),
      templatePrefetchCompleted: Boolean(templatePrefetchDone),
      templatePrefetchFailed: Boolean(templatePrefetchFailed),
      templatePrefetchDurationMs:
        typeof templatePrefetchDone?.payload?.durationMs === 'number' ? Number(templatePrefetchDone.payload.durationMs) : null,
      templatePrefetchStartAfterHomeDataMs,
      templatePrefetchOverlapHomeLoad,
      templatePrefetchStartView:
        templatePrefetchStart?.payload && templatePrefetchStart.payload.view !== undefined
          ? String(templatePrefetchStart.payload.view)
          : null,
      openedViaHook,
      switchedToForm,
      openedView: (() => {
        for (let i = consoleEvents.length - 1; i >= 0; i--) {
          const ev = consoleEvents[i];
          const a0 = ev.args?.[0];
          const a1 = ev.args?.[1];
          const a2 = ev.args?.[2];
          if (a0 === '[ReactForm][perf]' && a1 === 'ck.nav.openRecord' && a2 && a2.view) {
            return String(a2.view);
          }
        }
        return null;
      })(),
      submitSuccess: hasLogEvent(consoleEvents, 'submit.success')
    };

    return {
      ok: true,
      metrics,
      createdRecordIds,
      actionButtonsSample,
      consoleSummary: {
        totalLogs: consoleEvents.length,
        last60: consoleEvents.slice(-60)
      }
    };
  } catch (err) {
    console.log('[scenario] run failed', err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      metrics: {
        homeTimeToDataMs: findPerfDuration(consoleEvents, 'ck.home.timeToData'),
        homeBootstrapRpcMs: findPerfDurationFirst(consoleEvents, 'ck.home.bootstrap.rpc'),
        listFetchRpcMs: findPerfDurationFirst(consoleEvents, 'ck.list.fetch.rpc'),
        listRecordsPrefetchRpcMs: findPerfDurationFirst(consoleEvents, 'ck.list.records.prefetch.rpc'),
        recordFetchRpcMs: findRpcDuration(consoleEvents, 'fetchSubmissionByRowNumber', 'last'),
        navOpenRecordMs: findPerfDuration(consoleEvents, 'ck.nav.openRecord'),
        navBackToHomeMs: findPerfDuration(consoleEvents, 'ck.nav.backToHome'),
        navBackManualMs: null,
        submitPipelineMs: findPerfDuration(consoleEvents, 'ck.submit.pipeline'),
        submitRpcMs: findPerfDuration(consoleEvents, 'ck.submit.rpc'),
        submitFollowupRpcMs: findPerfDuration(consoleEvents, 'ck.submit.followup.rpc'),
        submitAttempted:
          hasLogEvent(consoleEvents, 'ui.submit.tap') ||
          hasLogEvent(consoleEvents, 'submit.begin') ||
          hasLogEvent(consoleEvents, 'summary.submit.fire') ||
          hasLogEvent(consoleEvents, 'list.openView.submit.fire'),
        submitBlockedDisabled: false,
        autoFilledFields: 0,
        templatePrefetchStarted: Boolean(findReactEventPayload(consoleEvents, 'templates.prefetch.start', 'first')),
        templatePrefetchCompleted: Boolean(findReactEventPayload(consoleEvents, 'templates.prefetch.ok', 'last')),
        templatePrefetchFailed: Boolean(findReactEventPayload(consoleEvents, 'templates.prefetch.failed', 'last')),
        templatePrefetchDurationMs: null,
        templatePrefetchStartAfterHomeDataMs: null,
        templatePrefetchOverlapHomeLoad: null,
        templatePrefetchStartView: null,
        openedViaHook: false,
        switchedToForm: false,
        openedView: null,
        submitSuccess: hasLogEvent(consoleEvents, 'submit.success')
      },
      createdRecordIds,
      actionButtonsSample: [],
      consoleSummary: {
        totalLogs: consoleEvents.length,
        last60: consoleEvents.slice(-60)
      }
    };
  } finally {
    if (cleanup && createdRecordIds.length) {
      try {
        const frame = await waitForAppFrame(page, 20000);
        for (const id of createdRecordIds) {
          try {
            await runAppsScript(frame, 'saveSubmissionWithId', {
              formKey,
              language: 'EN',
              __ckDeleteRecordId: id
            });
          } catch (_) {
            // keep teardown best-effort
          }
        }
      } catch (_) {
        // ignore cleanup frame acquisition failures
      }
    }

    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function summarizeRuns(runs) {
  const metricKeys = [
    'homeTimeToDataMs',
    'homeBootstrapRpcMs',
    'listFetchRpcMs',
    'listRecordsPrefetchRpcMs',
    'recordFetchRpcMs',
    'navOpenRecordMs',
    'navBackToHomeMs',
    'navBackManualMs',
    'submitPipelineMs',
    'submitRpcMs',
    'submitFollowupRpcMs',
    'autoFilledFields',
    'templatePrefetchDurationMs',
    'templatePrefetchStartAfterHomeDataMs'
  ];
  const summary = {};
  for (const key of metricKeys) {
    const values = runs.map(r => r.metrics?.[key]).filter(v => typeof v === 'number');
    if (!values.length) {
      summary[key] = null;
      continue;
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    summary[key] = {
      avg,
      min: Math.min(...values),
      max: Math.max(...values),
      unit: 'ms'
    };
  }
  summary.submitAttemptRate = runs.length
    ? runs.filter(r => r.metrics?.submitAttempted).length / runs.length
    : null;
  summary.submitBlockedDisabledRate = runs.length
    ? runs.filter(r => r.metrics?.submitBlockedDisabled).length / runs.length
    : null;
  summary.submitSuccessRate = runs.length
    ? runs.filter(r => r.metrics?.submitSuccess).length / runs.length
    : null;
  summary.templatePrefetchStartedRate = runs.length
    ? runs.filter(r => r.metrics?.templatePrefetchStarted).length / runs.length
    : null;
  summary.templatePrefetchCompletedRate = runs.length
    ? runs.filter(r => r.metrics?.templatePrefetchCompleted).length / runs.length
    : null;
  summary.templatePrefetchFailedRate = runs.length
    ? runs.filter(r => r.metrics?.templatePrefetchFailed).length / runs.length
    : null;
  summary.templatePrefetchOverlapHomeLoadRate = runs.length
    ? runs.filter(r => r.metrics?.templatePrefetchOverlapHomeLoad).length / runs.length
    : null;
  summary.openedViaHookRate = runs.length
    ? runs.filter(r => r.metrics?.openedViaHook).length / runs.length
    : null;
  summary.switchedToFormRate = runs.length
    ? runs.filter(r => r.metrics?.switchedToForm).length / runs.length
    : null;
  summary.openedSummaryRate = runs.length
    ? runs.filter(r => (r.metrics?.openedView || '').toString().toLowerCase() === 'summary').length / runs.length
    : null;
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urlRaw = args.url || args.u;
  if (!urlRaw) {
    console.error('Usage: node scripts/performance/scenario-runner.js --url="https://..." [--formKey="Config: Meal Production"] [--runs=3] [--preset=mobile-4g|mobile-wifi] [--output=perf-results/scenario.json] [--cleanup=true|false]');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(urlRaw);
  } catch (_) {
    console.error('Invalid --url value.');
    process.exit(1);
  }

  const presetId = (args.preset || 'mobile-4g').toString().trim().toLowerCase();
  const preset = PRESETS[presetId];
  if (!preset) {
    console.error(`Invalid --preset value: ${presetId}. Allowed: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  const formKey = (args.formKey || 'Config: Meal Production').toString();
  const runs = toPositiveInt(args.runs, 3);
  const cleanup = String(args.cleanup ?? 'true').toLowerCase() !== 'false';
  const outputPath = args.output ? path.resolve(String(args.output)) : null;

  console.log(`Scenario runner target: ${parsed.href}`);
  console.log(`Form key: ${formKey}`);
  console.log(`Runs: ${runs}`);
  console.log(`Preset: ${preset.id} (${preset.description})`);
  console.log(`Cleanup created records: ${cleanup}`);

  const results = [];
  for (let i = 0; i < runs; i++) {
    console.log(`\\n--- Scenario run ${i + 1}/${runs} ---`);
    const res = await runScenarioOnce({
      url: parsed.href,
      formKey,
      preset,
      cleanup
    });
    results.push({ run: i + 1, ...res });

    console.log(`ok=${res.ok}`);
    if (!res.ok) console.log(`error=${res.error}`);
    console.log(`homeTimeToDataMs=${res.metrics?.homeTimeToDataMs}`);
    console.log(`homeBootstrapRpcMs=${res.metrics?.homeBootstrapRpcMs}`);
    console.log(`listFetchRpcMs=${res.metrics?.listFetchRpcMs}`);
    console.log(`listRecordsPrefetchRpcMs=${res.metrics?.listRecordsPrefetchRpcMs}`);
    console.log(`recordFetchRpcMs=${res.metrics?.recordFetchRpcMs}`);
    console.log(`navOpenRecordMs=${res.metrics?.navOpenRecordMs}`);
    console.log(`navBackToHomeMs=${res.metrics?.navBackToHomeMs}`);
    console.log(`submitPipelineMs=${res.metrics?.submitPipelineMs}`);
    console.log(`submitRpcMs=${res.metrics?.submitRpcMs}`);
    console.log(`submitFollowupRpcMs=${res.metrics?.submitFollowupRpcMs}`);
    console.log(`templatePrefetchDurationMs=${res.metrics?.templatePrefetchDurationMs}`);
    console.log(`templatePrefetchStartAfterHomeDataMs=${res.metrics?.templatePrefetchStartAfterHomeDataMs}`);
    console.log(`templatePrefetchOverlapHomeLoad=${res.metrics?.templatePrefetchOverlapHomeLoad}`);
    console.log(`submitAttempted=${res.metrics?.submitAttempted}`);
    console.log(`submitSuccess=${res.metrics?.submitSuccess}`);
  }

  const out = {
    url: parsed.href,
    formKey,
    preset,
    runs: results,
    summary: summarizeRuns(results),
    generatedAt: new Date().toISOString()
  };

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`\\nSaved results: ${outputPath}`);
  } else {
    console.log('\\nSummary:');
    console.log(JSON.stringify(out.summary, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Scenario runner failed:', err);
    process.exit(1);
  });
}
