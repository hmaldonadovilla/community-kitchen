import { matchesWhenClause } from '../../core';
import type { CopyCurrentRecordLineItemProfile, CopyCurrentRecordProfile, WebFormDefinition } from '../../../types';
import type { FieldValue, VisibilityContext } from '../../types';
import type { LineItemState } from '../types';
import { buildInitialLineItems } from './lineItems';

const SYSTEM_ROW_VALUE_PREFIX = '__ck';

const normalizeIdList = (raw: any): string[] => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
    .filter(Boolean);
};

const normalizeLineItemProfiles = (raw: any): CopyCurrentRecordLineItemProfile[] => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map(v => (v && typeof v === 'object' ? (v as any) : null))
    .filter(Boolean)
    .map(v => {
      const groupId = (v.groupId || v.id || '').toString().trim();
      const fields = normalizeIdList(v.fields || v.keepFields);
      const includeWhen = v.includeWhen || v.rows || undefined;
      return { groupId, fields, includeWhen } as CopyCurrentRecordLineItemProfile;
    })
    .filter(v => v.groupId && v.fields.length);
};

export const applyCopyCurrentRecordProfile = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
}): { values: Record<string, FieldValue>; lineItems: LineItemState } | null => {
  const profile = (args.definition as any)?.copyCurrentRecordProfile as CopyCurrentRecordProfile | undefined;
  if (!profile || typeof profile !== 'object') return null;

  const keepValueIds = normalizeIdList((profile as any).values);
  const lineProfiles = normalizeLineItemProfiles((profile as any).lineItems);

  const nextValues: Record<string, FieldValue> = {};
  keepValueIds.forEach(fid => {
    if (!fid) return;
    if (Object.prototype.hasOwnProperty.call(args.values || {}, fid)) {
      nextValues[fid] = (args.values as any)[fid];
    }
  });

  let nextLineItems: LineItemState = buildInitialLineItems(args.definition);

  const topValues = args.values || {};
  const lineState = args.lineItems || {};

  lineProfiles.forEach(lp => {
    const rows = lineState[lp.groupId] || [];
    const fields = normalizeIdList(lp.fields);
    const includeWhen = lp.includeWhen;

    const filtered = (rows || [])
      .filter(row => {
        if (!includeWhen) return true;
        const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
        const rowCtx: VisibilityContext = {
          getValue: (fieldId: string) => {
            const fid = (fieldId || '').toString();
            if (!fid) return undefined;
            if (Object.prototype.hasOwnProperty.call(rowValues, fid)) return rowValues[fid];
            return (topValues as any)[fid];
          },
          getLineItems: (groupId: string) => (lineState as any)[groupId] || [],
          getLineItemKeys: () => Object.keys(lineState || {})
        };
        return matchesWhenClause(includeWhen as any, rowCtx as any);
      })
      .map(row => {
        const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
        const nextRowValues: Record<string, FieldValue> = {};
        fields.forEach(fid => {
          if (Object.prototype.hasOwnProperty.call(rowValues, fid)) nextRowValues[fid] = rowValues[fid];
        });
        // Preserve internal/system row attributes (e.g. __ckRowSource) so addMode="auto" reconciliation
        // can correctly recognize auto-generated rows and avoid duplicate auto-add behavior.
        Object.keys(rowValues || {}).forEach(key => {
          if (!key || !key.startsWith(SYSTEM_ROW_VALUE_PREFIX)) return;
          if (Object.prototype.hasOwnProperty.call(nextRowValues, key)) return;
          nextRowValues[key] = rowValues[key];
        });
        return { ...row, values: nextRowValues };
      });

    nextLineItems = { ...nextLineItems, [lp.groupId]: filtered };
  });

  return { values: nextValues, lineItems: nextLineItems };
};
