import type { FieldValue } from '../../../types';
import { getByPath } from '../../features/lineItems/domain/lineItemPresentation';

export type VirtualPresetContext = {
  rowValues: Record<string, FieldValue>;
  parentValues?: Record<string, FieldValue>;
  sourceRow?: Record<string, any>;
};

/**
 * Owner: guided virtual row preset projection.
 * Resolves configured preset tokens against row, parent, top-level, and source
 * values without depending on React state or rendering.
 */
export const resolveVirtualPresetValueAction = (args: {
  raw: any;
  context: VirtualPresetContext;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): FieldValue | undefined => {
  const { raw, context, resolveTopValue } = args;
  if (Array.isArray(raw)) {
    return raw
      .map(entry => resolveVirtualPresetValueAction({ raw: entry, context, resolveTopValue }))
      .filter(entry => entry !== undefined) as unknown as FieldValue;
  }
  if (raw && typeof raw === 'object') {
    const nextObject: Record<string, any> = {};
    Object.entries(raw).forEach(([key, value]) => {
      const resolved = resolveVirtualPresetValueAction({ raw: value, context, resolveTopValue });
      if (resolved === undefined) return;
      nextObject[key] = resolved;
    });
    return nextObject as FieldValue;
  }
  if (typeof raw !== 'string') return raw as FieldValue;
  const token = raw.toString().trim();
  if (token.startsWith('$row.')) {
    const fieldId = token.slice(5).trim();
    return fieldId ? ((context.rowValues as any)[fieldId] as FieldValue) : undefined;
  }
  if (token.startsWith('$parent.')) {
    const fieldId = token.slice(8).trim();
    return fieldId && context.parentValues ? ((context.parentValues as any)[fieldId] as FieldValue) : undefined;
  }
  if (token.startsWith('$top.')) {
    const fieldId = token.slice(5).trim();
    return fieldId ? resolveTopValue(fieldId) : undefined;
  }
  if (token.startsWith('$source.')) {
    const fieldId = token.slice(8).trim();
    return fieldId ? (getByPath(context.sourceRow, fieldId) as FieldValue | undefined) : undefined;
  }
  return raw as FieldValue;
};

const resolveVirtualPresetNodeAction = (args: {
  raw: any;
  context: VirtualPresetContext;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): any => {
  const { raw, context, resolveTopValue } = args;
  if (Array.isArray(raw)) {
    return raw
      .map(entry => resolveVirtualPresetNodeAction({ raw: entry, context, resolveTopValue }))
      .filter(entry => entry !== undefined);
  }
  if (raw && typeof raw === 'object') {
    const next: Record<string, any> = {};
    Object.entries(raw).forEach(([key, value]) => {
      const resolved = resolveVirtualPresetNodeAction({ raw: value, context, resolveTopValue });
      if (resolved === undefined) return;
      next[key] = resolved;
    });
    return next;
  }
  return resolveVirtualPresetValueAction({ raw, context, resolveTopValue });
};

export const resolveVirtualPresetAction = (args: {
  preset: Record<string, any> | undefined;
  context: VirtualPresetContext;
  resolveTopValue: (fieldId: string) => FieldValue | undefined;
}): Record<string, FieldValue> => {
  const { preset, context, resolveTopValue } = args;
  if (!preset || typeof preset !== 'object') return {};
  const next: Record<string, FieldValue> = {};
  Object.entries(preset).forEach(([key, raw]) => {
    const value = resolveVirtualPresetNodeAction({ raw, context, resolveTopValue });
    if (value === undefined) return;
    next[key] = value;
  });
  return next;
};
