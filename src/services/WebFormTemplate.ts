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
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
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

        --radius-card: 26px;
        --radius-control: 18px;
        --control-height: 96px;
        --safe-bottom: env(safe-area-inset-bottom, 0px);
        --safe-top: env(safe-area-inset-top, 0px);
        /* visualViewport-driven inset (Safari bottom UI / in-app browsers) */
        --vv-bottom: 0px;
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
        font-size: 32px;
        min-height: 100vh;
      }
      @supports (min-height: 100dvh) {
        body { min-height: 100dvh; }
      }
      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      /* Only the edit form view has a fixed bottom action bar; add scroll room so the last field
         never ends up behind it (accounts for iOS safe-area + visualViewport inset). */
      .page.ck-page-form {
        padding-bottom: calc(22px + 146px + var(--safe-bottom) + var(--vv-bottom));
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
        font-size: 32px;
        font-family: inherit;
      }
      input[type="text"], input[type="number"], input[type="date"], input[type="file"], select, textarea {
        padding: 18px 22px;
        min-height: var(--control-height);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: #ffffff;
      }
      textarea { min-height: 120px; resize: vertical; }
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
      .muted { color: var(--muted); font-size: 20px; }
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
        align-items: flex-end;
        margin-bottom: 12px;
      }
      .list-toolbar input[type="search"] {
        flex: 1 1 220px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
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
      .error { color: #b91c1c; font-size: 15px; }
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
    </style>
  </head>
  <body>
    <div id="react-prototype-root"></div>
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
