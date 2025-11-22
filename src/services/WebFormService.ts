import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import {
  FormConfig,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  WebQuestionDefinition
} from '../types';

/**
 * WebFormService generates a custom HTML web form (Apps Script Web App)
 * from the same spreadsheet configuration used for Google Forms.
 * It also handles submissions and writes responses directly into the destination tab.
 */
export class WebFormService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
  }

  public buildDefinition(formKey?: string): WebFormDefinition {
    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');

    const webQuestions: WebQuestionDefinition[] = questions.map(q => ({
      id: q.id,
      type: q.type,
      label: {
        en: q.qEn,
        fr: q.qFr,
        nl: q.qNl
      },
      required: q.required,
      options: q.options.length || q.optionsFr.length || q.optionsNl.length ? {
        en: q.options,
        fr: q.optionsFr,
        nl: q.optionsNl
      } : undefined,
      lineItemConfig: q.lineItemConfig,
      uploadConfig: q.uploadConfig
    }));

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages: ['EN', 'FR', 'NL'],
      questions: webQuestions
    };
  }

  public renderForm(formKey?: string): GoogleAppsScript.HTML.HtmlOutput {
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const html = this.buildTemplate(def, targetKey);
    const output = HtmlService.createHtmlOutput(html);
    output.setTitle(def.title || 'Form');
    return output;
  }

  public submitWebForm(formObject: any): { success: boolean; message: string } {
    const formKey = (formObject.formKey || formObject.form || '').toString();
    const languageRaw = (formObject.language || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const sheet = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

    const row: any[] = [new Date(), language];

    questions.forEach(q => {
      let value: any = '';

      if (q.type === 'LINE_ITEM_GROUP') {
        const rawLineItems = formObject[`${q.id}_json`] || formObject[q.id];
        if (rawLineItems && typeof rawLineItems === 'string') {
          value = rawLineItems;
        } else if (rawLineItems) {
          try {
            value = JSON.stringify(rawLineItems);
          } catch (_) {
            value = '';
          }
        }
      } else if (q.type === 'FILE_UPLOAD') {
        value = this.saveFiles(formObject[q.id], q.uploadConfig);
      } else {
        value = formObject[q.id];
        if (Array.isArray(value)) {
          value = value.join(', ');
        }
      }

      row.push(value ?? '');
    });

    sheet.appendRow(row);
    return { success: true, message: 'Saved to sheet' };
  }

  private findForm(formKey?: string): FormConfig {
    const forms = this.dashboard.getForms();
    if (!forms.length) throw new Error('No forms configured. Run setup first.');
    if (!formKey) return forms[0];

    const match = forms.find(f => f.configSheet === formKey || f.title.toLowerCase() === formKey.toLowerCase());
    if (!match) {
      throw new Error(`Form "${formKey}" not found in dashboard.`);
    }
    return match;
  }

  private ensureDestination(destinationTab: string, questions: QuestionConfig[]): GoogleAppsScript.Spreadsheet.Sheet {
    let sheet = this.ss.getSheetByName(destinationTab);
    if (!sheet) {
      sheet = this.ss.insertSheet(destinationTab);
    }

    const headers = ['Timestamp', 'Language', ...questions.map(q => q.qEn)];
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

    const needsHeader = existing.filter(v => v).length === 0;
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    } else {
      // Ensure all headers exist by appending missing ones
      headers.forEach((h, idx) => {
        const current = existing[idx];
        if (!current) {
          sheet.getRange(1, idx + 1).setValue(h).setFontWeight('bold');
        }
      });
    }

    return sheet;
  }

  private saveFiles(files: any, uploadConfig?: QuestionConfig['uploadConfig']): string {
    if (!files) return '';
    const fileArray = Array.isArray(files) ? files : [files];
    const limitedFiles = uploadConfig?.maxFiles ? fileArray.slice(0, uploadConfig.maxFiles) : fileArray;

    const folder = this.getUploadFolder(uploadConfig);
    const urls: string[] = [];

    limitedFiles.forEach(file => {
      if (!file) return;

      const name = typeof file.getName === 'function' ? file.getName() : undefined;
      if (uploadConfig?.allowedExtensions && name) {
        const lower = name.toLowerCase();
        const allowed = uploadConfig.allowedExtensions.map(ext => ext.toLowerCase().replace('.', ''));
        const isAllowed = allowed.some(ext => lower.endsWith(ext));
        if (!isAllowed) return;
      }

      if (uploadConfig?.maxFileSizeMb && typeof file.getBytes === 'function') {
        const sizeMb = file.getBytes().length / (1024 * 1024);
        if (sizeMb > uploadConfig.maxFileSizeMb) return;
      }

      const created = folder.createFile(file);
      urls.push(created.getUrl());
    });

    return urls.join(', ');
  }

  private getUploadFolder(uploadConfig?: QuestionConfig['uploadConfig']): GoogleAppsScript.Drive.Folder {
    if (uploadConfig?.destinationFolderId) {
      return DriveApp.getFolderById(uploadConfig.destinationFolderId);
    }

    const file = DriveApp.getFileById(this.ss.getId());
    const parents = file.getParents();
    if (parents.hasNext()) return parents.next();
    return DriveApp.getRootFolder();
  }

  private buildTemplate(def: WebFormDefinition, formKey: string): string {
    const defJson = JSON.stringify(def).replace(/</g, '\\u003c');
    const keyJson = JSON.stringify(formKey);

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

      button { font-weight: 800; letter-spacing: 0.2px; cursor: pointer; }
      button.primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border: none; padding: 22px 18px; border-radius: 14px; width: 100%; font-size: 26px; box-shadow: 0 12px 30px rgba(37,99,235,0.25); }
      button.secondary { background: #eef2ff; color: var(--accent); border: none; padding: 16px 14px; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(37,99,235,0.12); font-size: 25px; }

      .actions { position: sticky; bottom: 0; background: linear-gradient(180deg, transparent, var(--bg) 30%); padding: 10px 0 4px; }
      .status { display: block; margin-top: 8px; font-size: 14px; color: var(--muted); }
      .error { color: #b91c1c; }
      .success { color: #15803d; }

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

        renderQuestions();
        updateLanguage();
        formEl.addEventListener('submit', handleSubmit);
        formEl.addEventListener('focusin', lockViewport);
        formEl.addEventListener('focusout', unlockViewport);
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
            field.appendChild(container);

            state.lineItems[q.id] = state.lineItems[q.id] || [];
            addLineItemRow(q, container);

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'secondary';
            addBtn.textContent = (q.lineItemConfig && q.lineItemConfig.addButtonLabel && q.lineItemConfig.addButtonLabel.en) || '+ Add line';
            addBtn.addEventListener('click', () => addLineItemRow(q, container));
            field.appendChild(addBtn);
          } else {
            field.appendChild(renderInput(q));
          }

          questionsEl.appendChild(field);
        });
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
          return select;
        }

        if (q.type === 'CHECKBOX') {
          const wrapper = document.createElement('div');
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
        input.required = !!q.required;
        if (q.type === 'DATE') input.type = 'date';
        else if (q.type === 'NUMBER') input.type = 'number';
        else input.type = 'text';
        return input;
      }

      function addLineItemRow(q, container) {
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
            (field.options || []).forEach((opt, idx) => {
              const option = document.createElement('option');
              option.value = opt;
              option.dataset.enLabel = opt;
              option.dataset.frLabel = field.optionsFr?.[idx] || opt;
              option.dataset.nlLabel = field.optionsNl?.[idx] || opt;
              option.textContent = opt;
              input.appendChild(option);
            });
          } else if (field.type === 'CHECKBOX') {
            input = document.createElement('div');
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
          } else {
            input = document.createElement('input');
            input.type = field.type === 'NUMBER' ? 'number' : 'text';
            input.name = q.id + '__' + field.id;
          }

          if (input && input.tagName !== 'DIV') {
            (input).required = !!field.required;
            input.name = q.id + '__' + field.id;
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

      function handleSubmit(evt) {
        evt.preventDefault();
        statusEl.textContent = '';
        try {
          syncLineItemPayload();
        } catch (err) {
          statusEl.textContent = 'Please complete line items.';
          statusEl.className = 'status error';
          return;
        }

        const langInput = formEl.querySelector('select[name="language"]') || langSelect;
        if (langInput && langInput.value) {
          const hiddenLang = document.createElement('input');
          hiddenLang.type = 'hidden';
          hiddenLang.name = 'language';
          hiddenLang.value = langInput.value;
          formEl.appendChild(hiddenLang);
        }

        statusEl.textContent = 'Submitting...';
        statusEl.className = 'status';
        google.script.run
          .withSuccessHandler(() => {
            statusEl.textContent = 'Saved!';
            statusEl.className = 'status success';
            formEl.reset();
          })
          .withFailureHandler(err => {
            statusEl.textContent = err && err.message ? err.message : 'Submission failed';
            statusEl.className = 'status error';
          })
          .submitWebForm(formEl);
      }

      init();
    </script>
  </body>
</html>`;
  }
}
