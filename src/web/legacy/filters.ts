import { OptionFilter, WebQuestionDefinition } from '../../types';
import { computeAllowedOptions, buildLocalizedOptions } from '../rules/filter';
import { getValue, getRowValue } from './dom';
import { LangCode, OptionSet } from '../types';

interface ApplyFilterOptions {
  definition: { questions: WebQuestionDefinition[] };
  language: LangCode;
  formEl: HTMLFormElement;
  scopeRow?: HTMLElement | null;
}

function applyFilterToElement(
  el: HTMLElement,
  filter: OptionFilter,
  options: OptionSet,
  language: LangCode,
  dependencyValues: (string | number | null | undefined)[]
) {
  const allowed = computeAllowedOptions(filter, options, dependencyValues);
  const langKey = (language || 'en').toString().toLowerCase();

  if (el.tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    const previous = select.value;
    const currentSelections = previous ? [previous] : [];
    const extras = currentSelections.filter(v => v && !allowed.includes(v));
    const allowedSet = new Set((allowed || []).map(v => (v || '').toString().toLowerCase()));
    const combined: string[] = [];
    const seen = new Set<string>();
    [...allowed, ...extras].forEach(v => {
      if (seen.has(v)) return;
      seen.add(v);
      combined.push(v);
    });
    select.innerHTML = '';
    combined.forEach(base => {
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
        select.appendChild(opt);
      }
    });
  } else {
    const wrapper = el.tagName === 'DIV' ? el : el.parentElement;
    if (!wrapper) return;
    const inputs = wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const prevChecked = Array.from(inputs).filter(c => c.checked).map(c => c.value);
    const extras = prevChecked.filter(v => v && !allowed.includes(v));
    const allowedSet = new Set((allowed || []).map(v => (v || '').toString().toLowerCase()));
    const combined: string[] = [];
    const seen = new Set<string>();
    [...allowed, ...extras].forEach(v => {
      if (seen.has(v)) return;
      seen.add(v);
      combined.push(v);
    });
    const nameAttr = (wrapper as any).dataset?.fieldName || wrapper.getAttribute('name') || '';
    wrapper.innerHTML = '';
    combined.forEach((base, idx) => {
      const localized = buildLocalizedOptions(options, [base], language)[0];
      const id = nameAttr + '_' + idx + '_' + Math.random().toString(16).slice(2);
      const l = document.createElement('label');
      l.className = 'inline';
      l.style.fontWeight = '400';
      l.htmlFor = id;
      l.dataset.enLabel = localized?.labels?.en || base;
      l.dataset.frLabel = localized?.labels?.fr || base;
      l.dataset.nlLabel = localized?.labels?.nl || base;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = nameAttr;
      cb.id = id;
      cb.value = base;
      if (prevChecked.includes(base)) cb.checked = true;
      const span = document.createElement('span');
      span.className = 'option-label';
      span.textContent = localized?.label || base;
      l.appendChild(cb);
      l.appendChild(span);
      if (!allowedSet.size || allowedSet.has(base.toLowerCase()) || prevChecked.includes(base)) {
        wrapper.appendChild(l);
      }
    });
  }
}

export function applyFilters(options: ApplyFilterOptions): void {
  const { definition, language, formEl, scopeRow } = options;

  const getDependencyValues = (dependsOn: string | string[], row?: HTMLElement, linePrefix?: string) => {
    const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
    return ids.map(id => {
      const prefixed = linePrefix ? `${linePrefix}__${id}` : id;
      let val = row ? getRowValue(row, prefixed) : getValue(formEl, prefixed);
      if ((val === '' || (Array.isArray(val) && val.length === 0)) && linePrefix) {
        val = getValue(formEl, id);
      }
      if (Array.isArray(val)) return val.join('|');
      return val as string | number | null | undefined;
    });
  };

  definition.questions.forEach(q => {
    if ((q.type === 'CHOICE' || q.type === 'CHECKBOX') && q.optionFilter) {
      const target =
        q.type === 'CHECKBOX'
          ? (formEl.querySelector<HTMLElement>('[data-field-name="' + q.id + '"]') ||
            formEl.querySelector<HTMLElement>('[name="' + q.id + '"]'))
          : formEl.querySelector<HTMLElement>('[name="' + q.id + '"]');
      if (target) {
        applyFilterToElement(target as HTMLElement, q.optionFilter, q.options || { en: [], fr: [], nl: [] }, language, getDependencyValues(q.optionFilter.dependsOn));
      }
    }

    if (q.type === 'LINE_ITEM_GROUP') {
      const container = formEl.querySelector<HTMLElement>('[data-line-item="' + q.id + '"]');
      if (!container) return;
      const rows = scopeRow ? [scopeRow] : Array.from(container.querySelectorAll<HTMLElement>('.line-item-row'));
      rows.forEach(row => {
        (q.lineItemConfig?.fields || []).forEach(field => {
          if (!field.optionFilter) return;
          const name = q.id + '__' + field.id;
          const el =
            field.type === 'CHECKBOX'
              ? (row.querySelector<HTMLElement>('[data-field-name="' + name + '"]') ||
                row.querySelector<HTMLElement>('[name="' + name + '"]'))
              : row.querySelector<HTMLElement>('[name="' + name + '"]');
          if (el) {
            applyFilterToElement(
              el as HTMLElement,
              field.optionFilter,
              { en: field.options || [], fr: field.optionsFr || [], nl: field.optionsNl || [] },
              language,
              getDependencyValues(field.optionFilter.dependsOn, row, q.id)
            );
          }
        });
      });
    }
  });
}
