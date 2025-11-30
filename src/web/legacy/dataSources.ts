import { LineItemFieldConfig, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';
import { resolveQuestionOptionsFromSource } from '../data/dataSources';

function buildOptionEl(value: string, labels: { en?: string; fr?: string; nl?: string }, langKey: string): HTMLOptionElement {
  const opt = document.createElement('option');
  opt.value = value;
  opt.dataset.enLabel = labels.en || value;
  opt.dataset.frLabel = labels.fr || value;
  opt.dataset.nlLabel = labels.nl || value;
  const localized = (labels as Record<string, string | undefined>)[langKey] || labels.en || value;
  opt.textContent = localized;
  return opt;
}

function writeOptionsToSelect(select: HTMLSelectElement, options: string[], labelsMap: Record<string, string[]>): void {
  select.innerHTML = '';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '';
  select.appendChild(emptyOpt);
  const langKey = (labelsMap.__lang || 'en').toString().toLowerCase();
  options.forEach((value, idx) => {
    const labels = {
      en: labelsMap.en?.[idx] || value,
      fr: labelsMap.fr?.[idx] || value,
      nl: labelsMap.nl?.[idx] || value
    };
    select.appendChild(buildOptionEl(value, labels, langKey));
  });
  select.dataset.originalOptions = JSON.stringify({ en: labelsMap.en || options, fr: labelsMap.fr || options, nl: labelsMap.nl || options });
}

function writeOptionsToCheckbox(wrapper: HTMLElement, name: string, options: string[], labelsMap: Record<string, string[]>): void {
  wrapper.innerHTML = '';
  const langKey = (labelsMap.__lang || 'en').toString().toLowerCase();
  options.forEach((value, idx) => {
    const labels = {
      en: labelsMap.en?.[idx] || value,
      fr: labelsMap.fr?.[idx] || value,
      nl: labelsMap.nl?.[idx] || value
    };
    const id = name + '_' + idx + '_' + Math.random().toString(16).slice(2);
    const label = document.createElement('label');
    label.className = 'inline';
    label.style.fontWeight = '400';
    label.htmlFor = id;
    label.dataset.enLabel = labels.en || value;
    label.dataset.frLabel = labels.fr || value;
    label.dataset.nlLabel = labels.nl || value;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = name;
    cb.id = id;
    cb.value = value;
    const span = document.createElement('span');
    span.className = 'option-label';
    span.textContent = (labels as Record<string, string | undefined>)[langKey] || labels.en || value;
    label.appendChild(cb);
    label.appendChild(span);
    wrapper.appendChild(label);
  });
  wrapper.dataset.originalOptions = JSON.stringify({ en: labelsMap.en || options, fr: labelsMap.fr || options, nl: labelsMap.nl || options });
}

function emitLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  payload?: Record<string, any>
): void {
  const localConsole =
    typeof globalThis === 'object' && 'console' in globalThis
      ? (globalThis as typeof globalThis & { console: Console }).console
      : undefined;
  localConsole?.[level]?.(message, payload);
  try {
    const currentWindow =
      typeof globalThis === 'object' && 'window' in globalThis
        ? (globalThis as Window & typeof globalThis)
        : undefined;
    const parentWindow = currentWindow?.parent;
    if (parentWindow && parentWindow === currentWindow) {
      return;
    }
    if (parentWindow) {
      const parentConsole = (parentWindow as any).console as Console | undefined;
      parentConsole?.[level]?.(message, payload);
    }
  } catch (err) {
    localConsole?.debug?.('[DataSource] emitLog parent mirror failed', err);
  }
}

async function hydrateQuestionOptions(
  question: WebQuestionDefinition,
  language: LangCode,
  formEl: HTMLFormElement
): Promise<void> {
  emitLog('info', '[DataSource] hydrateQuestionOptions start', { questionId: question.id, type: question.type });
  const options = await resolveQuestionOptionsFromSource(question, language);
  const resolvedOptions = options ?? [];
  if (resolvedOptions.length === 0) {
    emitLog('warn', '[DataSource] no options returned', { questionId: question.id });
    return;
  }
  // Persist hydrated options on the definition so filters/visibility logic can
  // keep using question.options even after dynamic replacement.
  question.options = {
    en: resolvedOptions,
    fr: resolvedOptions,
    nl: resolvedOptions
  };
  const langKey = (language || 'en').toString().toLowerCase();
  const labelsMap: Record<string, string[]> = {
    en: resolvedOptions,
    fr: resolvedOptions,
    nl: resolvedOptions,
    __lang: langKey
  } as any;

  if (question.type === 'CHOICE') {
    const select = formEl.querySelector<HTMLSelectElement>('[name="' + question.id + '"]');
    if (select) {
      const previousValue = select.value;
      writeOptionsToSelect(select, resolvedOptions, labelsMap);
      if (previousValue && Array.from(select.options).some(opt => opt.value === previousValue)) {
        select.value = previousValue;
      }
    }
    emitLog('info', '[DataSource] choice options written', { questionId: question.id, count: resolvedOptions.length });
  } else if (question.type === 'CHECKBOX') {
    const wrapper =
      formEl.querySelector<HTMLElement>('[data-field-name="' + question.id + '"]') ||
      formEl.querySelector<HTMLElement>('[name="' + question.id + '"]');
    if (wrapper) {
      const prevSelections = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);
      writeOptionsToCheckbox(wrapper, question.id, resolvedOptions, labelsMap);
      if (prevSelections.length) {
        wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
          if (prevSelections.includes(cb.value)) cb.checked = true;
        });
      }
    }
    emitLog('info', '[DataSource] checkbox options written', { questionId: question.id, count: resolvedOptions.length });
  }
}

async function hydrateLineItemFieldOptions(
  group: WebQuestionDefinition,
  field: LineItemFieldConfig,
  language: LangCode,
  formEl: HTMLFormElement
): Promise<void> {
  emitLog('info', '[DataSource] hydrateLineItemFieldOptions start', { groupId: group.id, fieldId: field.id, type: field.type });
  const options = await resolveQuestionOptionsFromSource(
    {
      id: `${group.id}__${field.id}`,
      type: field.type,
      dataSource: field.dataSource
    },
    language
  );
  const resolvedOptions = options ?? [];
  if (!resolvedOptions.length) {
    emitLog('warn', '[DataSource] no line item options returned', { groupId: group.id, fieldId: field.id });
    return;
  }
  field.options = resolvedOptions;
  field.optionsFr = resolvedOptions;
  field.optionsNl = resolvedOptions;
  const container = formEl.querySelector<HTMLElement>('[data-line-item="' + group.id + '"]');
  if (!container) return;
  const langKey = (language || 'en').toString().toLowerCase();
  const labelsMap: Record<string, string[]> = {
    en: resolvedOptions,
    fr: resolvedOptions,
    nl: resolvedOptions,
    __lang: langKey
  } as any;

  if (field.type === 'CHOICE') {
    const selects = container.querySelectorAll<HTMLSelectElement>('select[name="' + group.id + '__' + field.id + '"]');
    selects.forEach(select => {
      const previousValue = select.value;
      writeOptionsToSelect(select, resolvedOptions, labelsMap);
      if (previousValue && Array.from(select.options).some(opt => opt.value === previousValue)) {
        select.value = previousValue;
      }
    });
    emitLog('info', '[DataSource] line item choice options written', { groupId: group.id, fieldId: field.id, count: resolvedOptions.length });
    return;
  }

  if (field.type === 'CHECKBOX') {
    const wrappers = container.querySelectorAll<HTMLElement>('[data-field-name="' + group.id + '__' + field.id + '"]');
    wrappers.forEach(wrapper => {
      const prevSelections = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);
      writeOptionsToCheckbox(wrapper, group.id + '__' + field.id, resolvedOptions, labelsMap);
      if (prevSelections.length) {
        wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
          if (prevSelections.includes(cb.value)) cb.checked = true;
        });
      }
    });
    emitLog('info', '[DataSource] line item checkbox options written', { groupId: group.id, fieldId: field.id, count: resolvedOptions.length });
  }
}

export async function hydrateDataSources(definition: WebFormDefinition, language: LangCode, formEl: HTMLFormElement): Promise<void> {
  const tasks: Promise<void>[] = [];
  definition.questions.forEach(q => {
    if (q.dataSource && (q.type === 'CHOICE' || q.type === 'CHECKBOX')) {
      emitLog('info', '[DataSource] scheduling hydration', { questionId: q.id });
      tasks.push(hydrateQuestionOptions(q, language, formEl));
    }
    if (q.type === 'LINE_ITEM_GROUP') {
      (q.lineItemConfig?.fields || []).forEach(field => {
        if (!field.dataSource || (field.type !== 'CHOICE' && field.type !== 'CHECKBOX')) return;
        emitLog('info', '[DataSource] scheduling line item hydration', { groupId: q.id, fieldId: field.id });
        tasks.push(hydrateLineItemFieldOptions(q, field, language, formEl));
      });
    }
  });
  await Promise.all(tasks);
}
