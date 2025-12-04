import { WebFormDefinition } from '../types';
import { WEB_FORM_BUNDLE } from '../web/webformBundle';

/**
 * Builds the HTML string for the web form. Kept as a separate module to keep
 * WebFormService focused on data and submission logic.
 */
const SCRIPT_CLOSE_PATTERN = /<\/script/gi;
const SCRIPT_CLOSE_ESCAPED = String.raw`<\\/script`;
const JS_UNSAFE_CHARS = /[\u2028\u2029]/g;
const replaceScriptTerminators = (value: string): string => {
  const str = value.toString();
  const replaceAllFn = (str as any).replaceAll as ((pattern: RegExp | string, replacement: string) => string) | undefined;
  if (typeof replaceAllFn === 'function') {
    return replaceAllFn.call(str, SCRIPT_CLOSE_PATTERN, SCRIPT_CLOSE_ESCAPED);
  }
  // Fallback for ES2019 target
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
const escapeForSrcdoc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const isServerDebugEnabled = (): boolean => {
  try {
    const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
      ? PropertiesService.getScriptProperties()
      : undefined;
    const flag = props?.getProperty('CK_DEBUG');
    if (!flag) return false;
    return flag === '1' || flag.toLowerCase() === 'true';
  } catch (_) {
    return false;
  }
};

export function buildLegacyWebFormHtml(def: WebFormDefinition, formKey: string): string {
  const debugEnabled = isServerDebugEnabled();
  const defJson = escapeJsonForScript(def);
  const keyJson = escapeJsonForScript(formKey || def?.title || '');
  const bundleScript = escapeScriptTerminator(WEB_FORM_BUNDLE || '');

  const formHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      :root {
        --bg: #f5f7fb;
        --card: #ffffff;
        --stroke: #e4e7ef;
        --text: #0f172a;
        --muted: #64748b;
        --accent: #2563eb;
        --accent-2: #0ea5e9;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Manrope", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: clamp(26px, 4.2vw, 29px);
        background: radial-gradient(circle at 20% 20%, rgba(14,165,233,0.08), transparent 40%),
                    radial-gradient(circle at 80% 0%, rgba(37,99,235,0.08), transparent 35%),
                    var(--bg);
        color: var(--text);
        min-height: 100vh;
        display: flex;
        justify-content: center;
      }

      .page {
        width: 100%;
        max-width: 1100px;
        padding: 12px 10px 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 100vh;
      }

      .topbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }

      .title-block h1 { margin: 0 0 4px; font-size: clamp(38px, 5.8vw, 43px); letter-spacing: -0.3px; }
      .title-block p { margin: 0; color: var(--muted); font-size: clamp(24px, 4.1vw, 26px); line-height: 1.7; }

      .control {
        background: var(--card);
        border: 1px solid var(--stroke);
        border-radius: 16px;
        padding: 12px 16px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        min-width: 180px;
        justify-content: space-between;
      }

      .control label { font-weight: 800; font-size: 24px; color: var(--muted); margin: 0; }

      select#lang-select {
        border: none;
        background: transparent;
        font-size: 26px;
        font-weight: 800;
        color: var(--text);
        padding: 10px 10px;
        outline: none;
        min-width: 120px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--stroke);
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 18px 45px rgba(15,23,42,0.08);
        width: 100%;
      }

      form { display: flex; flex-direction: column; gap: 14px; }

      .field {
        padding: 12px;
        border: 1px solid var(--stroke);
        border-radius: 12px;
        background: #fdfefe;
      }

      .field label {
        font-weight: 800;
        font-size: 26px;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .badge { background: rgba(37,99,235,0.08); color: var(--accent); padding: 2px 8px; border-radius: 999px; font-size: 12px; }

      input[type="text"], input[type="date"], input[type="number"], select, textarea, input[type="file"] {
        width: 100%;
        padding: 18px;
        border: 1px solid var(--stroke);
        border-radius: 14px;
        font-size: 26px;
        background: #ffffff;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        -webkit-appearance: none;
        appearance: none;
      }

      input[type="date"] { font-size: 26px; min-height: 72px; }

      input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); outline: none; }
      textarea { min-height: 170px; resize: vertical; font-size: 26px; }

      .inline { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

      .line-item { border: 1px dashed var(--stroke); padding: 10px; border-radius: 12px; background: #f8fbff; }
      .line-item-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: end; }
      .line-item-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .line-item-rows { display: flex; flex-direction: column; gap: 10px; }
      .line-item-totals { margin-top: 8px; padding: 10px; border-radius: 10px; background: #eef6ff; border: 1px solid var(--stroke); display: flex; flex-wrap: wrap; gap: 10px; font-weight: 800; font-size: 22px; color: var(--text); }
      .line-item-total-pill { background: #fff; border: 1px solid var(--stroke); padding: 8px 12px; border-radius: 10px; box-shadow: inset 0 0 0 1px rgba(37,99,235,0.08); }
      .is-hidden-field { display: none !important; }
      .required-star { color: #b91c1c; display: inline-block; margin-right: 6px; }

      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chips label { border: 1px solid var(--stroke); padding: 14px 16px; border-radius: 12px; background: #fff; font-weight: 800; font-size: 25px; }

      input[type="checkbox"] {
        width: 26px;
        height: 26px;
        accent-color: var(--accent);
        flex-shrink: 0;
      }

      button { font-weight: 800; letter-spacing: 0.2px; cursor: pointer; }
      button.primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border: none; padding: 22px 18px; border-radius: 14px; width: 100%; font-size: 26px; box-shadow: 0 12px 30px rgba(37,99,235,0.25); }
      button.secondary { background: #eef2ff; color: var(--accent); border: none; padding: 16px 14px; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(37,99,235,0.12); font-size: 25px; }

      .actions { position: sticky; bottom: 0; background: linear-gradient(180deg, transparent, var(--bg) 30%); padding: 10px 0 4px; }
      .status { display: block; margin-top: 8px; font-size: 18px; line-height: 1.5; color: var(--muted); font-weight: 700; }
      .error { color: #b91c1c; }
      .success { color: #15803d; }
      .field-error { margin-top: 8px; color: #b91c1c; font-size: 14px; }
      .has-error { border-color: #b91c1c !important; box-shadow: 0 0 0 3px rgba(185,28,28,0.12) !important; }

      @media (max-width: 640px) {
        .page { padding: 12px 12px 20px; }
        .topbar { flex-direction: column; align-items: flex-start; }
        .card { padding: 12px; }
        .field { padding: 10px; }
        button.primary { width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="topbar">
        <div class="title-block">
          <h1 id="form-title"></h1>
          <p id="form-description"></p>
        </div>
        <div class="control">
          <label for="lang-select" data-en-label="Language" data-fr-label="Langue" data-nl-label="Taal">Language</label>
          <select id="lang-select" name="language"></select>
        </div>
      </div>
      <div class="card">
        <div id="view-container">
          <div id="form-view">
            <form id="web-form">
              <input type="hidden" name="formKey" value=${keyJson} />
              <input type="hidden" name="id" id="record-id" value="" />
              <div id="questions"></div>
              <div class="actions" style="display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                  <button id="back-to-list-inline" class="secondary" type="button" style="display:none;flex:1;max-width:33%;">Back to list</button>
                  <button class="primary" type="submit" style="flex:2;">Submit</button>
                </div>
                <span id="status" class="status"></span>
              </div>
            </form>
          </div>
          <div id="summary-view" style="display:none;padding:12px;"></div>
          <div id="followup-view" style="display:none;padding:12px;"></div>
          <div id="list-view" style="display:none;padding:12px;"></div>
          <div id="view-actions" style="display:none;padding:12px 0;gap:10px;flex-wrap:wrap;">
            <button id="new-record" class="secondary" type="button">New record</button>
            <button id="back-to-form" class="secondary" type="button">Submit another</button>
          </div>
        </div>
      </div>
      <div id="line-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.48);display:none;align-items:center;justify-content:center;z-index:9999;">
        <div class="panel" style="background:#fff;border-radius:16px;padding:16px;width:min(520px,92vw);box-shadow:0 18px 40px rgba(0,0,0,0.25);display:flex;flex-direction:column;gap:12px;">
          <h3 id="overlay-title" style="margin:0;font-size:28px;">Select lines</h3>
          <div class="options" id="overlay-options" style="max-height:360px;overflow:auto;display:flex;flex-direction:column;gap:10px;"></div>
          <div class="actions" style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="overlay-cancel" class="secondary" type="button">Cancel</button>
            <button id="overlay-confirm" class="primary" type="button">Add</button>
          </div>
        </div>
      </div>
    </div>
    <script>
      if (typeof google === 'undefined' && parent && parent.google) {
        window.google = parent.google;
      }
    </script>
    <script>${bundleScript}</script>
    <script>
      const __WEB_FORM_DEBUG__ = ${debugEnabled ? 'true' : 'false'};
      try { window.__WEB_FORM_DEBUG__ = __WEB_FORM_DEBUG__; } catch (_) {}
      const definition = ${defJson};
      const formKey = ${keyJson};
      window.__WEB_FORM_DEF__ = definition;
      window.__WEB_FORM_KEY__ = formKey;
      if (__WEB_FORM_DEBUG__ && console && console.info) {
        try {
          console.info('[WebForm] inline script loaded', { questionCount: definition.questions?.length || 0, languages: definition.languages });
          console.info('[WebForm] WebFormApp keys', Object.keys(window.WebFormApp || {}));
        } catch (_) {}
        try {
          const dsQuestions = (definition.questions || []).filter(q => q.dataSource);
          console.info('[WebForm] dataSource diagnostics', {
            count: dsQuestions.length,
            questionIds: dsQuestions.map(q => q.id)
          });
        } catch (_) {}
        try {
          const effectQuestions = (definition.questions || []).filter(q => Array.isArray(q.selectionEffects) && q.selectionEffects.length);
          console.info('[WebForm] selectionEffects diagnostics', {
            count: effectQuestions.length,
            entries: effectQuestions.map(q => ({
              id: q.id,
              effectCount: q.selectionEffects.length,
              triggerValues: q.selectionEffects.map(e => e.triggerValues || [])
            }))
          });
        } catch (_) {}
      }
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const originalViewport = viewportMeta?.getAttribute('content') || 'width=device-width, initial-scale=1';
      const lockedViewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

      const langSelect = document.getElementById('lang-select');
      const titleEl = document.getElementById('form-title');
      const descriptionEl = document.getElementById('form-description');
      const questionsEl = document.getElementById('questions');
      const statusEl = document.getElementById('status');
      const formEl = document.getElementById('web-form');
      const formView = document.getElementById('form-view');
      const recordIdInput = document.getElementById('record-id');
      const summaryView = document.getElementById('summary-view');
      const followupView = document.getElementById('followup-view');
      const listView = document.getElementById('list-view');
      const viewActions = document.getElementById('view-actions');
      const newRecordBtn = document.getElementById('new-record');
      const backToFormBtn = document.getElementById('back-to-form');
      const backToListInline = document.getElementById('back-to-list-inline');
      const getListStatus = () => {
        if (!listView) return null;
        if (!listStatus || !listStatus.isConnected) {
          listStatus = document.createElement('div');
          listStatus.id = 'list-status';
          listStatus.className = 'status';
          listStatus.style.marginBottom = '8px';
          listView.prepend(listStatus);
        }
        return listStatus;
      };

      const state = { language: 'EN', lineItems: {}, lastSubmissionMeta: null };
      const recordCache = {};
      const fallbackListColumns = definition.questions
        .filter(q => q.listView)
        .map(q => ({ fieldId: q.id, label: q.label, kind: 'question' }));
      const listColumns = (definition.listView && Array.isArray(definition.listView.columns) && definition.listView.columns.length)
        ? definition.listView.columns
        : fallbackListColumns;
      let listViewLoaded = false;
      let listStatus = document.getElementById('list-status');
      const defaultSortField =
        (definition.listView && definition.listView.defaultSort && definition.listView.defaultSort.fieldId) ||
        (listColumns[0] && listColumns[0].fieldId) ||
        'updatedAt';
      const defaultSortDirection =
        definition.listView && definition.listView.defaultSort && definition.listView.defaultSort.direction === 'asc'
          ? 'asc'
          : 'desc';
      const listState = {
        search: '',
        sortField: defaultSortField,
        sortDirection: defaultSortDirection,
        page: 0
      };
      let listDataRows = [];
      const dedupeRows = (rows = []) => {
        const map = new Map();
        rows.forEach((row, idx) => {
          if (!row) return;
          const key =
            row.id ||
            row.recordId ||
            [row.updatedAt || '', row.createdAt || '', idx].join('|');
          map.set(key, row);
        });
        return Array.from(map.values());
      };
      let activeActionMenu = null;
      document.addEventListener('click', event => {
        if (!activeActionMenu) return;
        const target = event.target;
        if (target && target.closest && (target.closest('.action-menu') || target.closest('.action-menu-btn'))) {
          return;
        }
        activeActionMenu.classList.add('hidden');
        activeActionMenu.style.display = 'none';
        activeActionMenu = null;
      });
      function getWebFormApp() {
        if (window.WebFormApp) return window.WebFormApp;
        try {
          if (typeof WebFormApp !== 'undefined') {
            return WebFormApp;
          }
        } catch (_) {
          // ignore
        }
        return undefined;
      }

      const initialApp = getWebFormApp();
      if (initialApp && typeof initialApp.bootstrapWebForm === 'function') {
        try {
          initialApp.bootstrapWebForm(definition, formKey, {
            mountListView: document.getElementById('list-view'),
            onReady: () => {
              if (definition.startRoute === 'list') {
                document.getElementById('form-view').style.display = 'none';
                document.getElementById('list-view').style.display = 'block';
              }
            },
          });
        } catch (err) {
          console && console.error && console.error(err);
        }
      }

      const defaultRuleMessages = {
        required: { en: 'This field is required.', fr: 'Ce champ est obligatoire.', nl: 'Dit veld is verplicht.' },
        min: (limit) => ({ en: 'Value must be >= ' + limit + '.', fr: 'La valeur doit être >= ' + limit + '.', nl: 'Waarde moet >= ' + limit + '.' }),
        max: (limit) => ({ en: 'Value must be <= ' + limit + '.', fr: 'La valeur doit être <= ' + limit + '.', nl: 'Waarde moet <= ' + limit + '.' }),
        allowed: { en: 'Please use an allowed value.', fr: 'Veuillez utiliser une valeur autorisée.', nl: 'Gebruik een toegestane waarde.' },
        disallowed: { en: 'This combination is not allowed.', fr: "Cette combinaison n'est pas autorisée.", nl: 'Deze combinatie is niet toegestaan.' }
      };
      const errorBannerMessage = {
        en: 'There are errors above. Please correct the highlighted fields.',
        fr: 'Des erreurs se trouvent plus haut. Corrigez les champs indiqués.',
        nl: 'Er staan fouten hierboven. Corrigeer de gemarkeerde velden.'
      };

      function getLangLabel(labelObj, fallback) {
        if (!labelObj) return fallback;
        const key = (state.language || 'EN').toLowerCase();
        return labelObj[key] || labelObj['en'] || fallback;
      }

      function resolveMessage(msg, fallback) {
        const fallbackText = typeof fallback === 'object' ? getLangLabel(fallback, '') : fallback;
        if (!msg) return fallbackText;
        if (typeof msg === 'string') return msg;
        return getLangLabel(msg, fallbackText);
      }

      function setRecordId(value) {
        if (recordIdInput) {
          recordIdInput.value = value || '';
        }
      }

      function showFormMode(reset = false, preserveLanguage = true) {
        if (formView) formView.style.display = 'block';
        if (summaryView) summaryView.style.display = 'none';
        if (followupView) followupView.style.display = 'none';
        if (listView) listView.style.display = 'none';
        if (viewActions) viewActions.style.display = 'none';
        if (reset) {
          setRecordId('');
          resetFormState(preserveLanguage);
        }
        if (backToFormBtn) backToFormBtn.style.display = 'inline-flex';
        if (backToListInline) backToListInline.style.display = listColumns.length ? 'inline-flex' : 'none';
        if (newRecordBtn) newRecordBtn.style.display = 'inline-flex';
      }

      function buildFollowupActions(recordId) {
        if (!recordId || !definition.followup) return [];
        const actions = [];
        if (definition.followup.pdfTemplateId) {
          actions.push({
            label: 'Create PDF',
            onClick: () => runFollowupAction('CREATE_PDF', recordId)
          });
        }
        if (definition.followup.emailTemplateId && definition.followup.emailRecipients) {
          actions.push({
            label: 'Send PDF via email',
            onClick: () => runFollowupAction('SEND_EMAIL', recordId)
          });
        }
        actions.push({
          label: 'Close record',
          onClick: () => runFollowupAction('CLOSE_RECORD', recordId)
        });
        return actions;
      }

      function runFollowupAction(actionId, recordId) {
        if (!(google && google.script && google.script.run)) {
          statusEl.textContent = 'Follow-up actions are unavailable offline.';
          statusEl.className = 'status error';
          return Promise.reject(new Error('Follow-up unavailable'));
        }
        statusEl.textContent = 'Running follow-up action...';
        statusEl.className = 'status';
        return new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler(res => {
              statusEl.textContent = (res && res.message) || 'Action completed.';
              statusEl.className = 'status success';
              if (listColumns.length) {
                renderList(true);
              }
              resolve(res);
            })
            .withFailureHandler(err => {
              statusEl.textContent = (err && err.message) ? err.message : 'Action failed.';
              statusEl.className = 'status error';
              reject(err);
            })
            .triggerFollowupAction(formKey || '', recordId, actionId);
        });
      }

      function renderList(forceRefresh = false) {
        if (!listView || !listColumns.length) return;
        if (forceRefresh) {
          listViewLoaded = false;
          listDataRows = [];
          Object.keys(recordCache).forEach(key => delete recordCache[key]);
          listState.page = 0;
        }
        const columns = listColumns.length ? listColumns : fallbackListColumns;
        const headerRefs = [];
        const pageSize = Math.min(Math.max((definition.listView && definition.listView.pageSize) || 10, 1), 10);
        const fetchRows = (pageToken) =>
          new Promise(resolve => {
            const handleSuccess = res => {
              const listPayload = res && res.list ? res.list : (res || { items: [], totalCount: 0 });
              const recordsPayload =
                res && res.records && typeof res.records === 'object' ? res.records : {};
              Object.keys(recordsPayload).forEach(key => {
                if (!key) return;
                recordCache[key] = recordsPayload[key];
              });
              resolve({ list: listPayload, records: recordsPayload });
            };
            const attempt = () => {
            if (!(google && google.script && google.script.run)) {
                setTimeout(attempt, 150);
              return;
            }
            try {
              google.script.run
                  .withSuccessHandler(handleSuccess)
                  .withFailureHandler(() => resolve({ list: { items: [], totalCount: 0 }, records: {} }))
                  .fetchSubmissionsBatch(formKey || '', undefined, pageSize, pageToken, true);
            } catch (_) {
                resolve({ list: { items: [], totalCount: 0 }, records: {} });
              }
            };
            attempt();
          });

        if (listViewLoaded && listDataRows.length && !forceRefresh) {
          updateListView();
          return;
        }

        listViewLoaded = true;
        listView.innerHTML = '';
        const statusNode = getListStatus();
        if (statusNode) {
          statusNode.textContent = 'Loading...';
          statusNode.style.display = 'block';
        }

        const controls = buildListControls(columns);
        listView.appendChild(controls);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '8px';
        const header = document.createElement('tr');
        columns.forEach(col => {
          const th = document.createElement('th');
          th.style.textAlign = 'left';
          th.style.borderBottom = '1px solid #e2e8f0';
          th.style.padding = '6px 4px';
          th.style.cursor = 'pointer';
          th.style.userSelect = 'none';
          th.style.whiteSpace = 'nowrap';
          const label =
            (col.label && (col.label[state.language.toLowerCase()] || col.label.en)) ||
            col.label?.en ||
            col.label?.fr ||
            col.label?.nl ||
            col.fieldId;
          const labelSpan = document.createElement('span');
          labelSpan.textContent = label;
          const icon = document.createElement('span');
          icon.style.marginLeft = '6px';
          icon.style.fontSize = '11px';
          icon.style.color = '#94a3b8';
          icon.textContent = '↕';
          th.appendChild(labelSpan);
          th.appendChild(icon);
          th.addEventListener('click', () => handleHeaderSort(col.fieldId));
          headerRefs.push({ fieldId: col.fieldId, icon });
          header.appendChild(th);
        });
        const actionTh = document.createElement('th');
        actionTh.style.textAlign = 'center';
        actionTh.style.borderBottom = '1px solid #e2e8f0';
        actionTh.style.padding = '6px 4px';
        actionTh.textContent = '';
        header.appendChild(actionTh);
        table.appendChild(header);
        listView.appendChild(table);

        const pager = document.createElement('div');
        pager.style.display = 'flex';
        pager.style.alignItems = 'center';
        pager.style.gap = '8px';
        listView.appendChild(pager);

        loadAllRows()
          .then(() => {
            if (statusNode) {
              statusNode.textContent = listDataRows.length ? '' : 'No records yet.';
              statusNode.style.display = listDataRows.length ? 'none' : 'block';
            }
            updateListView();
          })
          .catch(() => {
            if (statusNode) {
              statusNode.textContent = 'Failed to load records.';
              statusNode.style.display = 'block';
            }
          });

        function buildListControls(columns) {
          const wrapper = document.createElement('div');
          wrapper.style.display = 'flex';
          wrapper.style.flexWrap = 'wrap';
          wrapper.style.alignItems = 'flex-end';
          wrapper.style.gap = '12px';
          wrapper.style.marginBottom = '12px';

          const buildFieldLabel = (text) => {
            const label = document.createElement('label');
            label.textContent = text;
            label.style.fontSize = '12px';
            label.style.textTransform = 'uppercase';
            label.style.letterSpacing = '0.04em';
            label.style.color = '#475569';
            return label;
          };

          const searchGroup = document.createElement('div');
          searchGroup.style.display = 'flex';
          searchGroup.style.flexDirection = 'column';
          searchGroup.style.flex = '1 1 260px';
          searchGroup.appendChild(buildFieldLabel('Search'));
          const searchInput = document.createElement('input');
          searchInput.type = 'search';
          searchInput.placeholder = 'Search records…';
          searchInput.value = listState.search;
          searchInput.style.padding = '6px 10px';
          searchInput.style.border = '1px solid #cbd5f5';
          searchInput.style.borderRadius = '6px';
          let searchTimer;
          searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
              listState.search = searchInput.value.trim();
              listState.page = 0;
              updateListView();
            }, 200);
          });
          searchGroup.appendChild(searchInput);
          wrapper.appendChild(searchGroup);

          const hint = document.createElement('span');
          hint.textContent = 'Tip: click a column header to sort.';
          hint.style.flex = '1 1 200px';
          hint.style.fontSize = '12px';
          hint.style.color = '#64748b';
          wrapper.appendChild(hint);

          return wrapper;
        }

        function loadAllRows() {
          listDataRows = [];
          return new Promise((resolve, reject) => {
            const collect = token => {
              fetchRows(token)
                .then(payload => {
                  const listPayload = payload && payload.list ? payload.list : { items: [] };
                  const rows = listPayload.items || [];
                  listDataRows = dedupeRows(listDataRows.concat(rows));
                  if (listPayload.nextPageToken) {
                    collect(listPayload.nextPageToken);
        } else {
                    resolve();
                  }
                })
                .catch(reject);
            };
            collect();
          });
        }

        function updateListView() {
          const filtered = sortRows(applySearch(listDataRows));
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          listState.page = Math.min(listState.page, totalPages - 1);
          const start = listState.page * pageSize;
          const visible = filtered.slice(start, start + pageSize);
          renderRows(visible);
          renderPager(totalPages, filtered.length);
          refreshSortIndicators();
        }

        function applySearch(rows) {
          return rows.filter(row => matchesSearch(row));
        }

        function matchesSearch(row) {
          if (!listState.search) return true;
          const normalized = Object.values(row || {})
            .map(val => (Array.isArray(val) ? val.join(', ') : val ?? ''))
            .join(' ')
            .toLowerCase();
          return normalized.includes(listState.search.toLowerCase());
        }

        function sortRows(rows) {
          const field = listState.sortField || 'updatedAt';
          const direction = listState.sortDirection === 'asc' ? 1 : -1;
          return rows.slice().sort((a, b) => {
            const valA = normalizeSortValue(a[field]);
            const valB = normalizeSortValue(b[field]);
            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
            return 0;
          });
        }

        function normalizeSortValue(value) {
          if (value === undefined || value === null || value === '') return '';
          if (typeof value === 'number') return value;
          if (value instanceof Date) return value.getTime();
          const text = Array.isArray(value) ? value.join(', ') : value.toString();
          const timestamp = Date.parse(text);
          if (!Number.isNaN(timestamp) && text.includes('T')) {
            return timestamp;
          }
          return text.toLowerCase();
        }

        function renderRows(rows) {
          table.querySelectorAll('tr:not(:first-child)').forEach(row => row.remove());
          const fragment = document.createDocumentFragment();
          rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'default';
            columns.forEach(col => {
              const td = document.createElement('td');
              td.style.borderBottom = '1px solid #f1f5f9';
              td.style.padding = '6px 4px';
              const val = row[col.fieldId];
              if (col.fieldId === 'pdfUrl' && val) {
                const link = document.createElement('a');
                link.href = val;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Open PDF';
                link.style.color = '#2563eb';
                link.style.textDecoration = 'none';
                td.appendChild(link);
              } else {
                td.textContent = formatListValue(col.fieldId, val);
              }
              tr.appendChild(td);
            });
            const actionsTd = document.createElement('td');
            actionsTd.style.borderBottom = '1px solid #f1f5f9';
            actionsTd.style.padding = '6px 4px';
            actionsTd.style.textAlign = 'right';
            if (row.id) {
              actionsTd.appendChild(buildActionMenu(row));
            }
            tr.appendChild(actionsTd);
            fragment.appendChild(tr);
          });
          table.appendChild(fragment);
        }

        function handleHeaderSort(fieldId) {
          if (listState.sortField === fieldId) {
            listState.sortDirection = listState.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            listState.sortField = fieldId;
            listState.sortDirection = 'asc';
          }
          listState.page = 0;
          updateListView();
        }

        function formatListValue(fieldId, value) {
          if (value === undefined || value === null || value === '') return '';
          if (fieldId === 'createdAt' || fieldId === 'updatedAt') {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
              return date.toLocaleString();
            }
          }
          if (Array.isArray(value)) return value.join(', ');
          return value.toString();
        }

        function refreshSortIndicators() {
          headerRefs.forEach(ref => {
            if (!ref || !ref.icon) return;
            if (ref.fieldId === listState.sortField) {
              ref.icon.textContent = listState.sortDirection === 'asc' ? '▲' : '▼';
              ref.icon.style.color = '#0f172a';
              ref.icon.style.opacity = '1';
            } else {
              ref.icon.textContent = '↕';
              ref.icon.style.color = '#94a3b8';
              ref.icon.style.opacity = '0.6';
            }
          });
        }

        function buildActionMenu(row) {
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ghost action-menu-btn';
          btn.textContent = '⋮';
          wrapper.appendChild(btn);
          const menu = document.createElement('div');
          menu.className = 'action-menu hidden';
          menu.style.position = 'absolute';
          menu.style.top = 'calc(100% + 4px)';
          menu.style.right = '0';
          menu.style.background = '#fff';
          menu.style.border = '1px solid #e2e8f0';
          menu.style.borderRadius = '8px';
          menu.style.boxShadow = '0 8px 24px rgba(15,23,42,0.15)';
          menu.style.display = 'flex';
          menu.style.flexDirection = 'column';
          menu.style.minWidth = '140px';
          menu.style.zIndex = '5';
          menu.style.display = 'none';
          wrapper.appendChild(menu);

          const hideMenu = () => {
            menu.classList.add('hidden');
            menu.style.display = 'none';
            activeActionMenu = null;
          };

          const showMenu = () => {
            menu.classList.remove('hidden');
            menu.style.display = 'flex';
            activeActionMenu = menu;
          };

          const toggleMenu = event => {
            event.stopPropagation();
            if (activeActionMenu && activeActionMenu !== menu) {
              activeActionMenu.classList.add('hidden');
              activeActionMenu.style.display = 'none';
            }
            if (menu.classList.contains('hidden')) {
              showMenu();
            } else {
              hideMenu();
            }
          };

          btn.addEventListener('click', toggleMenu);

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', event => {
            event.stopPropagation();
            hideMenu();
            openRecord(row.id, row.updatedAt || row.createdAt || '');
          });
          menu.appendChild(editBtn);

          if (definition.followup && row.id) {
            if (definition.followup.pdfTemplateId) {
              const pdfBtn = document.createElement('button');
              pdfBtn.type = 'button';
              pdfBtn.textContent = 'Create PDF';
              pdfBtn.addEventListener('click', event => {
                event.stopPropagation();
                hideMenu();
                runFollowupAction('CREATE_PDF', row.id);
              });
              menu.appendChild(pdfBtn);
            }
            if (definition.followup.emailTemplateId && definition.followup.emailRecipients) {
              const mailBtn = document.createElement('button');
              mailBtn.type = 'button';
              mailBtn.textContent = 'Send PDF';
              mailBtn.addEventListener('click', event => {
                event.stopPropagation();
                hideMenu();
                runFollowupAction('SEND_EMAIL', row.id);
              });
              menu.appendChild(mailBtn);
            }
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.textContent = 'Close';
            closeBtn.addEventListener('click', event => {
              event.stopPropagation();
              hideMenu();
              runFollowupAction('CLOSE_RECORD', row.id);
            });
            menu.appendChild(closeBtn);
          }

          return wrapper;
        }

        function renderPager(totalPages, totalItems) {
          pager.innerHTML = '';
          if (!totalItems) return;
          const info = document.createElement('span');
          info.textContent = 'Page ' + (listState.page + 1) + ' of ' + totalPages;
          pager.appendChild(info);
          if (listState.page > 0) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'secondary';
            prevBtn.type = 'button';
            prevBtn.textContent = 'Prev';
            prevBtn.addEventListener('click', () => {
              listState.page = Math.max(0, listState.page - 1);
              updateListView();
            });
            pager.appendChild(prevBtn);
          }
          if (listState.page < totalPages - 1) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'secondary';
            nextBtn.type = 'button';
            nextBtn.textContent = 'Next';
            nextBtn.addEventListener('click', () => {
              listState.page = Math.min(totalPages - 1, listState.page + 1);
              updateListView();
            });
            pager.appendChild(nextBtn);
          }
        }

        function openRecord(recordId, updatedAt) {
          const statusNode = getListStatus();
          if (statusNode) {
            statusNode.textContent = 'Loading record...';
            statusNode.style.display = 'block';
          }
          setFormInteractive(false);
          loadSubmission(recordId, true, updatedAt);
          showFormMode(false, true);
        }
      }

      function showListMode() {
        if (listView) listView.style.display = 'block';
        if (formView) formView.style.display = 'none';
        if (summaryView) summaryView.style.display = 'none';
        if (followupView) followupView.style.display = 'none';
        if (viewActions) viewActions.style.display = 'flex';
        if (newRecordBtn) newRecordBtn.style.display = 'inline-flex';
        if (backToFormBtn) backToFormBtn.style.display = 'none';
        if (backToListInline) backToListInline.style.display = 'none';
        renderList();
      }

      function setFieldValue(name, value, scope) {
        const ctx = scope || formEl;
        if (!ctx) return;
        const els = ctx.querySelectorAll('[name="' + name + '"]');
        if (!els || els.length === 0) return;
        const first = els[0];
        if (first instanceof HTMLInputElement && first.type === 'checkbox') {
          const values = Array.isArray(value)
            ? value.map(v => (v != null ? v.toString().trim() : ''))
            : (value ? value.toString().split(',').map(s => s.trim()) : []);
          els.forEach(el => {
            if (el instanceof HTMLInputElement) {
              el.checked = values.includes(el.value);
            }
          });
        } else if (first instanceof HTMLSelectElement || first instanceof HTMLTextAreaElement || first instanceof HTMLInputElement) {
          first.value = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
        }
      }

      function applyPrefill(values) {
        definition.questions.forEach(q => {
          const val = values ? values[q.id] : undefined;
          if (q.type === 'LINE_ITEM_GROUP') {
            if (!Array.isArray(val)) {
              resetLineItemGroup(q);
              return;
            }
            resetLineItemGroup(q);
            const container = document.querySelector('[data-line-item="' + q.id + '"]');
            val.forEach(entry => {
              addLineItemRow(q, container, entry || {});
              const rows = container ? container.querySelectorAll('.line-item-row') : [];
              const currentRow = rows.length ? rows[rows.length - 1] : null;
              if (!currentRow) return;
              Object.entries(entry || {}).forEach(([fid, fVal]) => {
                setFieldValue(q.id + '__' + fid, fVal, currentRow);
              });
            });
            updateLineItemTotals(q.id);
          } else if (q.type === 'CHECKBOX') {
            setFieldValue(q.id, val, formEl);
          } else if (q.type === 'CHOICE' || q.type === 'DATE' || q.type === 'NUMBER' || q.type === 'TEXT' || q.type === 'PARAGRAPH') {
            setFieldValue(q.id, val ?? '', formEl);
          }
        });
      }

      function setFormInteractive(enabled) {
        const elements = formEl.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => {
          if (enabled) {
            el.removeAttribute('disabled');
          } else {
            el.setAttribute('disabled', 'true');
          }
        });
      }

      function hydrateRecord(record) {
        if (!record) return;
        setRecordId(record.id);
        state.language = record.language || state.language;
        if (langSelect) langSelect.value = state.language;
        resetFormState(true);
        applyPrefill(record.values || {});
        updateLanguage();
        applyAllFilters();
        showFormMode(false, true);
        statusEl.textContent = '';
        statusEl.className = 'status';
        const statusNode = getListStatus();
        if (statusNode) {
          statusNode.textContent = '';
          statusNode.style.display = 'none';
        }
        setFormInteractive(true);
      }

      function loadSubmission(recordId, preferCache = true, expectedUpdatedAt) {
        if (!recordId) {
          return;
        }
        if (preferCache && recordCache[recordId]) {
          const cached = recordCache[recordId];
          const cachedUpdatedAt = cached?.updatedAt || cached?.lastUpdated || '';
          if (expectedUpdatedAt && cachedUpdatedAt && expectedUpdatedAt !== cachedUpdatedAt) {
            // Cached value is stale compared to the row metadata; fall through to server fetch.
          } else {
          if (__WEB_FORM_DEBUG__) {
            console.info('[ListView] record cache hit', { recordId });
          }
          setFormInteractive(false);
            hydrateRecord(cached);
            return;
          }
        }
        if (!(google && google.script && google.script.run)) {
          return;
        }
        setFormInteractive(false);
        statusEl.textContent = 'Loading record...';
        statusEl.className = 'status';
        const statusNode = getListStatus();
        if (statusNode) {
          statusNode.textContent = 'Loading record...';
          statusNode.style.display = 'block';
        }
        google.script.run
          .withSuccessHandler(res => {
            if (!res) {
              statusEl.textContent = 'Record not found.';
              statusEl.className = 'status error';
              setFormInteractive(true);
              if (statusNode) {
                statusNode.textContent = 'Record not found.';
                statusNode.style.display = 'block';
              }
              return;
            }
            recordCache[recordId] = res;
            hydrateRecord(res);
          })
          .withFailureHandler(err => {
            statusEl.textContent = (err && err.message) ? err.message : 'Failed to load record.';
            statusEl.className = 'status error';
            setFormInteractive(true);
            if (statusNode) {
              statusNode.textContent = 'Failed to load record.';
              statusNode.style.display = 'block';
            }
          })
          .fetchSubmissionById(formKey || '', recordId);
      }

      function init() {
        if (viewportMeta) viewportMeta.setAttribute('content', lockedViewport);

        titleEl.textContent = definition.title || '';
        descriptionEl.textContent = definition.description || '';
        definition.languages.forEach(lang => {
          const opt = document.createElement('option');
          opt.value = lang;
          opt.textContent = lang;
          langSelect.appendChild(opt);
        });
        state.language = definition.languages[0] || 'EN';
        langSelect.value = state.language;
        langSelect.addEventListener('change', () => {
          state.language = langSelect.value;
          updateLanguage();
        });

        try {
          renderQuestions();
          if (__WEB_FORM_DEBUG__ && console && console.info) {
            try {
              console.info('[WebForm] renderQuestions completed', { questionCount: definition.questions.length });
            } catch (_) {}
          }
          updateLanguage();
          applyAllFilters();
        } catch (err) {
          statusEl.textContent = (err && err.message) ? err.message : 'Failed to render form.';
          statusEl.className = 'status error';
          console.error(err);
        }
        formEl.addEventListener('submit', handleSubmit);
        formEl.addEventListener('focusin', lockViewport);
        formEl.addEventListener('focusout', unlockViewport);
        formEl.addEventListener('input', (e) => clearFieldErrorForTarget(e.target));
        formEl.addEventListener('change', (e) => {
          clearFieldErrorForTarget(e.target);
          const changedId = resolveFieldIdFromElement(e.target);
          const changedQuestion = definition.questions.find(q => q.id === changedId);
          if (changedQuestion?.clearOnChange) {
            clearOtherFieldsExcept(changedId);
          }
          const app = getWebFormApp();
          if (app && typeof app.handleSelectionEffects === 'function' && changedQuestion) {
            try {
              const value = getValue(changedId);
              app.handleSelectionEffects(definition, changedQuestion, value, state.language, {
                addLineItemRow: (groupId, preset) => {
                  const container = document.querySelector('[data-line-item="' + groupId + '"]');
                  const groupDef = definition.questions.find(q => q.id === groupId);
                  if (container && groupDef && groupDef.type === 'LINE_ITEM_GROUP') {
                    addLineItemRow(groupDef, container, preset || {});
                  }
                },
                clearLineItems: (groupId) => {
                  clearLineItemRows(groupId);
                }
              });
            } catch (err) {
              console && console.warn && console.warn('Selection effect failed', err);
            }
          }
          if (!changedQuestion && typeof e.target.closest === 'function') {
            const rowEl = e.target.closest('.line-item-row');
            if (rowEl) {
              const groupId = rowEl.dataset.groupId || (rowEl.closest('[data-line-item]')?.dataset.lineItem);
              const groupDef = definition.questions.find(q => q.id === groupId);
              if (groupDef && groupDef.type === 'LINE_ITEM_GROUP') {
                triggerLineItemEffects(groupDef, rowEl);
              }
            }
          }
          applyAllFilters();
        });

        if (backToFormBtn) {
          backToFormBtn.addEventListener('click', () => {
            showFormMode(true);
          });
        }

        if (backToListInline && listColumns.length) {
          backToListInline.addEventListener('click', () => {
            showListMode();
          });
          backToListInline.style.display = 'inline-flex';
        }

        if (newRecordBtn) {
          newRecordBtn.addEventListener('click', () => {
            showFormMode(true);
          });
        }

        if (definition.startRoute === 'list') {
          showListMode();
        }
      }

      function lockViewport() {
        if (viewportMeta) viewportMeta.setAttribute('content', lockedViewport);
      }

      function unlockViewport() {
        if (viewportMeta) {
          setTimeout(() => viewportMeta.setAttribute('content', lockedViewport), 120);
        }
      }

      function renderQuestions() {
        questionsEl.innerHTML = '';
        definition.questions.forEach(q => {
          const field = document.createElement('div');
          field.className = 'field';
          field.dataset.qid = q.id;

          const label = document.createElement('label');
          label.dataset.enLabel = q.label.en || '';
          label.dataset.frLabel = q.label.fr || '';
          label.dataset.nlLabel = q.label.nl || '';
          label.textContent = '';
          if (q.required) {
            const star = document.createElement('span');
            star.className = 'required-star';
            star.textContent = '*';
            label.appendChild(star);
          }
          const labelText = document.createElement('span');
          labelText.dataset.labelText = 'true';
          labelText.textContent = q.label.en || '';
          label.appendChild(labelText);
          if (q.required) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'Required';
            badge.style.marginLeft = '6px';
            label.appendChild(badge);
          }
          field.appendChild(label);

          if (q.type === 'LINE_ITEM_GROUP') {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = q.id + '_json';
            field.appendChild(hidden);

            const container = document.createElement('div');
            container.className = 'line-item';
            container.dataset.lineItem = q.id;
            container.dataset.fieldId = q.id;

            const rowsWrapper = document.createElement('div');
            rowsWrapper.className = 'line-item-rows';
            container.appendChild(rowsWrapper);

            const selectorCfg = q.lineItemConfig?.sectionSelector;
            if (selectorCfg) {
              const toolbar = document.createElement('div');
              toolbar.className = 'line-item-toolbar';

              const selectorLabel = document.createElement('label');
              selectorLabel.style.marginBottom = '0';
              selectorLabel.dataset.enLabel = selectorCfg.labelEn || '';
              selectorLabel.dataset.frLabel = selectorCfg.labelFr || '';
              selectorLabel.dataset.nlLabel = selectorCfg.labelNl || '';
              selectorLabel.textContent = selectorCfg.labelEn || '';
              toolbar.appendChild(selectorLabel);

              const selector = document.createElement('select');
              selector.name = selectorCfg.id;
              selector.dataset.fieldId = selectorCfg.id;
              selector.dataset.labelEn = (selectorCfg.labelEn || '').toLowerCase();
              selector.required = !!selectorCfg.required;
              const selectorOptions = {
                en: selectorCfg.options || [],
                fr: selectorCfg.optionsFr || [],
                nl: selectorCfg.optionsNl || []
              };
              selector.dataset.originalOptions = JSON.stringify(selectorOptions);
              const langKey = (state.language || 'EN').toLowerCase();
              const labels = selectorOptions[langKey] || selectorOptions.en || [];
              const baseOpts = selectorOptions.en || labels;
              const emptyOpt = document.createElement('option');
              emptyOpt.value = '';
              emptyOpt.textContent = '';
              selector.appendChild(emptyOpt);
              labels.forEach((opt, idx) => {
                const base = baseOpts[idx] || opt;
                const optionEl = document.createElement('option');
                optionEl.value = base;
                optionEl.dataset.enLabel = selectorOptions.en?.[idx] || base;
                optionEl.dataset.frLabel = selectorOptions.fr?.[idx] || base;
                optionEl.dataset.nlLabel = selectorOptions.nl?.[idx] || base;
                optionEl.textContent = opt;
                selector.appendChild(optionEl);
              });
              toolbar.appendChild(selector);
              container.insertBefore(toolbar, rowsWrapper);
            }

            if (q.lineItemConfig?.totals?.length) {
              const totalsHolder = document.createElement('div');
              totalsHolder.className = 'line-item-totals';
              totalsHolder.dataset.lineTotals = q.id;
              container.appendChild(totalsHolder);
            }

            field.appendChild(container);

            state.lineItems[q.id] = state.lineItems[q.id] || [];
            if (q.lineItemConfig?.addMode !== 'overlay') {
              addLineItemRow(q, container);
            }

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'secondary';
            const defaultLabel = q.lineItemConfig?.addMode === 'overlay' ? 'Add lines' : '+ Add line';
            addBtn.dataset.defaultLabel = defaultLabel;
            if (q.lineItemConfig?.addButtonLabel) {
            addBtn.dataset.addLabels = JSON.stringify(q.lineItemConfig.addButtonLabel);
          }
          addBtn.textContent = getLangLabel(q.lineItemConfig?.addButtonLabel, defaultLabel);
          if (q.lineItemConfig?.addMode === 'overlay' && q.lineItemConfig.anchorFieldId) {
              addBtn.addEventListener('click', () => openLineOverlay(q, container));
            } else {
              addBtn.addEventListener('click', () => {
                const app = getWebFormApp();
                if (app && typeof app.addLineItemRowFromBundle === 'function') {
                  try {
                    app.addLineItemRowFromBundle(q, formEl, {});
                    return;
                  } catch (err) {
                    console && console.warn && console.warn('addLineItemRow via bundle failed; using legacy', err);
                  }
                }
                addLineItemRow(q, container);
              });
            }
            field.appendChild(addBtn);
          } else {
            field.appendChild(renderInput(q));
          }

          questionsEl.appendChild(field);
        });
      }

      function clearAllErrors() {
        Array.from(formEl.querySelectorAll('.field-error')).forEach((n) => n.remove());
        Array.from(formEl.querySelectorAll('.has-error')).forEach((n) => n.classList.remove('has-error'));
        statusEl.textContent = '';
        statusEl.className = 'status';
      }

      function getLineItemRowCount(groupId) {
        const container = document.querySelector('[data-line-item="' + groupId + '"]');
        if (!container) return 0;
        return Array.from(container.querySelectorAll('.line-item-row')).filter(row => !row.classList.contains('is-hidden-field') && !isEmptyLineItemRow(row)).length;
      }

      function clearFieldErrorForTarget(target) {
        if (!target) return;
        const holder = target.closest('.line-item-row') || target.closest('.field') || target.parentElement;
        if (!holder) return;
        const err = holder.querySelector('.field-error');
        if (err) err.remove();
        target.classList.remove('has-error');
      }

      function findFieldElement(fieldId, scope) {
        const ctx = scope || formEl;
        return ctx.querySelector('[data-field-id="' + fieldId + '"]') ||
               ctx.querySelector('[name="' + fieldId + '"]') ||
               ctx.querySelector('[name$="__' + fieldId + '"]') ||
               ctx.querySelector('[data-field-name$="__' + fieldId + '"]');
      }

      function showErrorBanner(extraMessage) {
        const base = resolveMessage(errorBannerMessage, 'Please correct the errors above.');
        statusEl.textContent = extraMessage ? (base + ' ' + extraMessage) : base;
        statusEl.className = 'status error';
      }

      function scrollToField(holder, fieldEl) {
        const target = (holder && holder.closest && holder.closest('.field')) || holder || fieldEl;
        if (target && typeof target.scrollIntoView === 'function') {
          const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : (document.documentElement ? document.documentElement.clientHeight : 0);
          const rect = target.getBoundingClientRect();
          const fullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
          if (!fullyVisible) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        if (fieldEl && (fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLSelectElement || fieldEl instanceof HTMLTextAreaElement)) {
          try {
            fieldEl.focus({ preventScroll: true });
          } catch (_) {
            // ignore focus errors
          }
        }
      }

      function showFieldError(err) {
        const el = findFieldElement(err.fieldId, err.row);
        if (!el) {
          showErrorBanner(err.message);
          return;
        }
        el.classList.add('has-error');
        let holder = el.closest('.line-item-row');
        if (!holder) holder = el.closest('.field') || el.parentElement;
        if (!holder) holder = el.parentElement;
        if (!holder) return;
        let msg = holder.querySelector('.field-error');
        if (!msg) {
          msg = document.createElement('div');
          msg.className = 'field-error';
          holder.appendChild(msg);
        }
        msg.textContent = err.message;
        showErrorBanner();
        scrollToField(holder, el);
      }

      function renderInput(q) {
        if (q.type === 'PARAGRAPH') {
          const area = document.createElement('textarea');
          area.name = q.id;
          area.required = !!q.required;
          return area;
        }

        if (q.type === 'CHOICE') {
          const select = document.createElement('select');
          select.name = q.id;
          select.dataset.fieldId = q.id;
          select.dataset.labelEn = (q.label.en || '').toLowerCase();
          select.required = !!q.required;
          const emptyOpt = document.createElement('option');
          emptyOpt.value = '';
          emptyOpt.textContent = '';
          select.appendChild(emptyOpt);
          (q.options?.en || []).forEach((opt, idx) => {
            const option = document.createElement('option');
            option.value = opt;
            option.dataset.enLabel = opt;
            option.dataset.frLabel = q.options?.fr?.[idx] || opt;
            option.dataset.nlLabel = q.options?.nl?.[idx] || opt;
            option.textContent = opt;
            select.appendChild(option);
          });
          select.dataset.originalOptions = JSON.stringify(q.options || { en: [], fr: [], nl: [] });
          if (q.optionFilter) select.dataset.dependsOn = q.optionFilter.dependsOn;
          return select;
        }

        if (q.type === 'CHECKBOX') {
          const wrapper = document.createElement('div');
          wrapper.dataset.fieldName = q.id;
          wrapper.dataset.fieldId = q.id;
          wrapper.dataset.labelEn = (q.label.en || '').toLowerCase();
          (q.options?.en || []).forEach((opt, idx) => {
            const id = q.id + '_' + idx;
            const label = document.createElement('label');
            label.className = 'inline';
            label.style.fontWeight = '400';
            label.htmlFor = id;
            label.dataset.enLabel = opt;
            label.dataset.frLabel = q.options?.fr?.[idx] || opt;
            label.dataset.nlLabel = q.options?.nl?.[idx] || opt;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = q.id;
            checkbox.id = id;
            checkbox.value = opt;

            const span = document.createElement('span');
            span.className = 'option-label';
            span.textContent = opt;

            label.appendChild(checkbox);
            label.appendChild(span);
            wrapper.appendChild(label);
          });
          wrapper.dataset.originalOptions = JSON.stringify(q.options || { en: [], fr: [], nl: [] });
          if (q.optionFilter) wrapper.dataset.dependsOn = q.optionFilter.dependsOn;
          return wrapper;
        }

        if (q.type === 'FILE_UPLOAD') {
          const input = document.createElement('input');
          input.type = 'file';
          input.name = q.id;
          input.multiple = !q.uploadConfig || q.uploadConfig.maxFiles !== 1;
          input.required = !!q.required;
          if (q.uploadConfig?.allowedExtensions?.length) {
            input.accept = q.uploadConfig.allowedExtensions.map(ext => ext.startsWith('.') ? ext : '.' + ext).join(',');
          }
          return input;
        }

        const input = document.createElement('input');
        input.name = q.id;
        input.dataset.fieldId = q.id;
        input.dataset.labelEn = (q.label.en || '').toLowerCase();
        input.required = !!q.required;
        if (q.type === 'DATE') input.type = 'date';
        else if (q.type === 'NUMBER') {
          input.type = 'number';
          input.step = 'any';
        }
        else input.type = 'text';
        return input;
      }

      function addLineItemRow(q, container, presetValues = {}) {
        const rowsWrapper = container.querySelector('.line-item-rows') || container;
        const row = document.createElement('div');
        row.className = 'line-item-row';
        row.dataset.rowId = q.id + '_' + Math.random().toString(16).slice(2);
        row.dataset.groupId = q.id;

        (q.lineItemConfig?.fields || []).forEach(field => {
          const cell = document.createElement('div');
          cell.dataset.fieldId = field.id;
          cell.dataset.groupId = q.id;
          const lbl = document.createElement('label');
          lbl.dataset.enLabel = field.labelEn || '';
          lbl.dataset.frLabel = field.labelFr || '';
          lbl.dataset.nlLabel = field.labelNl || '';
          lbl.textContent = '';
          if (field.required) {
            const star = document.createElement('span');
            star.className = 'required-star';
            star.textContent = '*';
            lbl.appendChild(star);
          }
          const labelText = document.createElement('span');
          labelText.dataset.labelText = 'true';
          labelText.textContent = field.labelEn || '';
          lbl.appendChild(labelText);
          cell.appendChild(lbl);

          let input;
          if (field.type === 'CHOICE') {
            input = document.createElement('select');
            input.dataset.fieldId = field.id;
            input.dataset.labelEn = (field.labelEn || '').toLowerCase();
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '';
            input.appendChild(emptyOpt);
            (field.options || []).forEach((opt, idx) => {
              const option = document.createElement('option');
              option.value = opt;
              option.dataset.enLabel = opt;
              option.dataset.frLabel = field.optionsFr?.[idx] || opt;
              option.dataset.nlLabel = field.optionsNl?.[idx] || opt;
              option.textContent = opt;
              input.appendChild(option);
            });
            input.dataset.originalOptions = JSON.stringify({ en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] });
            if (field.optionFilter) input.dataset.dependsOn = field.optionFilter.dependsOn;
          } else if (field.type === 'CHECKBOX') {
            input = document.createElement('div');
            input.dataset.fieldName = q.id + '__' + field.id;
            input.dataset.fieldId = field.id;
            input.dataset.labelEn = (field.labelEn || '').toLowerCase();
            (field.options || []).forEach((opt, idx) => {
              const checkbox = document.createElement('label');
              checkbox.className = 'inline';
              checkbox.style.fontWeight = '400';
              checkbox.dataset.enLabel = opt;
              checkbox.dataset.frLabel = field.optionsFr?.[idx] || opt;
              checkbox.dataset.nlLabel = field.optionsNl?.[idx] || opt;
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.value = opt;
              cb.name = q.id + '__' + field.id;
              const span = document.createElement('span');
              span.className = 'option-label';
              span.textContent = opt;
              checkbox.appendChild(cb);
              checkbox.appendChild(span);
              input.appendChild(checkbox);
            });
            input.dataset.originalOptions = JSON.stringify({ en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] });
            if (field.optionFilter) input.dataset.dependsOn = field.optionFilter.dependsOn;
          } else {
            input = document.createElement('input');
            input.type = field.type === 'NUMBER' ? 'number' : 'text';
            if (field.type === 'NUMBER') input.step = 'any';
            input.name = q.id + '__' + field.id;
          }

          if (input && input.tagName !== 'DIV') {
            input.required = !!field.required;
            input.name = q.id + '__' + field.id;
            input.dataset.fieldId = field.id;
            input.dataset.labelEn = (field.labelEn || '').toLowerCase();
            if (presetValues[field.id] && 'value' in input) {
              input.value = presetValues[field.id];
            }
          }

          cell.appendChild(input);
          row.appendChild(cell);
        });

        const actions = document.createElement('div');
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'secondary';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          clearLineItemEffectsForRow(q, row);
          if (row.parentElement) row.parentElement.removeChild(row);
          updateLineItemTotals(q.id);
        });
        actions.appendChild(removeBtn);
        row.appendChild(actions);

        row.addEventListener('input', () => updateLineItemTotals(q.id));
        row.addEventListener('change', () => updateLineItemTotals(q.id));

        rowsWrapper.appendChild(row);
        applyAllFilters(row);
        updateLineItemTotals(q.id);
      }

      function clearLineItemRows(groupId) {
        const container = document.querySelector('[data-line-item="' + groupId + '"]');
        if (!container) return;
        Array.from(container.querySelectorAll('.line-item-row')).forEach((row) => row.parentElement && row.parentElement.removeChild(row));
        updateLineItemTotals(groupId);
      }

      function getLineItemEffectFields(group) {
        if (!group || group.type !== 'LINE_ITEM_GROUP') return [];
        return (group.lineItemConfig?.fields || []).filter(field => Array.isArray(field.selectionEffects) && field.selectionEffects.length);
      }

      function getLineItemRowContextId(groupId, row) {
        const rowId = row?.dataset?.rowId || ('row_' + Math.random().toString(16).slice(2));
        if (row && !row.dataset.rowId) {
          row.dataset.rowId = rowId;
        }
        return groupId + '::' + rowId;
      }

      function collectLineItemRowValues(group, row) {
        const values = {};
        if (!group?.lineItemConfig?.fields || !row) return values;
        group.lineItemConfig.fields.forEach(field => {
          const name = group.id + '__' + field.id;
          if (field.type === 'CHECKBOX') {
            const inputs = Array.from(row.querySelectorAll('input[name="' + name + '"]'));
            values[field.id] = inputs.filter(i => i.checked).map(i => i.value);
            return;
          }
          const input = row.querySelector('[name="' + name + '"]');
          if (!input) {
            values[field.id] = '';
            return;
          }
          values[field.id] = input.value || '';
        });
        return values;
      }

      function isLineItemRowComplete(group, rowValues) {
        if (!group?.lineItemConfig?.fields) return true;
        return group.lineItemConfig.fields.every(field => {
          if (!field.required) return true;
          const val = rowValues[field.id];
          if (Array.isArray(val)) return val.length > 0;
          return typeof val === 'string' ? val.trim() !== '' : val !== undefined && val !== null;
        });
      }

      function buildLineItemQuestion(field) {
        return {
          id: field.id,
          type: field.type,
          label: {
            en: field.labelEn || '',
            fr: field.labelFr || '',
            nl: field.labelNl || ''
          },
          required: !!field.required,
          options: {
            en: field.options || [],
            fr: field.optionsFr || [],
            nl: field.optionsNl || []
          },
          dataSource: field.dataSource,
          selectionEffects: field.selectionEffects
        };
      }

      function triggerLineItemEffects(group, row, forceClear = false) {
        const app = getWebFormApp();
        if (!app || typeof app.handleSelectionEffects !== 'function') return;
        const effectFields = getLineItemEffectFields(group);
        if (!effectFields.length) return;
        const rowValues = collectLineItemRowValues(group, row);
        const rowComplete = forceClear ? false : isLineItemRowComplete(group, rowValues);
        const contextId = getLineItemRowContextId(group.id, row);
        effectFields.forEach(field => {
          const questionDef = buildLineItemQuestion(field);
          const value = rowComplete ? rowValues[field.id] : null;
          try {
            app.handleSelectionEffects(definition, questionDef, value, state.language, {
              addLineItemRow: (groupId, preset) => {
                const container = document.querySelector('[data-line-item="' + groupId + '"]');
                const targetGroup = definition.questions.find(q => q.id === groupId);
                if (container && targetGroup && targetGroup.type === 'LINE_ITEM_GROUP') {
                  addLineItemRow(targetGroup, container, preset || {});
                }
              },
              clearLineItems: (groupId) => {
                clearLineItemRows(groupId);
              }
            }, {
              contextId,
              lineItem: {
                groupId: group.id,
                rowId: row?.dataset?.rowId || '',
                rowValues
              },
              forceContextReset: true
            });
          } catch (err) {
            console && console.warn && console.warn('Selection effect failed', err);
          }
        });
      }

      function clearLineItemEffectsForRow(group, row) {
        triggerLineItemEffects(group, row, true);
      }

      function formatTotalValue(value, decimalPlaces) {
        const num = Number(value);
        if (isNaN(num)) return '0';
        if (typeof decimalPlaces === 'number' && !isNaN(decimalPlaces)) {
          return num.toFixed(decimalPlaces);
        }
        return Number.isInteger(num) ? num.toString() : num.toFixed(2);
      }

      function updateLineItemTotals(groupId) {
        const group = definition.questions.find((q) => q.id === groupId);
        if (!group || group.type !== 'LINE_ITEM_GROUP' || !group.lineItemConfig?.totals?.length) return;
        const container = document.querySelector('[data-line-item="' + groupId + '"]');
        if (!container) return;
        const holder = container.querySelector('[data-line-totals]');
        if (!holder) return;
        const rows = Array.from(container.querySelectorAll('.line-item-row')).filter((r) => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r));
        holder.innerHTML = '';

        const rowData = rows.map((row) => {
          const values = {};
          (group.lineItemConfig?.fields || []).forEach((field) => {
            values[field.id] = getRowValue(row, groupId + '__' + field.id);
          });
          return { id: row.dataset.rowId || '', values };
        });

        const app = getWebFormApp();
        if (app && typeof app.computeLineTotals === 'function') {
          try {
            const totals = app.computeLineTotals({ config: group.lineItemConfig, rows: rowData }, state.language);
            totals.forEach((t) => {
              const pill = document.createElement('div');
              pill.className = 'line-item-total-pill';
              pill.textContent = t.label ? t.label + ': ' + formatTotalValue(t.value, t.decimalPlaces) : formatTotalValue(t.value, t.decimalPlaces);
              holder.appendChild(pill);
            });
            return;
          } catch (err) {
            console && console.warn && console.warn('Line totals via bundle failed; using legacy', err);
          }
        }

        group.lineItemConfig.totals.forEach((totalCfg) => {
          let total = 0;
          if (totalCfg.type === 'count') {
            total = rows.length;
          } else if (totalCfg.type === 'sum' && totalCfg.fieldId) {
            rows.forEach((row) => {
              const val = getRowValue(row, groupId + '__' + totalCfg.fieldId);
              const parsed = Array.isArray(val) ? Number(val[0]) : Number(val);
              if (!isNaN(parsed)) total += parsed;
            });
          }
          const pill = document.createElement('div');
          pill.className = 'line-item-total-pill';
          const label = getLangLabel(totalCfg.label, totalCfg.type === 'count' ? 'Total' : (totalCfg.fieldId || 'Total'));
          pill.textContent = label ? (label + ': ' + formatTotalValue(total, totalCfg.decimalPlaces)) : formatTotalValue(total, totalCfg.decimalPlaces);
          holder.appendChild(pill);
        });
      }

      function updateLanguage() {
        const current = state.language.toLowerCase();
        const app = getWebFormApp();
        if (app && typeof app.updateLanguageLabels === 'function') {
          try {
            app.updateLanguageLabels({ language: state.language, root: document, definition });
          } catch (err) {
            console && console.warn && console.warn('Language update via bundle failed, using legacy path', err);
          }
        } else {
          document.querySelectorAll('[data-en-label]').forEach(el => {
            const label = el.dataset[current + 'Label'] || el.dataset.enLabel || '';
            const optionLabel = el.querySelector ? el.querySelector('.option-label') : null;
            const textTarget = el.querySelector ? el.querySelector('[data-label-text]') : null;
            if (optionLabel) {
              optionLabel.textContent = label;
              return;
            }
            if (textTarget) {
              textTarget.textContent = label;
              return;
            }
            const textNode = Array.from(el.childNodes || []).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) {
              textNode.textContent = label;
            } else {
              el.textContent = label;
            }
          });

          document.querySelectorAll('option[data-en-label]').forEach(opt => {
            const label = opt.dataset[current + 'Label'] || opt.dataset.enLabel || '';
            opt.textContent = label;
          });

          document.querySelectorAll('button[data-default-label]').forEach(btn => {
            const defaultLabel = btn.dataset?.defaultLabel || '+ Add line';
            const labels = btn.dataset?.addLabels ? JSON.parse(btn.dataset.addLabels) : void 0;
            btn.textContent = getLangLabel(labels, defaultLabel);
          });
        }

        applyAllFilters();
      }

      let hydrateAttemptCount = 0;
      function applyAllFilters(scopeRow) {
        const appForHydration = getWebFormApp();
        if (appForHydration && typeof appForHydration.hydrateDataSources === 'function') {
          if (__WEB_FORM_DEBUG__) {
            console.info('[WebForm] hydrateDataSources invoked', { language: state.language });
          }
          appForHydration.hydrateDataSources(definition, state.language, formEl)
            .then(() => {
              if (__WEB_FORM_DEBUG__) {
                console.info('[WebForm] hydrateDataSources completed');
              }
              const appAfterHydration = getWebFormApp();
              if (appAfterHydration && typeof appAfterHydration.applyFiltersAndVisibility === 'function') {
                appAfterHydration.applyFiltersAndVisibility({ definition, language: state.language, formEl, scopeRow });
                definition.questions.forEach(q => { if (q.type === 'LINE_ITEM_GROUP') updateLineItemTotals(q.id); });
              }
            })
            .catch((err) => {
              if (__WEB_FORM_DEBUG__) {
                console.error('[WebForm] hydrateDataSources failed', err);
              }
            });
        } else if (hydrateAttemptCount < 20) {
          hydrateAttemptCount += 1;
          if (__WEB_FORM_DEBUG__) {
            console.warn('[WebForm] hydrateDataSources not ready, retrying', { attempt: hydrateAttemptCount });
          }
          setTimeout(() => applyAllFilters(scopeRow), 100);
          return;
        } else if (__WEB_FORM_DEBUG__) {
          console.warn('[WebForm] hydrateDataSources function missing on WebFormApp after retries');
        }
        const appForFilters = getWebFormApp();
        if (appForFilters && typeof appForFilters.applyFiltersAndVisibility === 'function') {
          try {
            appForFilters.applyFiltersAndVisibility({ definition, language: state.language, formEl, scopeRow });
            definition.questions.forEach(q => { if (q.type === 'LINE_ITEM_GROUP') updateLineItemTotals(q.id); });
            return;
          } catch (err) {
            console && console.warn && console.warn('applyFilters fallback to legacy due to error', err);
          }
        }
        definition.questions.forEach(q => {
          if ((q.type === 'CHOICE' || q.type === 'CHECKBOX') && q.optionFilter) {
            const target = q.type === 'CHECKBOX'
              ? formEl.querySelector('[data-field-name="' + q.id + '"]') || formEl.querySelector('[name="' + q.id + '"]')
              : formEl.querySelector('[name="' + q.id + '"]');
            if (target) applyFilter(target, q.optionFilter, q.options || { en: [], fr: [], nl: [] });
          }

          if (q.type === 'LINE_ITEM_GROUP') {
            const container = document.querySelector('[data-line-item="' + q.id + '"]');
            if (!container) return;
            const rows = scopeRow ? [scopeRow] : Array.from(container.querySelectorAll('.line-item-row'));
            rows.forEach(row => {
              (q.lineItemConfig?.fields || []).forEach(field => {
                if (!field.optionFilter) return;
                const name = q.id + '__' + field.id;
                const el = field.type === 'CHECKBOX'
                  ? row.querySelector('[data-field-name="' + name + '"]') || row.querySelector('[name="' + name + '"]')
                  : row.querySelector('[name="' + name + '"]');
                if (el) applyFilter(el, field.optionFilter, { en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] }, row, q.id);
              });
            });
          }
        });

        // Safety net: if for any reason checkbox inputs were removed by filters, rebuild them from original options
        document.querySelectorAll('[data-field-name]').forEach(wrapper => {
          if (wrapper.querySelector('input[type="checkbox"]')) return;
          const optsJson = wrapper.dataset.originalOptions || '';
          let opts;
          try { opts = JSON.parse(optsJson); } catch (_) { opts = { en: [], fr: [], nl: [] }; }
          const langKey = state.language.toLowerCase();
          const labels = opts[langKey] || opts.en || [];
          const baseOpts = opts.en || labels;
          const nameAttr = wrapper.dataset.fieldName || wrapper.getAttribute('name') || '';
          wrapper.innerHTML = '';
          labels.forEach((label, idx) => {
            const base = baseOpts[idx] || label;
            const id = nameAttr + '_' + idx + '_' + Math.random().toString(16).slice(2);
            const l = document.createElement('label');
            l.className = 'inline';
            l.style.fontWeight = '400';
            l.htmlFor = id;
            l.dataset.enLabel = base;
            l.dataset.frLabel = opts.fr?.[idx] || base;
            l.dataset.nlLabel = opts.nl?.[idx] || base;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = nameAttr;
            cb.id = id;
            cb.value = base;
            const span = document.createElement('span');
            span.className = 'option-label';
            span.textContent = label;
            l.appendChild(cb);
            l.appendChild(span);
            wrapper.appendChild(l);
          });
        });

        // Apply visibility after options are filtered
        definition.questions.forEach(q => {
          if (q.visibility) applyVisibilityForQuestion(q);
          if (q.type === 'LINE_ITEM_GROUP') {
            const container = document.querySelector('[data-line-item="' + q.id + '"]');
            if (!container) return;
            const rows = Array.from(container.querySelectorAll('.line-item-row'));
            rows.forEach(row => {
              (q.lineItemConfig?.fields || []).forEach(field => {
                if (!field.visibility) return;
                applyVisibilityForLineItemField(q, field, row);
              });
            });
          }
        });

        definition.questions.forEach(q => {
          if (q.type === 'LINE_ITEM_GROUP') updateLineItemTotals(q.id);
        });
      }

      function resolveVisibilityValue(condition, row, linePrefix) {
        if (!condition) return '';
        const targetId = condition.fieldId;
        const scopedName = linePrefix ? (linePrefix + '__' + targetId) : targetId;
        let value = row ? getRowValue(row, scopedName) : getValue(scopedName);
        if ((value === '' || (Array.isArray(value) && value.length === 0)) && linePrefix) {
          value = getValue(targetId);
        }
        return value;
      }

      function shouldHideFieldByVisibility(visibility, row, linePrefix) {
        if (!visibility) return false;
        const showMatch = visibility.showWhen ? matchesWhen(resolveVisibilityValue(visibility.showWhen, row, linePrefix), visibility.showWhen) : true;
        const hideMatch = visibility.hideWhen ? matchesWhen(resolveVisibilityValue(visibility.hideWhen, row, linePrefix), visibility.hideWhen) : false;
        if (visibility.showWhen && !showMatch) return true;
        if (visibility.hideWhen && hideMatch) return true;
        return false;
      }

      function toggleFieldVisibility(holder, shouldHide) {
        if (!holder) return;
        if (shouldHide) {
          holder.classList.add('is-hidden-field');
          const inputs = holder.querySelectorAll('input, select, textarea');
          inputs.forEach(input => {
            const data = input.dataset || {};
            if (data.originalRequired === undefined) data.originalRequired = input.required ? 'true' : 'false';
            input.required = false;
            if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
              input.checked = false;
            } else {
              try { input.value = ''; } catch (_) { /* ignore */ }
            }
          });
          const err = holder.querySelector('.field-error');
          if (err) err.remove();
        } else {
          holder.classList.remove('is-hidden-field');
          const inputs = holder.querySelectorAll('input, select, textarea');
          inputs.forEach(input => {
            if (input.dataset && input.dataset.originalRequired === 'true') input.required = true;
          });
        }
      }

      function applyVisibilityForQuestion(q) {
        const shouldHide = shouldHideFieldByVisibility(q.visibility, null, q.type === 'LINE_ITEM_GROUP' ? q.id : undefined);
        const holder = questionsEl.querySelector('[data-qid="' + q.id + '"]');
        toggleFieldVisibility(holder, shouldHide);
      }

      function applyVisibilityForLineItemField(group, field, row) {
        const shouldHide = shouldHideFieldByVisibility(field.visibility, row, group.id);
        const cell = row.querySelector('[data-field-id="' + field.id + '"][data-group-id="' + group.id + '"]') || row.querySelector('[name="' + group.id + '__' + field.id + '"]')?.closest('div');
        toggleFieldVisibility(cell || row, shouldHide);
      }

      function isFieldHidden(fieldId, row) {
        const el = findFieldElement(fieldId, row);
        if (!el) return false;
        const hiddenHolder = el.closest('.is-hidden-field');
        return !!hiddenHolder;
      }

      function computeAllowedOptions(filter, options, row, linePrefix) {
        if (!filter || !options) return options?.en || [];

        const getDependencyValues = (dependsOn) => {
          const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
          return ids.map((id) => {
            const prefixed = linePrefix ? (linePrefix + '__' + id) : id;
            let val = row ? getRowValue(row, prefixed) : getValue(prefixed);
            if ((val === '' || (Array.isArray(val) && val.length === 0)) && linePrefix) {
              val = getValue(id);
            }
            if (Array.isArray(val)) return val.join('|');
            return val ?? '';
          });
        };

        const depValues = getDependencyValues(filter.dependsOn);
        const candidateKeys = [];
        if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
        depValues.filter(Boolean).forEach((v) => candidateKeys.push(v));
        candidateKeys.push('*');
        const match = candidateKeys.reduce((acc, key) => acc || filter.optionMap[key], void 0);
        if (match) return match;
        return [];
      }

      function applyFilter(el, filter, options, row, linePrefix) {
        if (!options) return;
        const langKey = state.language.toLowerCase();

        const allowed = computeAllowedOptions(filter, options, row, linePrefix);
        const getLabelForBase = (base) => {
          const idx = Array.isArray(options.en) ? options.en.indexOf(base) : -1;
          if (idx >= 0) return (options[langKey] || [])[idx] || base;
          return base;
        };

        if (el.tagName === 'SELECT') {
          const previous = el.value;
          const currentSelections = previous ? [previous] : [];
          const extras = currentSelections.filter((v) => v && !allowed.includes(v));
          const allowedSet = new Set((allowed || []).map((v) => (v || '').toString().toLowerCase()));
          const combined = [];
          const seen = new Set();
          [...allowed, ...extras].forEach((v) => {
            if (seen.has(v)) return;
            seen.add(v);
            combined.push(v);
          });
          el.innerHTML = '';
          combined.forEach((base) => {
            const optIdx = Array.isArray(options.en) ? options.en.indexOf(base) : -1;
            const label = optIdx >= 0 ? ((options[langKey] || [])[optIdx] || base) : base;
            const opt = document.createElement('option');
            opt.value = base;
            opt.dataset.enLabel = optIdx >= 0 ? (options.en?.[optIdx] || base) : base;
            opt.dataset.frLabel = optIdx >= 0 ? (options.fr?.[optIdx] || base) : base;
            opt.dataset.nlLabel = optIdx >= 0 ? (options.nl?.[optIdx] || base) : base;
            opt.textContent = label;
            if (previous && previous === base) opt.selected = true;
            if (!allowedSet.size || allowedSet.has(base.toLowerCase()) || extras.includes(base)) {
              el.appendChild(opt);
            }
          });
        } else {
          const wrapper = el.tagName === 'DIV' ? el : el.parentElement;
          const prevChecked = Array.from(wrapper.querySelectorAll('input[type="checkbox"]')).filter((c) => c.checked).map((c) => c.value);
          const extras = prevChecked.filter((v) => v && !allowed.includes(v));
          const allowedSet = new Set((allowed || []).map((v) => (v || '').toString().toLowerCase()));
          const combined = [];
          const seen = new Set();
          [...allowed, ...extras].forEach((v) => {
            if (seen.has(v)) return;
            seen.add(v);
            combined.push(v);
          });
          wrapper.innerHTML = '';
          const nameAttr = (wrapper.dataset && wrapper.dataset.fieldName) || wrapper.getAttribute('name') || '';
          combined.forEach((base, idx) => {
            const label = getLabelForBase(base);
            const id = nameAttr + '_' + idx + '_' + Math.random().toString(16).slice(2);
            const l = document.createElement('label');
            l.className = 'inline';
            l.style.fontWeight = '400';
            l.htmlFor = id;
            const optIdx = Array.isArray(options.en) ? options.en.indexOf(base) : -1;
            l.dataset.enLabel = optIdx >= 0 ? (options.en?.[optIdx] || base) : base;
            l.dataset.frLabel = optIdx >= 0 ? (options.fr?.[optIdx] || base) : base;
            l.dataset.nlLabel = optIdx >= 0 ? (options.nl?.[optIdx] || base) : base;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = nameAttr;
            cb.id = id;
            cb.value = base;
            if (prevChecked.includes(base)) cb.checked = true;
            const span = document.createElement('span');
            span.className = 'option-label';
            span.textContent = label;
            l.appendChild(cb);
            l.appendChild(span);
            if (!allowedSet.size || allowedSet.has(base.toLowerCase()) || prevChecked.includes(base)) {
              wrapper.appendChild(l);
            }
          });
        }
      }

      function findDependency(depName, scope) {
        const normalized = (depName || '').toString().trim().toLowerCase();
        const search = (ctx) => {
          if (!ctx) return null;
          const byName = ctx.querySelector('[name="' + depName + '"]');
          if (byName) return byName;
          const byFieldId = ctx.querySelector('[data-field-id="' + depName + '"]');
          if (byFieldId) return byFieldId;
          return null;
        };
        let found = search(scope);
        if (normalized) {
          const byLabel = Array.from((scope || formEl).querySelectorAll('[data-label-en]')).find(el => {
            const dataset = el instanceof HTMLElement ? el.dataset : undefined;
            return dataset?.labelEn === normalized;
          });
          if (byLabel) found = byLabel;
        }
        if (!found && scope !== formEl) {
          found = search(formEl);
          if (!found && normalized) {
            const byLabel = Array.from(formEl.querySelectorAll('[data-label-en]')).find(el => {
              const dataset = el instanceof HTMLElement ? el.dataset : undefined;
              return dataset?.labelEn === normalized;
            });
            if (byLabel) found = byLabel;
          }
        }
        return found;
      }

      function validateForm() {
        clearAllErrors();
        const appForValidation = getWebFormApp();
        if (appForValidation && typeof appForValidation.validateFormWithBundle === 'function') {
          try {
            const result = appForValidation.validateFormWithBundle(definition, state.language, formEl);
            if (result && Array.isArray(result.errors) && result.errors.length) {
              const first = result.errors[0];
              const fieldEl = appForValidation.resolveFieldElement ? appForValidation.resolveFieldElement(first, formEl) : null;
              return { message: first.message, fieldId: first.fieldId, scope: first.scope || 'main', row: fieldEl?.closest('.line-item-row') || undefined };
            }
          } catch (err) {
            console && console.warn && console.warn('Validation via bundle failed; using legacy', err);
          }
        }
        const missingRequiredLineItem = definition.questions.find(q => q.type === 'LINE_ITEM_GROUP' && q.required && !isFieldHidden(q.id) && getLineItemRowCount(q.id) === 0);
        if (missingRequiredLineItem) {
          const msg = getLangLabel(
            { en: 'Please add at least one line.', fr: 'Ajoutez au moins une ligne.', nl: 'Voeg minstens één regel toe.' },
            'Please add at least one line.'
          );
          return { message: msg, fieldId: missingRequiredLineItem.id, scope: 'main' };
        }
        const rules = [];
        definition.questions.forEach(q => {
          if (q.validationRules?.length) q.validationRules.forEach(r => rules.push({ scope: 'main', rule: r }));
          if (q.type === 'LINE_ITEM_GROUP') {
            (q.lineItemConfig?.fields || []).forEach(f => {
              if (f.validationRules?.length) f.validationRules.forEach(r => rules.push({ scope: 'line', rule: r, groupId: q.id }));
            });
          }
        });
        const fileQuestions = definition.questions.filter((q) => q.type === 'FILE_UPLOAD' && q.required);
        for (const fq of fileQuestions) {
          if (isFieldHidden(fq.id)) continue;
          const fileInput = formEl.querySelector('input[type="file"][name="' + fq.id + '"]');
          const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
          if (!hasFile) {
            const msg = getLangLabel(
              { en: 'Please upload a file.', fr: 'Veuillez télécharger un fichier.', nl: 'Upload een bestand.' },
              'Please upload a file.'
            );
            return { message: msg, fieldId: fq.id, scope: 'main' };
          }
        }

        for (const entry of rules) {
          if (entry.scope === 'main') {
            if (isFieldHidden(entry.rule.then.fieldId)) continue;
            const whenVal = getValue(entry.rule.when.fieldId);
            if (!matchesWhen(whenVal, entry.rule.when)) continue;
            const targetQuestion = definition.questions.find((q) => q.id === entry.rule.then.fieldId);
            if (targetQuestion && targetQuestion.type === 'LINE_ITEM_GROUP' && entry.rule.then.required) {
              if (getLineItemRowCount(targetQuestion.id) === 0) {
                const msg = checkRule('', entry.rule.then, entry.rule.message) || resolveMessage(defaultRuleMessages.required, 'This field is required.');
                return { message: msg, fieldId: entry.rule.then.fieldId, scope: 'main' };
              }
              continue;
            }
            const targetVal = getValue(entry.rule.then.fieldId);
            const msg = checkRule(targetVal, entry.rule.then, entry.rule.message);
            if (msg) return { message: msg, fieldId: entry.rule.then.fieldId, scope: 'main' };
          } else if (entry.scope === 'line' && entry.groupId) {
            const container = document.querySelector('[data-line-item="' + entry.groupId + '"]');
            if (!container) continue;
            const rows = Array.from(container.querySelectorAll('.line-item-row')).filter((r) => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r));
            for (const row of rows) {
              const whenName = entry.groupId + '__' + entry.rule.when.fieldId;
              const thenName = entry.groupId + '__' + entry.rule.then.fieldId;
              let whenVal = getRowValue(row, whenName);
              if (whenVal === '' || (Array.isArray(whenVal) && whenVal.length === 0)) {
                whenVal = getValue(entry.rule.when.fieldId);
              }
              if (!matchesWhen(whenVal, entry.rule.when)) continue;
              if (isFieldHidden(entry.rule.then.fieldId, row)) continue;
              const targetVal = getRowValue(row, thenName);
              const msg = checkRule(targetVal, entry.rule.then, entry.rule.message);
              if (msg) return { message: msg, fieldId: entry.rule.then.fieldId, scope: 'line', row: row };
            }
          }
        }
        return null;
      }

      function getValue(name) {
        const els = formEl.querySelectorAll('[name="' + name + '"]');
        if (!els || els.length === 0) return '';
        const el = els[0];
        if (el instanceof HTMLSelectElement) return el.value;
        if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox') {
            return Array.from(els).filter((e) => e.checked).map((e) => e.value);
          }
          return el.value;
        }
        if (el instanceof HTMLTextAreaElement) return el.value;
        return '';
      }

      function getRowValue(row, name) {
        let els = row.querySelectorAll('[name="' + name + '"]');
        if (!els || els.length === 0) {
          const wrapper = row.querySelector('[data-field-name="' + name + '"]');
          if (wrapper) {
            els = wrapper.querySelectorAll('input');
          }
        }
        if (!els || els.length === 0) return '';
        const el = els[0];
        if (el instanceof HTMLSelectElement) return el.value;
        if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox') {
            return Array.from(els).filter((e) => e.checked).map((e) => e.value);
          }
          return el.value;
        }
        if (el instanceof HTMLTextAreaElement) return el.value;
        return '';
      }

      function matchesWhen(value, when) {
        if (!when) return true;
        const values = Array.isArray(value) ? value : [value];
        if (when.equals !== undefined) {
          const expected = Array.isArray(when.equals) ? when.equals : [when.equals];
          if (!values.some(v => expected.includes(v))) return false;
        }
        const numericVals = values.map(v => Number(v)).filter(v => !isNaN(v));
        if (when.greaterThan !== undefined) {
          if (!numericVals.some(v => v > Number(when.greaterThan))) return false;
        }
        if (when.lessThan !== undefined) {
          if (!numericVals.some(v => v < Number(when.lessThan))) return false;
        }
        return true;
      }

      function checkRule(value, thenCfg, message) {
        const values = Array.isArray(value) ? value : [value];
        const customMessage = resolveMessage(message, '');
        if (thenCfg?.required) {
          const hasValue = values.some(v => {
            if (v === undefined || v === null) return false;
            if (typeof v === 'string') return v.trim() !== '';
            return true;
          });
          if (!hasValue) return customMessage || resolveMessage(defaultRuleMessages.required, 'This field is required.');
        }
        if (thenCfg?.min !== undefined) {
          const numVals = values.map(v => Number(v)).filter(v => !isNaN(v));
          if (numVals.some(v => v < Number(thenCfg.min))) {
            return customMessage || resolveMessage(defaultRuleMessages.min(thenCfg.min), 'Value must be >= ' + thenCfg.min + '.');
          }
        }
        if (thenCfg?.max !== undefined) {
          const numVals = values.map(v => Number(v)).filter(v => !isNaN(v));
          if (numVals.some(v => v > Number(thenCfg.max))) {
            return customMessage || resolveMessage(defaultRuleMessages.max(thenCfg.max), 'Value must be <= ' + thenCfg.max + '.');
          }
        }
        if (thenCfg?.allowed?.length && !values.every(v => thenCfg.allowed.includes(v))) {
          return customMessage || resolveMessage(defaultRuleMessages.allowed, 'Please use an allowed value.');
        }
        if (thenCfg?.disallowed?.length && values.some(v => thenCfg.disallowed.includes(v))) {
          return customMessage || resolveMessage(defaultRuleMessages.disallowed, 'This combination is not allowed.');
        }
        return '';
      }

      function clearFieldValuesByName(name) {
        if (!name) return;
        const nodes = formEl.querySelectorAll('[name="' + name + '"]');
        nodes.forEach((node) => {
          if (node instanceof HTMLInputElement) {
            if (node.type === 'checkbox' || node.type === 'radio') {
              node.checked = false;
            } else {
              node.value = '';
            }
          } else if (node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) {
            node.value = '';
          }
        });
      }

      function resetLineItemGroup(q) {
        const container = document.querySelector('[data-line-item="' + q.id + '"]');
        if (!container) return;
        const rowsWrapper = container.querySelector('.line-item-rows') || container;
        const existingRows = Array.from(rowsWrapper.querySelectorAll('.line-item-row'));
        existingRows.forEach(row => clearLineItemEffectsForRow(q, row));
        rowsWrapper.innerHTML = '';
        if (q.lineItemConfig?.addMode !== 'overlay') {
          addLineItemRow(q, container);
        }
        const selector = q.lineItemConfig?.sectionSelector;
        if (selector) {
          const selectorEl = container.querySelector('select[name="' + selector.id + '"]');
          if (selectorEl instanceof HTMLSelectElement) {
            selectorEl.selectedIndex = 0;
          }
        }
        const totals = container.querySelector('[data-line-totals]');
        if (totals) totals.innerHTML = '';
        const hidden = formEl.querySelector('[name="' + q.id + '_json"]');
        if (hidden) hidden.value = '';
        updateLineItemTotals(q.id);
      }

      function resetFormState(preserveLanguage = true) {
        const currentLang = langSelect.value;
        formEl.reset();
        definition.questions.forEach(q => {
          if (q.type === 'LINE_ITEM_GROUP') resetLineItemGroup(q);
        });
        clearAllErrors();
        if (preserveLanguage && currentLang) {
          langSelect.value = currentLang;
          state.language = currentLang;
        }
        applyAllFilters();
      }

      function resolveFieldIdFromElement(el) {
        if (!el) return '';
        const datasetId = el.dataset?.fieldId;
        if (datasetId) return datasetId;
        const nameAttr = el.name || (typeof el.getAttribute === 'function' ? el.getAttribute('name') : '');
        if (nameAttr) {
          if (nameAttr.includes('__')) return nameAttr.split('__')[0];
          return nameAttr;
        }
        const holder = (typeof el.closest === 'function') ? el.closest('[data-field-id]') : null;
        if (holder && holder.dataset?.fieldId) return holder.dataset.fieldId;
        return '';
      }

      function clearOtherFieldsExcept(fieldId) {
        definition.questions.forEach(q => {
          if (q.id === fieldId) return;
          if (q.type === 'LINE_ITEM_GROUP') {
            resetLineItemGroup(q);
            return;
          }
          clearFieldValuesByName(q.id);
          const hidden = formEl.querySelector('[name="' + q.id + '_json"]');
          if (hidden) hidden.value = '';
        });
        clearAllErrors();
      }

      function isEmptyLineItemRow(row) {
        if (!row) return true;
        const inputs = Array.from(row.querySelectorAll('input, select, textarea'));
        for (const input of inputs) {
          if (input instanceof HTMLInputElement) {
            if ((input.type === 'checkbox' || input.type === 'radio')) {
              if (input.checked) return false;
            } else {
              const val = (input.value || '').trim();
              if (val !== '') return false;
            }
          } else if (input instanceof HTMLSelectElement) {
            const val = (input.value || '').trim();
            if (val !== '') return false;
          } else if (input instanceof HTMLTextAreaElement) {
            const val = (input.value || '').trim();
            if (val !== '') return false;
          }
        }
        return true;
      }

      function openLineOverlay(group, container) {
        const anchorId = group.lineItemConfig?.anchorFieldId;
        const anchorField = (group.lineItemConfig?.fields || []).find(f => f.id === anchorId);
        if (!anchorField || anchorField.type !== 'CHOICE') {
          addLineItemRow(group, container);
          return;
        }
        const overlay = document.getElementById('line-overlay');
        const optionsBox = document.getElementById('overlay-options');
        const langKey = state.language.toLowerCase();
        overlay.style.display = 'flex';
        optionsBox.innerHTML = '';
        const optionsObj = {
          en: anchorField.options || [],
          fr: anchorField.optionsFr || [],
          nl: anchorField.optionsNl || []
        };
        const allowed = anchorField.optionFilter ? computeAllowedOptions(anchorField.optionFilter, optionsObj, null, group.id) : (optionsObj.en || []);
        const labels = (langKey === 'fr' ? optionsObj.fr : langKey === 'nl' ? optionsObj.nl : optionsObj.en) || [];
        const baseOpts = optionsObj.en || [];
        (labels || []).forEach((label, idx) => {
          const base = baseOpts[idx] || label;
          if (!allowed.includes(base)) return;
          const row = document.createElement('label');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '10px';
          row.style.fontSize = '22px';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = base;
          row.appendChild(cb);
          const span = document.createElement('span');
          span.textContent = label;
          row.appendChild(span);
          optionsBox.appendChild(row);
        });

        document.getElementById('overlay-cancel').onclick = () => { overlay.style.display = 'none'; };
        document.getElementById('overlay-confirm').onclick = () => {
          const selected = Array.from(optionsBox.querySelectorAll('input[type="checkbox"]')).filter((i) => i.checked).map((i) => i.value);
          selected.forEach(val => addLineItemRow(group, container, { [anchorField.id]: val }));
          overlay.style.display = 'none';
        };
      }

      function syncLineItemPayload() {
        const appForSync = getWebFormApp();
        if (appForSync && typeof appForSync.syncLineItemPayload === 'function') {
          try {
            appForSync.syncLineItemPayload(definition, formEl);
            return;
          } catch (err) {
            console && console.warn && console.warn('syncLineItemPayload via bundle failed; using legacy', err);
          }
        }
        definition.questions.forEach(q => {
          if (q.type !== 'LINE_ITEM_GROUP') return;
          const container = document.querySelector('[data-line-item="' + q.id + '"]');
          const hidden = formEl.querySelector('[name="' + q.id + '_json"]');
          if (!container || !hidden) return;

          const rows = Array.from(container.querySelectorAll('.line-item-row')).filter((r) => !r.classList.contains('is-hidden-field') && !isEmptyLineItemRow(r));
          const data = rows.map(row => {
            const result = {};
            (q.lineItemConfig?.fields || []).forEach(field => {
              const name = q.id + '__' + field.id;
              const inputs = row.querySelectorAll('[name="' + name + '"]');
              if (!inputs || inputs.length === 0) return;
              if (inputs[0].type === 'checkbox') {
                const selected = Array.from(inputs).filter(i => i.checked).map(i => i.value);
                result[field.id] = selected.join(', ');
              } else {
                result[field.id] = inputs[0].value;
              }
            });
            return result;
          });

          hidden.value = JSON.stringify(data);
        });
      }

      function buildPayloadFromForm() {
        const appForPayload = getWebFormApp();
        if (appForPayload && typeof appForPayload.buildPayloadFromForm === 'function') {
          try {
            return appForPayload.buildPayloadFromForm(formEl);
          } catch (err) {
            console && console.warn && console.warn('buildPayloadFromForm via bundle failed; using legacy', err);
          }
        }
        const fd = new FormData(formEl);
        const payload = {};
        const fileReads = [];

        const addValue = (key, val) => {
          if (payload[key] === undefined) {
            payload[key] = val;
          } else if (Array.isArray(payload[key])) {
            payload[key].push(val);
          } else {
            payload[key] = [payload[key], val];
          }
        };

        fd.forEach((val, key) => {
          if (val instanceof File) {
            if (!val || (!val.name && val.size === 0)) return;
            const reader = new FileReader();
            const p = new Promise(resolve => {
              reader.onload = () => {
                addValue(key, {
                  name: val.name || 'upload',
                  data: reader.result,
                  type: val.type || 'application/octet-stream'
                });
                resolve();
              };
              reader.onerror = () => resolve();
            });
            reader.readAsDataURL(val);
            fileReads.push(p);
          } else {
            addValue(key, val);
          }
        });

        return Promise.all(fileReads).then(() => payload);
      }

      function handleSubmit(evt) {
        evt.preventDefault();
        statusEl.textContent = '';
        clearAllErrors();
        const validationError = validateForm();
        if (validationError) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[validateForm] blocking submission', validationError);
          }
          showFieldError(validationError);
          return;
        }
        try {
          syncLineItemPayload();
        } catch (err) {
          statusEl.textContent = 'Please complete line items.';
          statusEl.className = 'status error';
          return;
        }

        const langInput = formEl.querySelector('select[name="language"]') || langSelect;
        if (langInput && langInput.value) {
          const existingLangInputs = formEl.querySelectorAll('input[type="hidden"][name="language"]');
          existingLangInputs.forEach(n => n.remove());
          const hiddenLang = document.createElement('input');
          hiddenLang.type = 'hidden';
          hiddenLang.name = 'language';
          hiddenLang.value = langInput.value;
          formEl.appendChild(hiddenLang);
        }

        statusEl.textContent = 'Submitting...';
        statusEl.className = 'status';

        const payloadPromise = buildPayloadFromForm();

        payloadPromise
          .then(payload => {
            setSubmitting(true);
            google.script.run
              .withSuccessHandler(res => {
                statusEl.textContent = (res && res.message) || 'Saved!';
                statusEl.className = 'status success';
                setSubmitting(false);
                try {
                  state.lastSubmissionMeta = res && res.meta ? res.meta : null;
                  showSummaryAndFollowUp(payload, state.lastSubmissionMeta);
                  if (listColumns.length) {
                    renderList(true);
                    showListMode();
                  }
                } catch (_) {
                  resetFormState(true);
                }
              })
              .withFailureHandler(err => {
                statusEl.textContent = err && err.message ? err.message : 'Submission failed';
                statusEl.className = 'status error';
                setSubmitting(false);
              })
              .submitWebForm(payload);
          })
          .catch(err => {
            statusEl.textContent = err && err.message ? err.message : 'Submission failed';
            statusEl.className = 'status error';
            setSubmitting(false);
          });
      }

      function setSubmitting(flag) {
        const elements = formEl.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => {
          if (flag) {
            el.setAttribute('disabled', 'true');
          } else {
            el.removeAttribute('disabled');
          }
        });
      }

      function showSummaryAndFollowUp(payload, meta) {
        if (!summaryView || !followupView || !formView || !viewActions) {
          resetFormState(true);
          return;
        }
        formView.style.display = 'none';
        viewActions.style.display = 'flex';
        summaryView.style.display = 'block';
        followupView.style.display = 'block';
        if (listView) listView.style.display = 'none';

        summaryView.innerHTML = '';
        followupView.innerHTML = '';

        const appSummary = getWebFormApp();
        if (appSummary && typeof appSummary.renderSummaryView === 'function') {
          try {
            appSummary.renderSummaryView({
              mount: summaryView,
              definition,
              language: state.language,
              payload
            });
          } catch (err) {
            console && console.warn && console.warn('renderSummaryView failed', err);
          }
        }

        const followupActions = buildFollowupActions(meta && meta.id ? meta.id : (recordIdInput?.value || ''));
        if (appSummary && typeof appSummary.renderFollowupView === 'function') {
          try {
            appSummary.renderFollowupView({
              mount: followupView,
              definition,
              language: state.language,
              actions: followupActions
            });
          } catch (err) {
            console && console.warn && console.warn('renderFollowupView failed', err);
          }
        }
      }

      init();
      if (listColumns.length) {
        renderList();
      }
      if (__WEB_FORM_DEBUG__ && console && console.info) {
        try {
          console.info('[WebForm] init invoked');
        } catch (_) {}
      }
    <\/script>
  </body>
</html>`;
  const srcdoc = escapeForSrcdoc(formHtml);
  const outerHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; border: 0; }
      body { background: #f5f7fb; }
      iframe { display: block; }
    </style>
  </head>
  <body>
    <iframe id="ck-form-frame" sandbox="allow-forms allow-scripts allow-same-origin" srcdoc="${srcdoc}"></iframe>
  </body>
</html>`;
  return outerHtml;
}
