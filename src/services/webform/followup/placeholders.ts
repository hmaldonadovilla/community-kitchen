import { QuestionConfig, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { addPlaceholderVariants, formatTemplateValue, slugifyPlaceholder, resolveSubgroupKey } from './utils';

/**
 * Placeholder + consolidated placeholder generation for follow-up templates (Doc/PDF/Email).
 *
 * Responsibility:
 * - Build {{FIELD}} replacement map
 * - Collect LINE_ITEM_GROUP / subgroup row arrays
 * - Populate {{CONSOLIDATED(...)}} / {{COUNT(...)}} / {{SUM(...)}} tokens
 */

export const collectLineItemRows = (record: WebFormSubmission, questions: QuestionConfig[]): Record<string, any[]> => {
  const map: Record<string, any[]> = {};
  const normalizeRows = (raw: any): any[] => {
    if (Array.isArray(raw)) {
      return raw.map((row, idx) => {
        const base = row && typeof row === 'object' ? row : {};
        const rowId = (base as any)?.id;
        return {
          ...(base || {}),
          __rowIndex: idx,
          __rowId: rowId ?? ''
        };
      });
    }
    return [];
  };
  questions.forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const value = record.values ? (record.values as any)[q.id] : undefined;
    const normalized = normalizeRows(value);
    map[q.id] = normalized;

    const walkSubGroups = (parentRows: any[], subs: any[], path: string[]) => {
      (subs || []).forEach(sub => {
        const subKey = resolveSubgroupKey(sub as any);
        if (!subKey) return;
        const nextPath = [...path, subKey];
        const collected: any[] = [];
        parentRows.forEach(parentRow => {
          const children = normalizeRows((parentRow as any)[subKey]);
          children.forEach((child: any) => {
            collected.push({
              ...(child || {}),
              __parent: parentRow
            });
          });
        });
        map[`${q.id}.${nextPath.join('.')}`] = collected;
        const deeper = (sub as any)?.subGroups || [];
        if (deeper.length) {
          walkSubGroups(collected, deeper, nextPath);
        }
      });
    };

    if (normalized.length) {
      walkSubGroups(normalized, q.lineItemConfig?.subGroups || [], []);
    }
  });
  return map;
};

export const buildPlaceholderMap = (args: {
  record: WebFormSubmission;
  questions: QuestionConfig[];
  lineItemRows: Record<string, any[]>;
  dataSources: DataSourceService;
  formatValue?: (value: any, fieldType?: string) => string;
}): Record<string, string> => {
  const { record, questions, lineItemRows, dataSources, formatValue } = args;
  const fmt = formatValue || formatTemplateValue;
  const map: Record<string, string> = {};
  addPlaceholderVariants(map, 'RECORD_ID', record.id || '', undefined, formatValue);
  addPlaceholderVariants(map, 'FORM_KEY', record.formKey || '', undefined, formatValue);
  addPlaceholderVariants(map, 'CREATED_AT', record.createdAt || '', undefined, formatValue);
  addPlaceholderVariants(map, 'UPDATED_AT', record.updatedAt || '', undefined, formatValue);
  addPlaceholderVariants(map, 'STATUS', record.status || '', undefined, formatValue);
  addPlaceholderVariants(map, 'PDF_URL', record.pdfUrl || '', undefined, formatValue);
  addPlaceholderVariants(map, 'LANGUAGE', record.language || '', undefined, formatValue);

  questions.forEach(q => {
    if (q.type === 'BUTTON') return;
    const value = record.values ? (record.values as any)[q.id] : '';
    addPlaceholderVariants(map, q.id, value, q.type, formatValue);
    const labelToken = slugifyPlaceholder(q.qEn || q.id);
    addPlaceholderVariants(map, labelToken, value, q.type, formatValue);

    if (q.type === 'LINE_ITEM_GROUP') {
      const rows = lineItemRows[q.id] || [];
      (q.lineItemConfig?.fields || []).forEach(field => {
        const values = rows
          .map(row => (row as any)[field.id])
          .filter(val => val !== undefined && val !== null && val !== '')
          .map(val => fmt(val, (field as any).type));
        if (!values.length) return;
        const joined = values.join('\n');
        // Joined values are inherently multi-line; treat them as PARAGRAPH for renderer formatting.
        addPlaceholderVariants(map, `${q.id}.${field.id}`, joined, 'PARAGRAPH', formatValue);
        const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
        addPlaceholderVariants(map, `${q.id}.${fieldSlug}`, joined, 'PARAGRAPH', formatValue);
      });
      (q.lineItemConfig?.fields || []).forEach(field => {
        if (!(field as any)?.dataSource) return;
        const detailBuckets: Record<string, string[]> = {};
        rows.forEach(row => {
          const raw = (row as any)?.[field.id];
          if (raw === undefined || raw === null || raw === '') return;
          const details = dataSources.lookupDataSourceDetails(field as any, raw.toString(), record.language);
          if (!details) return;
          Object.entries(details).forEach(([key, val]) => {
            if (val === undefined || val === null || val === '') return;
            const dsKey = (key || '').toString().trim().toUpperCase();
            if (!dsKey) return;
            if (!detailBuckets[dsKey]) detailBuckets[dsKey] = [];
            detailBuckets[dsKey].push(val.toString());
          });
        });
        const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
        Object.entries(detailBuckets).forEach(([dsKey, values]) => {
          const joined = (values || []).filter(Boolean).join('\n');
          if (!joined) return;
          addPlaceholderVariants(map, `${q.id}.${field.id}.${dsKey}`, joined, 'PARAGRAPH', formatValue);
          if (fieldSlug) {
            addPlaceholderVariants(map, `${q.id}.${fieldSlug}.${dsKey}`, joined, 'PARAGRAPH', formatValue);
          }
        });
      });

      const resolveSubConfigByPath = (path: string[]): any | undefined => {
        if (!path.length) return undefined;
        let current: any = q.lineItemConfig;
        for (let i = 0; i < path.length; i += 1) {
          const subId = path[i];
          const subs = (current?.subGroups || []) as any[];
          const match = subs.find(s => resolveSubgroupKey(s as any) === subId);
          if (!match) return undefined;
          if (i === path.length - 1) return match;
          current = match;
        }
        return undefined;
      };

      Object.keys(lineItemRows)
        .filter(key => key.startsWith(`${q.id}.`))
        .forEach(key => {
          const pathRaw = key.slice(q.id.length + 1);
          const path = pathRaw.split('.').map(seg => seg.trim()).filter(Boolean);
          if (!path.length) return;
          const subCfg = resolveSubConfigByPath(path);
          if (!subCfg) return;
          const subRows = lineItemRows[key] || [];
          subRows.forEach((subRow: any) => {
            (subCfg.fields || []).forEach((field: any) => {
              const raw = subRow?.[field.id];
              if (raw === undefined || raw === null || raw === '') return;
              const tokenPath = path.join('.');
              addPlaceholderVariants(map, `${q.id}.${tokenPath}.${field.id}`, raw, (field as any).type, formatValue);
              const slug = slugifyPlaceholder(field.labelEn || field.id);
              addPlaceholderVariants(map, `${q.id}.${tokenPath}.${slug}`, raw, (field as any).type, formatValue);
              if ((field as any)?.dataSource) {
                const details = dataSources.lookupDataSourceDetails(field as any, raw.toString(), record.language);
                if (!details) return;
                Object.entries(details).forEach(([key, val]) => {
                  if (val === undefined || val === null || val === '') return;
                  const dsKey = (key || '').toString().trim().toUpperCase();
                  if (!dsKey) return;
                  addPlaceholderVariants(map, `${q.id}.${tokenPath}.${field.id}.${dsKey}`, val, undefined, formatValue);
                  if (slug) {
                    addPlaceholderVariants(map, `${q.id}.${tokenPath}.${slug}.${dsKey}`, val, undefined, formatValue);
                  }
                });
              }
            });
          });
        });
    } else if (q.dataSource && typeof value === 'string' && value) {
      const dsDetails = dataSources.lookupDataSourceDetails(q as any, value, record.language);
      if (dsDetails) {
        Object.entries(dsDetails).forEach(([key, val]) => {
          addPlaceholderVariants(map, `${q.id}.${key}`, val, undefined, formatValue);
        });
      }
    }
  });

  // Fallback: include any raw record.values entries not already populated (helps when a header/id mismatch prevented mapping)
  Object.entries((record.values as any) || {}).forEach(([key, rawVal]) => {
    const formatted = fmt(rawVal);
    const tokens = [key, key.toUpperCase(), key.toLowerCase()];
    tokens.forEach(t => {
      const ph = `{{${t}}}`;
      if (map[ph] === undefined || map[ph] === '') {
        map[ph] = formatted;
      }
    });
  });
  return map;
};

export const addConsolidatedPlaceholders = (
  placeholders: Record<string, string>,
  questions: QuestionConfig[],
  lineItemRows: Record<string, any[]>
): void => {
  const normalizeRows = (raw: any): any[] => {
    if (Array.isArray(raw)) {
      return raw.map(row => (row && typeof row === 'object' ? row : {}));
    }
    return [];
  };
  const toNumber = (raw: any): number | null => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = raw.toString().trim();
    if (!s) return null;
    // Support commas as decimal separators in inputs like "1,25"
    const normalized = s.replace(',', '.');
    const n = Number.parseFloat(normalized);
    return Number.isNaN(n) ? null : n;
  };
  const round2 = (n: number): number => {
    if (!Number.isFinite(n)) return n;
    // Round to 2 decimals (avoid long floating tails like 0.30000000000000004).
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
  };

  questions.forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const rows = Array.isArray(lineItemRows[q.id]) ? (lineItemRows[q.id] as any[]) : [];
    const subgroupRowMap = (() => {
      const hasSubgroupKeys = Object.keys(lineItemRows).some(key => key.startsWith(`${q.id}.`));
      if (hasSubgroupKeys || !rows.length) return lineItemRows;
      const derived: Record<string, any[]> = {};
      const walkSubGroups = (parentRows: any[], subs: any[], path: string[]) => {
        (subs || []).forEach(sub => {
          const subKey = resolveSubgroupKey(sub as any);
          if (!subKey) return;
          const nextPath = [...path, subKey];
          const collected: any[] = [];
          parentRows.forEach(parentRow => {
            const children = normalizeRows((parentRow as any)[subKey]);
            children.forEach((child: any) => {
              collected.push({
                ...(child || {}),
                __parent: parentRow
              });
            });
          });
          derived[`${q.id}.${nextPath.join('.')}`] = collected;
          const deeper = (sub as any)?.subGroups || [];
          if (deeper.length) {
            walkSubGroups(collected, deeper, nextPath);
          }
        });
      };
      walkSubGroups(rows, q.lineItemConfig?.subGroups || [], []);
      return { ...lineItemRows, ...derived };
    })();

    // Item count across the full group.
    placeholders[`{{COUNT(${q.id})}}`] = `${rows.length}`;

    (q.lineItemConfig?.fields || []).forEach(field => {
      const type = ((field as any)?.type || '').toString().toUpperCase();
      const values = rows
        .map(row => (row as any)?.[field.id])
        .filter(val => val !== undefined && val !== null && val !== '')
        .map(val => formatTemplateValue(val, (field as any).type))
        .map(s => (s || '').toString().trim())
        .filter(Boolean);
      const unique = Array.from(new Set(values));
      const consolidatedText = unique.length ? unique.join(', ') : 'None';

      placeholders[`{{CONSOLIDATED(${q.id}.${field.id})}}`] = consolidatedText;
      const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
      placeholders[`{{CONSOLIDATED(${q.id}.${fieldSlug})}}`] = consolidatedText;

      // Numeric calculation: SUM across all group rows.
      if (type === 'NUMBER') {
        let sum = 0;
        let hasAny = false;
        rows.forEach(row => {
          const n = toNumber((row as any)?.[field.id]);
          if (n === null) return;
          hasAny = true;
          sum += n;
        });
        const sumText = hasAny ? `${round2(sum)}` : '0';
        placeholders[`{{SUM(${q.id}.${field.id})}}`] = sumText;
        placeholders[`{{SUM(${q.id}.${fieldSlug})}}`] = sumText;
      }
    });

    const resolveSubConfigByPath = (path: string[]): any | undefined => {
      if (!path.length) return undefined;
      let current: any = q.lineItemConfig;
      for (let i = 0; i < path.length; i += 1) {
        const subId = path[i];
        const subs = (current?.subGroups || []) as any[];
        const match = subs.find(s => resolveSubgroupKey(s as any) === subId);
        if (!match) return undefined;
        if (i === path.length - 1) return match;
        current = match;
      }
      return undefined;
    };

    Object.keys(subgroupRowMap)
      .filter(key => key.startsWith(`${q.id}.`))
      .forEach(key => {
        const pathRaw = key.slice(q.id.length + 1);
        const path = pathRaw.split('.').map(seg => seg.trim()).filter(Boolean);
        if (!path.length) return;
        const subCfg = resolveSubConfigByPath(path);
        if (!subCfg) return;
        const subSlug = slugifyPlaceholder(path.join('.'));
        const children: any[] = Array.isArray(subgroupRowMap[key]) ? (subgroupRowMap[key] as any[]) : [];

        placeholders[`{{COUNT(${q.id}.${pathRaw})}}`] = `${children.length}`;
        placeholders[`{{COUNT(${q.id}.${subSlug})}}`] = `${children.length}`;

        (subCfg.fields || []).forEach((field: any) => {
          const type = ((field as any)?.type || '').toString().toUpperCase();
          const values = children
            .map(row => (row as any)?.[field.id])
            .filter(val => val !== undefined && val !== null && val !== '')
            .map(val => formatTemplateValue(val, (field as any).type))
            .map(s => (s || '').toString().trim())
            .filter(Boolean);
          const unique = Array.from(new Set(values));
          const consolidatedText = unique.length ? unique.join(', ') : 'None';

          const fieldSlug = slugifyPlaceholder(field.labelEn || field.id);
          const fieldTokens = [field.id, fieldSlug];
          fieldTokens.forEach(ft => {
            placeholders[`{{CONSOLIDATED(${q.id}.${pathRaw}.${ft})}}`] = consolidatedText;
            placeholders[`{{CONSOLIDATED(${q.id}.${subSlug}.${ft})}}`] = consolidatedText;
          });

          if (type === 'NUMBER') {
            let sum = 0;
            let hasAny = false;
            children.forEach(row => {
              const n = toNumber((row as any)?.[field.id]);
              if (n === null) return;
              hasAny = true;
              sum += n;
            });
            const sumText = hasAny ? `${round2(sum)}` : '0';
            fieldTokens.forEach(ft => {
              placeholders[`{{SUM(${q.id}.${pathRaw}.${ft})}}`] = sumText;
              placeholders[`{{SUM(${q.id}.${subSlug}.${ft})}}`] = sumText;
            });
          }
        });
      });
  });
};

