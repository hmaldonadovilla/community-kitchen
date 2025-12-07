import { WebFormDefinition } from '../../types';
import { LangCode } from '../types';
import { resolveLocalizedString } from '../i18n';

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
        const consolidated = buildConsolidatedValues(rows, q, langKey);
        if (consolidated) {
          value.appendChild(consolidated);
        }
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
    const main = document.createElement('div');
    main.textContent = formatLineItemRow(row, question, languageKey);
    li.appendChild(main);

    if (question.lineItemConfig?.subGroups?.length) {
      question.lineItemConfig.subGroups.forEach(sub => {
        const key =
          sub.id ||
          (typeof sub.label === 'string'
            ? sub.label
            : sub.label?.en || sub.label?.fr || sub.label?.nl) ||
          '';
        const subRows = Array.isArray(row[key]) ? row[key] : [];
        if (!key || !subRows.length) return;
        const subLabel = document.createElement('div');
        subLabel.style.fontWeight = '600';
        subLabel.textContent = resolveLocalizedString(sub.label, languageKey.toUpperCase() as LangCode, key);
        li.appendChild(subLabel);
        li.appendChild(renderSubLineItemList(subRows, sub, languageKey));
      });
    }

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
  const selectorId = question.lineItemConfig?.sectionSelector?.id;
  question.lineItemConfig.fields.forEach(field => {
    if (field.id === selectorId || field.id === 'ITEM_FILTER') return;
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

function buildConsolidatedValues(
  rows: Record<string, any>[],
  question: SummaryViewOptions['definition']['questions'][number],
  languageKey: string
): HTMLElement | null {
  const items: Array<{ label: string; text: string }> = [];
  const selectorId = question.lineItemConfig?.sectionSelector?.id;
  (question.lineItemConfig?.fields || []).forEach(field => {
    if (field.id === selectorId || field.id === 'ITEM_FILTER') return;
    const set = new Set<string>();
    rows.forEach(row => {
      const raw = row[field.id];
      if (raw === undefined || raw === null || raw === '') return;
      const val = Array.isArray(raw) ? raw.join(', ') : raw.toString();
      if (val.trim()) set.add(val.trim());
    });
    if (set.size) {
      const label =
        (field as any)[`label${languageKey.toUpperCase()}`] ||
        field.labelEn ||
        field.id;
      items.push({ label, text: Array.from(set).join(', ') });
    }
  });

  (question.lineItemConfig?.subGroups || []).forEach(sub => {
    const subKey =
      sub.id ||
      (typeof sub.label === 'string' ? sub.label : sub.label?.en || sub.label?.fr || sub.label?.nl) ||
      '';
    if (!subKey) return;
    const subLabel = resolveLocalizedString(sub.label, languageKey.toUpperCase() as LangCode, subKey);
    rows.forEach(row => {
      const subRows = Array.isArray((row || {})[subKey]) ? (row as any)[subKey] : [];
      (sub.fields || []).forEach(field => {
        if (field.id === 'ITEM_FILTER') return;
        const set = new Set<string>();
        subRows.forEach((subRow: any) => {
          const raw = subRow?.[field.id];
          if (raw === undefined || raw === null || raw === '') return;
          const val = Array.isArray(raw) ? raw.join(', ') : raw.toString();
          if (val.trim()) set.add(val.trim());
        });
        if (set.size) {
          const label =
            `${subLabel} • ` +
            ((field as any)[`label${languageKey.toUpperCase()}`] || field.labelEn || field.id);
          items.push({ label, text: Array.from(set).join(', ') });
        }
      });
    });
  });

  if (!items.length) return null;
  const wrapper = document.createElement('div');
  wrapper.style.marginTop = '6px';
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = 'Consolidated';
  wrapper.appendChild(title);
  const list = document.createElement('ul');
  list.style.margin = '4px 0 0 12px';
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.label}: ${item.text}`;
    list.appendChild(li);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function renderSubLineItemList(
  rows: Record<string, any>[],
  subGroup: NonNullable<SummaryViewOptions['definition']['questions'][number]['lineItemConfig']>['subGroups'][number],
  languageKey: string
): HTMLElement {
  const list = document.createElement('ul');
  list.style.margin = '2px 0 0 12px';
  list.style.padding = '0 0 0 12px';
  rows.forEach(row => {
    const li = document.createElement('li');
    const parts: string[] = [];
    (subGroup.fields || []).forEach(field => {
      if (field.id === 'ITEM_FILTER') return;
      const raw = row[field.id];
      if (!raw) return;
      const label =
        (field as any)[`label${languageKey.toUpperCase()}`] ||
        field.labelEn ||
        field.id;
      parts.push(`${label}: ${raw}`);
    });
    li.textContent = parts.join(' • ');
    list.appendChild(li);
  });
  return list;
}
