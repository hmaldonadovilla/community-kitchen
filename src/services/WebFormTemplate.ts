import { WebFormDefinition } from '../types';
import { WEB_FORM_REACT_BUNDLE } from '../web/react/reactBundle';

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

export function buildWebFormHtml(def: WebFormDefinition, formKey: string): string {
  const defJson = escapeJsonForScript(def);
  const keyJson = escapeJsonForScript(formKey || def?.title || '');
  // Base64-encode the bundle to avoid parser issues when Google wraps HTML in document.write.
  const bundleBase64 = escapeScriptTerminator(encodeBase64(WEB_FORM_REACT_BUNDLE || ''));

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      :root {
        --bg: #f4f6fb;
        --card: #ffffff;
        --border: #e2e8f0;
        --text: #0f172a;
        --muted: #475569;
        --accent: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
        background: radial-gradient(circle at 15% 20%, rgba(37, 99, 235, 0.08), transparent 32%),
                    radial-gradient(circle at 85% 10%, rgba(14, 165, 233, 0.08), transparent 38%),
                    var(--bg);
        color: var(--text);
        min-height: 100vh;
      }
      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      header h1 { margin: 0 0 4px; font-size: 32px; letter-spacing: -0.3px; }
      header p { margin: 0 0 8px; color: var(--muted); }
      .controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 16px 42px rgba(15, 23, 42, 0.06);
      }
      .form-card {
        padding-bottom: 96px;
        position: relative;
      }
      h2 { margin: 0 0 10px; }
      .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .field label { font-weight: 700; }
      input, select, textarea, button {
        font-size: 16px;
        font-family: inherit;
      }
      input[type="text"], input[type="number"], input[type="date"], input[type="file"], select, textarea {
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      textarea { min-height: 120px; resize: vertical; }
      button {
        background: var(--accent);
        color: #fff;
        border: none;
        padding: 10px 16px;
        border-radius: 10px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
      .muted { color: var(--muted); font-size: 14px; }
      .status { margin-top: 8px; padding: 8px 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; }
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
      .line-item-toolbar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
      .line-item-toolbar .section-selector { flex: 1 1 220px; }
      .line-item-toolbar .section-selector label { margin-bottom: 4px; display: inline-block; }
      .line-item-toolbar .section-selector select { width: 100%; }
      .line-item-row { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
      .inline-field { min-width: 180px; }
      .line-actions { display: flex; justify-content: flex-end; }
      .pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #e2e8f0; border-radius: 999px; font-size: 13px; margin-right: 6px; }
      .error { color: #b91c1c; font-size: 13px; }
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
        position: sticky;
        bottom: 16px;
        display: flex;
        justify-content: flex-end;
        padding: 12px 0 4px;
        background: linear-gradient(180deg, rgba(244,246,251,0) 0%, var(--bg) 70%);
        z-index: 20;
      }
      .sticky-submit button {
        min-width: 160px;
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
      }
    </style>
  </head>
  <body>
    <div id="react-prototype-root"></div>
    <script>window.__WEB_FORM_DEF__ = ${defJson}; window.__WEB_FORM_KEY__ = ${keyJson};</script>
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
