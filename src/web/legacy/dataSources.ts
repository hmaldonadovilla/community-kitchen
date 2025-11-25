import { WebFormDefinition, WebQuestionDefinition } from '../../types';
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

async function hydrateQuestionOptions(
  question: WebQuestionDefinition,
  language: LangCode,
  formEl: HTMLFormElement
): Promise<void> {
  const options = await resolveQuestionOptionsFromSource(question, language);
  if (!options || !options.length) return;
  const langKey = (language || 'en').toString().toLowerCase();
  const labelsMap: Record<string, string[]> = {
    en: options,
    fr: options,
    nl: options,
    __lang: langKey
  } as any;

  if (question.type === 'CHOICE') {
    const select = formEl.querySelector<HTMLSelectElement>('[name="' + question.id + '"]');
    if (select) writeOptionsToSelect(select, options, labelsMap);
  } else if (question.type === 'CHECKBOX') {
    const wrapper =
      formEl.querySelector<HTMLElement>('[data-field-name="' + question.id + '"]') ||
      formEl.querySelector<HTMLElement>('[name="' + question.id + '"]');
    if (wrapper) writeOptionsToCheckbox(wrapper, question.id, options, labelsMap);
  }
}

export async function hydrateDataSources(definition: WebFormDefinition, language: LangCode, formEl: HTMLFormElement): Promise<void> {
  const tasks: Promise<void>[] = [];
  definition.questions.forEach(q => {
    if (q.dataSource && (q.type === 'CHOICE' || q.type === 'CHECKBOX')) {
      tasks.push(hydrateQuestionOptions(q, language, formEl));
    }
  });
  await Promise.all(tasks);
}
