import { WebFormDefinition } from '../types';
import { SYSTEM_FONT_STACK } from '../constants/typography';
import { CACHE_VERSION_PROPERTY_KEY, DEFAULT_CACHE_VERSION, getDocumentProperties } from './webform/cache';
import { isDebugEnabled } from './webform/debug';
import { getUiEnvTag } from './webform/envTag';

const SCRIPT_CLOSE_PATTERN = /<\/script/gi;
const SCRIPT_CLOSE_ESCAPED = String.raw`<\\/script`;
const JS_UNSAFE_CHARS = /[\u2028\u2029]/g;
const replaceScriptTerminators = (value: string): string => {
  const str = value.toString();
  const replaceAllFn = (str as any).replaceAll as ((pattern: RegExp | string, replacement: string) => string) | undefined;
  if (typeof replaceAllFn === 'function') {
    return replaceAllFn.call(str, SCRIPT_CLOSE_PATTERN, SCRIPT_CLOSE_ESCAPED);
  }
  return str.replace(SCRIPT_CLOSE_PATTERN, SCRIPT_CLOSE_ESCAPED);
};
const escapeScriptTerminator = (value: string): string => replaceScriptTerminators(value);
const escapeJsonForScript = (value: any): string =>
  escapeScriptTerminator(
    JSON.stringify(value)
      .replace(/</g, '\\u003c')
      // Guard against U+2028/2029 which break inline <script> parsing in some browsers.
      .replace(JS_UNSAFE_CHARS, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
  );
const resolveServiceUrl = (): string | null => {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
      const url = ScriptApp.getService().getUrl();
      if (url) return url.toString();
    }
  } catch (_) {
    // ignore and fall back to relative URL
  }
  return null;
};

const resolveCacheVersion = (): string => {
  try {
    const props = getDocumentProperties();
    if (!props) return DEFAULT_CACHE_VERSION;
    const version = props.getProperty(CACHE_VERSION_PROPERTY_KEY);
    return (version || DEFAULT_CACHE_VERSION).toString().trim() || DEFAULT_CACHE_VERSION;
  } catch (_) {
    return DEFAULT_CACHE_VERSION;
  }
};

const buildBundleSrc = (bundleTarget?: string): string => {
  const target = (bundleTarget || '').toString().trim();
  const appParam = target ? `&app=${encodeURIComponent(target)}` : '';
  const cacheVersion = resolveCacheVersion();
  const versionParam = cacheVersion ? `&v=${encodeURIComponent(cacheVersion)}` : '';
  const query = `bundle=react${appParam}${versionParam}`;
  const baseUrl = resolveServiceUrl();
  if (!baseUrl) return `?${query}`;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${query}`;
};

export function buildWebFormHtml(
  def: WebFormDefinition | null,
  formKey: string,
  bootstrap?: any,
  bundleTarget?: string,
  requestParams?: Record<string, string>
): string {
  const defJson = escapeJsonForScript(def || null);
  const keyJson = escapeJsonForScript(formKey || def?.title || '');
  const debugJson = isDebugEnabled() ? 'true' : 'false';
  const bundleSrc = buildBundleSrc(bundleTarget);
  const cacheVersion = resolveCacheVersion();
  const cacheVersionJson = escapeJsonForScript(cacheVersion);
  const envTag = getUiEnvTag();
  const envTagJson = escapeJsonForScript(envTag || null);

  const bootstrapPayload = (() => {
    if (bootstrap && typeof bootstrap === 'object') {
      const existingEnvTag = (bootstrap as any).envTag;
      return { ...(bootstrap as any), envTag: existingEnvTag !== undefined ? existingEnvTag : (envTag || null) };
    }
    return { envTag: envTag || null };
  })();
  const bootstrapJson = escapeJsonForScript(bootstrapPayload);
  const requestParamsPayload =
    requestParams && typeof requestParams === 'object' ? { ...(requestParams as Record<string, string>) } : {};
  const requestParamsJson = escapeJsonForScript(requestParamsPayload);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://docs.google.com" />
    <link rel="preconnect" href="https://drive.google.com" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <link rel="preload" as="script" href="${bundleSrc}" />
    <script src="${bundleSrc}" defer></script>
    <script>
      // iOS sometimes renders this Apps Script web app with a desktop-like base viewport (e.g., 980px wide),
      // which makes the UI effectively smaller and can trigger focus-zoom on inputs. Detect that early and
      // opt into a sizing compensation mode via a CSS class.
      (function () {
        try {
          var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
          var isiOS = /iPad|iPhone|iPod/i.test(ua);
          if (!isiOS) return;
          var vv = window.visualViewport;
          var scrW = (window.screen && window.screen.width) ? window.screen.width : 0;
          if (vv && typeof vv.width === 'number' && scrW > 0 && vv.width > scrW * 1.3) {
            document.documentElement.classList.add('ck-ios-basescale');
          }
        } catch (e) {
          // ignore
        }
      })();
    </script>
    <style>
      :root {
        /* System-neutral surfaces and text */
        --bg: Canvas;
        --card: Canvas;
        --border: GrayText;
        --text: CanvasText;
        --muted: GrayText;
        --accent: #0b57d0;
        --accentText: #ffffff;
        --danger: #b91c1c;
        --success: CanvasText;

        /* Secondary action surface: neutral outline */
        --ck-secondary-bg: transparent;
        --ck-secondary-border: var(--border);
        --ck-secondary-text: var(--text);

        --radius-card: 26px;
        --radius-control: 18px;
        /* Global control sizing (inputs/selects/buttons). Keep touch-friendly, but avoid wasting vertical space. */
        --control-height: 72px;
        --safe-bottom: env(safe-area-inset-bottom, 0px);
        --safe-top: env(safe-area-inset-top, 0px);
        /* visualViewport-driven inset (Safari bottom UI / in-app browsers) */
        --vv-bottom: 0px;

        /* Typography tokens (keep labels + controls uniform) */
        --ck-font-base: 32px;
        --ck-font-label: 32px;
        --ck-font-control: 32px;
        --ck-font-group-title: 36px;
        --ck-font-pill: 26px;
        --ck-font-caret: 38px;
        --ck-font-helper: calc(var(--ck-font-label) * 0.85);
        --ck-helper-opacity: 0.78;

        /* Typography */
        --ck-font-family: ${SYSTEM_FONT_STACK};
      }
      * { box-sizing: border-box; }
      html {
        /* Prevent automatic text inflation on iOS; keep sizing consistent and intentional. */
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      body {
        margin: 0;
        font-family: var(--ck-font-family);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background: var(--bg);
        color: var(--text);
        font-size: var(--ck-font-base);
        min-height: 100vh;
      }
      a {
        color: var(--accent);
        text-decoration: underline;
      }
      a:visited {
        color: var(--accent);
      }
      /* iOS base-scale compensation: if we start in a desktop-like 980px viewport, the whole page is effectively
         scaled down (~0.4 on iPhone). Boost *token values* so labels/controls remain uniform and iOS doesn't zoom. */
      html.ck-ios-basescale {
        /* iOS base-scale compensation: keep controls large enough to avoid focus-zoom, but not oversized. */
        --control-height: 92px;
        --ck-font-base: 40px;
        --ck-font-label: 40px;
        --ck-font-control: 40px;
        --ck-font-group-title: 46px;
        --ck-font-pill: 34px;
        --ck-font-caret: 44px;
      }
      @supports (min-height: 100dvh) {
        body { min-height: 100dvh; }
        .page { min-height: 100dvh; }
      }
      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 22px;
        /* Make the page a "definite height" flex container so children can use flex:1 and iframe height:100%. */
        min-height: 100vh;
        /* Reserve room for the fixed bottom action bar (accounts for iOS safe-area + visualViewport inset). */
        padding-bottom: calc(22px + var(--ck-bottom-bar-height, calc(146px + var(--safe-bottom))) + var(--vv-bottom));
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      /* (legacy) ck-page-form is still applied, but bottom-bar room is now reserved for all views. */
      /* App header (Excel-style: avatar + title) */
      .ck-app-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: calc(14px + var(--safe-top)) 22px 14px;
        /* Make the header full-bleed within the .page padding */
        margin: -22px -22px 6px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
      }
      .ck-app-avatar-btn {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        cursor: pointer;
        flex: 0 0 auto;
        border-radius: 999px;
      }
      .ck-app-avatar-btn:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 4px;
      }
      .ck-app-avatar {
        --ck-avatar-size: calc(var(--control-height) * 0.62);
        width: var(--ck-avatar-size);
        height: var(--ck-avatar-size);
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--ck-secondary-bg);
        border: 1px solid var(--ck-secondary-border);
        color: var(--ck-secondary-text);
        font-weight: 600;
        letter-spacing: -0.02em;
        font-size: calc(var(--ck-font-control) * 0.72);
        line-height: 1;
        user-select: none;
      }
      /* When using an image logo, keep the same circular sizing + border, but render as an image. */
      .ck-app-avatar--img {
        display: block;
        object-fit: cover;
        background: transparent;
      }
      .ck-app-avatar--drawer {
        --ck-avatar-size: calc(var(--control-height) * 0.58);
        font-size: calc(var(--ck-font-control) * 0.66);
      }
      .ck-app-title {
        font-weight: 600;
        font-size: var(--ck-font-group-title);
        letter-spacing: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ck-app-title-row {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .ck-app-title-right {
        flex: 0 0 auto;
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        font-weight: 600;
        font-size: calc(var(--ck-font-label) * 0.85);
        letter-spacing: 0;
        color: var(--muted);
        white-space: nowrap;
      }
      .ck-app-title-right [data-tone="error"] {
        color: var(--danger);
      }
      .ck-app-title-right [data-tone="saved"] {
        color: var(--muted);
      }
      .ck-app-title-right [data-tone="saving"] {
        color: var(--muted);
      }
      .ck-app-title-right [data-tone="paused"] {
        color: var(--muted);
      }
      .ck-env-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        font-weight: 600;
        font-size: calc(var(--ck-font-label) * 0.85);
        line-height: 1.2;
        text-transform: none;
        letter-spacing: 0;
        white-space: nowrap;
      }
      /* Left slide-in drawer */
      .ck-app-drawer-overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: transparent;
        pointer-events: none;
        transition: background 180ms ease;
      }
      .ck-app-drawer-overlay.open {
        background: transparent;
        pointer-events: auto;
      }
      .ck-app-drawer {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: min(520px, 88vw);
        background: var(--card);
        border-right: 1px solid var(--border);
        box-shadow: none;
        transform: translateX(-104%);
        transition: transform 220ms ease;
        padding: calc(16px + var(--safe-top)) 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .ck-app-drawer-overlay.open .ck-app-drawer {
        transform: translateX(0);
      }
      .ck-app-drawer-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .ck-app-drawer-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .ck-app-drawer-brand-text {
        min-width: 0;
      }
      .ck-app-drawer-brand-title {
        font-weight: 600;
        font-size: var(--ck-font-group-title);
        letter-spacing: 0;
        line-height: 1.1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ck-app-drawer-brand-subtitle {
        font-weight: 500;
      }
      .ck-app-drawer-close {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
        width: calc(var(--control-height) * 0.62);
        height: calc(var(--control-height) * 0.62);
        border-radius: 999px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-weight: 600;
        font-size: var(--ck-font-caret);
        line-height: 1;
        flex: 0 0 auto;
      }
      .ck-app-drawer-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ck-app-drawer-section-title {
        font-weight: 600;
        letter-spacing: 0;
        text-transform: none;
        font-size: var(--ck-font-label);
      }
      .ck-app-drawer-item {
        width: 100%;
        text-align: left;
        border: 1px solid var(--ck-secondary-border);
        background: var(--ck-secondary-bg);
        color: var(--ck-secondary-text);
        border-radius: 16px;
        font-weight: 600;
        padding: 16px 18px;
        min-height: var(--control-height);
        font-size: var(--ck-font-control);
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .ck-app-drawer-item--primary {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accentText);
      }
      .ck-app-drawer-select {
        width: 100%;
      }
      .ck-app-drawer-build {
        font-weight: 600;
      }
      .ck-app-drawer-divider {
        height: 1px;
        background: var(--border);
        margin: 6px 0;
      }
      header h1 {
        margin: 0 0 6px;
        font-size: var(--ck-font-group-title);
        font-weight: 600;
        letter-spacing: 0;
      }
      header p { margin: 0 0 8px; color: var(--muted); }
      .controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .card {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 32px;
        box-shadow: none;
      }
      .form-card {
        position: relative;
      }
      h2 { margin: 0 0 10px; font-size: var(--ck-font-group-title); font-weight: 600; }
      .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .field label { font-weight: 500; }
      .field.inline-field.ck-label-inline:not(.ck-consent-field) {
        display: grid;
        grid-template-columns: minmax(0, var(--ck-inline-label-width, clamp(136px, 42vw, 220px))) minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 6px;
        align-items: center;
      }
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > label {
        grid-column: 1;
        margin: 0;
      }
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > :not(label) {
        grid-column: 2;
        min-width: 0;
      }
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > .ck-field-helper,
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > .error,
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > .warning,
      .field.inline-field.ck-label-inline:not(.ck-consent-field) > .muted {
        grid-column: 2;
        margin-left: 0;
      }
      input, select, textarea, button {
        font-size: var(--ck-font-control);
        font-family: inherit;
      }
      input[type="text"], input[type="number"], input[type="date"], input[type="file"], select, textarea {
        padding: 12px 16px;
        min-height: var(--control-height);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--card);
      }
      textarea { min-height: 110px; resize: vertical; }
      button {
        background: var(--accent);
        color: var(--accentText);
        border: 1px solid var(--accent);
        padding: 16px 22px;
        border-radius: 12px;
        cursor: pointer;
      }
      button .ck-button-text {
        min-width: 0;
      }
      button.ck-button-wrap-left .ck-button-text,
      button.ck-button-wrap-left .ck-bottom-label {
        display: inline-block;
        min-width: 0;
        white-space: nowrap;
        text-align: left;
      }
      button.ck-dialog-action-button .ck-button-text,
      button.ck-dialog-action-button .ck-bottom-label {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        white-space: normal !important;
        overflow-wrap: anywhere;
        word-break: break-word;
        text-align: center;
      }
      button.ck-dialog-action-button.ck-button-wrap-left .ck-button-text,
      button.ck-dialog-action-button.ck-button-wrap-left .ck-bottom-label {
        text-align: left !important;
      }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
      .muted {
        color: var(--muted);
        opacity: 1;
        font-size: var(--ck-font-helper);
        font-weight: 400;
        line-height: 1.35;
        text-align: left;
      }
      .ck-step-help-text {
        margin: 0 0 12px;
        color: var(--muted);
        opacity: 1;
        font-size: var(--ck-font-helper);
        line-height: 1.35;
        font-weight: 400;
        text-align: left;
      }
      .status { margin-top: 8px; padding: 8px 10px; background: transparent; border: 1px solid var(--border); border-radius: 12px; color: var(--text); }
      .inline-options { display: flex; gap: 10px; flex-wrap: wrap; }
      .inline { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
      .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .tabs button { background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
      .tabs button.active { background: var(--accent); color: var(--accentText); border-color: var(--accent); }
      .list-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }
      .ck-list-clear-results {
        display: flex;
        justify-content: flex-start;
        margin: 4px 0 12px;
      }
      .ck-list-search-presets {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        margin: 4px 0 12px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .ck-list-search-presets-title {
        font-weight: 600;
        color: var(--muted);
        white-space: nowrap;
      }
      .list-toolbar .ck-list-search-label {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        color: var(--muted);
        /* Match list/table typography (same as column headers). */
        font-size: var(--ck-font-control);
        margin-bottom: 0;
        white-space: nowrap;
      }
      .list-toolbar .ck-list-search-control {
        flex: 1 1 0;
        min-width: 0;
        max-width: 100%;
        position: relative;
      }
      .list-toolbar .ck-list-search-control .ck-date-input-wrap {
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .list-toolbar .ck-list-search-control .ck-date-input-wrap > input.ck-date-input {
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .list-toolbar input[type="search"],
      .list-toolbar input[type="date"] {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .list-toolbar input[type="date"]::-webkit-date-and-time-value {
        min-width: 0;
        max-width: 100%;
        text-align: left;
      }
      /* Hide native iOS/WebKit search clear so we can show our own clear control. */
      .list-toolbar input[type="search"]::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
        display: none;
      }
      /* Leave room for right-side icons (gear / clear) only when they are present. */
      .list-toolbar .ck-list-search-control.ck-has-icons input[type="search"],
      .list-toolbar .ck-list-search-control.ck-has-icons input[type="date"] {
        padding-right: 90px;
      }
      .list-toolbar .ck-list-search-control.ck-has-clear.ck-has-advanced input[type="search"],
      .list-toolbar .ck-list-search-control.ck-has-clear.ck-has-advanced input[type="date"] {
        padding-right: 150px;
      }
      /* When DateInput overlay is active, leave room for the clear icon too. */
      .list-toolbar .ck-list-search-control.ck-has-clear .ck-date-overlay {
        padding-right: 56px;
      }
      .list-toolbar .ck-list-search-advanced-icon {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        min-width: 36px;
        padding: 0 6px;
        height: 36px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--muted);
        font-weight: 600;
        font-size: var(--ck-font-control);
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        padding: 6px 10px;
        cursor: pointer;
        box-shadow: none;
      }
      /* When the clear "×" is present, move the gear left so the buttons are not cramped. */
      .list-toolbar .ck-list-search-control.ck-has-clear .ck-list-search-advanced-icon {
        right: 56px;
      }
      .list-toolbar .ck-list-search-advanced-icon:hover {
        background: transparent;
      }
      .list-toolbar .ck-list-search-advanced-icon:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 3px;
      }
      .list-toolbar .ck-list-search-clear-icon {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--muted);
        font-weight: 600;
        font-size: var(--ck-font-control);
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: none;
      }
      .list-toolbar .ck-list-search-clear-icon:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 3px;
      }
      .list-toolbar .sort-control {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-weight: 600;
      }
      .list-table-wrapper {
        width: 100%;
        overflow-x: auto;
      }
      .list-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        min-width: 600px;
      }
      .list-table th,
      .list-table td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        word-break: break-word;
      }
      .list-table th {
        background: var(--card);
      }
      .ck-list-sort-header {
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: inherit;
        color: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ck-list-sort-header:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 3px;
        border-radius: 10px;
      }
      .ck-list-sort-indicator { font-size: calc(var(--ck-font-label) * 0.85); opacity: 0.75; }
      .truncate-link {
        display: inline-block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--accent);
      }
      .truncate-link:hover { text-decoration: underline; }
      .truncate-text {
        display: inline-block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text);
        text-decoration: none;
        cursor: default;
      }
      .inline-link {
        color: var(--accent);
        text-decoration: underline;
      }
      .inline-link:hover { text-decoration: underline; }
      .ck-list-nav {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        color: var(--accent);
        font: inherit;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        text-decoration: underline;
      }
      .ck-list-nav-group {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        flex-wrap: nowrap;
      }
      .ck-list-nav:hover { text-decoration: underline; }
      .ck-list-nav:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 3px;
        border-radius: 10px;
      }
      .ck-list-nav--iconOnly {
        text-decoration: none;
        padding: 3px 6px;
        min-width: 30px;
        min-height: 30px;
        justify-content: center;
        border-radius: 8px;
      }
      .ck-list-nav--iconOnly:hover {
        text-decoration: none;
      }
      .ck-list-nav--iconOnly .ck-list-icon {
        width: 1.15em;
        height: 1.15em;
      }
      .ck-list-nav--warning { color: var(--text); }
      .ck-list-nav--muted { color: var(--muted); font-weight: 500; }
      .ck-list-nav .ck-list-icon {
        color: var(--accent);
      }
      .ck-list-icon {
        width: 1.05em;
        height: 1.05em;
        flex: 0 0 auto;
        color: currentColor;
      }

      .ck-list-view-toggle {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        flex: 0 0 auto;
      }
      .ck-list-view-toggle > button {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 12px;
      }
      .ck-list-view-toggle > button.active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accentText);
      }

      .ck-list-advanced-panel {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: transparent;
      }
      .ck-list-advanced-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ck-list-advanced-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
        align-items: center;
      }
      .ck-list-advanced-label {
        font-weight: 600;
        color: var(--muted);
        font-size: var(--ck-font-control);
        min-width: 0;
        white-space: normal;
        line-height: 1.15;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .ck-list-advanced-control {
        min-width: 0;
      }
      .ck-list-advanced-control input,
      .ck-list-advanced-control select,
      .ck-list-advanced-control .ck-date-input-wrap,
      .ck-list-advanced-control .ck-date-input-wrap > input.ck-date-input {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .ck-list-advanced-control input[type="search"] {
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .ck-list-advanced-actions {
        justify-content: flex-end;
      }
      @media (max-width: 540px) {
        .ck-list-advanced-row {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .ck-list-advanced-label {
          white-space: normal;
        }
      }

      .ck-list-cards {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ck-list-cards-placeholder {
        padding: 12px 0;
      }
      .ck-list-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        cursor: pointer;
      }
      .ck-list-card:hover {
        box-shadow: none;
      }
      .ck-list-card:focus-visible {
        outline: 2px solid var(--text);
        outline-offset: 3px;
      }
      .ck-list-card-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .ck-list-card-title {
        font-weight: 600;
        font-size: var(--ck-font-label);
        min-width: 0;
        flex: 1 1 auto;
      }
      .ck-list-card-title-row .ck-status-pill {
        margin-left: auto;
      }
      .ck-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        font-weight: 600;
        font-size: calc(var(--ck-font-label) * 0.85);
        line-height: 1;
        white-space: nowrap;
      }
      .ck-status-pill[data-status-key="onClose"] {
        border-color: var(--border);
        background: transparent;
        color: var(--text);
      }
      .ck-status-pill[data-status-key="reOpened"] {
        border-color: var(--border);
        background: transparent;
        color: var(--text);
      }
      .ck-record-status-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }
      .ck-record-status-label {
        font-size: calc(var(--ck-font-label) * 0.85);
        letter-spacing: 0;
        text-transform: none;
        color: var(--muted);
        font-weight: 600;
      }
      .ck-list-card-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        padding-top: 10px;
        border-top: 1px dashed var(--border);
      }
      .ck-list-card-action {
        display: inline-flex;
        align-items: center;
      }
      .ck-list-icon--warning { color: var(--accent); }
      .ck-list-icon--check { color: var(--accent); }
      .ck-list-icon--error { color: var(--accent); }
      .ck-list-icon--info { color: var(--accent); }
      .ck-list-icon--external { color: var(--accent); }
      .ck-list-icon--lock { color: var(--accent); }
      .ck-list-icon--edit { color: var(--accent); }
      .ck-list-icon--view { color: var(--accent); }
      .ck-list-icon--copy { color: var(--accent); }
      .ck-list-legend {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-start;
        color: var(--muted);
        font-size: calc(var(--ck-font-label) * 0.85);
      }
      .ck-list-legend--bottomBar {
        margin-top: 0;
        padding: 2px 0;
        padding-left: 20px;
      }
      .ck-list-legend-title {
        font-weight: 600;
        color: var(--text);
      }
      .ck-list-legend-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ck-list-legend-list[data-columns="2"] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 16px;
        row-gap: 6px;
      }
      .ck-list-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        position: relative;
      }
      .ck-list-legend-pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        font-weight: 600;
        font-size: calc(var(--ck-font-label) * 0.85);
        line-height: 1;
        white-space: nowrap;
      }
      .ck-list-legend-pill[data-tone="muted"] {
        border-color: var(--border);
        background: transparent;
        color: var(--text);
      }
      .ck-list-legend-pill[data-tone="strong"] {
        border-color: var(--border);
        background: transparent;
        color: var(--text);
      }
      .ck-list-legend-text strong {
        font-weight: 600;
      }
      .required-star {
        color: currentColor;
        font-size: calc(var(--ck-font-label) * 0.85);
      }
      .line-item-toolbar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 12px; justify-content: space-between; }
      .line-item-toolbar-actions { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
      .line-item-toolbar .section-selector { flex: 1 1 220px; }
      .line-item-toolbar .section-selector label { margin-bottom: 4px; display: inline-block; }
      .line-item-toolbar .section-selector select { width: 100%; }
      .line-item-totals { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .line-item-row { border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
      .inline-field { min-width: 180px; }
      .line-actions { display: flex; justify-content: flex-end; }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 0.35em 0.55em;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: calc(var(--ck-font-label) * 0.85);
        font-weight: 600;
        line-height: 1;
        margin-right: 6px;
        white-space: nowrap;
      }
      .error {
        color: var(--danger);
        font-size: calc(var(--ck-font-label) * 0.85);
        font-weight: 600;
        line-height: 1.15;
      }
      .warning {
        color: var(--text);
        font-size: calc(var(--ck-font-label) * 0.85);
        font-weight: 600;
        line-height: 1.15;
      }
      .line-summary-table { overflow-x: auto; margin-top: 8px; }
      .line-summary-table table { width: 100%; border-collapse: collapse; min-width: 480px; }
      .line-summary-table th, .line-summary-table td {
        padding: 6px 10px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        white-space: nowrap;
      }
      .line-summary-table tbody tr:nth-child(odd) { background: transparent; }
      .sticky-submit {
        position: fixed;
        left: 0;
        right: 0;
        bottom: var(--vv-bottom);
        /* Use safe-area inset to avoid iOS home-indicator clipping */
        padding: 14px 18px max(14px, var(--safe-bottom));
        background: var(--bg);
        border-top: 1px solid var(--border);
        z-index: 2000;
      }
      .sticky-submit button {
        min-width: 200px;
        box-shadow: none;
      }
      /* Bottom action bar (Excel-like) */
      .ck-bottom-bar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: var(--vv-bottom);
        /* Add extra breathing room above iPhone curved corners / home indicator. */
        padding: 12px 32px max(32px, calc(var(--safe-bottom) + 10px));
        background: var(--bg);
        border-top: 1px solid var(--border);
        z-index: 2000;
      }
      .ck-bottom-bar .ck-actionbar-notice-inner {
        display: block;
        margin-bottom: 10px;
      }
      .ck-bottom-bar[data-notice-only="1"] .ck-actionbar-notice-inner {
        margin-bottom: 0;
      }
      .ck-bottom-bar-inner {
        max-width: 1100px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-inline-size: 0;
      }
      .ck-bottom-capsule {
        flex: 1 1 auto;
        min-inline-size: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 999px;
        background: transparent;
        border: 1px solid var(--border);
        box-shadow: none;
      }
      .ck-bottom-item {
        /* Size to label (no ellipsis). If space is tight, the capsule wraps buttons onto a new row. */
        flex: 1 0 auto;
        background: transparent;
        color: var(--text);
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 12px 14px;
        min-height: calc(var(--control-height) * 0.78);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-weight: 600;
        font-size: var(--ck-font-pill);
        white-space: nowrap;
        box-shadow: none;
      }
      .ck-bottom-label {
        /* Show labels in full; wrapping happens at the button level (via the capsule). */
        min-inline-size: 0;
        white-space: nowrap;
      }
      .ck-bottom-item--icon {
        flex: 0 0 auto;
        padding: 12px 14px;
        min-inline-size: calc(var(--control-height) * 0.78);
      }
      .ck-bottom-item.active {
        background: var(--ck-secondary-bg);
        border-color: var(--ck-secondary-border);
        color: var(--ck-secondary-text);
      }
      .ck-bottom-item.ck-bottom-item--primary,
      .ck-bottom-item.ck-bottom-item--primary.active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accentText);
      }
      .ck-bottom-item.ck-bottom-item--primary:disabled {
        opacity: 0.6;
      }
      .ck-bottom-item--back {
        /* Guided steps Back button: visually primary, but distinct from the Next/Submit accent color. */
        flex: 0 0 auto;
        background: transparent;
        border-color: var(--border);
        color: var(--text);
        box-shadow: none;
      }
      .ck-bottom-item--back:disabled {
        opacity: 0.6;
      }
      .ck-bottom-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      .ck-bottom-submit {
        flex: 0 0 auto;
        border-radius: 999px;
        min-height: calc(var(--control-height) * 0.78);
        padding: 12px 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-weight: 600;
        font-size: var(--ck-font-pill);
        background: var(--accent);
        border: 1px solid var(--accent);
        color: var(--accentText);
        box-shadow: none;
      }
      .ck-bottom-submit:disabled {
        opacity: 0.6;
      }
      /* Create (+) menu */
      .ck-bottom-menu-overlay {
        position: fixed;
        inset: 0;
        z-index: 2100;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 0 18px;
        background: transparent;
        pointer-events: none;
        transition: background 180ms ease;
      }
      .ck-bottom-menu-overlay.open {
        background: transparent;
        pointer-events: auto;
      }
      .ck-bottom-menu {
        position: relative;
        z-index: 1;
        width: min(760px, calc(100vw - 36px));
        /* Keep menus above the fixed bottom action bar (which can become 2 rows on small screens). */
        margin-bottom: calc(var(--vv-bottom) + var(--ck-bottom-bar-height, calc(146px + var(--safe-bottom))) + 16px);
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: none;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ck-bottom-menu-backdrop {
        position: absolute;
        inset: 0;
        border: none;
        background: transparent;
        padding: 0;
        margin: 0;
        cursor: pointer;
      }
      .ck-bottom-menu-item {
        width: 100%;
        text-align: left;
        border: 1px solid var(--ck-secondary-border);
        background: var(--ck-secondary-bg);
        color: var(--ck-secondary-text);
        border-radius: 16px;
        font-weight: 600;
        padding: 16px 18px;
        min-height: var(--control-height);
        font-size: var(--ck-font-control);
        display: inline-flex;
        align-items: center;
        gap: 10px;
        box-shadow: none;
      }
      .ck-bottom-menu-item--primary {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accentText);
      }
    </style>
  </head>
  <body>
    <div id="react-prototype-root">
      <div class="page">
        <main class="card form-card">
          <h1>Loading…</h1>
          <p>Please keep this page open. This may take a few seconds.</p>
        </main>
      </div>
    </div>
    <script>
      (function () {
        // Boot globals
        window.__WEB_FORM_DEF__ = ${defJson};
        window.__WEB_FORM_KEY__ = ${keyJson};
        window.__WEB_FORM_DEBUG__ = ${debugJson};
        window.__WEB_FORM_BOOTSTRAP__ = ${bootstrapJson};
        window.__WEB_FORM_REQUEST_PARAMS__ = ${requestParamsJson};
        window.__CK_CACHE_VERSION__ = ${cacheVersionJson};
        window.__CK_ENV_TAG__ = ${envTagJson};

        var log = function (event, payload) {
          try {
            if (typeof console === 'undefined' || typeof console.info !== 'function') return;
            console.info('[ReactForm][boot]', event, payload || {});
          } catch (e) {
            // ignore
          }
        };

        // Non-bundled forms: hydrate from a long-lived localStorage cache keyed by server cache version.
        // Version bump is controlled by createAllForms() (server-side), which invalidates __CK_CACHE_VERSION__.
        try {
          var hasDef = !!window.__WEB_FORM_DEF__;
          var cacheVersion = (window.__CK_CACHE_VERSION__ || '').toString().trim();
          var formKey = (window.__WEB_FORM_KEY__ || '').toString().trim();
          if (!hasDef && cacheVersion) {
            var cacheKey = 'ck.formDef.v1::' + cacheVersion + '::' + formKey;
            var raw = null;
            try {
              raw = window.localStorage ? window.localStorage.getItem(cacheKey) : null;
            } catch (e) {
              raw = null;
            }
            if (raw) {
              try {
                window.__WEB_FORM_DEF__ = JSON.parse(raw);
                log('config.cache.hit', { formKey: formKey || null, cacheVersion: cacheVersion });
                hasDef = !!window.__WEB_FORM_DEF__;
              } catch (e) {
                try {
                  if (window.localStorage) window.localStorage.removeItem(cacheKey);
                } catch (e2) {
                  // ignore
                }
                log('config.cache.parseError', { formKey: formKey || null, cacheVersion: cacheVersion });
              }
            } else {
              log('config.cache.miss', { formKey: formKey || null, cacheVersion: cacheVersion });
            }
          }
        } catch (e) {
          // ignore
        }

        // Start bootstrap fetch as early as possible to overlap with bundle download.
        try {
          if (!window.__WEB_FORM_DEF__ && !window.__CK_BOOTSTRAP_PROMISE__ && window.google && window.google.script && window.google.script.run) {
            var startedAt = Date.now();
            var key = (window.__WEB_FORM_KEY__ || '').toString().trim();
            log('bootstrap.prefetch.start', { formKey: key || null });
            window.__CK_BOOTSTRAP_PROMISE__ = new Promise(function (resolve, reject) {
              try {
                window.google.script.run
                  .withSuccessHandler(function (res) {
                    try {
                      window.__WEB_FORM_BOOTSTRAP__ = res || window.__WEB_FORM_BOOTSTRAP__ || {};
                    } catch (e) {
                      // ignore
                    }
                    log('bootstrap.prefetch.success', { formKey: (res && res.formKey) ? res.formKey : (key || null), elapsedMs: Date.now() - startedAt });
                    resolve(res);
                  })
                  .withFailureHandler(function (err) {
                    var msg = (err && err.message) ? err.message.toString() : (err ? err.toString() : 'unknown');
                    log('bootstrap.prefetch.error', { formKey: key || null, elapsedMs: Date.now() - startedAt, message: msg });
                    reject(err);
                  })
                  .fetchBootstrapContext(key || null);
              } catch (e) {
                log('bootstrap.prefetch.error', { formKey: key || null, elapsedMs: Date.now() - startedAt, message: e ? e.toString() : 'unknown' });
                reject(e);
              }
            });
          }
        } catch (e) {
          // ignore
        }
      })();
    </script>
  </body>
</html>`;
}
