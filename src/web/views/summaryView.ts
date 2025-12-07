import { WebFormDefinition, LineItemFieldConfig } from '../../types';
import { LangCode } from '../types';
import { resolveLocalizedString } from '../i18n';

function createTooltipIcon(text: string, label?: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-flex';
  wrapper.style.marginLeft = '6px';
  wrapper.style.color = '#2563eb';
  wrapper.style.fontWeight = '700';
  wrapper.style.cursor = 'pointer';

  const icon = document.createElement('button');
  icon.type = 'button';
  icon.textContent = label || 'ℹ';
  icon.setAttribute('aria-label', label ? `Show ${label}` : 'Show details');
  icon.style.background = 'transparent';
  icon.style.border = 'none';
  icon.style.padding = '0';
  icon.style.lineHeight = '1';
  icon.style.color = 'inherit';
  icon.style.cursor = 'pointer';
  icon.style.textDecoration = 'underline';
  icon.style.textAlign = 'left';
  icon.style.display = 'inline-flex';

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'tooltip');
  overlay.style.position = 'absolute';
  overlay.style.zIndex = '30';
  overlay.style.top = '100%';
  overlay.style.left = '0';
  overlay.style.marginTop = '8px';
  overlay.style.background = '#ffffff';
  overlay.style.color = '#111827';
  overlay.style.border = '1px solid #e5e7eb';
  overlay.style.borderRadius = '12px';
  overlay.style.boxShadow = '0 16px 40px rgba(15,23,42,0.16)';
  overlay.style.padding = '18px';
  overlay.style.maxWidth = '90vw';
  overlay.style.minWidth = '70vw';
  overlay.style.maxHeight = '80vh';
  overlay.style.overflowY = 'auto';
  overlay.style.fontSize = '15px';
  overlay.style.lineHeight = '1.7';
  overlay.style.whiteSpace = 'pre-wrap';
  overlay.style.display = 'none';
  overlay.style.textAlign = 'left';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'flex-start';
  header.style.gap = '10px';

  const titleSpan = document.createElement('span');
  titleSpan.style.fontWeight = '700';
  titleSpan.style.color = '#0f172a';
  titleSpan.textContent = label || 'Details';
  header.appendChild(titleSpan);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.ariaLabel = 'Close';
  closeButton.textContent = '×';
  closeButton.style.border = 'none';
  closeButton.style.background = 'transparent';
  closeButton.style.fontSize = '16px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.padding = '2px';
  closeButton.style.lineHeight = '1';
  closeButton.style.color = '#475569';
  header.appendChild(closeButton);

  const content = document.createElement('div');
  content.style.marginTop = '10px';
  content.style.color = '#1f2937';
  content.textContent = text;

  overlay.appendChild(header);
  overlay.appendChild(content);

  let pinned = false;
  const show = () => {
    overlay.style.display = 'block';
  };
  const hide = () => {
    if (!pinned) overlay.style.display = 'none';
  };

  icon.addEventListener('mouseenter', show);
  icon.addEventListener('mouseleave', hide);
  icon.addEventListener('focus', show);
  icon.addEventListener('blur', hide);
  icon.addEventListener('click', e => {
    e.stopPropagation();
    pinned = !pinned;
    if (pinned) overlay.style.display = 'block';
    else overlay.style.display = 'none';
  });
  closeButton.addEventListener('click', () => {
    pinned = false;
    overlay.style.display = 'none';
  });

  wrapper.appendChild(icon);
  wrapper.appendChild(overlay);
  return wrapper;
}

function resolveTooltipForValue(
  question: SummaryViewOptions['definition']['questions'][number],
  rawValue: any
): string | undefined {
  const tooltips = (question as any)?.options?.tooltips;
  if (!tooltips) return undefined;
  if (Array.isArray(rawValue)) {
    for (const val of rawValue) {
      if (tooltips[val]) return tooltips[val];
    }
    return undefined;
  }
  return tooltips[rawValue];
}

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
    block.style.padding = '10px 0';
    const label = document.createElement('div');
    label.style.fontWeight = '800';
    label.style.fontSize = '18px';
    label.textContent = q.label[langKey as keyof typeof q.label] || q.label.en || q.id;
    const value = document.createElement('div');
    value.style.fontSize = '18px';
    value.style.lineHeight = '1.6';
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
      const textValue = Array.isArray(val) ? val.join(', ') : ((val as string) || '');
      const tooltipText = resolveTooltipForValue(q, val);
      if (tooltipText) {
        const row = document.createElement('div');
        row.style.display = 'inline-flex';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';
        const span = document.createElement('span');
        span.textContent = textValue;
        row.appendChild(span);
        const tooltipLabel = resolveLocalizedString(
          (q as any).dataSource?.tooltipLabel,
          language,
          q.label[langKey as keyof typeof q.label] || q.label.en || q.id
        );
        row.appendChild(createTooltipIcon(tooltipText, tooltipLabel));
        value.appendChild(row);
      } else {
        value.textContent = textValue;
      }
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

type SubGroupConfig = NonNullable<
  NonNullable<SummaryViewOptions['definition']['questions'][number]['lineItemConfig']>['subGroups']
>[number];

function renderSubLineItemList(rows: Record<string, any>[], subGroup: SubGroupConfig, languageKey: string): HTMLElement {
  const list = document.createElement('ul');
  list.style.margin = '2px 0 0 12px';
  list.style.padding = '0 0 0 12px';
  rows.forEach(row => {
    const li = document.createElement('li');
    const parts: string[] = [];
    const fields: LineItemFieldConfig[] = (subGroup?.fields as LineItemFieldConfig[]) || [];
    fields.forEach((field: LineItemFieldConfig) => {
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
