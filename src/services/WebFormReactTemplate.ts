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

export function buildReactWebFormHtml(def: WebFormDefinition, formKey: string): string {
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
