import { WebFormDefinition } from '../types';

/**
 * Builds the HTML string for the web form. Kept as a separate module to keep
 * WebFormService focused on data and submission logic.
 */
export function buildWebFormHtml(def: WebFormDefinition, formKey: string): string {
  const defJson = JSON.stringify(def).replace(/</g, '\\u003c');
  const keyJson = JSON.stringify(formKey || def?.title || '');

  return `<!DOCTYPE html>
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
        <form id="web-form">
          <input type="hidden" name="formKey" value=${keyJson} />
          <div id="questions"></div>
          <div class="actions">
            <button class="primary" type="submit">Submit</button>
            <span id="status" class="status"></span>
          </div>
        </form>
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
      const definition = ${defJson};
      const formKey = ${keyJson};

      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const originalViewport = viewportMeta?.getAttribute('content') || 'width=device-width, initial-scale=1';
      const lockedViewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

      const langSelect = document.getElementById('lang-select');
      const titleEl = document.getElementById('form-title');
      const descriptionEl = document.getElementById('form-description');
      const questionsEl = document.getElementById('questions');
      const statusEl = document.getElementById('status');
      const formEl = document.getElementById('web-form');

      const state = { language: 'EN', lineItems: {} };
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
          updateLanguage();
          applyAllFilters();
        } catch (err) {
          statusEl.textContent = (err && err.message) ? err.message : 'Failed to render form.';
          statusEl.className = 'status error';
          console.error(err);
        }
        formEl.addEventListener('submit', handleSubmit);
        formEl.addEventListener('change', () => applyAllFilters());
        formEl.addEventListener('focusin', lockViewport);
        formEl.addEventListener('focusout', unlockViewport);
        formEl.addEventListener('input', (e) => clearFieldErrorForTarget(e.target));
        formEl.addEventListener('change', (e) => clearFieldErrorForTarget(e.target));
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
          label.textContent = q.label.en || '';
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
              addBtn.addEventListener('click', () => addLineItemRow(q, container));
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
        return container.querySelectorAll('.line-item-row').length;
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
        else if (q.type === 'NUMBER') input.type = 'number';
        else input.type = 'text';
        return input;
      }

      function addLineItemRow(q, container, presetValues = {}) {
        const row = document.createElement('div');
        row.className = 'line-item-row';

        (q.lineItemConfig?.fields || []).forEach(field => {
          const cell = document.createElement('div');
          const lbl = document.createElement('label');
          lbl.dataset.enLabel = field.labelEn || '';
          lbl.dataset.frLabel = field.labelFr || '';
          lbl.dataset.nlLabel = field.labelNl || '';
          lbl.textContent = field.labelEn || '';
          cell.appendChild(lbl);

          let input;
          if (field.type === 'CHOICE') {
            input = document.createElement('select');
            input.dataset.fieldId = field.id;
            input.dataset.labelEn = (field.labelEn || '').toLowerCase();
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
            input.name = q.id + '__' + field.id;
          }

          if (input && input.tagName !== 'DIV') {
            input.required = !!field.required;
            input.name = q.id + '__' + field.id;
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
          container.removeChild(row);
        });
        actions.appendChild(removeBtn);
        row.appendChild(actions);

        container.appendChild(row);
        applyAllFilters(row);
      }

      function updateLanguage() {
        const current = state.language.toLowerCase();
        document.querySelectorAll('[data-en-label]').forEach(el => {
          const label = el.dataset[current + 'Label'] || el.dataset.enLabel || '';
          el.textContent = label;
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

        applyAllFilters();
      }

      function applyAllFilters(scopeRow) {
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
            const rows = Array.from(container.querySelectorAll('.line-item-row'));
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
        return candidateKeys.reduce((acc, key) => acc || filter.optionMap[key], void 0) || options.en || [];
      }

      function applyFilter(el, filter, options, row, linePrefix) {
        if (!options) return;
        const langKey = state.language.toLowerCase();

        const allowed = computeAllowedOptions(filter, options, row, linePrefix);

        if (el.tagName === 'SELECT') {
          const previous = el.value;
          el.innerHTML = '';
          (options[langKey] || options.en || []).forEach((label, idx) => {
            const base = options.en?.[idx] || label;
            if (!allowed.includes(base)) return;
            const opt = document.createElement('option');
            opt.value = base;
            opt.dataset.enLabel = options.en?.[idx] || base;
            opt.dataset.frLabel = options.fr?.[idx] || base;
            opt.dataset.nlLabel = options.nl?.[idx] || base;
            opt.textContent = label;
            if (previous && previous === base) opt.selected = true;
            el.appendChild(opt);
          });
        } else {
          const wrapper = el.tagName === 'DIV' ? el : el.parentElement;
          const prevChecked = Array.from(wrapper.querySelectorAll('input[type="checkbox"]')).filter((c) => c.checked).map((c) => c.value);
          wrapper.innerHTML = '';
          const nameAttr = (wrapper.dataset && wrapper.dataset.fieldName) || wrapper.getAttribute('name') || '';
          (options[langKey] || options.en || []).forEach((label, idx) => {
            const base = options.en?.[idx] || label;
            if (!allowed.includes(base)) return;
            const id = nameAttr + '_' + idx + '_' + Math.random().toString(16).slice(2);
            const l = document.createElement('label');
            l.className = 'inline';
            l.style.fontWeight = '400';
            l.htmlFor = id;
            l.dataset.enLabel = options.en?.[idx] || base;
            l.dataset.frLabel = options.fr?.[idx] || base;
            l.dataset.nlLabel = options.nl?.[idx] || base;
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
            wrapper.appendChild(l);
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
        const missingRequiredLineItem = definition.questions.find(q => q.type === 'LINE_ITEM_GROUP' && q.required && getLineItemRowCount(q.id) === 0);
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

        for (const entry of rules) {
          if (entry.scope === 'main') {
            const whenVal = getValue(entry.rule.when.fieldId);
            if (!matchesWhen(whenVal, entry.rule.when)) continue;
            const targetVal = getValue(entry.rule.then.fieldId);
            const msg = checkRule(targetVal, entry.rule.then, entry.rule.message);
            if (msg) return { message: msg, fieldId: entry.rule.then.fieldId, scope: 'main' };
          } else if (entry.scope === 'line' && entry.groupId) {
            const container = document.querySelector('[data-line-item="' + entry.groupId + '"]');
            if (!container) continue;
            const rows = Array.from(container.querySelectorAll('.line-item-row'));
            for (const row of rows) {
              const whenName = entry.groupId + '__' + entry.rule.when.fieldId;
              const thenName = entry.groupId + '__' + entry.rule.then.fieldId;
              let whenVal = getRowValue(row, whenName);
              if (whenVal === '' || (Array.isArray(whenVal) && whenVal.length === 0)) {
                whenVal = getValue(entry.rule.when.fieldId);
              }
              if (!matchesWhen(whenVal, entry.rule.when)) continue;
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
        return '';
      }

      function getRowValue(row, name) {
        const els = row.querySelectorAll('[name="' + name + '"]');
        if (!els || els.length === 0) return '';
        const el = els[0];
        if (el instanceof HTMLSelectElement) return el.value;
        if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox') {
            return Array.from(els).filter((e) => e.checked).map((e) => e.value);
          }
          return el.value;
        }
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
          const hasValue = values.some(v => v !== undefined && v !== null && v !== '');
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
        definition.questions.forEach(q => {
          if (q.type !== 'LINE_ITEM_GROUP') return;
          const container = document.querySelector('[data-line-item="' + q.id + '"]');
          const hidden = formEl.querySelector('[name="' + q.id + '_json"]');
          if (!container || !hidden) return;

          const rows = Array.from(container.querySelectorAll('.line-item-row'));
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

        buildPayloadFromForm()
          .then(payload => {
            setSubmitting(true);
            google.script.run
              .withSuccessHandler(() => {
                statusEl.textContent = 'Saved!';
                statusEl.className = 'status success';
                formEl.reset();
                clearAllErrors();
                applyAllFilters();
                setSubmitting(false);
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

      init();
    <\/script>
  </body>
</html>`;
}
