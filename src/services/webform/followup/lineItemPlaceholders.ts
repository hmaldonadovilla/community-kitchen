import { LineItemGroupConfig, QuestionConfig } from '../../../types';
import { formatTemplateValue, slugifyPlaceholder, resolveSubgroupKey } from './utils';

type SubGroupConfig = LineItemGroupConfig;

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
}): unknown => {
  const { token, group, rowData, subGroup, subGroupToken } = args;
  if (!token) return '';
  const normalizedToken = token.toString().toUpperCase().replace(/\s+/g, '');
  const normalizedGroupId = (group.id || '').toString().toUpperCase();
  if (!normalizedGroupId) return '';

  const replacements: Record<string, unknown> = {};
  const parent = (rowData as any)?.__parent;
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

  (group.lineItemConfig?.fields || []).forEach(field => {
    const raw = resolveGroupValue(field.id);
    const tokens = [
      `${normalizedGroupId}.${field.id.toUpperCase()}`,
      `${normalizedGroupId}.${slugifyPlaceholder(field.labelEn || field.id)}`
    ];
    tokens.forEach(t => {
      replacements[t] = raw;
    });
  });

  // Consolidated table pseudo-fields (computed by the renderer, not part of the form schema).
  const countRaw = (rowData as any)?.__COUNT;
  replacements[`${normalizedGroupId}.__COUNT`] = countRaw ?? '';

  if (subGroup) {
    const subKeyRaw = resolveSubgroupKey(subGroup);
    const subToken = subGroupToken || slugifyPlaceholder(subKeyRaw);
    const normalizedSubKey = (subToken || '').toString().toUpperCase();
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__COUNT`] = countRaw ?? '';
    (subGroup.fields || []).forEach((field: any) => {
      const raw = resolveSubGroupValue(field.id);
      const tokens = [
        `${normalizedGroupId}.${normalizedSubKey}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${normalizedSubKey}.${slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(t => {
        replacements[t] = raw;
      });
    });
  }

  if (Object.prototype.hasOwnProperty.call(replacements, normalizedToken)) {
    return replacements[normalizedToken] ?? '';
  }

  const parts = token
    .toString()
    .trim()
    .split('.')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return '';
  const groupToken = (parts[0] || '').toString().toUpperCase();
  if (groupToken !== normalizedGroupId) return '';
  if (parts.length === 2) {
    return resolveGroupValue(parts[1] || '');
  }
  if (!subGroup) return '';
  const subTokenRaw = (parts[1] || '').toString();
  const subTokenUpper = subTokenRaw.toUpperCase();
  const subKeyRaw = resolveSubgroupKey(subGroup);
  const slugSubKey = slugifyPlaceholder(subKeyRaw || '');
  const allowedSubTokens = new Set<string>();
  if (subGroupToken) allowedSubTokens.add((subGroupToken || '').toString().toUpperCase());
  if (subKeyRaw) allowedSubTokens.add(subKeyRaw.toString().toUpperCase());
  if (slugSubKey) allowedSubTokens.add(slugSubKey.toString().toUpperCase());
  if (!allowedSubTokens.has(subTokenUpper)) return '';
  return resolveSubGroupValue(parts[2] || '');
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
  opts?: { subGroup?: SubGroupConfig; subGroupToken?: string; collapsedOnly?: boolean }
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
  });

  // Consolidated table pseudo-fields (computed by the renderer, not part of the form schema).
  // - {{GROUP.__COUNT}} or {{GROUP.SUBGROUP.__COUNT}}: number of source rows that were consolidated into this row.
  const countRaw = (rowData as any)?.__COUNT;
  const countText = countRaw === undefined || countRaw === null ? '' : countRaw.toString();
  replacements[`${normalizedGroupId}.__COUNT`] = countText;

  if (opts?.subGroup) {
    const subKeyRaw = resolveSubgroupKey(opts.subGroup);
    const subToken = opts.subGroupToken || slugifyPlaceholder(subKeyRaw);
    const normalizedSubKey = subToken.toUpperCase();
    replacements[`${normalizedGroupId}.${normalizedSubKey}.__COUNT`] = countText;
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
    });
  }

  const replaced = template.replace(
    // Allow incidental spaces inside {{ ... }} and around "." to tolerate Markdown/text templates.
    /{{\s*([A-Z0-9_]+)\s*(?:\.\s*([A-Z0-9_]+)\s*)?\.\s*([A-Z0-9_]+)\s*}}/gi,
    (_, groupId, maybeSub, fieldKey) => {
      if (groupId.toUpperCase() !== normalizedGroupId) return '';
      const token = maybeSub
        ? `${normalizedGroupId}.${maybeSub.toUpperCase()}.${fieldKey.toUpperCase()}`
        : `${normalizedGroupId}.${fieldKey.toUpperCase()}`;
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
      const consolidatedMatch = inner.match(/^CONSOLIDATED_ROW\(\s*([A-Z0-9_]+\.[A-Z0-9_]+\.[A-Z0-9_]+)\s*\)$/i);
      if (consolidatedMatch) {
        return `{{CONSOLIDATED_ROW(${consolidatedMatch[1]})}}`;
      }

      const parts = inner.split('.').map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) return '';
      const gid = (parts[0] || '').toString().toUpperCase();
      if (gid !== normalizedGroupId) return '';
      if (parts.length === 2) {
        const field = (parts[1] || '').toString().toUpperCase();
        return replacements[`${normalizedGroupId}.${field}`] ?? '';
      }
      if (parts.length === 3) {
        const sub = (parts[1] || '').toString().toUpperCase();
        const field = (parts[2] || '').toString().toUpperCase();
        return replacements[`${normalizedGroupId}.${sub}.${field}`] ?? '';
      }
      return '';
    }
  );

  // Row-scoped consolidated values for nested subgroups (useful inside ROW_TABLE blocks).
  // Example: {{CONSOLIDATED_ROW(MP_DISHES.INGREDIENTS.ALLERGEN)}}
  return withAlwaysShow.replace(
    /{{\s*CONSOLIDATED_ROW\(\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+)\s*\.\s*([A-Z0-9_]+)\s*\)\s*}}/gi,
    (_m, groupIdRaw: string, subGroupIdRaw: string, fieldIdRaw: string) => {
      const groupId = (groupIdRaw || '').toString().toUpperCase();
      if (groupId !== normalizedGroupId) return '';
      const subToken = (subGroupIdRaw || '').toString().toUpperCase();
      const fieldToken = (fieldIdRaw || '').toString().toUpperCase();
      if (!subToken || !fieldToken) return '';

      const parentRow = (rowData as any)?.__parent || rowData || {};
      const subGroups = group.lineItemConfig?.subGroups || [];
      const subConfig = subGroups.find(sub => {
        const key = resolveSubgroupKey(sub as SubGroupConfig);
        const normalizedKey = (key || '').toUpperCase();
        const slugKey = slugifyPlaceholder(key || '');
        return normalizedKey === subToken || slugKey === subToken;
      });
      if (!subConfig) return '';
      const subKey = resolveSubgroupKey(subConfig as SubGroupConfig);
      if (!subKey) return '';

      const children = Array.isArray((parentRow as any)[subKey]) ? (parentRow as any)[subKey] : [];
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


