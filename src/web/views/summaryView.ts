import { WebFormDefinition } from '../../types';
import { LangCode } from '../types';

interface SummaryViewOptions {
  mount: HTMLElement;
  definition: WebFormDefinition;
  language: LangCode;
  payload: Record<string, unknown>;
}

export function renderSummaryView(opts: SummaryViewOptions): void {
  const { mount, definition, language, payload } = opts;
  mount.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = language === 'FR' ? 'Résumé' : language === 'NL' ? 'Samenvatting' : 'Summary';
  mount.appendChild(title);

  const langKey = (language || 'EN').toLowerCase();

  definition.questions.forEach(q => {
    const block = document.createElement('div');
    block.style.padding = '8px 0';
    const label = document.createElement('div');
    label.style.fontWeight = '800';
    label.textContent = q.label[langKey as keyof typeof q.label] || q.label.en || q.id;
    const value = document.createElement('div');
    if (q.type === 'LINE_ITEM_GROUP') {
      const raw = (payload as any)[`${q.id}_json`] || (payload as any)[q.id];
      const rows = parseLineItems(raw);
      if (rows.length) {
        value.appendChild(renderLineItemList(rows, q, langKey));
      } else {
        value.textContent = '';
      }
    } else {
      const val = (payload as any)[q.id];
      value.textContent = Array.isArray(val) ? val.join(', ') : ((val as string) || '');
    }
    block.appendChild(label);
    block.appendChild(value);
    mount.appendChild(block);
  });
}

function parseLineItems(raw: any): Record<string, any>[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function renderLineItemList(
  rows: Record<string, any>[],
  question: SummaryViewOptions['definition']['questions'][number],
  languageKey: string
): HTMLElement {
  const list = document.createElement('ul');
  list.style.margin = '4px 0 0 16px';
  list.style.padding = '0 0 0 12px';
  rows.forEach(row => {
    const li = document.createElement('li');
    li.style.marginBottom = '4px';
    li.textContent = formatLineItemRow(row, question, languageKey);
    list.appendChild(li);
  });
  return list;
}

function formatLineItemRow(
  row: Record<string, any>,
  question: SummaryViewOptions['definition']['questions'][number],
  languageKey: string
): string {
  if (!row || typeof row !== 'object' || !question.lineItemConfig?.fields) return '';
  const parts: string[] = [];
  question.lineItemConfig.fields.forEach(field => {
    const raw = row[field.id];
    if (!raw) return;
    const label =
      (field as any)[`label${languageKey.toUpperCase()}`] ||
      field.labelEn ||
      field.id;
    parts.push(`${label}: ${raw}`);
  });
  return parts.join(' • ');
}
