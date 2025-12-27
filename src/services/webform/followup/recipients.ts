import { EmailRecipientDataSourceConfig, EmailRecipientEntry, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import { matchesWhen } from '../../../web/rules/visibility';

/**
 * Recipient + template selection helpers for follow-up emails/PDFs.
 *
 * Responsibility:
 * - Resolve template IDs from TemplateIdMap (language map or field-driven cases)
 * - Resolve recipients from static strings and dataSource lookups
 */

export const resolveLocalizedStringValue = (value: any, language?: string): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const langKey = (language || 'EN').toLowerCase();
  return (value as any)[langKey] || (value as any).en || (value as any).EN || '';
};

export const resolveTemplateId = (template: TemplateIdMap | undefined, record: WebFormSubmission): string | undefined => {
  if (!template) return undefined;

  const resolveBase = (t: any): any => {
    if (!t) return undefined;
    if (typeof t === 'string') {
      const trimmed = t.trim();
      return trimmed || undefined;
    }
    if (typeof t !== 'object') return undefined;

    // Selector config: choose a template based on record field values.
    if (Array.isArray((t as any).cases)) {
      const cases = (t as any).cases as any[];
      for (const c of cases) {
        const when = c?.when;
        const candidate = c?.templateId;
        const fieldId = when?.fieldId ? when.fieldId.toString() : '';
        if (!fieldId) continue;
        const value = (record.values as any)?.[fieldId];
        try {
          if (matchesWhen(value, when)) {
            debugLog('followup.template.caseMatched', {
              fieldId,
              value: value === undefined || value === null ? '' : value.toString?.() || value,
              language: record.language || ''
            });
            return resolveBase(candidate);
          }
        } catch (err) {
          debugLog('followup.template.caseError', { error: err ? err.toString() : 'unknown', fieldId });
        }
      }
      if ((t as any).default !== undefined) return resolveBase((t as any).default);
      return undefined;
    }

    // Language map object: { EN: "...", FR: "..." } or { en: "...", fr: "..." }.
    return t;
  };

  const base = resolveBase(template);
  if (!base) return undefined;
  if (typeof base === 'string') return base.trim() || undefined;

  const language = (record.language || 'EN').toString();
  const langKey = (language || 'EN').toUpperCase();
  if ((base as any)[langKey]) return (base as any)[langKey];
  const lower = (language || 'en').toLowerCase();
  if ((base as any)[lower]) return (base as any)[lower];
  if ((base as any).EN) return (base as any).EN;
  const firstKey = Object.keys(base)[0];
  return firstKey ? (base as any)[firstKey] : undefined;
};

export const lookupRecipientFromDataSource = (
  dataSources: DataSourceService,
  entry: EmailRecipientDataSourceConfig,
  lookupValue: any,
  language: string
): string | undefined => {
  if (!lookupValue) return undefined;
  try {
    const projection = entry.dataSource?.projection || [entry.lookupField, entry.valueField];
    const limit = entry.dataSource?.limit || 200;
    const response = dataSources.fetchDataSource(entry.dataSource as any, language, projection, limit);
    const items = Array.isArray((response as any).items) ? (response as any).items : [];
    const normalizedLookup = lookupValue.toString().trim().toLowerCase();
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const matchValue = (item as any)[entry.lookupField];
      if (matchValue === undefined || matchValue === null) continue;
      const normalizedMatch = matchValue.toString().trim().toLowerCase();
      if (normalizedMatch === normalizedLookup) {
        const emailValue = (item as any)[entry.valueField];
        if (emailValue && emailValue.toString().trim()) {
          return emailValue.toString().trim();
        }
      }
    }
  } catch (err) {
    debugLog('followup.recipient.lookup.failed', {
      error: err ? err.toString() : 'lookup error',
      dataSource: entry.dataSource?.id || (entry as any).dataSource
    });
  }
  return undefined;
};

export const resolveRecipients = (
  dataSources: DataSourceService,
  entries: EmailRecipientEntry[] | undefined,
  placeholders: Record<string, string>,
  record: WebFormSubmission
): string[] => {
  if (!entries || !entries.length) return [];
  const resolved: string[] = [];
  entries.forEach(entry => {
    if (typeof entry === 'string') {
      const address = (entry || '').toString();
      const expanded = address.replace(/{{[^}]+}}/g, t => placeholders[t] ?? t).trim();
      if (expanded) resolved.push(expanded);
      return;
    }
    if (entry && (entry as any).type === 'dataSource') {
      const cfg = entry as EmailRecipientDataSourceConfig;
      const lookupValue = (record.values && (record.values as any)[cfg.recordFieldId]) || '';
      const address = lookupRecipientFromDataSource(dataSources, cfg, lookupValue, record.language);
      if (address) {
        resolved.push(address);
      } else if (cfg.fallbackEmail) {
        resolved.push(cfg.fallbackEmail);
      }
    }
  });
  return resolved.filter(Boolean);
};


