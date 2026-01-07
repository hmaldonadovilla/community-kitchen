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
  questions.forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    const value = record.values ? (record.values as any)[q.id] : undefined;
    if (Array.isArray(value)) {
      const normalized = value.map(row => (row && typeof row === 'object' ? row : {}));
      map[q.id] = normalized;
      (q.lineItemConfig?.subGroups || []).forEach(sub => {
        const subKey = resolveSubgroupKey(sub as any);
        if (!subKey) return;
        const collected: any[] = [];
        normalized.forEach(parentRow => {
          const children = Array.isArray((parentRow as any)[subKey]) ? (parentRow as any)[subKey] : [];
          children.forEach((child: any) => {
            collected.push({
              ...(child || {}),
              __parent: parentRow
            });
          });
        });
        map[`${q.id}.${subKey}`] = collected;
      });
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

      (q.lineItemConfig?.subGroups || []).forEach(sub => {
        const subKey = resolveSubgroupKey(sub as any);
        if (!subKey) return;
        rows.forEach(row => {
          const subRows = Array.isArray((row as any)[subKey]) ? (row as any)[subKey] : [];
          subRows.forEach((subRow: any) => {
            (sub.fields || []).forEach(field => {
              const raw = subRow?.[field.id];
              if (raw === undefined || raw === null || raw === '') return;
              addPlaceholderVariants(map, `${q.id}.${subKey}.${field.id}`, raw, (field as any).type, formatValue);
              const slug = slugifyPlaceholder(field.labelEn || field.id);
              addPlaceholderVariants(map, `${q.id}.${subKey}.${slug}`, raw, (field as any).type, formatValue);
            });
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

    // nested sub groups
    (q.lineItemConfig?.subGroups || []).forEach(sub => {
      const subKey = resolveSubgroupKey(sub as any);
      if (!subKey) return;
      const subSlug = slugifyPlaceholder(subKey);

      const children: any[] = [];
      rows.forEach(parentRow => {
        const subRows = Array.isArray((parentRow as any)?.[subKey]) ? (parentRow as any)[subKey] : [];
        subRows.forEach((subRow: any) => children.push(subRow || {}));
      });

      // Item count across the full subgroup.
      placeholders[`{{COUNT(${q.id}.${subKey})}}`] = `${children.length}`;
      placeholders[`{{COUNT(${q.id}.${subSlug})}}`] = `${children.length}`;

      (sub.fields || []).forEach(field => {
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
          placeholders[`{{CONSOLIDATED(${q.id}.${subKey}.${ft})}}`] = consolidatedText;
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
            placeholders[`{{SUM(${q.id}.${subKey}.${ft})}}`] = sumText;
            placeholders[`{{SUM(${q.id}.${subSlug}.${ft})}}`] = sumText;
          });
        }
      });
    });
  });
};


