import { LineItemGroupConfig, QuestionConfig } from '../../../types';
import type { DataSourceService } from '../dataSources';
import { formatTemplateValue, slugifyPlaceholder, resolveSubgroupKey } from './utils';

type SubGroupConfig = LineItemGroupConfig;

const resolveDataSourceDetails = (args: {
  field: any;
  raw: unknown;
  dataSources?: DataSourceService;
  language?: string;
}): Record<string, string> | null => {
  const { field, raw, dataSources, language } = args;
  if (!dataSources || !language) return null;
  if (!field || !(field as any).dataSource) return null;
  if (raw === undefined || raw === null || raw === '') return null;
  const value = raw.toString().trim();
  if (!value) return null;
  return dataSources.lookupDataSourceDetails(field as any, value, language);
};

/**
 * Resolve a line-item placeholder token to its raw (unformatted) value.
 * This is used by EXCLUDE_WHEN filters to avoid display-only formatting.
 */
export const resolveLineItemTokenValue = (args: {
  token: string;
  group: QuestionConfig;
  rowData: Record<string, any>;
  subGroup?: SubGroupConfig;
  subGroupToken?: string;
  dataSources?: DataSourceService;
  language?: string;
}): unknown => {
  const { token, group, rowData, subGroup, subGroupToken, dataSources, language } = args;
  if (!token) return '';
  const normalizedToken = token.toString().toUpperCase().replace(/\s+/g, '');
  const normalizedGroupId = (group.id || '').toString().toUpperCase();
  if (!normalizedGroupId) return '';

  const replacements: Record<string, unknown> = {};
  const parent = (rowData as any)?.__parent;
  const addDataSourceTokens = (field: any, raw: unknown, bases: string[]): void => {
    const details = resolveDataSourceDetails({ field, raw, dataSources, language });
    if (!details) return;
    Object.entries(details).forEach(([key, val]) => {
      const dsKey = (key || '').toString().trim().toUpperCase();
      if (!dsKey) return;
      bases.forEach(base => {
        replacements[`${base}.${dsKey}`] = val ?? '';
      });
    });
  };
  const resolveGroupValue = (fieldId: string): unknown => {
    if (!fieldId) return '';
    const hasParent = parent && Object.prototype.hasOwnProperty.call(parent || {}, fieldId);
    if (subGroup && hasParent) return (parent as any)[fieldId];
    if (Object.prototype.hasOwnProperty.call(rowData || {}, fieldId)) return (rowData as any)[fieldId];
    if (hasParent) return (parent as any)[fieldId];
    return '';
  };
  const resolveSubGroupValue = (fieldId: string): unknown => {
    if (!fieldId) return '';
    if (Object.prototype.hasOwnProperty.call(rowData || {}, fieldId)) return (rowData as any)[fieldId];
    if (parent && Object.prototype.hasOwnProperty.call(parent || {}, fieldId)) return (parent as any)[fieldId];
    return '';
  };
  const systemRowIndex = (rowData as any)?.__rowIndex ?? (parent as any)?.__rowIndex;
  const systemRowId = (rowData as any)?.__rowId ?? (rowData as any)?.id ?? (parent as any)?.__rowId ?? (parent as any)?.id;

  (group.lineItemConfig?.fields || []).forEach(field => {
    const raw = resolveGroupValue(field.id);
    const tokens = [
      `${normalizedGroupId}.${field.id.toUpperCase()}`,
      `${normalizedGroupId}.${slugifyPlaceholder(field.labelEn || field.id)}`
    ];
    tokens.forEach(t => {
      replacements[t] = raw;
    });
    addDataSourceTokens(field, raw, tokens);
  });

  // Consolidated table pseudo-fields (computed by the renderer, not part of the form schema).
  const countRaw = (rowData as any)?.__COUNT;
  replacements[`${normalizedGroupId}.__COUNT`] = countRaw ?? '';
  replacements[`${normalizedGroupId}.__ROWINDEX`] = systemRowIndex ?? '';
  replacements[`${normalizedGroupId}.__ROWID`] = systemRowId ?? '';

  if (subGroup) {
    const subKeyRaw = resolveSubgroupKey(subGroup);
    const subToken = subGroupToken || subKeyRaw;
    const normalizedSubKey = (subToken || '').toString().toUpperCase();
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__COUNT`] = countRaw ?? '';
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__ROWINDEX`] = systemRowIndex ?? '';
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__ROWID`] = systemRowId ?? '';
    (subGroup.fields || []).forEach((field: any) => {
      const raw = resolveSubGroupValue(field.id);
      const tokens = [
        `${normalizedGroupId}.${normalizedSubKey}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${normalizedSubKey}.${slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(t => {
        replacements[t] = raw;
      });
      addDataSourceTokens(field, raw, tokens);
    });
  }

  if (Object.prototype.hasOwnProperty.call(replacements, normalizedToken)) {
    return replacements[normalizedToken] ?? '';
  }

  const parts = token
    .toString()
    .trim()
    .split('.')
    .map((p: string) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return '';
  const groupToken = (parts[0] || '').toString().toUpperCase();
  if (groupToken !== normalizedGroupId) return '';
  if (parts.length === 2) {
    return resolveGroupValue(parts[1] || '');
  }
  if (!subGroup) return '';
  const subTokenRaw = parts.slice(1, -1).join('.');
  const subTokenUpper = subTokenRaw.toUpperCase();
  const subKeyRaw = subGroupToken || resolveSubgroupKey(subGroup);
  const slugSubKey = slugifyPlaceholder(subKeyRaw || '');
  const allowedSubTokens = new Set<string>();
  if (subGroupToken) allowedSubTokens.add((subGroupToken || '').toString().toUpperCase());
  if (subKeyRaw) allowedSubTokens.add(subKeyRaw.toString().toUpperCase());
  if (slugSubKey) allowedSubTokens.add(slugSubKey.toString().toUpperCase());
  if (!allowedSubTokens.has(subTokenUpper)) return '';
  return resolveSubGroupValue(parts[parts.length - 1] || '');
};

/**
 * Replace {{GROUP.FIELD}} / {{GROUP.SUBGROUP.FIELD}} placeholders inside a table cell template
 * for a specific line-item row (or subgroup row).
 *
 * When `collapsedOnly` is true, fields not included in ui.collapsedFields resolve to an empty string.
 */
export const replaceLineItemPlaceholders = (
  template: string,
  group: QuestionConfig,
  rowData: Record<string, any>,
  opts?: {
    subGroup?: SubGroupConfig;
    subGroupToken?: string;
    collapsedOnly?: boolean;
    dataSources?: DataSourceService;
    language?: string;
  }
): string => {
  if (!template) return '';
  const normalizedGroupId = group.id.toUpperCase();
  const collapseOnly = !!opts?.collapsedOnly;
  const groupUi: any = (group as any)?.lineItemConfig?.ui;
  const groupCollapsedOnly =
    collapseOnly &&
    groupUi?.mode === 'progressive' &&
    Array.isArray(groupUi?.collapsedFields) &&
    (groupUi?.collapsedFields || []).length > 0;
  const groupCollapsedFieldIds = new Set<string>(
    groupCollapsedOnly
      ? (groupUi?.collapsedFields || [])
          .map((c: any) => (c?.fieldId ?? '').toString().trim().toUpperCase())
          .filter(Boolean)
      : []
  );
  const replacements: Record<string, string> = {};
  const parent = (rowData as any)?.__parent;
  const addDataSourceTokens = (field: any, raw: unknown, bases: string[]): void => {
    const details = resolveDataSourceDetails({
      field,
      raw,
      dataSources: opts?.dataSources,
      language: opts?.language
    });
    if (!details) return;
    Object.entries(details).forEach(([key, val]) => {
      const dsKey = (key || '').toString().trim().toUpperCase();
      if (!dsKey) return;
      const text = formatTemplateValue(val);
      bases.forEach(base => {
        replacements[`${base}.${dsKey}`] = text;
      });
    });
  };
  const resolveGroupValue = (fieldId: string): any => {
    if (!fieldId) return '';
    const hasParent = parent && Object.prototype.hasOwnProperty.call(parent || {}, fieldId);
    if (opts?.subGroup && hasParent) return (parent as any)[fieldId];
    if (Object.prototype.hasOwnProperty.call(rowData || {}, fieldId)) return (rowData as any)[fieldId];
    if (hasParent) return (parent as any)[fieldId];
    return '';
  };
  const resolveSubGroupValue = (fieldId: string): any => {
    if (!fieldId) return '';
    if (Object.prototype.hasOwnProperty.call(rowData || {}, fieldId)) return (rowData as any)[fieldId];
    if (parent && Object.prototype.hasOwnProperty.call(parent || {}, fieldId)) return (parent as any)[fieldId];
    return '';
  };
  const systemRowIndex = (rowData as any)?.__rowIndex ?? (parent as any)?.__rowIndex;
  const systemRowId = (rowData as any)?.__rowId ?? (rowData as any)?.id ?? (parent as any)?.__rowId ?? (parent as any)?.id;
  (group.lineItemConfig?.fields || []).forEach(field => {
    const include = !groupCollapsedOnly || groupCollapsedFieldIds.has((field.id || '').toString().trim().toUpperCase());
    const raw = include ? resolveGroupValue(field.id) : '';
    const text = include ? formatTemplateValue(raw, (field as any).type) : '';
    const tokens = [
      `${normalizedGroupId}.${field.id.toUpperCase()}`,
      `${normalizedGroupId}.${slugifyPlaceholder(field.labelEn || field.id)}`
    ];
    tokens.forEach(token => {
      replacements[token] = text;
    });
    if (include) {
      addDataSourceTokens(field, raw, tokens);
    }
  });

  // Consolidated table pseudo-fields (computed by the renderer, not part of the form schema).
  // - {{GROUP.__COUNT}} or {{GROUP.SUBGROUP.__COUNT}}: number of source rows that were consolidated into this row.
  const countRaw = (rowData as any)?.__COUNT;
  const countText = countRaw === undefined || countRaw === null ? '' : countRaw.toString();
  replacements[`${normalizedGroupId}.__COUNT`] = countText;
  replacements[`${normalizedGroupId}.__ROWINDEX`] =
    systemRowIndex === undefined || systemRowIndex === null ? '' : systemRowIndex.toString();
  replacements[`${normalizedGroupId}.__ROWID`] =
    systemRowId === undefined || systemRowId === null ? '' : systemRowId.toString();

  if (opts?.subGroup) {
    const subKeyRaw = resolveSubgroupKey(opts.subGroup);
    const subToken = opts.subGroupToken || subKeyRaw;
    const normalizedSubKey = (subToken || '').toString().toUpperCase();
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__COUNT`] = countText;
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__ROWINDEX`] =
      systemRowIndex === undefined || systemRowIndex === null ? '' : systemRowIndex.toString();
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__ROWID`] =
      systemRowId === undefined || systemRowId === null ? '' : systemRowId.toString();
    const subUi: any = (opts.subGroup as any)?.ui;
    const subCollapsedOnly =
      collapseOnly &&
      subUi?.mode === 'progressive' &&
      Array.isArray(subUi?.collapsedFields) &&
      (subUi?.collapsedFields || []).length > 0;
    const subCollapsedFieldIds = new Set<string>(
      subCollapsedOnly
        ? (subUi?.collapsedFields || [])
            .map((c: any) => (c?.fieldId ?? '').toString().trim().toUpperCase())
            .filter(Boolean)
        : []
    );
    (opts.subGroup.fields || []).forEach((field: any) => {
      const include = !subCollapsedOnly || subCollapsedFieldIds.has((field.id || '').toString().trim().toUpperCase());
      const raw = include ? resolveSubGroupValue(field.id) : '';
      const text = include ? formatTemplateValue(raw, (field as any).type) : '';
      const tokens = [
        `${normalizedGroupId}.${normalizedSubKey}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${normalizedSubKey}.${slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(token => {
        replacements[token] = text;
      });
      if (include) {
        addDataSourceTokens(field, raw, tokens);
      }
    });
  }

  const replaced = template.replace(
    // Allow incidental spaces inside {{ ... }} and around "." to tolerate Markdown/text templates.
    /{{\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+(?:\s*\.\s*[A-Z0-9_]+)*)\s*}}/gi,
    (_match, groupId, rest) => {
      if (groupId.toUpperCase() !== normalizedGroupId) return '';
      const parts = (rest || '')
        .toString()
        .split('.')
        .map((p: string) => p.trim())
        .filter(Boolean);
      if (!parts.length) return '';
      const fieldKey = parts[parts.length - 1].toUpperCase();
      const subPath = parts.length > 1 ? parts.slice(0, -1).map((p: string) => p.toUpperCase()).join('.') : '';
      const token = subPath ? `${normalizedGroupId}.${subPath}.${fieldKey}` : `${normalizedGroupId}.${fieldKey}`;
      return replacements[token] ?? '';
    }
  );

  // ALWAYS_SHOW wrapper:
  // - Outputs the underlying value like the normal placeholder replacement.
  // - Used by the PDF renderer to keep specific rows visible even when a progressive row is disabled.
  const withAlwaysShow = replaced.replace(
    /{{ALWAYS_SHOW\(\s*([\s\S]*?)\s*\)}}/gi,
    (_m, innerRaw: string) => {
      const inner = (innerRaw || '').toString().trim();
      if (!inner) return '';

      // Allow ALWAYS_SHOW(CONSOLIDATED_ROW(...)) by unwrapping to the underlying token
      // and letting the existing CONSOLIDATED_ROW replacement handle it.
      const consolidatedMatch = inner.match(/^CONSOLIDATED_ROW\(\s*([A-Z0-9_]+(?:\.[A-Z0-9_]+)+)\s*\)$/i);
      if (consolidatedMatch) {
        return `{{CONSOLIDATED_ROW(${consolidatedMatch[1]})}}`;
      }

      const parts = inner.split('.').map((p: string) => p.trim()).filter(Boolean);
      if (parts.length < 2) return '';
      const gid = (parts[0] || '').toString().toUpperCase();
      if (gid !== normalizedGroupId) return '';
      if (parts.length === 2) {
        const field = (parts[1] || '').toString().toUpperCase();
        return replacements[`${normalizedGroupId}.${field}`] ?? '';
      }
      if (parts.length >= 3) {
        const sub = parts.slice(1, -1).map((p: string) => p.toString().toUpperCase()).join('.');
        const field = (parts[parts.length - 1] || '').toString().toUpperCase();
        return replacements[`${normalizedGroupId}.${sub}.${field}`] ?? '';
      }
      return '';
    }
  );

  // Row-scoped consolidated values for nested subgroups (useful inside ROW_TABLE blocks).
  // Example: {{CONSOLIDATED_ROW(MP_DISHES.INGREDIENTS.ALLERGEN)}}
  return withAlwaysShow.replace(
    /{{\s*CONSOLIDATED_ROW\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+(?:\s*\.\s*[A-Z0-9_]+)*)\s*\)\s*}}/gi,
    (_m, groupIdRaw: string, restRaw: string) => {
      const groupId = (groupIdRaw || '').toString().toUpperCase();
      if (groupId !== normalizedGroupId) return '';
      const parts = (restRaw || '')
        .toString()
        .split('.')
        .map((p: string) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) return '';
      const subToken = parts.slice(0, -1).map((p: string) => p.toUpperCase()).join('.');
      const fieldToken = (parts[parts.length - 1] || '').toString().toUpperCase();
      if (!subToken || !fieldToken) return '';

      const parentRow = (rowData as any)?.__parent || rowData || {};
      const resolveSubConfigByPath = (path: string[]): SubGroupConfig | undefined => {
        let current: any = group.lineItemConfig;
        for (let i = 0; i < path.length; i += 1) {
          const subId = path[i];
          const subs = (current?.subGroups || []) as any[];
          const match = subs.find(s => resolveSubgroupKey(s as SubGroupConfig).toUpperCase() === subId);
          if (!match) return undefined;
          if (i === path.length - 1) return match as SubGroupConfig;
          current = match;
        }
        return undefined;
      };

      const subPath = parts.slice(0, -1).map((p: string) => p.toUpperCase());
      const subConfig = resolveSubConfigByPath(subPath);
      if (!subConfig) return '';

      const collectChildren = (startRows: any[], path: string[]): any[] => {
        let currentRows = startRows;
        for (let i = 0; i < path.length; i += 1) {
          const subId = path[i];
          const next: any[] = [];
          currentRows.forEach(row => {
            const children = Array.isArray((row as any)[subId]) ? (row as any)[subId] : [];
            children.forEach((child: any) => next.push(child || {}));
          });
          currentRows = next;
        }
        return currentRows;
      };

      const children = collectChildren([parentRow], subPath);
      if (!children.length) return 'None';

      const fields = (subConfig as any).fields || [];
      const fieldCfg = fields.find((f: any) => {
        const id = (f?.id || '').toString().toUpperCase();
        const slug = slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
        return id === fieldToken || slug === fieldToken;
      });
      if (!fieldCfg) return '';

      const seen = new Set<string>();
      const ordered: string[] = [];
      children.forEach((child: any) => {
        const raw = child?.[fieldCfg.id];
        if (raw === undefined || raw === null || raw === '') return;
        const text = formatTemplateValue(raw, (fieldCfg as any).type).trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        ordered.push(text);
      });
      return ordered.join(', ') || 'None';
    }
  );
};
