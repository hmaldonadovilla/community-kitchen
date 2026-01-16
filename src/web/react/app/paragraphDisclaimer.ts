import { resolveLocalizedString } from '../../i18n';
import { FieldValue, LangCode, LocalizedString, WebFormDefinition } from '../../types';
import { LineItemState, OptionState } from '../types';
import { formatDisplayText, EMPTY_DISPLAY } from '../utils/valueDisplay';
import { optionKey, toOptionSet } from '../../core';
import { tSystem } from '../../systemStrings';
import {
  ROW_NON_MATCH_OPTIONS_KEY,
  buildSubgroupKey,
  parseRowNonMatchOptions,
  resolveSubgroupKey
} from './lineItems';

export const DEFAULT_PARAGRAPH_DISCLAIMER_SEPARATOR = '---';

type ItemMap = Map<string, Set<string>>;

const normalizeSeparator = (raw?: string): string => {
  const s = raw !== undefined && raw !== null ? raw.toString().trim() : '';
  return s || DEFAULT_PARAGRAPH_DISCLAIMER_SEPARATOR;
};

const formatTemplate = (value: string, vars?: Record<string, string>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => (vars[key] !== undefined ? vars[key] : ''));
};

const resolveLocalizedText = (raw: LocalizedString | string | undefined, language: LangCode, fallback: string): string => {
  if (!raw) return fallback;
  return resolveLocalizedString(raw as any, language, fallback).toString();
};

const resolveItemLabel = (args: {
  field: any;
  rawValue: FieldValue;
  language: LangCode;
  optionState: OptionState;
  groupKey: string;
}): string => {
  const { field, rawValue, language, optionState, groupKey } = args;
  if (!field) return '';
  const optionSet =
    optionState?.[optionKey(field.id, groupKey)] ||
    (field?.options || field?.optionsFr || field?.optionsNl ? toOptionSet(field) : undefined);
  const display = formatDisplayText(rawValue, { language, optionSet, fieldType: field?.type });
  return display === EMPTY_DISPLAY ? '' : display;
};

export const buildParagraphDisclaimerSection = (args: {
  config: any;
  definition: WebFormDefinition;
  lineItems: LineItemState;
  optionState: OptionState;
  language: LangCode;
}): { sectionText: string; separator: string; keyCount: number; itemCount: number } => {
  const { config, definition, lineItems, optionState, language } = args;
  const sourceGroupId = config?.sourceGroupId !== undefined && config?.sourceGroupId !== null ? config.sourceGroupId.toString() : '';
  if (!sourceGroupId) return { sectionText: '', separator: normalizeSeparator(config?.separator), keyCount: 0, itemCount: 0 };

  const group = (definition.questions || []).find(q => q && q.type === 'LINE_ITEM_GROUP' && q.id === sourceGroupId) as any;
  if (!group || !group.lineItemConfig) {
    return { sectionText: '', separator: normalizeSeparator(config?.separator), keyCount: 0, itemCount: 0 };
  }

  const separator = normalizeSeparator(config?.separator);
  const itemMap: ItemMap = new Map();

  const addItem = (key: string, item: string) => {
    const k = (key || '').toString().trim();
    const v = (item || '').toString().trim();
    if (!k || !v) return;
    if (!itemMap.has(k)) itemMap.set(k, new Set());
    itemMap.get(k)!.add(v);
  };

  const sourceSubGroupId =
    config?.sourceSubGroupId !== undefined && config?.sourceSubGroupId !== null ? config.sourceSubGroupId.toString() : '';
  const baseFields = group.lineItemConfig?.fields || [];
  const baseAnchor =
    group.lineItemConfig?.anchorFieldId !== undefined && group.lineItemConfig?.anchorFieldId !== null
      ? group.lineItemConfig.anchorFieldId.toString()
      : '';

  const resolveFallbackItemFieldId = (fields: any[], anchorFieldId?: string): string => {
    const anchor = anchorFieldId ? anchorFieldId.toString() : '';
    if (anchor) return anchor;
    const first = (fields[0]?.id ?? '').toString();
    return first;
  };

  const scanRows = (rows: any[], fields: any[], groupKey: string, fallbackItemFieldId: string) => {
    const itemFieldId =
      config?.itemFieldId !== undefined && config?.itemFieldId !== null
        ? config.itemFieldId.toString()
        : fallbackItemFieldId;
    const itemField = fields.find((f: any) => (f?.id ?? '').toString() === itemFieldId);
    rows.forEach(row => {
      const rowValues = row?.values || {};
      const nonMatch = parseRowNonMatchOptions((rowValues as any)[ROW_NON_MATCH_OPTIONS_KEY]);
      if (!nonMatch.length) return;
      const label = resolveItemLabel({
        field: itemField,
        rawValue: (rowValues as any)[itemFieldId],
        language,
        optionState,
        groupKey
      });
      if (!label) return;
      nonMatch.forEach(key => addItem(key, label));
    });
  };

  if (!sourceSubGroupId) {
    scanRows(lineItems[sourceGroupId] || [], baseFields, sourceGroupId, resolveFallbackItemFieldId(baseFields, baseAnchor));
  } else {
    const subConfig = (group.lineItemConfig?.subGroups || []).find((sub: any) => resolveSubgroupKey(sub as any) === sourceSubGroupId);
    if (subConfig) {
      const subFields = (subConfig as any)?.fields || [];
      const subAnchor =
        (subConfig as any)?.anchorFieldId !== undefined && (subConfig as any)?.anchorFieldId !== null
          ? (subConfig as any).anchorFieldId.toString()
          : '';
      const fallbackItemFieldId = resolveFallbackItemFieldId(subFields, subAnchor);
      const parents = lineItems[sourceGroupId] || [];
      parents.forEach(parentRow => {
        const subKey = buildSubgroupKey(sourceGroupId, parentRow.id, sourceSubGroupId);
        scanRows(lineItems[subKey] || [], subFields, subKey, fallbackItemFieldId);
      });
    }
  }

  const extraMessage = resolveLocalizedText(config?.message, language, '').trim();
  if (!itemMap.size && !extraMessage) {
    return { sectionText: '', separator, keyCount: 0, itemCount: 0 };
  }

  const defaultTitle = tSystem('paragraphDisclaimer.title', language, 'Pay attention to:');
  const defaultListMessage = tSystem('paragraphDisclaimer.listMessage', language, 'For {key}, do not use: {items}.');
  const title = resolveLocalizedText(config?.title, language, defaultTitle).trim();
  const listTemplate = resolveLocalizedText(config?.listMessage, language, defaultListMessage).trim();

  const lines: string[] = [];
  if (title) lines.push(title);
  itemMap.forEach((items, key) => {
    const list = Array.from(items);
    const msg = formatTemplate(listTemplate, {
      key,
      value: key,
      items: list.join(', '),
      keys: list.join(', ')
    }).trim();
    lines.push(`- ${msg}`);
  });
  if (extraMessage) lines.push(`- ${extraMessage}`);

  const itemCount = Array.from(itemMap.values()).reduce((acc, set) => acc + set.size, 0);
  return {
    sectionText: lines.join('\n').trim(),
    separator,
    keyCount: itemMap.size,
    itemCount
  };
};

export const splitParagraphDisclaimerValue = (args: { rawValue: FieldValue; separator: string }): { userText: string; hasDisclaimer: boolean } => {
  const { rawValue, separator } = args;
  const raw = rawValue === undefined || rawValue === null ? '' : rawValue.toString();
  const marker = `\n\n${normalizeSeparator(separator)}\n`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    return { userText: raw.slice(0, idx), hasDisclaimer: true };
  }
  return { userText: raw, hasDisclaimer: false };
};

export const buildParagraphDisclaimerValue = (args: {
  userText: string;
  sectionText: string;
  separator: string;
}): string => {
  const { userText, sectionText, separator } = args;
  const base = (userText || '').toString().replace(/\s+$/, '');
  if (!sectionText) return base;
  const marker = `\n\n${normalizeSeparator(separator)}\n`;
  return `${base}${marker}${sectionText}`;
};
