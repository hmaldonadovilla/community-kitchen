import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  shouldHideField,
  validateRules,
  handleSelectionEffects,
  loadOptionsFromDataSource,
  optionKey,
  normalizeLanguage
} from '../core';
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  LineItemSelectorConfig,
  OptionFilter,
  VisibilityContext,
  WebQuestionDefinition,
  WebFormSubmission
} from '../types';
import { BootstrapContext, SubmissionPayload, submit, triggerFollowup, ListResponse, ListItem } from './api';
import FormView from './components/FormView';
import ListView from './components/ListView';
import FollowupView from './components/FollowupView';
import { FormErrors, LineItemState, OptionState, View } from './types';
import { resolveFieldLabel, resolveLabel } from './utils/labels';
import { resolveLocalizedString } from '../i18n';
import { isEmptyValue } from './utils/values';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

const buildFilePayload = async (files: FileList | File[] | undefined | null, maxFiles?: number) => {
  if (!files) return [];
  const list = Array.from(files);
  const sliced = maxFiles ? list.slice(0, maxFiles) : list;
  const payloads = await Promise.all(
    sliced.map(
      file =>
        new Promise<{ name: string; type: string; dataUrl: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: (reader.result as string) || '' });
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        })
    )
  );
  return payloads;
};

const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string) =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

const parseSubgroupKey = (key: string): { parentGroupId: string; parentRowId: string; subGroupId: string } | null => {
  const parts = key.split('::');
  if (parts.length !== 3) return null;
  return { parentGroupId: parts[0], parentRowId: parts[1], subGroupId: parts[2] };
};

const buildLineContextId = (groupId: string, rowId: string, fieldId: string) => `${groupId}::${rowId}::${fieldId}`;

const resolveSubgroupKey = (sub?: { id?: string; label?: any }): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  if (typeof sub.label === 'string') return sub.label;
  return sub.label?.en || sub.label?.fr || sub.label?.nl || '';
};

const TooltipIcon: React.FC<{
  text?: string;
  label?: string;
  triggerText?: string;
  linkStyle?: boolean;
}> = ({ text, label, triggerText, linkStyle }) => {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const open = hoverOpen || pinned;
  const hasText = !!text;

  useLayoutEffect(() => {
    if (!hasText || !open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const maxWidth = 460;
    const margin = 8;
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - maxWidth - margin);
    const top = Math.min(rect.bottom + margin, window.innerHeight - margin);
    setPosition({ top, left });
  }, [open, hasText]);

  useEffect(() => {
    if (!hasText || !open) return;
    const onDocClick = (e: MouseEvent) => {
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      setPinned(false);
      setHoverOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, hasText]);

  if (!hasText) return null;

  const overlay =
    open && position
      ? createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              zIndex: 3000,
              top: position.top,
              left: position.left,
              background: '#ffffff',
              color: '#111827',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              boxShadow: '0 16px 40px rgba(15,23,42,0.16)',
              padding: 14,
              maxWidth: 460,
              minWidth: 260,
              maxHeight: 360,
              overflowY: 'auto',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}
            onMouseEnter={() => setHoverOpen(true)}
            onMouseLeave={() => {
              if (!pinned) setHoverOpen(false);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{label || 'Details'}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setPinned(false);
                  setHoverOpen(false);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 16,
                  cursor: 'pointer',
                  padding: 2,
                  lineHeight: 1,
                  color: '#475569'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 10, color: '#1f2937' }}>{text}</div>
          </div>,
          document.body
        )
      : null;

  return (
    <span className="tooltip-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ? `Show ${label}` : 'Show details'}
        aria-expanded={open}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => {
          if (!pinned) setHoverOpen(false);
        }}
        onFocus={() => setHoverOpen(true)}
        onBlur={() => {
          if (!pinned) setHoverOpen(false);
        }}
        onClick={() => setPinned(prev => !prev)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#2563eb',
          cursor: 'pointer',
          fontWeight: linkStyle ? 600 : 700,
          padding: 0,
          lineHeight: 1,
          textDecoration: linkStyle ? 'underline' : 'none',
          textAlign: 'left',
        }}
      >
        {triggerText || label || 'ℹ'}
      </button>
      {overlay}
    </span>
  );
};

// Build marker to verify deployed bundle version in UI
const BUILD_MARKER = 'tooltip-overlay-2025-02-08-01';

const seedSubgroupDefaults = (
  lineItems: LineItemState,
  group: WebQuestionDefinition,
  parentRowId: string
): LineItemState => {
  if (!group.lineItemConfig?.subGroups?.length) return lineItems;
  let next = lineItems;
  group.lineItemConfig.subGroups.forEach(sub => {
    const subKeyRaw = resolveSubgroupKey(sub);
    if (!subKeyRaw || sub.addMode === 'overlay') return;
    const subKey = buildSubgroupKey(group.id, parentRowId, subKeyRaw);
    const existing = next[subKey] || [];
    if (existing.length) return;
    const minRows = Math.max(1, sub.minRows || 1);
    const newRows: LineItemRowState[] = [];
    for (let i = 0; i < minRows; i += 1) {
      newRows.push({
        id: `${subKey}_${i}_${Math.random().toString(16).slice(2)}`,
        values: {},
        parentId: parentRowId,
        parentGroupId: group.id
      });
    }
    next = { ...next, [subKey]: newRows };
  });
  return next;
};

const buildInitialLineItems = (definition: BootstrapContext['definition'], recordValues?: Record<string, any>): LineItemState => {
  let state: LineItemState = {};
  const effectFieldLookup: Record<string, string> = {};
  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      const subgroupIds = group.lineItemConfig?.subGroups?.map(resolveSubgroupKey).filter(Boolean) || [];
      subgroupIds.forEach(subId => {
        const effectField = (group.lineItemConfig?.fields || []).find(f =>
          Array.isArray((f as any).selectionEffects) &&
          (f as any).selectionEffects.some(
            (eff: any) => eff?.type === 'addLineItemsFromDataSource' && eff.groupId === subId
          )
        );
        if (effectField?.id) {
          effectFieldLookup[`${group.id}::${subId}`] = effectField.id.toString();
        }
      });
    });
  definition.questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const raw = recordValues?.[q.id] || recordValues?.[`${q.id}_json`];
      let rows: any[] = [];
      if (Array.isArray(raw)) {
        rows = raw;
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rows = parsed;
        } catch (_) {
          rows = [];
        }
      }
      const parsedRows = (rows || []).map((r, idx) => {
        const rowId = `${q.id}_${idx}_${Math.random().toString(16).slice(2)}`;
        const values = { ...(r || {}) };
        // extract subgroup rows if present
        if (q.lineItemConfig?.subGroups?.length) {
          q.lineItemConfig.subGroups.forEach(sub => {
            const key = resolveSubgroupKey(sub);
            if (!key) return;
            const rawChild = (r && r[key]) || [];
            const childRows: any[] = Array.isArray(rawChild)
              ? rawChild
              : typeof rawChild === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(rawChild);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch (_) {
                    return [];
                  }
                })()
              : [];
            const childParsed = childRows.map((cr, cIdx) => ({
              id: `${sub.id || key}_${cIdx}_${Math.random().toString(16).slice(2)}`,
              values: cr || {},
              parentId: rowId,
              parentGroupId: q.id,
              autoGenerated: (() => {
                const effectFieldId = effectFieldLookup[`${q.id}::${key}`];
                if (!effectFieldId) return undefined;
                return true;
              })(),
              effectContextId: (() => {
                const effectFieldId = effectFieldLookup[`${q.id}::${key}`];
                if (!effectFieldId) return undefined;
                return buildLineContextId(q.id, rowId, effectFieldId);
              })()
            }));
            if (childParsed.length) {
              state = { ...state, [buildSubgroupKey(q.id, rowId, key)]: childParsed };
            }
            delete (values as any)[key];
          });
        }
        state = seedSubgroupDefaults(state, q, rowId);
        return {
          id: rowId,
          values
        };
      });
      if (!parsedRows.length && q.lineItemConfig?.addMode !== 'overlay') {
        const minRows = Math.max(1, q.lineItemConfig?.minRows || 1);
        for (let i = 0; i < minRows; i += 1) {
          const newRowId = `${q.id}_${i}_${Math.random().toString(16).slice(2)}`;
          parsedRows.push({ id: newRowId, values: {} });
          state = seedSubgroupDefaults(state, q, newRowId);
        }
      }
      state[q.id] = parsedRows;
    });
  return state;
};

const resolveValueMapValue = (
  valueMap: OptionFilter,
  getValue: (fieldId: string) => FieldValue
): string => {
  if (!valueMap?.optionMap || !valueMap.dependsOn) return '';
  const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
  const depValues = dependsOn.map(dep => {
    const raw = getValue(dep);
    if (Array.isArray(raw)) return raw.join('|');
    return raw ?? '';
  });
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v.toString()));
  candidateKeys.push('*');
  const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
  const values = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
  const unique = Array.from(new Set(values.map(v => (v ?? '').toString().trim()).filter(Boolean)));
  return unique.join(', ');
};

const applyValueMapsToLineRow = (
  fields: any[],
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): Record<string, FieldValue> => {
  const nextValues = { ...rowValues };
  fields
    .filter(field => field?.valueMap)
    .forEach(field => {
      const computed = resolveValueMapValue(field.valueMap, fieldId => {
        if (fieldId === undefined || fieldId === null) return undefined;
        if (rowValues.hasOwnProperty(fieldId)) return nextValues[fieldId];
        return topValues[fieldId];
      });
      nextValues[field.id] = computed;
    });
  return nextValues;
};

const applyValueMapsToForm = (
  definition: BootstrapContext['definition'],
  currentValues: Record<string, FieldValue>,
  currentLineItems: LineItemState
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let values = { ...currentValues };
  let lineItems = { ...currentLineItems };

  definition.questions.forEach(q => {
    if (q.valueMap) {
      values[q.id] = resolveValueMapValue(q.valueMap, fieldId => values[fieldId]);
    }
    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const updatedRows = rows.map(row => ({
        ...row,
        values: applyValueMapsToLineRow(q.lineItemConfig!.fields, row.values, values)
      }));
      lineItems = { ...lineItems, [q.id]: updatedRows };

      // handle nested subgroups
      if (q.lineItemConfig.subGroups?.length) {
        rows.forEach(row => {
          q.lineItemConfig?.subGroups?.forEach(sub => {
            const key = resolveSubgroupKey(sub);
            if (!key) return;
            const subgroupKey = `${q.id}::${row.id}::${key}`;
            const subRows = lineItems[subgroupKey] || [];
            const updatedSubRows = subRows.map(subRow => ({
              ...subRow,
              values: applyValueMapsToLineRow(sub.fields || [], subRow.values, { ...values, ...row.values })
            }));
            lineItems = { ...lineItems, [subgroupKey]: updatedSubRows };
          });
        });
      }
    }
  });

  return { values, lineItems };
};

const normalizeRecordValues = (
  definition: BootstrapContext['definition'],
  rawValues?: Record<string, any>
): Record<string, FieldValue> => {
  const source = rawValues ? { ...rawValues } : {};
  const normalized: Record<string, FieldValue> = { ...source };
  definition.questions.forEach(question => {
    if (question.type !== 'CHECKBOX') return;
    const raw = source[question.id];
    if (Array.isArray(raw)) {
      normalized[question.id] = raw as FieldValue;
      return;
    }
    if (typeof raw === 'string') {
      const entries = raw
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
      normalized[question.id] = entries;
    } else if (raw === undefined || raw === null) {
      normalized[question.id] = [];
    }
  });
  return normalized;
};

const buildValidationContext = (
  values: Record<string, FieldValue>,
  lineItems: LineItemState
): VisibilityContext => ({
  getValue: (fieldId: string) => values[fieldId],
  getLineValue: (rowId: string, fieldId: string) => {
    const [groupId] = fieldId.split('__');
    const rows = lineItems[groupId] || [];
    const match = rows.find(r => r.id === rowId);
    return match?.values[fieldId.replace(`${groupId}__`, '')];
  }
});

const detectDebug = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).__WEB_FORM_DEBUG__);
  } catch (_) {
    return false;
  }
};

const resolveSelectorLabel = (selector: LineItemSelectorConfig | undefined, language: LangCode): string => {
  if (!selector) return '';
  if (language === 'FR') return selector.labelFr || selector.labelEn || selector.id;
  if (language === 'NL') return selector.labelNl || selector.labelEn || selector.id;
  return selector.labelEn || selector.id;
};

const formatFieldValue = (value: FieldValue): string => {
  if (Array.isArray(value)) {
    return value.length ? (value as string[]).join(', ') : '—';
  }
  if (value === undefined || value === null || value === '') return '—';
  return value.toString();
};

const renderValueWithTooltip = (
  value: FieldValue,
  tooltipText?: string,
  label?: string,
  linkStyle?: boolean
) => {
  const display = formatFieldValue(value);
  if (!tooltipText) return display;
  if (linkStyle) {
    return <TooltipIcon text={tooltipText} label={label} triggerText={display} linkStyle />;
  }
  return <TooltipIcon text={tooltipText} label={label} />;
};

const resolveTooltipText = (
  tooltipState: Record<string, Record<string, string>>,
  optionState: OptionState,
  key: string,
  value: FieldValue
): string | undefined => {
  const map = tooltipState[key] || optionState[key]?.tooltips;
  if (!map) return undefined;
  const pick = (v: any) => (v !== undefined && v !== null ? map[v as string] : undefined);
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = pick(v);
      if (hit) return hit;
    }
    return undefined;
  }
  return pick(value);
};

const App: React.FC<BootstrapContext> = ({ definition, formKey, record }) => {
  const [language, setLanguage] = useState<LangCode>(normalizeLanguage(definition.languages?.[0] || record?.language));
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems);
    return mapped.values;
  });
  const [lineItems, setLineItems] = useState<LineItemState>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems);
    return mapped.lineItems;
  });
  const [view, setView] = useState<View>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<'info' | 'success' | 'error' | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(record?.id || '');
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] = useState<WebFormSubmission | null>(record || null);
  const [followupMessage, setFollowupMessage] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>({});
  const [tooltipState, setTooltipState] = useState<Record<string, Record<string, string>>>({});
  const preloadPromisesRef = useRef<Record<string, Promise<void> | undefined>>({});
  const [lastSubmissionMeta, setLastSubmissionMeta] = useState<SubmissionMeta | null>(() =>
    record
      ? {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          status: record.status || null
        }
      : null
  );
  const [followupRunning, setFollowupRunning] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [debugEnabled] = useState<boolean>(() => detectDebug());
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (!debugEnabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm]', event, payload || {});
      } catch (_) {
        // ignore logging failures
      }
    },
    [debugEnabled]
  );
  const [listCache, setListCache] = useState<{ response: ListResponse | null; records: Record<string, WebFormSubmission> }>({
    response: null,
    records: {}
  });
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const invalidateListCache = () => {
    setListCache({ response: null, records: {} });
    setListRefreshToken(token => token + 1);
  };

  const loadOptionsForField = useCallback(
    (field: any, groupId?: string) => {
      if (!field?.dataSource) return Promise.resolve();
      const key = optionKey(field.id, groupId);
      if (optionState[key] && tooltipState[key]) return Promise.resolve();
      if (preloadPromisesRef.current[key]) return preloadPromisesRef.current[key];
      const promise = loadOptionsFromDataSource(field.dataSource, language).then(res => {
        if (res) {
          setOptionState(prev => ({ ...prev, [key]: res }));
          if (res.tooltips) {
            setTooltipState(prev => ({ ...prev, [key]: res.tooltips || {} }));
          }
        }
      });
      preloadPromisesRef.current[key] = promise;
      return promise;
    },
    [language, optionState, tooltipState]
  );

  const preloadSummaryTooltips = useCallback(() => {
    const tasks: Promise<void>[] = [];
    definition.questions.forEach(q => {
      if (q.dataSource) tasks.push(loadOptionsForField(q) as Promise<void>);
      if (q.type === 'LINE_ITEM_GROUP') {
        (q.lineItemConfig?.fields || []).forEach(field => {
          if (field?.dataSource) tasks.push(loadOptionsForField(field, q.id) as Promise<void>);
        });
        (q.lineItemConfig?.subGroups || []).forEach(sub => {
          const subKey = resolveSubgroupKey(sub);
          (sub.fields || []).forEach(field => {
            if (field?.dataSource) tasks.push(loadOptionsForField(field, `${q.id}::${subKey}`) as Promise<void>);
          });
        });
      }
    });
    return Promise.all(tasks).then(() => undefined);
  }, [definition.questions, loadOptionsForField]);
  const clearStatus = useCallback(() => {
    setStatus(null);
    setStatusLevel(null);
    logEvent('status.cleared');
  }, [logEvent]);

  const handleSubmitAnother = useCallback(() => {
    const normalized = normalizeRecordValues(definition);
    const initialLineItems = buildInitialLineItems(definition);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems);
    setValues(mapped.values);
    setLineItems(mapped.lineItems);
    setErrors({});
    setStatus(null);
    setStatusLevel(null);
    setSelectedRecordId('');
    setSelectedRecordSnapshot(null);
    setFollowupMessage(null);
    setLastSubmissionMeta(null);
    setFollowupRunning(null);
    setView('form');
    logEvent('form.reset', { reason: 'submitAnother' });
  }, [definition, logEvent]);

  const summaryRecordId = lastSubmissionMeta?.id || selectedRecordId || '';

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleString();
    } catch (_) {
      return value;
    }
  };

  const handleCopyRecordId = useCallback(async () => {
    if (!summaryRecordId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryRecordId);
        setCopyFeedback('Copied');
        logEvent('record.copy', { recordId: summaryRecordId });
      } else {
        setCopyFeedback('Press Cmd/Ctrl+C to copy');
      }
    } catch (_) {
      setCopyFeedback('Unable to copy');
    }
    const clear = () => setCopyFeedback(null);
    if (typeof window !== 'undefined' && window?.setTimeout) {
      window.setTimeout(clear, 2000);
    } else {
      setTimeout(clear, 2000);
    }
  }, [summaryRecordId, logEvent]);


  useEffect(() => {
    if (record?.values) {
      const normalizedValues = normalizeRecordValues(definition, record.values);
      const initialLineItems = buildInitialLineItems(definition, normalizedValues);
      const { values: mappedValues, lineItems: mappedLineItems } = applyValueMapsToForm(
        definition,
        normalizedValues,
        initialLineItems
      );
      setValues(mappedValues);
      setLineItems(mappedLineItems);
    }
    if (record?.id) {
      setSelectedRecordId(record.id);
    }
    if (record) {
      setLastSubmissionMeta({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status || null
      });
      setSelectedRecordSnapshot(record);
    }
  }, [record, definition]);

  useEffect(() => {
    if (view !== 'summary') return;
    preloadSummaryTooltips();
  }, [view, preloadSummaryTooltips]);

  useEffect(() => {
    if (!selectedRecordId || selectedRecordSnapshot) return;
    const cached = listCache.records[selectedRecordId];
    if (cached) {
      setSelectedRecordSnapshot(cached);
    }
  }, [selectedRecordId, selectedRecordSnapshot, listCache.records]);

  useEffect(() => {
    if (view !== 'summary') return;
    preloadSummaryTooltips();
  }, [view, preloadSummaryTooltips]);

  const ensureOptions = (q: WebQuestionDefinition) => {
    if (!q.dataSource) return;
    const key = optionKey(q.id);
    if (optionState[key]) return;
    loadOptionsFromDataSource(q.dataSource, language).then(res => {
      if (res) {
        setOptionState(prev => ({ ...prev, [key]: res }));
        if (res.tooltips) {
          setTooltipState(prev => ({ ...prev, [key]: res.tooltips || {} }));
        }
        logEvent('options.loaded', { questionId: q.id, source: 'question', count: res.en?.length || 0 });
      }
    });
  };

  const runSelectionEffects = (
    question: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    }
  ) => {
    if (!question.selectionEffects || !question.selectionEffects.length) return;
    const resolveTargetGroupKey = (targetGroupId: string, lineItemCtx?: { groupId: string; rowId?: string }): string => {
      if (!lineItemCtx?.groupId || !lineItemCtx?.rowId) return targetGroupId;
      const parentGroup = definition.questions.find(q => q.id === lineItemCtx.groupId);
      const subMatch = parentGroup?.lineItemConfig?.subGroups?.find(sub => {
        const key = resolveSubgroupKey(sub);
        return key === targetGroupId;
      });
      if (subMatch) {
        const key = resolveSubgroupKey(subMatch) || targetGroupId;
        return buildSubgroupKey(lineItemCtx.groupId, lineItemCtx.rowId, key);
      }
      return targetGroupId;
    };

    handleSelectionEffects(
      definition,
      question,
      value as any,
      language,
      {
        addLineItemRow: (
          groupId: string,
          preset?: Record<string, string | number>,
          meta?: { effectContextId?: string; auto?: boolean }
        ) => {
          setLineItems(prev => {
            const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
            const rows = prev[targetKey] || [];
            // capture section selector value at creation so later selector changes don't rewrite existing rows
            const targetGroup =
              definition.questions.find(q => q.id === targetKey) ||
              definition.questions.find(q => q.id === opts?.lineItem?.groupId);
            const selectorId = targetGroup?.lineItemConfig?.sectionSelector?.id;
            const selectorValue =
              selectorId && values.hasOwnProperty(selectorId) ? (values as any)[selectorId] : undefined;
            const presetValues: Record<string, FieldValue> = {};
            Object.entries(preset || {}).forEach(([key, raw]) => {
              if (Array.isArray(raw)) {
                const first = raw[0];
                if (first !== undefined) presetValues[key] = first as FieldValue;
              } else {
                presetValues[key] = raw as FieldValue;
              }
            });
            if (selectorId && selectorValue !== undefined && selectorValue !== null && presetValues[selectorId] === undefined) {
              presetValues[selectorId] = selectorValue;
            }
            const newRow: LineItemRowState = {
              id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
              values: presetValues,
              parentId: opts?.lineItem?.rowId,
              parentGroupId: opts?.lineItem?.groupId,
              autoGenerated: meta?.auto,
              effectContextId: meta?.effectContextId
            };
            const subgroupInfo = parseSubgroupKey(targetKey);
            let nextLineItems = { ...prev, [targetKey]: [...rows, newRow] };
            if (!subgroupInfo) {
              const parentGroup = definition.questions.find(q => q.id === targetKey);
              if (parentGroup) {
                nextLineItems = seedSubgroupDefaults(nextLineItems, parentGroup, newRow.id);
              }
            }
            const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(
              definition,
              values,
              nextLineItems
            );
            setValues(nextValues);
            return recomputed;
          });
        },
      updateAutoLineItems: (
        groupId: string,
        presets: Array<Record<string, string | number>>,
        meta: { effectContextId: string; numericTargets: string[] }
      ) => {
        setLineItems(prev => {
          const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
          const rows = prev[targetKey] || [];
          const manualRows = rows.filter(r => !(r.autoGenerated && r.effectContextId === meta.effectContextId));

          // Rebuild auto rows for this context from scratch so recipe changes fully replace them
          const rebuiltAuto: LineItemRowState[] = presets.map(preset => {
            const values: Record<string, FieldValue> = { ...preset };
            meta.numericTargets.forEach(fid => {
              if (preset[fid] !== undefined) {
                values[fid] = preset[fid] as FieldValue;
              }
            });
            return {
              id: `${targetKey}_${Math.random().toString(16).slice(2)}`,
              values,
              parentId: opts?.lineItem?.rowId,
              parentGroupId: opts?.lineItem?.groupId,
              autoGenerated: true,
              effectContextId: meta.effectContextId
            };
          });

          const next: LineItemState = { ...prev, [targetKey]: [...manualRows, ...rebuiltAuto] };
          const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next);
          setValues(nextValues);
          return recomputed;
        });
      },
        clearLineItems: (groupId: string, contextId?: string) => {
          setLineItems(prev => {
            const targetKey = resolveTargetGroupKey(groupId, opts?.lineItem);
            const rows = prev[targetKey] || [];
            const remaining = contextId
              ? rows.filter(r => !(r.autoGenerated && r.effectContextId === contextId))
              : rows.filter(r => !r.autoGenerated);
            const removedIds = rows.filter(r => !remaining.includes(r)).map(r => r.id);
            const next: LineItemState = { ...prev, [targetKey]: remaining };
            const subgroupInfo = parseSubgroupKey(targetKey);
            if (!subgroupInfo) {
              Object.keys(next).forEach(key => {
                const parsed = parseSubgroupKey(key);
                if (parsed?.parentGroupId === targetKey && removedIds.includes(parsed.parentRowId)) {
                  delete (next as any)[key];
                }
              });
            }
            const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, next);
            setValues(nextValues);
            return recomputed;
          });
          logEvent('lineItems.cleared', { groupId });
        }
      },
      opts
    );
  };

  const validateForm = (): boolean => {
    const ctx = buildValidationContext(values, lineItems);
    const allErrors: FormErrors = {};
    definition.questions.forEach(q => {
      const questionHidden = shouldHideField(q.visibility, ctx);
      if (q.validationRules && q.validationRules.length) {
        const errs = validateRules(q.validationRules, { ...ctx, language, isHidden: () => questionHidden });
        errs.forEach(err => {
          allErrors[err.fieldId] = err.message;
        });
      }
      if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
        const rows = lineItems[q.id] || [];
        rows.forEach(row => {
          const groupCtx: VisibilityContext = {
            getValue: fid => values[fid],
            getLineValue: (_rowId, fid) => row.values[fid]
          };
          q.lineItemConfig?.fields.forEach(field => {
            if (field.required) {
              const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
              if (hideField) return;
              const val = row.values[field.id];
              const hasValue = Array.isArray(val) ? val.length > 0 : !!(val && val.toString().trim());
              if (!hasValue) {
                allErrors[`${q.id}__${field.id}__${row.id}`] = resolveFieldLabel(field, language, 'Required') + ' is required';
              }
            }
          });

          // validate subgroups, if any
          if (q.lineItemConfig?.subGroups?.length) {
            q.lineItemConfig.subGroups.forEach(sub => {
              const subId = resolveSubgroupKey(sub);
              if (!subId) return;
              const subKey = buildSubgroupKey(q.id, row.id, subId);
              const subRows = lineItems[subKey] || [];
              subRows.forEach(subRow => {
                const subCtx: VisibilityContext = {
                  getValue: fid => values[fid],
                  getLineValue: (_rowId, fid) => subRow.values[fid]
                };
                (sub.fields || []).forEach(field => {
                  if (field.required) {
                    const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                    if (hide) return;
                    const val = subRow.values[field.id];
                    const hasValue = Array.isArray(val) ? val.length > 0 : !!(val && val.toString().trim());
                    if (!hasValue) {
                      allErrors[`${subKey}__${field.id}__${subRow.id}`] =
                        resolveFieldLabel(field, language, 'Required') + ' is required';
                    }
                  }
                });
              });
            });
          }
        });
      } else if (q.required && !questionHidden && isEmptyValue(values[q.id])) {
        allErrors[q.id] = 'This field is required.';
      }
    });
    setErrors(allErrors);
    return !Object.keys(allErrors).length;
  };

  const buildPayload = async (): Promise<SubmissionPayload> => {
    const recomputed = applyValueMapsToForm(definition, values, lineItems);
    const payloadValues: Record<string, any> = { ...recomputed.values };
    for (const q of definition.questions) {
      if (q.type === 'FILE_UPLOAD') {
        const raw = recomputed.values[q.id] as FileList | File[] | undefined | null;
        payloadValues[q.id] = await buildFilePayload(raw, q.uploadConfig?.maxFiles);
      }
    }
    definition.questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        const rows = recomputed.lineItems[q.id] || [];
        if (q.lineItemConfig?.subGroups?.length) {
          const serialized = rows.map(row => {
            const base = { ...(row.values || {}) };
            q.lineItemConfig?.subGroups?.forEach(sub => {
              const key = resolveSubgroupKey(sub);
              if (!key) return;
              const childKey = buildSubgroupKey(q.id, row.id, key);
              const childRows = recomputed.lineItems[childKey] || [];
              base[key] = childRows.map(cr => cr.values);
            });
            return base;
          });
          payloadValues[q.id] = serialized;
          payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
          return;
        }
        const serialized = rows.map(r => r.values);
        payloadValues[q.id] = serialized;
        payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
      });
    const submission: SubmissionPayload = {
      formKey,
      language,
      values: payloadValues,
      ...payloadValues
    };
    const submissionId = selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id || undefined;
    if (submissionId) {
      submission.id = submissionId;
    }
    return submission;
  };

  const handleSubmit = async () => {
    clearStatus();
    logEvent('submit.begin', { language, lineItemGroups: Object.keys(lineItems).length });
    if (!validateForm()) {
      setStatus('Please fix validation errors.');
      setStatusLevel('error');
      logEvent('submit.validationFailed');
      return;
    }
    setSubmitting(true);
    try {
      const payload = await buildPayload();
      const res = await submit(payload);
      const message = res.message || (res.success ? 'Submitted' : 'Submit failed');
      setStatus(message);
      setStatusLevel(res.success ? 'success' : 'error');
      if (!res.success) {
        logEvent('submit.error', { message, meta: res.meta });
        return;
      }
      logEvent('submit.success', { recordId: res.meta?.id });
      if (res.meta?.id) {
        setSelectedRecordId(res.meta.id);
      }
      setLastSubmissionMeta(prev => ({
        id: res.meta?.id || prev?.id || selectedRecordId,
        createdAt: res.meta?.createdAt || prev?.createdAt,
        updatedAt: res.meta?.updatedAt || prev?.updatedAt,
        status: prev?.status || null
      }));
      setView('summary');
      invalidateListCache();
    } catch (err: any) {
      setStatus(err?.message || 'Submit failed');
      setStatusLevel('error');
      logEvent('submit.exception', { message: err?.message || err });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunFollowup = async (action: string) => {
    if (!selectedRecordId) {
      setFollowupMessage('Select a record first.');
      return;
    }
    setFollowupRunning(action);
    setFollowupMessage('Running…');
    logEvent('followup.begin', { action, recordId: selectedRecordId });
    try {
      const res = await triggerFollowup(formKey, selectedRecordId, action);
      setFollowupMessage(res.message || res.status || (res.success ? 'Done' : 'Failed'));
      if (res.success) {
        invalidateListCache();
        logEvent('followup.success', { action, status: res.status });
        setLastSubmissionMeta(prev => ({
          ...(prev || { id: selectedRecordId }),
          updatedAt: res.updatedAt || prev?.updatedAt,
          status: res.status || prev?.status || null
        }));
        setSelectedRecordSnapshot(prev =>
          prev
            ? {
                ...prev,
                updatedAt: res.updatedAt || prev.updatedAt,
                status: res.status || prev.status,
                pdfUrl: res.pdfUrl || prev.pdfUrl
              }
            : prev
        );
      } else {
        logEvent('followup.error', { action, message: res.message });
      }
    } catch (err: any) {
      setFollowupMessage(err?.message || 'Failed');
      logEvent('followup.exception', { action, message: err?.message || err });
    } finally {
      setFollowupRunning(null);
    }
  };

  const handleRecordSelect = (row: ListItem, fullRecord?: WebFormSubmission) => {
    const sourceRecord = fullRecord || listCache.records[row.id] || null;
    setSelectedRecordId(row.id);
    setFollowupMessage(null);
    setStatus(null);
    setStatusLevel(null);
    if (sourceRecord) {
      const normalized = normalizeRecordValues(definition, sourceRecord.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const { values: mappedValues, lineItems: mappedLineItems } = applyValueMapsToForm(
        definition,
        normalized,
        initialLineItems
      );
      setValues(mappedValues);
      setLineItems(mappedLineItems);
      setErrors({});
      setSelectedRecordSnapshot(sourceRecord);
      setLastSubmissionMeta({
        id: sourceRecord.id,
        createdAt: sourceRecord.createdAt,
        updatedAt: sourceRecord.updatedAt,
        status: sourceRecord.status || null
      });
    } else {
      setSelectedRecordSnapshot(null);
    }
    setView('summary');
  };

  const currentRecord = selectedRecordSnapshot || (selectedRecordId ? listCache.records[selectedRecordId] : null);

  const renderLineSummaryTable = (group: WebQuestionDefinition) => {
    const rows = lineItems[group.id] || [];
    if (!rows.length) return <div className="muted">No line items captured.</div>;
    const selector = group.lineItemConfig?.sectionSelector;
    const fieldColumns = (group.lineItemConfig?.fields || [])
      .filter(field => field.id !== 'ITEM_FILTER' && field.id !== selector?.id)
      .map(field => ({
        id: field.id,
        label: resolveFieldLabel(field, language, field.id),
        getValue: (row: LineItemRowState) => row.values[field.id],
        tooltipKey: optionKey(field.id, group.id)
      }));

    const renderSubgroups = () => {
      const subGroups = group.lineItemConfig?.subGroups || [];
      if (!subGroups.length) return null;
      return subGroups.map(sub => {
        const subKeyId = resolveSubgroupKey(sub);
        if (!subKeyId) return null;
        const subSelector = sub.sectionSelector;
        const parentAnchorId = group.lineItemConfig?.anchorFieldId;
        const parentAnchorLabel = parentAnchorId
          ? resolveFieldLabel(
              group.lineItemConfig?.fields?.find(f => f.id === parentAnchorId) || { labelEn: 'Parent', id: 'parent' },
              language,
              parentAnchorId
            )
          : 'Parent';
        const subColumns =
          (sub.fields || [])
            .filter(field => field.id !== 'ITEM_FILTER' && field.id !== subSelector?.id)
            .map(field => ({
              id: field.id,
              label: resolveFieldLabel(field, language, field.id),
              getValue: (row: LineItemRowState) => row.values[field.id]
            })) || [];
        const parentTables = rows
          .map(parent => {
            const key = buildSubgroupKey(group.id, parent.id, subKeyId);
            const childRows = lineItems[key] || [];
            if (!childRows.length) return null;
            const parentLabel = parentAnchorId
              ? formatFieldValue(parent.values[parentAnchorId])
              : parent.id;
            return (
              <div key={key} style={{ marginTop: 8 }}>
                <div className="muted" style={{ marginBottom: 4, fontWeight: 600, wordBreak: 'break-word' }}>
                  {parentAnchorLabel}: {parentLabel}
                </div>
                <div className="line-summary-table">
                  <table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        {subColumns.map(col => (
                          <th
                            key={col.id}
                            style={{
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              maxWidth: `${Math.max(14, Math.floor(100 / Math.max(1, subColumns.length)))}%`
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {childRows.map(child => (
                        <tr key={child.id}>
                          {subColumns.map(col => {
                            const tooltipKey = optionKey(col.id, key);
                            const tooltipText = resolveTooltipText(tooltipState, optionState, tooltipKey, col.getValue(child));
                            const tooltipLabel = (sub.fields || []).find(f => f.id === col.id)?.dataSource?.tooltipLabel;
                            const localizedLabel = resolveLocalizedString(tooltipLabel, language, col.label);
                            return (
                              <td key={col.id} style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {renderValueWithTooltip(col.getValue(child), tooltipText, localizedLabel, true)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
          .filter(Boolean);
        if (!parentTables.length) return null;

        return (
          <div key={subKeyId} style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontWeight: 600, marginBottom: 6 }}>
              {resolveLocalizedString(sub.label, language, subKeyId)}
            </div>
            {parentTables}
          </div>
        );
      });
    };

    return (
      <div className="line-summary-table">
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              {fieldColumns.map(col => (
                <th
                  key={col.id}
                  style={{ wordBreak: 'break-word', whiteSpace: 'normal', maxWidth: `${Math.max(18, Math.floor(100 / Math.max(1, fieldColumns.length)))}%` }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {fieldColumns.map(col => {
                  const tooltipText = resolveTooltipText(tooltipState, optionState, col.tooltipKey, col.getValue(row));
                  const tooltipLabel =
                    definition.questions.find(q => q.id === group.id)?.lineItemConfig?.fields?.find(f => f.id === col.id)
                      ?.dataSource?.tooltipLabel;
                  const localizedLabel = resolveLocalizedString(tooltipLabel, language, col.label);
                  return (
                    <td key={col.id} style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      {renderValueWithTooltip(col.getValue(row), tooltipText, localizedLabel, true)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {renderSubgroups()}
      </div>
    );
  };

  return (
    <div className="page">
      <header>
        <h1>{definition.title || 'Form'}</h1>
        <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>Build: {BUILD_MARKER}</div>
        <div className="controls">
          <label>
            Language:
            <select value={language} onChange={e => setLanguage(normalizeLanguage(e.target.value))}>
              {(definition.languages || ['EN']).map(lang => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
          <div className="tabs">
            {(['form', 'summary', 'list', 'followup'] as View[]).map(v => (
              <button key={v} className={view === v ? 'active' : ''} type="button" onClick={() => setView(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {view === 'form' && (
        <>
          <FormView
            definition={definition}
            language={language}
            values={values}
            setValues={setValues}
            lineItems={lineItems}
            setLineItems={setLineItems}
            onSubmit={handleSubmit}
            submitting={submitting}
            errors={errors}
            setErrors={setErrors}
            status={status}
            statusTone={statusLevel}
            onStatusClear={clearStatus}
            optionState={optionState}
            setOptionState={setOptionState}
            ensureOptions={ensureOptions}
            ensureLineOptions={(groupId, field) => {
              const key = optionKey(field.id, groupId);
              if (optionState[key]) return;
              if (field.dataSource) {
                loadOptionsFromDataSource(field.dataSource, language).then(res => {
                  if (res) {
                    setOptionState(prev => ({ ...prev, [key]: res }));
                    if (res.tooltips) {
                      setTooltipState(prev => ({ ...prev, [key]: res.tooltips || {} }));
                    }
                  }
                });
              }
            }}
            onSelectionEffect={runSelectionEffects}
            onDiagnostic={logEvent}
          />
        </>
      )}

      {view === 'summary' && (
        <div className="card">
          <h3>Submission summary</h3>
          <p className="muted" style={{ marginTop: -4 }}>
            Review the captured values and optionally jump to follow-up actions or start a fresh entry.
          </p>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              margin: '16px 0'
            }}
          >
            <div>
              <div className="muted">Record ID</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontWeight: 600 }}>
                {summaryRecordId || 'Pending'}
                {summaryRecordId && (
                  <button type="button" className="secondary" onClick={handleCopyRecordId}>
                    Copy
                  </button>
                )}
              </div>
              {copyFeedback && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {copyFeedback}
                </div>
              )}
            </div>
            <div>
              <div className="muted">Created</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{formatDateTime(lastSubmissionMeta?.createdAt)}</div>
            </div>
            <div>
              <div className="muted">Last updated</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{formatDateTime(lastSubmissionMeta?.updatedAt)}</div>
            </div>
            <div>
              <div className="muted">Status</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{lastSubmissionMeta?.status || '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" onClick={() => setView('followup')} disabled={!summaryRecordId}>
              Go to follow-up
            </button>
            <button type="button" className="secondary" onClick={handleSubmitAnother}>
              Submit another
            </button>
          </div>
          <hr />
          {definition.questions.map(q => {
            if (q.type === 'LINE_ITEM_GROUP') {
              return (
                <div key={q.id} className="field">
                  <div className="muted">{resolveLabel(q, language)}</div>
                  {renderLineSummaryTable(q)}
                </div>
              );
            }
            const value = values[q.id];
            if (Array.isArray(value)) {
              const tooltipText = resolveTooltipText(tooltipState, optionState, optionKey(q.id), value);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, resolveLabel(q, language));
              return (
                <div key={q.id} className="field">
                  <div className="muted">{resolveLabel(q, language)}</div>
                  {value.length ? (
                    <div>{renderValueWithTooltip(value, tooltipText, tooltipLabel, true)}</div>
                  ) : (
                    <div className="muted">No response</div>
                  )}
                </div>
              );
            }
            const tooltipText = resolveTooltipText(tooltipState, optionState, optionKey(q.id), value);
            const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, resolveLabel(q, language));
            const showParagraphStyle =
              q.type === 'PARAGRAPH'
                ? {
                    whiteSpace: 'pre-wrap' as const,
                    lineHeight: 1.5
                  }
                : undefined;
            return (
              <div key={q.id} className="field">
                <div className="muted">{resolveLabel(q, language)}</div>
                {value === undefined || value === null || value === '' ? (
                  <div className="muted">No response</div>
                ) : (
                  <div style={showParagraphStyle}>
                    {renderValueWithTooltip(value, tooltipText, tooltipLabel, true)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {view === 'list' && (
        <ListView
          formKey={formKey}
          definition={definition}
          language={language}
          cachedResponse={listCache.response}
          cachedRecords={listCache.records}
          refreshToken={listRefreshToken}
          onCache={({ response, records }) => {
            setListCache(prev => ({
              response,
              records: { ...prev.records, ...records }
            }));
          }}
          onSelect={handleRecordSelect}
        />
      )}

      {view === 'followup' && (
        <FollowupView
          recordId={selectedRecordId}
          onRun={handleRunFollowup}
          followupConfig={definition.followup}
          resultMessage={followupMessage}
          runningAction={followupRunning}
          recordStatus={currentRecord?.status || lastSubmissionMeta?.status || null}
          lastUpdated={currentRecord?.updatedAt || lastSubmissionMeta?.updatedAt || null}
          pdfUrl={currentRecord?.pdfUrl}
        />
      )}
    </div>
  );
};

export default App;

