import { WebFormDefinition } from '../types';
import { WEB_FORM_REACT_BUNDLE } from '../web/react/reactBundle';
import { isDebugEnabled } from './webform/debug';

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
const encodeBase64 = (value: string): string => {
  try {
    if (typeof Utilities !== 'undefined' && Utilities.base64Encode) {
      return Utilities.base64Encode(value, Utilities.Charset.UTF_8);
    }
  } catch (_) {
    // ignore server-side errors and fall through
  }
  // Fallbacks for non-Apps Script environments (e.g., tests or local execution)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return value;
};

let cachedBundleBase64: string | null = null;
const getBundleBase64 = (): string => {
  if (cachedBundleBase64 !== null) return cachedBundleBase64;
  // Base64 contains only A–Z/a–z/0–9/+//= so it is safe to embed directly in a single-quoted string literal.
  cachedBundleBase64 = encodeBase64(WEB_FORM_REACT_BUNDLE || '');
  return cachedBundleBase64;
};

export function buildWebFormHtml(def: WebFormDefinition, formKey: string, bootstrap?: any): string {
  const defJson = escapeJsonForScript(def);
  const keyJson = escapeJsonForScript(formKey || def?.title || '');
  const debugJson = isDebugEnabled() ? 'true' : 'false';
  const bootstrapJson = escapeJsonForScript(bootstrap || null);
  // Base64-encode the bundle to avoid parser issues when Google wraps HTML in document.write.
  const bundleBase64 = escapeScriptTerminator(getBundleBase64());

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
        /* iOS "grouped" look */
        --bg: #f2f2f7;
        --card: #ffffff;
        --border: rgba(60, 60, 67, 0.22);
        --text: #000000;
        --muted: rgba(60, 60, 67, 0.6);
        --accent: #007aff;
        --danger: #ff3b30;
        --success: #34c759;

        /* Secondary/tinted button surface (subgroup / tooltip / files) - distinct from input surfaces like segmented controls */
        --ck-secondary-bg: rgba(0, 122, 255, 0.12);
        --ck-secondary-border: rgba(0, 122, 255, 0.24);
        --ck-secondary-text: var(--accent);

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
      }
      * { box-sizing: border-box; }
      html {
        /* Prevent automatic text inflation on iOS; keep sizing consistent and intentional. */
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background: var(--bg);
        color: var(--text);
        font-size: var(--ck-font-base);
        min-height: 100vh;
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
        background: rgba(242, 242, 247, 0.88);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
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
        outline: 4px solid rgba(0, 122, 255, 0.3);
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
        font-weight: 900;
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
        font-weight: 900;
        font-size: calc(var(--ck-font-control) + 10px);
        letter-spacing: -0.6px;
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
        font-weight: 800;
        font-size: calc(var(--ck-font-label) * 0.78);
        letter-spacing: -0.2px;
        color: rgba(15, 23, 42, 0.62);
        white-space: nowrap;
      }
      .ck-app-title-right [data-tone="error"] {
        color: #b91c1c;
      }
      .ck-app-title-right [data-tone="saved"] {
        color: rgba(15, 23, 42, 0.62);
      }
      .ck-app-title-right [data-tone="saving"] {
        color: rgba(15, 23, 42, 0.62);
      }
      .ck-app-title-right [data-tone="paused"] {
        color: rgba(15, 23, 42, 0.62);
      }
      /* Left slide-in drawer */
      .ck-app-drawer-overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: rgba(15, 23, 42, 0);
        pointer-events: none;
        transition: background 180ms ease;
      }
      .ck-app-drawer-overlay.open {
        background: rgba(15, 23, 42, 0.28);
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
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.24);
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
        font-weight: 900;
        font-size: calc(var(--ck-font-control) + 6px);
        letter-spacing: -0.5px;
        line-height: 1.1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ck-app-drawer-brand-subtitle {
        font-weight: 700;
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
        font-weight: 900;
        font-size: calc(var(--ck-font-control) + 12px);
        line-height: 1;
        flex: 0 0 auto;
      }
      .ck-app-drawer-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ck-app-drawer-section-title {
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-size: calc(var(--ck-font-label) * 0.66);
      }
      .ck-app-drawer-item {
        width: 100%;
        text-align: left;
        border: 1px solid var(--ck-secondary-border);
        background: var(--ck-secondary-bg);
        color: var(--ck-secondary-text);
        border-radius: 16px;
        font-weight: 900;
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
        color: #fff;
      }
      .ck-app-drawer-select {
        width: 100%;
      }
      .ck-app-drawer-build {
        font-weight: 800;
      }
      .ck-app-drawer-divider {
        height: 1px;
        background: var(--border);
        margin: 6px 0;
      }
      header h1 { margin: 0 0 6px; font-size: 54px; letter-spacing: -0.7px; }
      header p { margin: 0 0 8px; color: var(--muted); }
      .controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        padding: 32px;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
      }
      .form-card {
        position: relative;
      }
      h2 { margin: 0 0 10px; }
      .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .field label { font-weight: 700; }
      input, select, textarea, button {
        font-size: var(--ck-font-control);
        font-family: inherit;
      }
      input[type="text"], input[type="number"], input[type="date"], input[type="file"], select, textarea {
        padding: 12px 16px;
        min-height: var(--control-height);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: #ffffff;
      }
      textarea { min-height: 110px; resize: vertical; }
      button {
        background: var(--accent);
        color: #fff;
        border: none;
        padding: 16px 22px;
        border-radius: 12px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
      .muted { color: var(--muted); font-size: 0.7em; }
      .status { margin-top: 8px; padding: 8px 10px; background: rgba(118,118,128,0.12); border: 1px solid var(--border); border-radius: 12px; }
      .inline-options { display: flex; gap: 10px; flex-wrap: wrap; }
      .inline { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
      .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .tabs button { background: #e2e8f0; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; }
      .tabs button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
      .list-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }
      .list-toolbar .ck-list-search-label {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 800;
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
      /* Hide native iOS/WebKit search clear so we can show our own red "×". */
      .list-toolbar input[type="search"]::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
        display: none;
      }
      /* Leave room for right-side icons (gear / clear) only when they are present. */
      .list-toolbar .ck-list-search-control.ck-has-icons input[type="search"],
      .list-toolbar .ck-list-search-control.ck-has-icons input[type="date"] {
        padding-right: 56px;
      }
      .list-toolbar .ck-list-search-control.ck-has-clear.ck-has-advanced input[type="search"],
      .list-toolbar .ck-list-search-control.ck-has-clear.ck-has-advanced input[type="date"] {
        padding-right: 104px;
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
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--muted);
        font-weight: 900;
        font-size: 1.05em;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: none;
      }
      /* When the clear "×" is present, move the gear left so the buttons are not cramped. */
      .list-toolbar .ck-list-search-control.ck-has-clear .ck-list-search-advanced-icon {
        right: 56px;
      }
      .list-toolbar .ck-list-search-advanced-icon:hover {
        background: rgba(118,118,128,0.12);
      }
      .list-toolbar .ck-list-search-advanced-icon:focus-visible {
        outline: 4px solid rgba(0, 122, 255, 0.28);
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
        color: var(--danger);
        font-weight: 900;
        font-size: 1.2em;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: none;
      }
      .list-toolbar .ck-list-search-clear-icon:focus-visible {
        outline: 4px solid rgba(255, 59, 48, 0.28);
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
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        word-break: break-word;
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
        outline: 4px solid rgba(0, 122, 255, 0.28);
        outline-offset: 3px;
        border-radius: 10px;
      }
      .ck-list-sort-indicator { font-size: 0.85em; opacity: 0.75; }
      .truncate-link {
        display: inline-block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: inherit;
      }
      .truncate-link:hover { text-decoration: underline; }
      .inline-link {
        color: var(--accent);
        text-decoration: none;
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
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        text-decoration: none;
      }
      .ck-list-nav:hover { text-decoration: underline; }
      .ck-list-nav:focus-visible {
        outline: 4px solid rgba(0, 122, 255, 0.28);
        outline-offset: 3px;
        border-radius: 10px;
      }
      .ck-list-nav--warning { color: #b45309; }
      .ck-list-nav--muted { color: var(--muted); font-weight: 700; }
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
        background: #e2e8f0;
        color: #0f172a;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 8px 12px;
      }
      .ck-list-view-toggle > button.active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      .ck-list-advanced-panel {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(118,118,128,0.06);
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
        font-weight: 800;
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
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        cursor: pointer;
      }
      .ck-list-card:hover {
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
      }
      .ck-list-card:focus-visible {
        outline: 4px solid rgba(0, 122, 255, 0.28);
        outline-offset: 3px;
      }
      .ck-list-card-title {
        font-weight: 900;
        font-size: 1.05em;
        margin-bottom: 10px;
      }
      .ck-list-card-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        padding-top: 10px;
        border-top: 1px dashed #e2e8f0;
      }
      .ck-list-icon--warning { color: #b45309; }
      .ck-list-icon--check { color: #16a34a; }
      .ck-list-icon--error { color: #b91c1c; }
      .ck-list-icon--info { color: #2563eb; }
      .ck-list-icon--external { color: var(--accent); }
      .ck-list-icon--lock { color: var(--muted); }
      .ck-list-icon--edit { color: var(--accent); }
      .ck-list-icon--view { color: var(--accent); }
      .ck-list-legend {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        align-items: center;
        color: var(--muted);
        font-size: 0.85em;
      }
      .ck-list-legend--bottomBar {
        margin-top: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding: 2px 0;
        padding-left: 40px;
      }
      .ck-list-legend-title {
        font-weight: 800;
        color: var(--text);
      }
      .ck-list-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
      }
      .required-star {
        color: #dc2626;
        font-size: 0.9em;
      }
      .line-item-toolbar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 12px; justify-content: space-between; }
      .line-item-toolbar-actions { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
      .line-item-toolbar .section-selector { flex: 1 1 220px; }
      .line-item-toolbar .section-selector label { margin-bottom: 4px; display: inline-block; }
      .line-item-toolbar .section-selector select { width: 100%; }
      .line-item-totals { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .line-item-row { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
      .inline-field { min-width: 180px; }
      .line-actions { display: flex; justify-content: flex-end; }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 0.35em 0.55em;
        background: #e2e8f0;
        border-radius: 999px;
        font-size: 0.75em;
        font-weight: 800;
        line-height: 1;
        margin-right: 6px;
        white-space: nowrap;
      }
      .error {
        color: #b91c1c;
        font-size: calc(var(--ck-font-label) * 0.85);
        font-weight: 800;
        line-height: 1.15;
      }
      .warning {
        color: #b45309;
        font-size: calc(var(--ck-font-label) * 0.85);
        font-weight: 800;
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
      .line-summary-table tbody tr:nth-child(odd) { background: #f8fafc; }
      .sticky-submit {
        position: fixed;
        left: 0;
        right: 0;
        bottom: var(--vv-bottom);
        /* Use safe-area inset to avoid iOS home-indicator clipping */
        padding: 14px 18px max(14px, var(--safe-bottom));
        background: rgba(248, 248, 248, 0.92);
        border-top: 1px solid rgba(60, 60, 67, 0.22);
        backdrop-filter: saturate(180%) blur(18px);
        -webkit-backdrop-filter: saturate(180%) blur(18px);
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
        background: rgba(242, 242, 247, 0.92);
        border-top: 1px solid rgba(60, 60, 67, 0.22);
        backdrop-filter: saturate(180%) blur(18px);
        -webkit-backdrop-filter: saturate(180%) blur(18px);
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
        background: rgba(255, 255, 255, 0.75);
        border: 1px solid var(--border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
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
        font-weight: 900;
        font-size: calc(var(--ck-font-pill) * 1.05);
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
      .ck-bottom-item--back {
        /* Guided steps Back button: visually primary, but distinct from the Next/Submit accent color. */
        flex: 0 0 auto;
        background: rgba(255, 59, 48, 0.14);
        border-color: rgba(255, 59, 48, 0.28);
        color: #b42318;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
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
        font-weight: 900;
        font-size: calc(var(--ck-font-pill) * 1.05);
        background: var(--accent);
        border: 1px solid var(--accent);
        color: #fff;
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
        background: rgba(15, 23, 42, 0);
        pointer-events: none;
        transition: background 180ms ease;
      }
      .ck-bottom-menu-overlay.open {
        background: rgba(15, 23, 42, 0.22);
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
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.24);
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
        font-weight: 900;
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
        color: #fff;
      }
    </style>
  </head>
  <body>
    <div id="react-prototype-root">
      <div class="page">
        <header class="ck-app-header">
          <button class="ck-app-avatar-btn" type="button" disabled>
            <div class="ck-app-avatar">CK</div>
          </button>
          <div class="ck-app-title-row">
            <div class="ck-app-title">Loading…</div>
            <div class="ck-app-title-right">
              <span data-tone="info">Starting Community Kitchen form…</span>
            </div>
          </div>
        </header>
        <main class="card form-card">
          <h1>Loading…</h1>
          <p>Please keep this page open. This may take a few seconds.</p>
          <p class="muted" data-boot-copy="slow">Still loading… your connection may be slow. Don’t close the page.</p>
        </main>
      </div>
    </div>
    <script>window.__WEB_FORM_DEF__ = ${defJson}; window.__WEB_FORM_KEY__ = ${keyJson}; window.__WEB_FORM_DEBUG__ = ${debugJson}; window.__WEB_FORM_BOOTSTRAP__ = ${bootstrapJson};</script>
    <script>
      // Decode + eval to keep the inline script content parser-safe within Google wrappers.
      (function() {
        var decoded = typeof atob === 'function' ? atob('${bundleBase64}') : '${bundleBase64}';
        (0, eval)(decoded);
      })();
    </script>
  </body>
</html>`;
}
