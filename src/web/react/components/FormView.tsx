import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
  validateRules,
  computeTotals,
  loadOptionsFromDataSource,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../core';
import { resolveLocalizedString } from '../../i18n';
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  LineItemSelectorConfig,
  OptionSet,
  OptionFilter,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { FormErrors, LineItemState, OptionState } from '../types';
import { isEmptyValue, toFileArray } from '../utils/values';

interface LineOverlayState {
  open: boolean;
  options: { value: string; label: string }[];
  groupId?: string;
  anchorFieldId?: string;
  selected?: string[];
}

interface SubgroupOverlayState {
  open: boolean;
  subKey?: string;
}

interface InfoOverlayState {
  open: boolean;
  title?: string;
  text?: string;
}

// keep context ids consistent with App.tsx so auto-generated rows from selection effects
// can be reconciled when loading existing records
const buildLineContextId = (groupId: string, rowId: string, fieldId?: string) => `${groupId}::${rowId}::${fieldId || 'field'}`;
const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string) =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

const parseSubgroupKey = (key: string): { parentGroupId: string; parentRowId: string; subGroupId: string } | null => {
  const parts = key.split('::');
  if (parts.length !== 3) return null;
  return { parentGroupId: parts[0], parentRowId: parts[1], subGroupId: parts[2] };
};

const resolveSubgroupKey = (sub?: { id?: string; label?: any }): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  if (typeof sub.label === 'string') return sub.label;
  return sub.label?.en || sub.label?.fr || sub.label?.nl || '';
};

const seedSubgroupDefaults = (
  lineItems: LineItemState,
  group: WebQuestionDefinition,
  parentRowId: string
): LineItemState => {
  if (!group.lineItemConfig?.subGroups?.length) return lineItems;
  let next = lineItems;
  group.lineItemConfig.subGroups.forEach(sub => {
    const subKeyRaw =
      sub.id ||
      (typeof sub.label === 'string' ? sub.label : sub.label?.en || sub.label?.fr || sub.label?.nl) ||
      '';
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

type StatusTone = 'info' | 'success' | 'error';

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
};

const InfoTooltip: React.FC<{
  text?: string;
  label?: string;
  onOpen?: (title: string, text: string) => void;
}> = ({ text, label, onOpen }) => {
  if (!text) return null;
  const normalizedLabel = (label || '').trim();
  const title = normalizedLabel || 'Info';
  const buttonText = normalizedLabel || 'i';
  return (
      <button
        type="button"
      className="info-button"
      onClick={() => onOpen?.(title, text)}
      aria-label={`Open ${title}`}
    >
      {buttonText}
      </button>
  );
};

const RequiredStar = () => (
  <span className="required-star" aria-hidden="true" style={{ marginLeft: 4 }}>
    *
  </span>
);

const resolveSelectorLabel = (selector: LineItemSelectorConfig, language: LangCode): string => {
  if (!selector) return '';
  if (language === 'FR') return selector.labelFr || selector.labelEn || selector.id;
  if (language === 'NL') return selector.labelNl || selector.labelEn || selector.id;
  return selector.labelEn || selector.id;
};

const buildSelectorOptionSet = (selector?: LineItemSelectorConfig | null): OptionSet | null => {
  if (!selector) return null;
  const base = selector.options || [];
  return {
    en: base,
    fr: selector.optionsFr && selector.optionsFr.length ? selector.optionsFr : base,
    nl: selector.optionsNl && selector.optionsNl.length ? selector.optionsNl : base
  };
};

const hasSelectionEffects = (field: any): boolean =>
  Array.isArray(field?.selectionEffects) && field.selectionEffects.length > 0;

const getSelectionEffects = (field: any): any[] =>
  Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];

const selectionEffectDependsOnField = (field: any, targetFieldId: string): boolean => {
  return getSelectionEffects(field).some(effect => {
    if (!effect) return false;
    if (effect.rowMultiplierFieldId && effect.rowMultiplierFieldId === targetFieldId) {
      return true;
    }
    if (effect.lineItemMapping) {
      return Object.values(effect.lineItemMapping).some(value => {
        if (typeof value !== 'string' || !value.startsWith('$row.')) return false;
        const referencedField = value.slice(5).split('.')[0];
        return referencedField === targetFieldId;
      });
    }
    return false;
  });
};

const isLineRowComplete = (group: WebQuestionDefinition, rowValues: Record<string, FieldValue>): boolean => {
  const fields = group.lineItemConfig?.fields || [];
  return fields.every(field => {
    if (!field.required) return true;
    const val = rowValues[field.id];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim() !== '';
    return val !== undefined && val !== null;
  });
};

interface FormViewProps {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  onSubmit: () => Promise<void>;
  onBack: () => void;
  submitting: boolean;
  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  status?: string | null;
  statusTone?: StatusTone | null;
  onStatusClear?: () => void;
  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  ensureOptions: (q: WebQuestionDefinition) => void;
  ensureLineOptions: (groupId: string, field: any) => void;
  onSelectionEffect?: (
    q: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    }
  ) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}
const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeExtensions = (extensions?: string[]) =>
  (extensions || []).map(ext => {
    const trimmed = ext.trim();
    return (trimmed.startsWith('.') ? trimmed.slice(1) : trimmed).toLowerCase();
  });

const resolveValueMapValue = (
  valueMap: OptionFilter,
  getValue: (fieldId: string) => FieldValue
): string => {
  if (!valueMap?.optionMap || !valueMap.dependsOn) return '';
  const dependsOn = Array.isArray(valueMap.dependsOn) ? valueMap.dependsOn : [valueMap.dependsOn];
  const depValues = dependsOn.map(dep => toDependencyValue(getValue(dep)) ?? '');
  const candidateKeys: string[] = [];
  if (depValues.length > 1) candidateKeys.push(depValues.join('||'));
  depValues.filter(Boolean).forEach(v => candidateKeys.push(v.toString()));
  candidateKeys.push('*');
  const matchKey = candidateKeys.find(key => valueMap.optionMap[key] !== undefined);
  const values = (matchKey ? valueMap.optionMap[matchKey] : []) || [];
  const unique = Array.from(new Set(values.map(v => (v ?? '').toString().trim()).filter(Boolean)));
  return unique.join(', ');
};

const resolveDerivedValue = (
  config: any,
  getter: (fieldId: string) => FieldValue
): FieldValue => {
  if (!config) return undefined;
  if (config.op === 'addDays') {
    const base = getter(config.dependsOn);
    if (!base) return '';
    const baseDate = new Date(base as any);
    if (isNaN(baseDate.getTime())) return '';
    const offset = typeof config.offsetDays === 'number' ? config.offsetDays : Number(config.offsetDays || 0);
    const result = new Date(baseDate);
    result.setDate(result.getDate() + (isNaN(offset) ? 0 : offset));
    return result.toISOString().slice(0, 10);
  }
  return undefined;
};

const applyUploadConstraints = (
  question: WebQuestionDefinition,
  existing: File[],
  incoming: File[]
): { files: File[]; errorMessage?: string } => {
  if (!incoming.length) {
    return { files: existing };
  }
  const maxFiles = question.uploadConfig?.maxFiles;
  const allowedExtensions = normalizeExtensions(question.uploadConfig?.allowedExtensions);
  const maxBytes = question.uploadConfig?.maxFileSizeMb ? question.uploadConfig.maxFileSizeMb * 1024 * 1024 : undefined;
  const next = [...existing];
  const errors: string[] = [];
  incoming.forEach(file => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (allowedExtensions.length && !allowedExtensions.includes(ext)) {
      errors.push(`${file.name} is not an allowed file type.`);
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      errors.push(`${file.name} exceeds ${question.uploadConfig?.maxFileSizeMb} MB.`);
      return;
    }
    if (maxFiles && next.length >= maxFiles) {
      errors.push(`Maximum of ${maxFiles} file${maxFiles > 1 ? 's' : ''} reached.`);
      return;
    }
    next.push(file);
  });
  return { files: next, errorMessage: errors.join(' ') || undefined };
};

const applyValueMapsToLineRow = (
  fields: any[],
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): Record<string, FieldValue> => {
  const nextValues = { ...rowValues };
  fields
    .filter(field => field?.valueMap || field?.derivedValue)
    .forEach(field => {
      if (field.valueMap) {
        const computed = resolveValueMapValue(field.valueMap, fieldId => {
          if (fieldId === undefined || fieldId === null) return undefined;
          if (rowValues.hasOwnProperty(fieldId)) return nextValues[fieldId];
          return topValues[fieldId];
        });
        nextValues[field.id] = computed;
      }
      if (field.derivedValue) {
        const derived = resolveDerivedValue(field.derivedValue, fid => {
          if (fid === undefined || fid === null) return undefined;
          if (rowValues.hasOwnProperty(fid)) return nextValues[fid];
          return topValues[fid];
        });
        if (derived !== undefined) nextValues[field.id] = derived;
      }
    });
  return nextValues;
};

const applyValueMapsToForm = (
  definition: WebFormDefinition,
  currentValues: Record<string, FieldValue>,
  currentLineItems: LineItemState
): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let values = { ...currentValues };
  let lineItems = { ...currentLineItems };

  definition.questions.forEach(q => {
    if (q.valueMap) {
      values[q.id] = resolveValueMapValue(q.valueMap, fieldId => values[fieldId]);
    }
    if ((q as any).derivedValue) {
      const derived = resolveDerivedValue((q as any).derivedValue, fieldId => values[fieldId]);
      if (derived !== undefined) values[q.id] = derived;
    }
    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const updatedRows = rows.map(row => ({
        ...row,
        values: applyValueMapsToLineRow(q.lineItemConfig!.fields, row.values, values)
      }));
      lineItems = { ...lineItems, [q.id]: updatedRows };
    }
  });

  return { values, lineItems };
};

const FormView: React.FC<FormViewProps> = ({
  definition,
  language,
  values,
  setValues,
  lineItems,
  setLineItems,
  onSubmit,
  onBack,
  submitting,
  errors,
  setErrors,
  status,
  statusTone,
  onStatusClear,
  optionState,
  setOptionState,
  ensureOptions,
  ensureLineOptions,
  onSelectionEffect,
  onDiagnostic
}) => {
  const ROW_SOURCE_KEY = '__ckRowSource';
  const [overlay, setOverlay] = useState<LineOverlayState>({ open: false, options: [], selected: [] });
  const [subgroupOverlay, setSubgroupOverlay] = useState<SubgroupOverlayState>({ open: false });
  const [infoOverlay, setInfoOverlay] = useState<InfoOverlayState>({ open: false });
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<string | null>(null);
  const [subgroupSelectors, setSubgroupSelectors] = useState<Record<string, string>>({});
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});
  const subgroupBottomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const subgroupPrevCountsRef = useRef<Record<string, number>>({});
  const statusRef = useRef<HTMLDivElement | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragState, setDragState] = useState<Record<string, boolean>>({});
  const dragCounterRef = useRef<Record<string, number>>({});
  const [uploadAnnouncements, setUploadAnnouncements] = useState<Record<string, string>>({});
  const firstErrorRef = useRef<string | null>(null);
  const errorNavRequestRef = useRef(0);
  const errorNavConsumedRef = useRef(0);

  const closeSubgroupOverlay = useCallback(() => {
    setSubgroupOverlay({ open: false });
    onDiagnostic?.('subgroup.overlay.close');
  }, [onDiagnostic]);

  const openSubgroupOverlay = useCallback(
    (subKey: string) => {
      if (!subKey) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setSubgroupOverlay({ open: true, subKey });
      onDiagnostic?.('subgroup.overlay.open', { subKey });
    },
    [onDiagnostic, overlay.open]
  );

  const closeInfoOverlay = useCallback(() => {
    setInfoOverlay({ open: false });
    onDiagnostic?.('tooltip.overlay.close');
  }, [onDiagnostic]);

  const openInfoOverlay = useCallback(
    (title: string, text: string) => {
      if (!text) return;
      if (submitting) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setInfoOverlay({ open: true, title, text });
      onDiagnostic?.('tooltip.overlay.open', { title });
    },
    [onDiagnostic, overlay.open, submitting]
  );

  useEffect(() => {
    if (!pendingScrollAnchor) return;
    if (typeof document === 'undefined') return;
    const anchor = pendingScrollAnchor;
    let cancelled = false;
    let tries = 0;
    const maxTries = 20;
    const attempt = () => {
      if (cancelled) return false;
      const el = document.querySelector(`[data-row-anchor="${anchor}"]`) as HTMLElement | null;
      if (!el) return false;
      // Prefer scrolling the nearest scroll container, because scrollIntoView can be inconsistent in sandboxed iframes.
      const overlayRoot = el.closest('.webform-overlay');
      const overlayScroller = overlayRoot
        ? (overlayRoot.querySelector('[data-overlay-scroll-container="true"]') as HTMLElement | null)
        : null;
      if (overlayScroller) {
        const containerRect = overlayScroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const delta = elRect.top - containerRect.top;
        const target =
          overlayScroller.scrollTop + delta - overlayScroller.clientHeight / 2 + elRect.height / 2;
        overlayScroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      } else {
        const scrollingEl = (document.scrollingElement || document.documentElement) as HTMLElement | null;
        if (scrollingEl) {
          const rect = el.getBoundingClientRect();
          const offset = 120; // account for sticky header and breathing room
          const top = scrollingEl.scrollTop + rect.top - offset;
          scrollingEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      const focusable = el.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ) as HTMLElement | null;
      try {
        focusable?.focus();
      } catch (_) {
        // ignore focus failures
      }
      return true;
    };
    const schedule = () => {
      if (cancelled) return;
      if (attempt()) {
        setPendingScrollAnchor(null);
        onDiagnostic?.('ui.autoscroll.success', { anchor, tries });
        return;
      }
      tries += 1;
      if (tries >= maxTries) {
        setPendingScrollAnchor(null);
        onDiagnostic?.('ui.autoscroll.miss', { anchor, tries });
        return;
      }
      setTimeout(schedule, 50);
    };
    onDiagnostic?.('ui.autoscroll.request', { anchor });
    requestAnimationFrame(schedule);
    return () => {
      cancelled = true;
    };
  }, [onDiagnostic, pendingScrollAnchor]);

  useEffect(() => {
    const anyOpen = subgroupOverlay.open || infoOverlay.open;
    if (!anyOpen) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (infoOverlay.open) {
          closeInfoOverlay();
          return;
        }
        closeSubgroupOverlay();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeInfoOverlay, closeSubgroupOverlay, infoOverlay.open, subgroupOverlay.open]);
  useEffect(() => {
    if (status && statusRef.current) {
      try {
        statusRef.current.focus();
      } catch (_) {
        // ignore
      }
      statusRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [status]);

  const setDragActive = useCallback((questionId: string, active: boolean) => {
    setDragState(prev => {
      if (prev[questionId] === active) return prev;
      return { ...prev, [questionId]: active };
    });
  }, []);

  const incrementDrag = useCallback(
    (questionId: string) => {
      const next = (dragCounterRef.current[questionId] || 0) + 1;
      dragCounterRef.current[questionId] = next;
      setDragActive(questionId, true);
    },
    [setDragActive]
  );

  const decrementDrag = useCallback(
    (questionId: string) => {
      const next = Math.max(0, (dragCounterRef.current[questionId] || 0) - 1);
      dragCounterRef.current[questionId] = next;
      if (next === 0) {
        setDragActive(questionId, false);
      }
    },
    [setDragActive]
  );

  const resetDrag = useCallback(
    (questionId: string) => {
      dragCounterRef.current[questionId] = 0;
      setDragActive(questionId, false);
    },
    [setDragActive]
  );

  const announceUpload = useCallback((questionId: string, message: string) => {
    setUploadAnnouncements(prev => ({ ...prev, [questionId]: message }));
  }, []);

  const resetNativeFileInput = (questionId: string) => {
    const input = fileInputsRef.current[questionId];
    if (input) {
      input.value = '';
    }
  };

  // Auto-scroll when subgroup rows increase (works for inline add and overlay add)
  useEffect(() => {
    Object.entries(lineItems).forEach(([key, rows]) => {
      const info = parseSubgroupKey(key);
      if (!info) return; // only subgroups
      const prevCount = subgroupPrevCountsRef.current[key] ?? 0;
      const nextCount = Array.isArray(rows) ? rows.length : 0;
      subgroupPrevCountsRef.current[key] = nextCount;
      if (nextCount > prevCount) {
        const isCollapsed = collapsedSubgroups[key] ?? true;
        if (isCollapsed) return;
        const el = subgroupBottomRefs.current[key];
        if (!el) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
      }
    });
  }, [lineItems, collapsedSubgroups]);

  useEffect(() => {
    Object.keys(lineItems).forEach(key => {
      const rows = lineItems[key] || [];
      const prev = subgroupPrevCountsRef.current[key] || 0;
      const next = Array.isArray(rows) ? rows.length : 0;
      subgroupPrevCountsRef.current[key] = next;
      if (next > prev) {
        const isCollapsed = collapsedSubgroups[key] ?? true;
        if (!isCollapsed) {
          const el = subgroupBottomRefs.current[key];
          if (el) {
            requestAnimationFrame(() => {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }
        }
      }
    });
  }, [lineItems, collapsedSubgroups]);

  const handleFileFieldChange = (question: WebQuestionDefinition, files: File[], errorMessage?: string) => {
    if (onStatusClear) onStatusClear();
    setValues(prev => ({ ...prev, [question.id]: files as unknown as FieldValue }));
    setErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[question.id] = errorMessage;
      } else {
        delete next[question.id];
      }
      return next;
    });
  };

  const processIncomingFiles = (question: WebQuestionDefinition, incoming: File[]) => {
    if (!incoming.length) return;
    const existing = toFileArray(values[question.id]);
    const { files, errorMessage } = applyUploadConstraints(question, existing, incoming);
    handleFileFieldChange(question, files, errorMessage);
    const accepted = Math.max(0, files.length - existing.length);
    if (errorMessage) {
      announceUpload(question.id, errorMessage);
      onDiagnostic?.('upload.error', { questionId: question.id, error: errorMessage });
    } else if (accepted > 0) {
      announceUpload(
        question.id,
        `Added ${accepted} file${accepted > 1 ? 's' : ''}. ${files.length} total selected.`
      );
    } else {
      announceUpload(question.id, 'Files unchanged.');
    }
    onDiagnostic?.('upload.add', {
      questionId: question.id,
      attempted: incoming.length,
      accepted: accepted,
      total: files.length,
      error: Boolean(errorMessage)
    });
  };

  const handleFileInputChange = (question: WebQuestionDefinition, list: FileList | null) => {
    if (!list || !list.length) {
      resetNativeFileInput(question.id);
      return;
    }
    processIncomingFiles(question, Array.from(list));
    resetNativeFileInput(question.id);
  };

  const handleFileDrop = (question: WebQuestionDefinition, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!event.dataTransfer?.files?.length) return;
    processIncomingFiles(question, Array.from(event.dataTransfer.files));
    onDiagnostic?.('upload.drop', { questionId: question.id, count: event.dataTransfer.files.length });
    resetDrag(question.id);
  };

  const removeFile = (question: WebQuestionDefinition, index: number) => {
    const existing = toFileArray(values[question.id]);
    if (!existing.length) return;
    const removed = existing[index];
    const next = existing.filter((_, idx) => idx !== index);
    handleFileFieldChange(question, next);
    onDiagnostic?.('upload.remove', { questionId: question.id, removed: removed?.name, remaining: next.length });
    announceUpload(
      question.id,
      removed?.name ? `Removed ${removed.name}. ${next.length} remaining.` : `Removed file. ${next.length} remaining.`
    );
  };

  const clearFiles = (question: WebQuestionDefinition) => {
    handleFileFieldChange(question, []);
    resetDrag(question.id);
    resetNativeFileInput(question.id);
    announceUpload(question.id, 'Cleared all files.');
    onDiagnostic?.('upload.clear', { questionId: question.id });
  };

  const sanitizePreset = (input?: Record<string, any>): Record<string, any> => {
    if (!input) return {};
    const next: Record<string, any> = { ...input };
    Object.keys(next).forEach(key => {
      const v = next[key];
      if (Array.isArray(v)) {
        next[key] = v[0];
      }
    });
    return next;
  };

  const addLineItemRow = (groupId: string, preset?: Record<string, any>, rowIdOverride?: string) => {
    setLineItems(prev => {
      const subgroupInfo = parseSubgroupKey(groupId);
      const groupDef = subgroupInfo ? undefined : definition.questions.find(q => q.id === groupId);
      const current = prev[groupId] || [];

      // resolve selector for top-level or subgroup
      let selectorId: string | undefined;
      let selectorValue: FieldValue | undefined;
      if (subgroupInfo) {
        const parentDef = definition.questions.find(q => q.id === subgroupInfo.parentGroupId);
        const subDef = parentDef?.lineItemConfig?.subGroups?.find(
          s => resolveSubgroupKey(s) === subgroupInfo.subGroupId
        );
        selectorId = subDef?.sectionSelector?.id;
        selectorValue = subgroupSelectors[groupId];
      } else {
        selectorId = groupDef?.lineItemConfig?.sectionSelector?.id;
        selectorValue = selectorId && values.hasOwnProperty(selectorId) ? (values[selectorId] as FieldValue) : undefined;
      }

      const rowValues: Record<string, FieldValue> = sanitizePreset(preset);
      if (selectorId && selectorValue !== undefined && selectorValue !== null && rowValues[selectorId] === undefined) {
        rowValues[selectorId] = selectorValue;
      }
      const rowId = rowIdOverride || `${groupId}_${Math.random().toString(16).slice(2)}`;
      const row: LineItemRowState = {
        id: rowId,
        values: rowValues,
        parentId: subgroupInfo?.parentRowId,
        parentGroupId: subgroupInfo?.parentGroupId
      };
      const nextWithRow = { ...prev, [groupId]: [...current, row] };
      const nextLineItems = groupDef ? seedSubgroupDefaults(nextWithRow, groupDef, row.id) : nextWithRow;
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems);
      setValues(nextValues);
      return recomputed;
    });
  };

  const addLineItemRowManual = (groupId: string, preset?: Record<string, any>) => {
    const rowId = `${groupId}_${Math.random().toString(16).slice(2)}`;
    const subgroupInfo = parseSubgroupKey(groupId);
    if (subgroupInfo) {
      setCollapsedSubgroups(prev => ({ ...prev, [groupId]: false }));
    }
    const anchor = `${groupId}__${rowId}`;
    onDiagnostic?.('ui.addRow.manual', { groupId, rowId, anchor });
    setPendingScrollAnchor(anchor);
    addLineItemRow(groupId, { ...(preset || {}), [ROW_SOURCE_KEY]: 'manual' }, rowId);
  };

  const removeLineRow = (groupId: string, rowId: string) => {
    if (onSelectionEffect) {
      const groupQuestion = definition.questions.find(q => q.id === groupId);
      const rows = lineItems[groupId] || [];
      const targetRow = rows.find(r => r.id === rowId);
      if (groupQuestion && targetRow) {
        clearSelectionEffectsForRow(groupQuestion, targetRow);
      }
    }
    setLineItems(prev => {
      const rows = prev[groupId] || [];
      const nextLineItems: LineItemState = { ...prev, [groupId]: rows.filter(r => r.id !== rowId) };
      const subgroupKeys = Object.keys(prev).filter(key => key.startsWith(`${groupId}::${rowId}::`));
      subgroupKeys.forEach(key => {
        delete (nextLineItems as any)[key];
      });
      if (subgroupKeys.length) {
        setSubgroupSelectors(prevSel => {
          const nextSel = { ...prevSel };
          subgroupKeys.forEach(key => {
            delete (nextSel as any)[key];
          });
          return nextSel;
        });
      }
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems);
      setValues(nextValues);
      return recomputed;
    });
  };

  const clearSelectionEffectsForRow = (groupQuestion: WebQuestionDefinition, row: LineItemRowState) => {
    if (!onSelectionEffect) return;
    const effectFields = (groupQuestion.lineItemConfig?.fields || []).filter(field => Array.isArray((field as any).selectionEffects) && (field as any).selectionEffects.length);
    if (!effectFields.length) return;
    effectFields.forEach(field => {
      const contextId = buildLineContextId(groupQuestion.id, row.id, field.id);
      onSelectionEffect(field as unknown as WebQuestionDefinition, null, {
        contextId,
        lineItem: { groupId: groupQuestion.id, rowId: row.id, rowValues: row.values },
        forceContextReset: true
      });
    });
  };

  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (onStatusClear) onStatusClear();
    const baseValues = { ...values, [q.id]: value };
    const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, baseValues, lineItems);
    setValues(nextValues);
    if (nextLineItems !== lineItems) {
      setLineItems(nextLineItems);
    }
    setErrors(prev => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    if (onSelectionEffect) {
      onSelectionEffect(q, value);
    }
  };

  const handleLineFieldChange = (group: WebQuestionDefinition, rowId: string, field: any, value: FieldValue) => {
    if (onStatusClear) onStatusClear();
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const nextRowValues: Record<string, FieldValue> = { ...(currentRow?.values || {}), [field.id]: value };
    const nextRows = existingRows.map(row =>
      row.id === rowId ? { ...row, values: nextRowValues } : row
    );
    let updatedLineItems: LineItemState = { ...lineItems, [group.id]: nextRows };
    const { values: nextValues, lineItems: finalLineItems } = applyValueMapsToForm(
      definition,
      values,
      updatedLineItems
    );
    setLineItems(finalLineItems);
    setValues(nextValues);
    setErrors(prev => {
      const next = { ...prev };
      delete next[`${group.id}__${field.id}__${rowId}`];
      return next;
    });
    if (onSelectionEffect) {
      const effectFields = (group.lineItemConfig?.fields || []).filter(hasSelectionEffects);
      if (effectFields.length) {
        const rowComplete = isLineRowComplete(group, nextRowValues);
        effectFields.forEach(effectField => {
          const isSourceField = effectField.id === field.id;
          const dependsOnChangedField = !isSourceField && selectionEffectDependsOnField(effectField, field.id);
          if (!isSourceField && !dependsOnChangedField) {
            return;
          }
          const contextId = buildLineContextId(group.id, rowId, effectField.id);
          const currentValue = nextRowValues[effectField.id] as FieldValue;
          const effectQuestion = effectField as unknown as WebQuestionDefinition;
          if (!isSourceField && dependsOnChangedField) {
            // Re-run effect with current value and force context reset so dependent fields (e.g., multipliers) refresh aggregates,
            // even if other fields in the row are still empty.
            onSelectionEffect(effectQuestion, currentValue ?? null, {
              contextId,
              lineItem: { groupId: group.id, rowId, rowValues: nextRowValues },
              forceContextReset: true
            });
            return;
          }
          const isClearingSource = isSourceField && isEmptyValue(value as FieldValue);
          const payloadValue = isSourceField
            ? isClearingSource
              ? null
              : currentValue ?? null
            : currentValue ?? null;
          onSelectionEffect(effectQuestion, payloadValue, {
            contextId,
            lineItem: { groupId: group.id, rowId, rowValues: nextRowValues },
            forceContextReset: true
          });
        });
      }
    }
  };

  const renderOptions = (q: WebQuestionDefinition): OptionSet => {
    ensureOptions(q);
    return optionState[optionKey(q.id)] || toOptionSet(q);
  };

  const resolveVisibilityValue = (fieldId: string): FieldValue | undefined => {
    const direct = values[fieldId];
    if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
    // scan all line item groups for the first non-empty occurrence
    for (const rows of Object.values(lineItems)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const v = (row as LineItemRowState).values[fieldId];
        if (v !== undefined && v !== null && v !== '') return v as FieldValue;
      }
    }
    return undefined;
  };

  const renderQuestion = (q: WebQuestionDefinition) => {
    const optionSet = renderOptions(q);
    const dependencyValues = (dependsOn: string | string[]) => {
      const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
      return ids.map(id => toDependencyValue(values[id]));
    };
    const firstLineValue = (groupId: string, fieldId: string): FieldValue | undefined => {
      const rows = lineItems[groupId] || [];
      for (const row of rows) {
        const v = row.values[fieldId];
        if (v !== undefined && v !== null && v !== '') return v as FieldValue;
      }
      return undefined;
    };
    const allowed = computeAllowedOptions(q.optionFilter, optionSet, dependencyValues(q.optionFilter?.dependsOn || []));
    const currentVal = values[q.id];
    const allowedWithCurrent =
      currentVal && typeof currentVal === 'string' && !allowed.includes(currentVal) ? [...allowed, currentVal] : allowed;
    const opts = buildLocalizedOptions(optionSet, allowedWithCurrent, language);
        const hidden = shouldHideField(q.visibility, {
          getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
        });
    if (hidden) return null;

    switch (q.type) {
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE':
        const mappedValue = q.valueMap ? resolveValueMapValue(q.valueMap, fieldId => values[fieldId]) : undefined;
        const inputValue = q.valueMap ? (mappedValue || '') : ((values[q.id] as string) || '');
        return (
          <div
            key={q.id}
            className="field inline-field"
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
          >
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {q.type === 'PARAGRAPH' ? (
              <textarea
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap}
              />
            ) : (
              <input
                type={q.type === 'NUMBER' ? 'number' : q.type === 'DATE' ? 'date' : 'text'}
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap}
              />
            )}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      case 'CHOICE': {
        const rawVal = values[q.id];
        const choiceValue = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        return (
          <div
            key={q.id}
            className="field inline-field"
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
          >
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <select value={choiceValue || ''} onChange={e => handleFieldChange(q, e.target.value)}>
              <option value="">Select…</option>
              {opts.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {(() => {
              const selected = opts.find(opt => opt.value === choiceValue);
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
              return <InfoTooltip text={selected?.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
            })()}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      }
      case 'CHECKBOX': {
        const selected = Array.isArray(values[q.id]) ? (values[q.id] as string[]) : [];
        return (
          <div
            key={q.id}
            className="field inline-field"
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
          >
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <div className="inline-options">
              {opts.map(opt => (
                <label key={opt.value} className="inline">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...selected, opt.value]
                        : selected.filter(v => v !== opt.value);
                      handleFieldChange(q, next);
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            {(() => {
              const withTooltips = opts.filter(opt => opt.tooltip && selected.includes(opt.value));
              if (!withTooltips.length) return null;
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
              return (
                <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {withTooltips.map(opt => (
                    <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {opt.label} <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                    </span>
                  ))}
                </div>
              );
            })()}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      }
      case 'FILE_UPLOAD': {
        const files = toFileArray(values[q.id]);
        const uploadConfig = q.uploadConfig || {};
        const allowedDisplay = (uploadConfig.allowedExtensions || []).map(ext =>
          ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
        );
        const acceptAttr = allowedDisplay.length ? allowedDisplay.join(',') : undefined;
        const maxed = uploadConfig.maxFiles ? files.length >= uploadConfig.maxFiles : false;
        const helperParts: string[] = [];
        if (uploadConfig.maxFiles) {
          helperParts.push(`${uploadConfig.maxFiles} file${uploadConfig.maxFiles > 1 ? 's' : ''} max`);
        }
        if (uploadConfig.maxFileSizeMb) {
          helperParts.push(`<= ${uploadConfig.maxFileSizeMb} MB each`);
        }
        if (allowedDisplay.length) {
          helperParts.push(`Allowed: ${allowedDisplay.join(', ')}`);
        }
        const remainingSlots =
          uploadConfig.maxFiles && uploadConfig.maxFiles > files.length
            ? `${uploadConfig.maxFiles - files.length} slot${uploadConfig.maxFiles - files.length > 1 ? 's' : ''} remaining`
            : null;
        const dragActive = !!dragState[q.id];
        const totalBytes = files.reduce((sum, file) => sum + (file?.size || 0), 0);
        const selectionLabel = files.length
          ? `${files.length} file${files.length > 1 ? 's' : ''} selected${totalBytes ? ` • ${formatFileSize(totalBytes)} total` : ''}`
          : 'No files selected yet.';
        return (
          <div
            key={q.id}
            className="field inline-field"
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
          >
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <div
              role="button"
              tabIndex={0}
              aria-disabled={maxed || submitting}
              onClick={() => {
                if (maxed || submitting) return;
                fileInputsRef.current[q.id]?.click();
              }}
              onKeyDown={e => {
                if (maxed || submitting) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputsRef.current[q.id]?.click();
                }
              }}
              onDragEnter={e => {
                e.preventDefault();
                if (submitting) return;
                incrementDrag(q.id);
              }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => {
                e.preventDefault();
                if (submitting) return;
                decrementDrag(q.id);
              }}
              onDrop={e => handleFileDrop(q, e)}
              style={{
                border: dragActive ? '2px solid #0ea5e9' : '1px dashed #94a3b8',
                borderRadius: 12,
                padding: '16px',
                background: dragActive ? '#e0f2fe' : maxed || submitting ? '#f1f5f9' : '#f8fafc',
                color: '#0f172a',
                cursor: maxed || submitting ? 'not-allowed' : 'pointer',
                marginBottom: 12,
                transition: 'border-color 120ms ease, background 120ms ease',
                boxShadow: dragActive ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none'
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {dragActive ? 'Release to upload files' : maxed ? 'Maximum files selected' : 'Drag & drop files here or click to browse'}
              </div>
              <div className="muted" style={{ marginBottom: 6 }}>
                {selectionLabel}
              </div>
              {remainingSlots && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {remainingSlots}
                </div>
              )}
            </div>
            <div style={srOnly} aria-live="polite">
              {uploadAnnouncements[q.id] || ''}
            </div>
            <input
              ref={el => {
                fileInputsRef.current[q.id] = el;
              }}
              type="file"
              multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
              accept={acceptAttr}
              style={{ display: 'none' }}
              onChange={e => handleFileInputChange(q, e.target.files)}
            />
            {files.length ? (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                {files.map((file, idx) => (
                  <li
                    key={`${file.name}-${file.size}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{file.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(q, idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted" style={{ marginBottom: 12 }}>
                You haven't selected any files.
              </div>
            )}
            {helperParts.length ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{helperParts.join(' | ')}</div>
            ) : null}
            {files.length ? (
              <button
                type="button"
                onClick={() => clearFiles(q)}
                style={{ ...buttonStyles.secondary, marginBottom: 12 }}
              >
                Clear files
              </button>
            ) : null}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      }
      case 'LINE_ITEM_GROUP': {
        const selectorCfg = q.lineItemConfig?.sectionSelector;
        const selectorOptionSet = buildSelectorOptionSet(selectorCfg);
        const selectorOptions = selectorOptionSet
          ? buildLocalizedOptions(selectorOptionSet, selectorOptionSet.en || [], language)
          : [];
        const selectorValue = selectorCfg ? ((values[selectorCfg.id] as string) || '') : '';

        const renderAddButton = () => {
          if (q.lineItemConfig?.addMode === 'overlay' && q.lineItemConfig.anchorFieldId) {
            return (
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  if (submitting) return;
                  const anchorField = (q.lineItemConfig?.fields || []).find(f => f.id === q.lineItemConfig?.anchorFieldId);
                  if (!anchorField || anchorField.type !== 'CHOICE') {
                    addLineItemRowManual(q.id);
                    return;
                  }
                  const key = optionKey(anchorField.id, q.id);
                  let opts = optionState[key];
                  if (!opts && anchorField.dataSource) {
                    const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                    if (loaded) {
                      opts = loaded;
                      setOptionState(prev => ({ ...prev, [key]: loaded }));
                    }
                  }
                  if (!opts) {
                    opts = {
                      en: anchorField.options || [],
                      fr: (anchorField as any).optionsFr || [],
                      nl: (anchorField as any).optionsNl || []
                    };
                  }
                  const dependencyIds = (
                    Array.isArray(anchorField.optionFilter?.dependsOn)
                      ? anchorField.optionFilter?.dependsOn
                      : [anchorField.optionFilter?.dependsOn || '']
                  ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                  const depVals = dependencyIds.map(dep => toDependencyValue(values[dep]));
                  const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                  const localized = buildLocalizedOptions(opts, allowed, language);
                  const deduped = Array.from(
                    new Set(localized.map(opt => opt.value).filter(Boolean))
                  );
                  setOverlay({
                    open: true,
                    options: localized
                      .filter(opt => deduped.includes(opt.value))
                      .map(opt => ({ value: opt.value, label: opt.label })),
                    groupId: q.id,
                    anchorFieldId: anchorField.id,
                    selected: []
                  });
                }}
              >
                {resolveLocalizedString(q.lineItemConfig?.addButtonLabel, language, 'Add lines')}
              </button>
            );
          }
          return (
            <button type="button" disabled={submitting} onClick={() => addLineItemRowManual(q.id)}>
              {resolveLocalizedString(q.lineItemConfig?.addButtonLabel, language, 'Add line')}
            </button>
          );
        };

        const groupTotals = computeTotals({ config: q.lineItemConfig!, rows: lineItems[q.id] || [] }, language);
        const parentRows = lineItems[q.id] || [];
        const parentCount = parentRows.length;
        const selectorControl =
          selectorCfg && selectorOptions.length ? (
            <div
              className="section-selector"
              data-field-path={selectorCfg.id}
              style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <label style={{ fontWeight: 600 }}>
                {resolveSelectorLabel(selectorCfg, language)}
                {selectorCfg.required && <RequiredStar />}
              </label>
              <select
                value={selectorValue}
                onChange={e => {
                  const nextVal = e.target.value;
                  setValues(prev => {
                    if (prev[selectorCfg.id] === nextVal) return prev;
                    return { ...prev, [selectorCfg.id]: nextVal };
                  });
                }}
              >
                <option value="">Select…</option>
                {selectorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null;
        return (
          <div key={q.id} className="card" data-field-path={q.id}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{resolveLabel(q, language)}</h3>
              <span className="pill" style={{ background: '#e2e8f0', color: '#334155' }}>
                {parentCount} item{parentCount === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                {selectorControl}
                {renderAddButton()}
              </div>
            </div>
            {parentRows.map((row, rowIdx) => {
              const groupCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => row.values[fid]
              };
              const ui = q.lineItemConfig?.ui;
              const isProgressive =
                ui?.mode === 'progressive' && Array.isArray(ui.collapsedFields) && ui.collapsedFields.length > 0;
              const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
              const collapseKey = `${q.id}::${row.id}`;
              const rowCollapsed = isProgressive ? (collapsedRows[collapseKey] ?? defaultCollapsed) : false;

              const collapsedFieldConfigs = isProgressive ? ui?.collapsedFields || [] : [];
              const collapsedLabelMap: Record<string, boolean> = {};
              const collapsedFieldOrder: string[] = [];
              collapsedFieldConfigs.forEach(cfg => {
                const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                if (!fid) return;
                collapsedFieldOrder.push(fid);
                collapsedLabelMap[fid] = cfg.showLabel !== undefined ? !!cfg.showLabel : true;
              });

              const allFields = q.lineItemConfig?.fields || [];
              const subGroups = q.lineItemConfig?.subGroups || [];
              const subIdToLabel: Record<string, string> = {};
              subGroups.forEach(sub => {
                const id = resolveSubgroupKey(sub);
                if (!id) return;
                const label = resolveLocalizedString(sub.label, language, id);
                subIdToLabel[id] = label || id;
              });
              const subIds = Object.keys(subIdToLabel);
              const fieldTriggeredSubgroupIdSet =
                !rowCollapsed && subIds.length > 0
                  ? allFields.reduce<Set<string>>((acc, field) => {
                      const effects = Array.isArray((field as any).selectionEffects)
                        ? ((field as any).selectionEffects as any[])
                        : [];
                      effects.forEach(e => {
                        const gid = e?.groupId ? e.groupId.toString() : '';
                        if (gid && subIdToLabel[gid] !== undefined) acc.add(gid);
                      });
                      return acc;
                    }, new Set<string>())
                  : new Set<string>();
              const hasFieldTriggeredSubgroup = fieldTriggeredSubgroupIdSet.size > 0;
              const fallbackSubIds =
                !rowCollapsed && subIds.length ? subIds.filter(id => !fieldTriggeredSubgroupIdSet.has(id)) : [];
              const collapsedFieldsOrdered = collapsedFieldOrder
                .map(fid => allFields.find(f => f.id === fid))
                .filter(Boolean) as any[];
              const fieldsToRenderBase =
                isProgressive && rowCollapsed
                  ? collapsedFieldsOrdered.length
                    ? collapsedFieldsOrdered
                    : allFields
                  : allFields;

              const titleFieldId = (() => {
                if (!isProgressive) return '';
                const unlabeled = (collapsedFieldConfigs || [])
                  .filter(cfg => cfg && cfg.showLabel === false)
                  .map(cfg => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
                  .filter(Boolean);
                return unlabeled.length === 1 ? unlabeled[0] : '';
              })();

              const titleField = titleFieldId ? (allFields.find(f => f.id === titleFieldId) as any) : undefined;
              const titleHidden = titleField
                ? shouldHideField(titleField.visibility, groupCtx, { rowId: row.id, linePrefix: q.id })
                : true;
              const showTitleControl = !!titleField && !titleHidden;

              const fieldsToRender = showTitleControl
                ? fieldsToRenderBase.filter((f: any) => f?.id !== titleFieldId)
                : fieldsToRenderBase;

              const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
              const gateResult = (() => {
                if (!isProgressive || !rowCollapsed) return { canExpand: true, reason: '' };
                if (expandGate === 'always') return { canExpand: true, reason: '' };

                const missing: string[] = [];
                const invalid: string[] = [];
                (collapsedFieldConfigs || []).forEach(cfg => {
                  const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
                  if (!fid) return;
                  const field = allFields.find(f => f.id === fid);
                  if (!field) return;
                  const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                  if (hideField) return;

                  const val = row.values[field.id];
                  if (field.required && isEmptyValue(val as any)) {
                    missing.push(field.id);
                  }

                  const rules = Array.isArray(field.validationRules)
                    ? field.validationRules.filter(r => r?.then?.fieldId === field.id)
                    : [];
                  if (rules.length) {
                    const isHidden = (fieldId: string) => {
                      const target = allFields.find(f => f.id === fieldId);
                      if (!target) return false;
                      return shouldHideField(target.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                    };
                    const ctx: any = {
                      ...groupCtx,
                      getValue: (fieldId: string) =>
                        Object.prototype.hasOwnProperty.call(row.values || {}, fieldId) ? row.values[fieldId] : values[fieldId],
                      language,
                      phase: 'submit',
                      isHidden
                    };
                    const errs = validateRules(rules, ctx);
                    if (errs.length) {
                      invalid.push(field.id);
                    }
                  }
                });

                const blocked = Array.from(new Set([...missing, ...invalid]));
                if (!blocked.length) return { canExpand: true, reason: '' };
                return { canExpand: false, reason: `Complete required fields to expand: ${blocked.join(', ')}` };
              })();
              const canExpand = gateResult.canExpand;
              const rowHasError = errorIndex.rowErrors.has(collapseKey);
              return (
                <div
                  key={row.id}
                  className="line-item-row"
                  data-row-anchor={`${q.id}__${row.id}`}
                  style={{
                    background:
                      isProgressive && rowCollapsed && !canExpand
                        ? '#f1f5f9'
                        : rowIdx % 2 === 0
                        ? '#ffffff'
                        : '#f8fafc',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    outline: rowHasError ? '3px solid rgba(239, 68, 68, 0.55)' : undefined,
                    outlineOffset: 2,
                    marginBottom: 10
                  }}
                >
                  {isProgressive ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        {showTitleControl && titleField ? (
                          <div style={{ maxWidth: 420 }}>
                            {(() => {
                              ensureLineOptions(q.id, titleField);
                              const errorKey = `${q.id}__${titleField.id}__${row.id}`;
                              const hideLabel = true;
                              const labelStyle = hideLabel ? srOnly : undefined;
                              const triggeredSubgroupIds = (() => {
                                if (rowCollapsed) return [] as string[];
                                if (!subIds.length) return [] as string[];
                                const effects = Array.isArray((titleField as any).selectionEffects)
                                  ? ((titleField as any).selectionEffects as any[])
                                  : [];
                                const hits = effects
                                  .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                                  .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                                return Array.from(new Set(hits));
                              })();
                              const subgroupTriggerButtons =
                                triggeredSubgroupIds.length && !rowCollapsed ? (
                                  <div>
                                    {triggeredSubgroupIds.map(subId => {
                                      const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                                      const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                                      return (
                                        <button
                                          key={subId}
                                          type="button"
                                          style={{
                                            ...buttonStyles.secondary,
                                            borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                                            background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                                          }}
                                          onClick={() => openSubgroupOverlay(fullSubKey)}
                                        >
                                          Open {subIdToLabel[subId] || subId}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null;

                              if (titleField.type === 'CHOICE') {
                                const optionSetField: OptionSet =
                                  optionState[optionKey(titleField.id, q.id)] || {
                                    en: titleField.options || [],
                                    fr: (titleField as any).optionsFr || [],
                                    nl: (titleField as any).optionsNl || []
                                  };
                                const dependencyIds = (
                                  Array.isArray(titleField.optionFilter?.dependsOn)
                                    ? titleField.optionFilter?.dependsOn
                                    : [titleField.optionFilter?.dependsOn || '']
                                ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  titleField.optionFilter,
                                  optionSetField,
                                  dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                                );
                                const rawVal = row.values[titleField.id];
                                const choiceVal =
                                  Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                const allowedWithCurrent =
                                  choiceVal && typeof choiceVal === 'string' && !allowedField.includes(choiceVal)
                                    ? [...allowedField, choiceVal]
                                    : allowedField;
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language);
                                return (
                                  <div
                                    className="field inline-field"
                                    style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                    data-field-path={errorKey}
                                    data-has-error={errors[errorKey] ? 'true' : undefined}
                                  >
                                    <label style={labelStyle}>
                                      {resolveFieldLabel(titleField, language, titleField.id)}
                                      {titleField.required && <RequiredStar />}
                                    </label>
                                    <select
                                      value={choiceVal || ''}
                                      onChange={e => handleLineFieldChange(q, row.id, titleField, e.target.value)}
                                    >
                                      <option value="">Select…</option>
                                      {optsField.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    {subgroupTriggerButtons}
                                    {(() => {
                                      const selected = optsField.find(opt => opt.value === choiceVal);
                                      if (!selected?.tooltip) return null;
                                      const fallbackLabel = resolveFieldLabel(titleField, language, titleField.id);
                                      const tooltipLabel = resolveLocalizedString(
                                        titleField.dataSource?.tooltipLabel,
                                        language,
                                        fallbackLabel
                                      );
                                      return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
                                    })()}
                                    {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                  </div>
                                );
                              }

                              if (titleField.type === 'CHECKBOX') {
                                const optionSetField: OptionSet =
                                  optionState[optionKey(titleField.id, q.id)] || {
                                    en: titleField.options || [],
                                    fr: (titleField as any).optionsFr || [],
                                    nl: (titleField as any).optionsNl || []
                                  };
                                const dependencyIds = (
                                  Array.isArray(titleField.optionFilter?.dependsOn)
                                    ? titleField.optionFilter?.dependsOn
                                    : [titleField.optionFilter?.dependsOn || '']
                                ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  titleField.optionFilter,
                                  optionSetField,
                                  dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                                );
                                const selected = Array.isArray(row.values[titleField.id]) ? (row.values[titleField.id] as string[]) : [];
                                const allowedWithSelected = selected.reduce((acc, val) => {
                                  if (val && !acc.includes(val)) acc.push(val);
                                  return acc;
                                }, [...allowedField]);
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language);
                                return (
                                  <div
                                    className="field inline-field"
                                    style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                    data-field-path={errorKey}
                                    data-has-error={errors[errorKey] ? 'true' : undefined}
                                  >
                                    <label style={labelStyle}>
                                      {resolveFieldLabel(titleField, language, titleField.id)}
                                      {titleField.required && <RequiredStar />}
                                    </label>
                                    <div className="inline-options">
                                      {optsField.map(opt => (
                                        <label key={opt.value} className="inline">
                                          <input
                                            type="checkbox"
                                            checked={selected.includes(opt.value)}
                                            onChange={e => {
                                              const next = e.target.checked
                                                ? [...selected, opt.value]
                                                : selected.filter(v => v !== opt.value);
                                              handleLineFieldChange(q, row.id, titleField, next);
                                            }}
                                          />
                                          <span>{opt.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                    {subgroupTriggerButtons}
                                    {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                  </div>
                                );
                              }

                              const mapped = titleField.valueMap
                                ? resolveValueMapValue(titleField.valueMap, fid => {
                                    if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                    return values[fid];
                                  })
                                : undefined;
                              const fieldValue = titleField.valueMap ? mapped : (row.values[titleField.id] as string) || '';
                              return (
                                <div
                                  className="field inline-field"
                                  style={{ border: 'none', padding: 0, background: 'transparent', margin: 0 }}
                                  data-field-path={errorKey}
                                  data-has-error={errors[errorKey] ? 'true' : undefined}
                                >
                                  <label style={labelStyle}>
                                    {resolveFieldLabel(titleField, language, titleField.id)}
                                    {titleField.required && <RequiredStar />}
                                  </label>
                                  <input
                                    type={
                                      titleField.type === 'NUMBER'
                                        ? 'number'
                                        : titleField.type === 'DATE'
                                        ? 'date'
                                        : 'text'
                                    }
                                    value={fieldValue}
                                    onChange={e => handleLineFieldChange(q, row.id, titleField, e.target.value)}
                                    readOnly={!!titleField.valueMap}
                                  />
                                  {subgroupTriggerButtons}
                                  {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                        {rowCollapsed && !canExpand ? (
                          <div
                            className="muted"
                            style={{ fontSize: 12, fontWeight: 600, color: rowHasError ? '#b42318' : undefined }}
                          >
                            {rowHasError ? 'Needs attention · ' : ''}
                            Fill the collapsed fields to unlock expand.
                          </div>
                        ) : null}
                      </div>
                      <div className="muted" style={{ fontSize: 12, fontWeight: 600, color: rowHasError ? '#b42318' : undefined }}>
                        Row {rowIdx + 1}
                        {rowHasError ? ' · Needs attention' : ''}
                      </div>
                    </div>
                  ) : null}
                  <div
                    className={isProgressive && rowCollapsed ? 'collapsed-fields-grid' : undefined}
                    style={
                      isProgressive && rowCollapsed
                        ? {
                            display: 'grid',
                            gridTemplateColumns:
                              fieldsToRender.length === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 12
                          }
                        : undefined
                    }
                  >
                  {fieldsToRender.map(field => {
                    ensureLineOptions(q.id, field);
                    const optionSetField: OptionSet =
                      optionState[optionKey(field.id, q.id)] || {
                        en: field.options || [],
                        fr: (field as any).optionsFr || [],
                        nl: (field as any).optionsNl || []
                      };
                    const dependencyIds = (
                      Array.isArray(field.optionFilter?.dependsOn)
                        ? field.optionFilter?.dependsOn
                        : [field.optionFilter?.dependsOn || '']
                    ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      field.optionFilter,
                      optionSetField,
                      dependencyIds.map((dep: string) => toDependencyValue(row.values[dep] ?? values[dep]))
                    );
                    const currentVal = row.values[field.id];
                    const allowedWithCurrent =
                      currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                        ? [...allowedField, currentVal]
                        : allowedField;
                    const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language);
                    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                    if (hideField) return null;
                    const errorKey = `${q.id}__${field.id}__${row.id}`;
                    const hideLabel = isProgressive && rowCollapsed && collapsedLabelMap[field.id] === false;
                    const labelStyle = hideLabel ? srOnly : undefined;
                    const triggeredSubgroupIds = (() => {
                      if (rowCollapsed) return [] as string[];
                      if (!subIds.length) return [] as string[];
                      const effects = Array.isArray((field as any).selectionEffects)
                        ? ((field as any).selectionEffects as any[])
                        : [];
                      const hits = effects
                        .map(e => (e?.groupId !== undefined && e?.groupId !== null ? e.groupId.toString() : ''))
                        .filter(gid => !!gid && subIdToLabel[gid] !== undefined);
                      return Array.from(new Set(hits));
                    })();
                    const subgroupTriggerButtons =
                      triggeredSubgroupIds.length && !rowCollapsed ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', alignSelf: 'center' }}>
                          {triggeredSubgroupIds.map(subId => {
                            const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                            const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                            return (
                              <button
                                key={subId}
                                type="button"
                                style={{
                                  ...buttonStyles.secondary,
                                  borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                                  background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                                }}
                                onClick={() => openSubgroupOverlay(fullSubKey)}
                              >
                                Open {subIdToLabel[subId] || subId}
                              </button>
                            );
                          })}
                        </div>
                      ) : null;
                    switch (field.type) {
                      case 'CHOICE': {
                        const rawVal = row.values[field.id];
                        const choiceVal =
                          Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label style={labelStyle}>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <select
                              value={choiceVal || ''}
                              onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            >
                              <option value="">Select…</option>
                              {optsField.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {subgroupTriggerButtons}
                            {(() => {
                              const selected = optsField.find(opt => opt.value === choiceVal);
                              if (!selected?.tooltip) return null;
                              const fallbackLabel = resolveFieldLabel(field, language, field.id);
                              const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                              return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
                            })()}
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                      case 'CHECKBOX': {
                        const selected = Array.isArray(row.values[field.id]) ? (row.values[field.id] as string[]) : [];
                        const allowedWithSelected = selected.reduce((acc, val) => {
                          if (val && !acc.includes(val)) acc.push(val);
                          return acc;
                        }, [...allowedField]);
                        const optsField = buildLocalizedOptions(optionSetField, allowedWithSelected, language);
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label style={labelStyle}>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <div className="inline-options">
                              {optsField.map(opt => (
                                <label key={opt.value} className="inline">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={e => {
                                      const next = e.target.checked
                                        ? [...selected, opt.value]
                                        : selected.filter(v => v !== opt.value);
                                      handleLineFieldChange(q, row.id, field, next);
                                    }}
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                            {subgroupTriggerButtons}
                            {(() => {
                              const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                              if (!withTooltips.length) return null;
                              const fallbackLabel = resolveFieldLabel(field, language, field.id);
                              const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                              return (
                                <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {withTooltips.map(opt => (
                                    <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      {opt.label} <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                      default: {
                        const mapped = field.valueMap
                          ? resolveValueMapValue(field.valueMap, fid => {
                              if (row.values.hasOwnProperty(fid)) return row.values[fid];
                              return values[fid];
                            })
                          : undefined;
                        const fieldValue = field.valueMap ? mapped : (row.values[field.id] as string) || '';
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label style={labelStyle}>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <input
                              type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                              value={fieldValue}
                              onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                              readOnly={!!field.valueMap}
                            />
                            {subgroupTriggerButtons}
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                    }
                  })}
                  </div>
                  {!rowCollapsed && fallbackSubIds.length ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fallbackSubIds.map(subId => {
                        const fullSubKey = buildSubgroupKey(q.id, row.id, subId);
                        const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
                        return (
                          <button
                            key={subId}
                            type="button"
                            style={{
                              ...buttonStyles.secondary,
                              borderColor: subHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                              background: subHasError ? '#fff7f7' : buttonStyles.secondary.background
                            }}
                            onClick={() => openSubgroupOverlay(fullSubKey)}
                          >
                            Open {subIdToLabel[subId] || subId}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div
                    className="line-actions"
                    style={
                      isProgressive
                        ? { justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
                        : undefined
                    }
                  >
                    {isProgressive ? (
                      <button
                        type="button"
                        aria-expanded={!rowCollapsed}
                        aria-disabled={rowCollapsed && !canExpand}
                        title={rowCollapsed && !canExpand ? gateResult.reason : undefined}
                        onClick={() => {
                          if (rowCollapsed && !canExpand) {
                            onDiagnostic?.('edit.progressive.expand.blocked', {
                              groupId: q.id,
                              rowId: row.id,
                              reason: gateResult.reason
                            });
                            return;
                          }
                          setCollapsedRows(prev => ({ ...prev, [collapseKey]: !rowCollapsed }));
                          onDiagnostic?.('edit.progressive.toggle', { groupId: q.id, rowId: row.id, collapsed: !rowCollapsed });
                        }}
                        style={{
                          ...buttonStyles.secondary,
                          opacity: rowCollapsed && !canExpand ? 0.6 : 1,
                          borderColor: rowHasError ? '#ef4444' : buttonStyles.secondary.borderColor,
                          background: rowHasError ? '#fff7f7' : buttonStyles.secondary.background
                        }}
                      >
                        {rowCollapsed ? '▸ Expand' : '▾ Collapse'}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => removeLineRow(q.id, row.id)} style={buttonStyles.negative}>
                      Remove
                    </button>
                  </div>
                  {!isProgressive && (q.lineItemConfig?.subGroups || []).map(sub => {
                    const subLabelResolved = resolveLocalizedString(
                      sub.label,
                      language,
                      sub.id ||
                        (typeof sub.label === 'string'
                          ? sub.label
                          : sub.label?.en || sub.label?.fr || sub.label?.nl || '')
                    );
                    const subId = sub.id || subLabelResolved;
                    if (!subId) return null;
                    const subKey = buildSubgroupKey(q.id, row.id, subId);
                    const collapsed = collapsedSubgroups[subKey] ?? true;
                    const subRows = lineItems[subKey] || [];
                    const orderedSubRows = [...subRows].sort((a, b) => {
                      // keep auto-generated rows first, manual rows (no flag) at the bottom
                      const aAuto = !!a.autoGenerated;
                      const bAuto = !!b.autoGenerated;
                      if (aAuto === bAuto) return 0;
                      return aAuto ? -1 : 1;
                    });
                    const subTotals = computeTotals({ config: { ...sub, fields: sub.fields || [] }, rows: orderedSubRows }, language);
                    const subSelectorCfg = sub.sectionSelector;
                    const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
                    const subSelectorOptions = subSelectorOptionSet
                      ? buildLocalizedOptions(subSelectorOptionSet, subSelectorOptionSet.en || [], language)
                      : [];
                    const subSelectorValue = subgroupSelectors[subKey] || '';

                    const renderSubAddButton = () => {
                      if (sub.addMode === 'overlay' && sub.anchorFieldId) {
                        return (
                          <button
                            type="button"
                            onClick={async () => {
                              const anchorField = (sub.fields || []).find(f => f.id === sub.anchorFieldId);
                              if (!anchorField || anchorField.type !== 'CHOICE') {
                                addLineItemRowManual(subKey);
                                return;
                              }
                              const key = optionKey(anchorField.id, subKey);
                              let opts = optionState[key];
                              if (!opts && anchorField.dataSource) {
                                const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                                if (loaded) {
                                  opts = loaded;
                                  setOptionState(prev => ({ ...prev, [key]: loaded }));
                                }
                              }
                              if (!opts) {
                                opts = {
                                  en: anchorField.options || [],
                                  fr: (anchorField as any).optionsFr || [],
                                  nl: (anchorField as any).optionsNl || []
                                };
                              }
                              const dependencyIds = (
                                Array.isArray(anchorField.optionFilter?.dependsOn)
                                  ? anchorField.optionFilter?.dependsOn
                                  : [anchorField.optionFilter?.dependsOn || '']
                              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                              const depVals = dependencyIds.map(dep =>
                                toDependencyValue(row.values[dep] ?? values[dep] ?? subSelectorValue)
                              );
                              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
                              const localized = buildLocalizedOptions(opts, allowed, language);
                              const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
                              setOverlay({
                                open: true,
                                options: localized
                                  .filter(opt => deduped.includes(opt.value))
                                  .map(opt => ({ value: opt.value, label: opt.label })),
                                groupId: subKey,
                                anchorFieldId: anchorField.id,
                                selected: []
                              });
                            }}
                          >
                            {resolveLocalizedString(sub.addButtonLabel, language, 'Add lines')}
                          </button>
                        );
                      }
                      return (
                        <button type="button" onClick={() => addLineItemRowManual(subKey)}>
                          {resolveLocalizedString(sub.addButtonLabel, language, 'Add line')}
                        </button>
                      );
                    };
                    const subCount = orderedSubRows.length;
                    const scrollSubgroupBottom = () => {
                      const el = subgroupBottomRefs.current[subKey];
                      if (!el) return;
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                      });
                    };
                    return (
                      <div key={subKey} className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
                        <div
                          className="subgroup-header"
                          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                        >
                          <div style={{ textAlign: 'center', fontWeight: 700 }}>
                            {subLabelResolved || subId}
                            <span className="pill" style={{ marginLeft: 8, background: '#e2e8f0', color: '#334155' }}>
                              {subCount} item{subCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
                              {subSelectorCfg && (
                                <div
                                  className="section-selector"
                                  data-field-path={subSelectorCfg.id}
                                  style={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}
                                >
                                  <label style={{ fontWeight: 600 }}>
                                    {resolveSelectorLabel(subSelectorCfg, language)}
                                    {subSelectorCfg.required && <RequiredStar />}
                                  </label>
                                  <select
                                    value={subSelectorValue}
                                    onChange={e => {
                                      const nextValue = e.target.value;
                                      setSubgroupSelectors(prev => {
                                        if (prev[subKey] === nextValue) return prev;
                                        return { ...prev, [subKey]: nextValue };
                                      });
                                    }}
                                  >
                                    <option value="">Select…</option>
                                    {subSelectorOptions.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {renderSubAddButton()}
                            </div>
                            <div style={{ marginLeft: 'auto' }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedSubgroups(prev => ({
                                    ...prev,
                                    [subKey]: !(prev[subKey] ?? true)
                                  }))
                                }
                                aria-expanded={!collapsed}
                                aria-controls={`${subKey}-body`}
                                style={buttonStyles.secondary}
                              >
                                {collapsed
                                  ? resolveLocalizedString({ en: 'Show', fr: 'Afficher', nl: 'Tonen' }, language, 'Show')
                                  : resolveLocalizedString({ en: 'Hide', fr: 'Masquer', nl: 'Verbergen' }, language, 'Hide')}
                              </button>
                            </div>
                          </div>
                        </div>
                        {collapsed ? null : (
                        <div id={`${subKey}-body`}>
                        <div style={{ marginTop: 8 }}>
                        {orderedSubRows.map((subRow, subIdx) => {
                          const subCtx: VisibilityContext = {
                            getValue: fid => values[fid],
                            getLineValue: (_rowId, fid) => subRow.values[fid]
                          };
                          const subGroupDef: WebQuestionDefinition = {
                            ...(q as any),
                            id: subKey,
                            lineItemConfig: { ...(sub as any), fields: sub.fields || [], subGroups: [] }
                          };
                          const targetGroup = subGroupDef;
                          return (
                            <div
                              key={subRow.id}
                              className="line-item-row"
                              data-row-anchor={`${subKey}__${subRow.id}`}
                              style={{
                                background: subIdx % 2 === 0 ? '#ffffff' : '#f1f5f9',
                                padding: 12,
                                borderRadius: 10,
                                border: '1px solid #e5e7eb',
                                marginBottom: 10
                              }}
                            >
                              {!subRow.autoGenerated && (
                                <div style={{ marginBottom: 8 }}>
                                  <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
                                    Manual
                                  </span>
                                </div>
                              )}
                              {(sub.fields || []).map(field => {
                                ensureLineOptions(subKey, field);
                                const optionSetField: OptionSet =
                                  optionState[optionKey(field.id, subKey)] || {
                                    en: field.options || [],
                                    fr: (field as any).optionsFr || [],
                                    nl: (field as any).optionsNl || []
                                  };
                                const dependencyIds = (
                                  Array.isArray(field.optionFilter?.dependsOn)
                                    ? field.optionFilter?.dependsOn
                                    : [field.optionFilter?.dependsOn || '']
                                ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  field.optionFilter,
                                  optionSetField,
                                  dependencyIds.map(dep => {
                                    const selectorFallback =
                                      subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                                    return toDependencyValue(
                                      subRow.values[dep] ?? values[dep] ?? row.values[dep] ?? selectorFallback
                                    );
                                  })
                                );
                                const currentVal = subRow.values[field.id];
                                const allowedWithCurrent =
                                  currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                                    ? [...allowedField, currentVal]
                                    : allowedField;
                                const selectedSub = Array.isArray(subRow.values[field.id])
                                  ? (subRow.values[field.id] as string[])
                                  : null;
                                const allowedWithSelection =
                                  selectedSub && selectedSub.length
                                    ? selectedSub.reduce((acc, val) => {
                                        if (val && !acc.includes(val)) acc.push(val);
                                        return acc;
                                      }, [...allowedWithCurrent])
                                    : allowedWithCurrent;
                                const optsField = buildLocalizedOptions(optionSetField, allowedWithSelection, language);
                                const hideField = shouldHideField(field.visibility, subCtx, {
                                  rowId: subRow.id,
                                  linePrefix: subKey
                                });
                                if (hideField) return null;
                                const errorKey = `${subKey}__${field.id}__${subRow.id}`;
                                switch (field.type) {
                                  case 'CHOICE': {
                                    const rawVal = subRow.values[field.id];
                                    const choiceVal =
                                      Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                    return (
                                      <div
                                        key={field.id}
                                        className="field inline-field"
                                        data-field-path={errorKey}
                                        data-has-error={errors[errorKey] ? 'true' : undefined}
                                      >
                                        <label>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                                        <select
                                          value={choiceVal || ''}
                                          onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                        >
                                          <option value="">Select…</option>
                                          {optsField.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                        {(() => {
                                          const selected = optsField.find(opt => opt.value === choiceVal);
                                          if (!selected?.tooltip) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                          const tooltipLabel = resolveLocalizedString(
                                            field.dataSource?.tooltipLabel,
                                            language,
                                            fallbackLabel
                                          );
                                          return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
                                        })()}
                                        {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                      </div>
                                    );
                                  }
                                  case 'CHECKBOX': {
                                    const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                    return (
                                      <div
                                        key={field.id}
                                        className="field inline-field"
                                        data-field-path={errorKey}
                                        data-has-error={errors[errorKey] ? 'true' : undefined}
                                      >
                                        <label>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                                        <div className="inline-options">
                                          {optsField.map(opt => (
                                            <label key={opt.value} className="inline">
                                              <input
                                                type="checkbox"
                                                checked={selected.includes(opt.value)}
                                                onChange={e => {
                                                  const next = e.target.checked
                                                    ? [...selected, opt.value]
                                                    : selected.filter(v => v !== opt.value);
                                                  handleLineFieldChange(targetGroup, subRow.id, field, next);
                                                }}
                                              />
                                              <span>{opt.label}</span>
                                            </label>
                                          ))}
                                        </div>
                                        {(() => {
                                          const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                                          if (!withTooltips.length) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                          const tooltipLabel = resolveLocalizedString(
                                            field.dataSource?.tooltipLabel,
                                            language,
                                            fallbackLabel
                                          );
                                          return (
                                            <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                              {withTooltips.map(opt => (
                                                <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                  {opt.label}{' '}
                                                  <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                                </span>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                        {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                      </div>
                                    );
                                  }
                                  default: {
                                    const mapped = field.valueMap
                                      ? resolveValueMapValue(field.valueMap, fid => {
                                          if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                          if (row.values.hasOwnProperty(fid)) return row.values[fid];
                                          return values[fid];
                                        })
                                      : undefined;
                                    const fieldValue = field.valueMap ? mapped : (subRow.values[field.id] as string) || '';
                                    return (
                                      <div
                                        key={field.id}
                                        className="field inline-field"
                                        data-field-path={errorKey}
                                        data-has-error={errors[errorKey] ? 'true' : undefined}
                                      >
                                        <label>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                                        <input
                                          type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                                          value={fieldValue}
                                          onChange={e => handleLineFieldChange(targetGroup, subRow.id, field, e.target.value)}
                                          readOnly={!!field.valueMap}
                                        />
                                        {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                                      </div>
                                    );
                                  }
                                }
                              })}
                              <div className="line-actions">
                                <button
                                  type="button"
                                  onClick={() => removeLineRow(subKey, subRow.id)}
                                  style={buttonStyles.negative}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {orderedSubRows.length > 0 && (
                        <div
                            ref={el => {
                              subgroupBottomRefs.current[subKey] = el;
                            }}
                            className="line-item-toolbar"
                            style={{ marginTop: 12 }}
                          >
                            <div
                              className="line-item-toolbar-actions"
                              style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'flex-end',
                                flex: 1,
                                flexWrap: 'wrap',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                {subSelectorCfg && (
                                  <div className="section-selector" data-field-path={subSelectorCfg.id}>
                                    <label>
                                      {resolveSelectorLabel(subSelectorCfg, language)}
                                      {subSelectorCfg.required && <RequiredStar />}
                                    </label>
                                    <select
                                      value={subSelectorValue}
                                      onChange={e => {
                                        const nextValue = e.target.value;
                                        setSubgroupSelectors(prev => {
                                          if (prev[subKey] === nextValue) return prev;
                                          return { ...prev, [subKey]: nextValue };
                                        });
                                      }}
                                    >
                                      <option value="">Select…</option>
                                      {subSelectorOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {renderSubAddButton()}
                                {subTotals.length ? (
                                  <div className="line-item-totals">
                                    {subTotals.map(t => (
                                      <span key={t.key} className="pill">
                                        {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ marginLeft: 'auto'}}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedSubgroups(prev => ({
                                      ...prev,
                                      [subKey]: !(prev[subKey] ?? true)
                                    }))
                                  }
                                  style={buttonStyles.secondary}
                                  aria-expanded={!collapsed}
                                  aria-controls={`${subKey}-body`}
                                >
                                  {collapsed
                                    ? resolveLocalizedString({ en: 'Show', fr: 'Afficher', nl: 'Tonen' }, language, 'Show')
                                    : resolveLocalizedString({ en: 'Hide', fr: 'Masquer', nl: 'Verbergen' }, language, 'Hide')}
                                </button>
                              </div>
                            </div>
                        </div>
                        )}
                        </div>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {parentRows.length > 0 && (
              <div className="line-item-toolbar">
                {selectorCfg && (
                  <div
                    className="section-selector"
                    data-field-path={selectorCfg.id}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}
                  >
                    <label style={{ fontWeight: 600 }}>
                      {resolveSelectorLabel(selectorCfg, language)}
                      {selectorCfg.required && <RequiredStar />}
                    </label>
                    <select
                      value={selectorValue}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setValues(prev => {
                          if (prev[selectorCfg.id] === nextValue) return prev;
                          return { ...prev, [selectorCfg.id]: nextValue };
                        });
                      }}
                    >
                      <option value="">Select…</option>
                      {selectorOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="line-item-toolbar-actions">
                  {renderAddButton()}
                  {groupTotals.length ? (
                    <div className="line-item-totals">
                      {groupTotals.map(t => (
                        <span key={t.key} className="pill">
                          {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  useEffect(() => {
    const pendingDefaults: Array<{ question: WebQuestionDefinition; value: string }> = [];
    definition.questions.forEach(q => {
      if (q.type !== 'CHOICE') return;
      const optionSet = optionState[optionKey(q.id)] || toOptionSet(q);
      const allowed = computeAllowedOptions(
        q.optionFilter,
        optionSet,
        (Array.isArray(q.optionFilter?.dependsOn) ? q.optionFilter?.dependsOn : [q.optionFilter?.dependsOn || ''])
          .filter(Boolean)
          .map(dep => toDependencyValue(values[dep as string]))
      );
      const opts = buildLocalizedOptions(optionSet, allowed, language);
      if (opts.length === 1 && isEmptyValue(values[q.id]) && values[q.id] !== opts[0].value) {
        pendingDefaults.push({ question: q, value: opts[0].value });
      }
    });
    if (!pendingDefaults.length) return;
    const applied: typeof pendingDefaults = [];
    setValues(prev => {
      let changed = false;
      const next = { ...prev };
      pendingDefaults.forEach(({ question, value }) => {
        if (isEmptyValue(prev[question.id]) && prev[question.id] !== value) {
          next[question.id] = value;
          applied.push({ question, value });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ question }) => {
        if (next[question.id]) {
          delete next[question.id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ question, value }) => onSelectionEffect(question, value));
    }
  }, [definition, language, optionState, setValues, setErrors, values, onSelectionEffect]);

  useEffect(() => {
    const pendingLineDefaults: Array<{
      group: WebQuestionDefinition;
      field: any;
      rowId: string;
      value: string;
      rowValues: Record<string, FieldValue>;
    }> = [];
    definition.questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(group => {
        const rows = lineItems[group.id] || [];
        rows.forEach(row => {
          (group.lineItemConfig?.fields || [])
            .filter(field => field.type === 'CHOICE')
            .forEach(field => {
              const optionSetField: OptionSet =
                optionState[optionKey(field.id, group.id)] || {
                  en: field.options || [],
                  fr: (field as any).optionsFr || [],
                  nl: (field as any).optionsNl || []
                };
              const dependencyIds = (
                Array.isArray(field.optionFilter?.dependsOn)
                  ? field.optionFilter?.dependsOn
                  : [field.optionFilter?.dependsOn || '']
              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
              const allowedField = computeAllowedOptions(
                field.optionFilter,
                optionSetField,
                dependencyIds.map(dep => toDependencyValue(row.values[dep] ?? values[dep]))
              );
              const optsField = buildLocalizedOptions(optionSetField, allowedField, language);
              const currentValue = row.values[field.id];
              if (optsField.length === 1 && isEmptyValue(currentValue) && currentValue !== optsField[0].value) {
                pendingLineDefaults.push({
                  group,
                  field,
                  rowId: row.id,
                  value: optsField[0].value,
                  rowValues: { ...(row.values || {}), [field.id]: optsField[0].value }
                });
              }
            });
        });
      });
    if (!pendingLineDefaults.length) return;
    const applied: typeof pendingLineDefaults = [];
    setLineItems(prev => {
      let changed = false;
      const next: LineItemState = { ...prev };
      pendingLineDefaults.forEach(({ group, rowId, field, value, rowValues }) => {
        const rows = next[group.id] || prev[group.id] || [];
        const rowIdx = rows.findIndex(r => r.id === rowId);
        if (rowIdx === -1) return;
        const row = rows[rowIdx];
        if (row.values[field.id] === value) return;
        const updatedRow: LineItemRowState = {
          ...row,
          values: { ...row.values, [field.id]: value }
        };
        const updatedRows = [...rows];
        updatedRows[rowIdx] = updatedRow;
        next[group.id] = updatedRows;
        applied.push({ group, field, rowId, value, rowValues });
        changed = true;
      });
      return changed ? next : prev;
    });
    if (!applied.length) return;
    setErrors(prev => {
      let changed = false;
      const next = { ...prev };
      applied.forEach(({ group, field, rowId }) => {
        const key = `${group.id}__${field.id}__${rowId}`;
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    if (onSelectionEffect) {
      applied.forEach(({ field, value, group, rowId, rowValues }) => {
        onSelectionEffect(field as WebQuestionDefinition, value, { lineItem: { groupId: group.id, rowId, rowValues } });
      });
    }
  }, [definition, language, lineItems, optionState, setErrors, setLineItems, values, onSelectionEffect]);

  const errorIndex = useMemo(() => {
    const rowErrors = new Set<string>();
    const subgroupErrors = new Set<string>();
    const keys = Object.keys(errors || {});
    keys.forEach(key => {
      const parts = key.split('__');
      if (parts.length !== 3) return;
      const prefix = parts[0];
      const rowId = parts[2];
      const info = parseSubgroupKey(prefix);
      if (info) {
        subgroupErrors.add(prefix);
        rowErrors.add(`${info.parentGroupId}::${info.parentRowId}`);
        return;
      }
      rowErrors.add(`${prefix}::${rowId}`);
    });
    return { rowErrors, subgroupErrors };
  }, [errors]);

  useEffect(() => {
    const keys = Object.keys(errors || {});
    if (!keys.length) {
      firstErrorRef.current = null;
      return;
    }
    // Only auto-navigate to the next errored field on submit attempt.
    // While the user is typing, errors will change (as fields are fixed) and we should not steal focus.
    if (errorNavConsumedRef.current === errorNavRequestRef.current) return;
    const firstKey = keys[0];
    if (typeof document === 'undefined') return;
    const wasSame = firstErrorRef.current === firstKey;
    firstErrorRef.current = firstKey;

    const ensureMountedForError = (): boolean => {
      const parts = firstKey.split('__');
      if (parts.length !== 3) return false;
      const prefix = parts[0];
      const rowId = parts[2];
      const subgroupInfo = parseSubgroupKey(prefix);
      if (subgroupInfo) {
        const collapseKey = `${subgroupInfo.parentGroupId}::${subgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
          openSubgroupOverlay(prefix);
          onDiagnostic?.('validation.navigate.openSubgroup', { key: firstKey, subKey: prefix });
        }
        return true;
      }

      const collapseKey = `${prefix}::${rowId}`;
      setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
      return true;
    };

    const scrollToError = (): boolean => {
    const target = document.querySelector<HTMLElement>(`[data-field-path="${firstKey}"]`);
      if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
    try {
      focusable?.focus({ preventScroll: true } as any);
    } catch (_) {
      // ignore focus issues
    }
      return true;
    };

    const requestedMount = ensureMountedForError();
    const attempt = () => scrollToError();

    requestAnimationFrame(() => {
      const found = attempt();
      if (found && wasSame) return;
      if (!found && requestedMount) {
        // wait for state-driven DOM mount (expanded row / subgroup overlay)
        requestAnimationFrame(() => attempt());
        setTimeout(() => attempt(), 80);
      }
    });
    errorNavConsumedRef.current = errorNavRequestRef.current;
  }, [errors, onDiagnostic, openSubgroupOverlay, subgroupOverlay.open, subgroupOverlay.subKey]);

  const buttonBase: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: 10,
    fontWeight: 700,
    border: '1px solid transparent',
    cursor: 'pointer'
  };

  const buttonStyles = {
    primary: {
      ...buttonBase,
      background: '#2563eb',
      borderColor: '#1d4ed8',
      color: '#ffffff'
    },
    secondary: {
      ...buttonBase,
      background: '#ffffff',
      borderColor: '#cbd5e1',
      color: '#0f172a'
    },
    negative: {
      ...buttonBase,
      background: '#fff7f7',
      borderColor: '#fecdd3',
      color: '#b42318'
    }
  } as const;

  const withDisabled = (style: React.CSSProperties, disabled?: boolean): React.CSSProperties =>
    disabled
      ? {
          ...style,
          opacity: 0.6,
          cursor: 'not-allowed'
        }
      : style;

  const subgroupOverlayPortal = (() => {
    if (!subgroupOverlay.open || !subgroupOverlay.subKey) return null;
    if (typeof document === 'undefined') return null;

    const subKey = subgroupOverlay.subKey;
    const parsed = parseSubgroupKey(subKey);
    const parentGroup = parsed ? definition.questions.find(q => q.id === parsed.parentGroupId) : undefined;
    const parentRows = parsed ? lineItems[parsed.parentGroupId] || [] : [];
    const parentRow = parsed ? parentRows.find(r => r.id === parsed.parentRowId) : undefined;
    const parentRowIdx = parsed ? parentRows.findIndex(r => r.id === parsed.parentRowId) : -1;
    const parentRowValues: Record<string, FieldValue> = parentRow?.values || {};

    const subConfig = parsed
      ? parentGroup?.lineItemConfig?.subGroups?.find(sub => resolveSubgroupKey(sub) === parsed.subGroupId)
      : undefined;
    const subLabel = parsed
      ? resolveLocalizedString(subConfig?.label, language, parsed.subGroupId)
      : resolveLocalizedString({ en: 'Subgroup', fr: 'Sous-groupe', nl: 'Subgroep' }, language, 'Subgroup');
    const parentLabel = parentGroup ? resolveLabel(parentGroup, language) : (parsed?.parentGroupId || 'Group');

    const rows = lineItems[subKey] || [];
    const orderedRows = [...rows].sort((a, b) => {
      const aAuto = !!a.autoGenerated;
      const bAuto = !!b.autoGenerated;
      if (aAuto === bAuto) return 0;
      return aAuto ? -1 : 1;
    });

    const totalsCfg = subConfig ? { ...subConfig, fields: subConfig.fields || [] } : undefined;
    const totals = totalsCfg ? computeTotals({ config: totalsCfg as any, rows: orderedRows }, language) : [];

    const subSelectorCfg = subConfig?.sectionSelector;
    const subSelectorOptionSet = buildSelectorOptionSet(subSelectorCfg);
    const subSelectorOptions = subSelectorOptionSet
      ? buildLocalizedOptions(subSelectorOptionSet, subSelectorOptionSet.en || [], language)
      : [];
    const subSelectorValue = subgroupSelectors[subKey] || '';

    const renderAddButton = () => {
      if (!subConfig) {
        return (
          <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.primary}>
            Add line
          </button>
        );
      }
      if (subConfig.addMode === 'overlay' && subConfig.anchorFieldId) {
        return (
          <button
            type="button"
            style={buttonStyles.primary}
            onClick={async () => {
              const anchorField = (subConfig.fields || []).find(f => f.id === subConfig.anchorFieldId);
              if (!anchorField || anchorField.type !== 'CHOICE') {
                addLineItemRowManual(subKey);
                return;
              }
              const key = optionKey(anchorField.id, subKey);
              let opts = optionState[key];
              if (!opts && anchorField.dataSource) {
                const loaded = await loadOptionsFromDataSource(anchorField.dataSource, language);
                if (loaded) {
                  opts = loaded;
                  setOptionState(prev => ({ ...prev, [key]: loaded }));
                }
              }
              if (!opts) {
                opts = {
                  en: anchorField.options || [],
                  fr: (anchorField as any).optionsFr || [],
                  nl: (anchorField as any).optionsNl || []
                };
              }
              const dependencyIds = (
                Array.isArray(anchorField.optionFilter?.dependsOn)
                  ? anchorField.optionFilter?.dependsOn
                  : [anchorField.optionFilter?.dependsOn || '']
              ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
              const depVals = dependencyIds.map(dep => toDependencyValue(parentRowValues[dep] ?? values[dep] ?? subSelectorValue));
              const allowed = computeAllowedOptions(anchorField.optionFilter, opts, depVals);
              const localized = buildLocalizedOptions(opts, allowed, language);
              const deduped = Array.from(new Set(localized.map(opt => opt.value).filter(Boolean)));
              setOverlay({
                open: true,
                options: localized
                  .filter(opt => deduped.includes(opt.value))
                  .map(opt => ({ value: opt.value, label: opt.label })),
                groupId: subKey,
                anchorFieldId: anchorField.id,
                selected: []
              });
            }}
          >
            {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines')}
          </button>
        );
      }
      return (
        <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.primary}>
          {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add line')}
        </button>
      );
    };

    const subGroupDef: WebQuestionDefinition | null =
      parentGroup && subConfig
        ? ({
            ...(parentGroup as any),
            id: subKey,
            lineItemConfig: { ...(subConfig as any), fields: subConfig.fields || [], subGroups: [] }
          } as WebQuestionDefinition)
        : null;

    return createPortal(
      <div
        className="webform-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#ffffff',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #e5e7eb',
            background: '#ffffff',
            boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={closeSubgroupOverlay} style={buttonStyles.negative}>
              ← Back
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{subLabel}</div>
              <div className="muted" style={{ fontWeight: 600, marginTop: 4 }}>
                {parentLabel}
                {parentRowIdx >= 0 ? ` · Row ${parentRowIdx + 1}` : parsed?.parentRowId ? ` · ${parsed.parentRowId}` : ''}
                {` · ${orderedRows.length} item${orderedRows.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <button type="button" onClick={closeSubgroupOverlay} style={buttonStyles.secondary}>
              Close
            </button>
          </div>
          <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {subSelectorCfg && subSelectorOptions.length ? (
                  <div
                    className="section-selector"
                    data-field-path={subSelectorCfg.id}
                    style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label style={{ fontWeight: 700 }}>{resolveSelectorLabel(subSelectorCfg, language)}</label>
                    <select
                      value={subSelectorValue}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setSubgroupSelectors(prev => {
                          if (prev[subKey] === nextValue) return prev;
                          return { ...prev, [subKey]: nextValue };
                        });
                      }}
                    >
                      <option value="">Select…</option>
                      {subSelectorOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {renderAddButton()}
              </div>
              {totals.length ? (
                <div className="line-item-totals" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {totals.map(t => (
                    <span key={t.key} className="pill">
                      {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </fieldset>
        </div>
        <fieldset
          disabled={submitting}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minInlineSize: 0,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div data-overlay-scroll-container="true" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {!subGroupDef ? (
            <div className="error">
              Unable to load subgroup editor (missing group/subgroup configuration for <code>{subKey}</code>).
            </div>
          ) : orderedRows.length ? (
            orderedRows.map((subRow, subIdx) => {
              const subCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => subRow.values[fid]
              };
              return (
                <div
                  key={subRow.id}
                  className="line-item-row"
                  data-row-anchor={`${subKey}__${subRow.id}`}
                  style={{
                    background: subIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    marginBottom: 10
                  }}
                >
                  {!subRow.autoGenerated && (
                    <div style={{ marginBottom: 8 }}>
                      <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
                        Manual
                      </span>
                    </div>
                  )}
                  {(subConfig?.fields || []).map(field => {
                    ensureLineOptions(subKey, field);
                    const optionSetField: OptionSet =
                      optionState[optionKey(field.id, subKey)] || {
                        en: field.options || [],
                        fr: (field as any).optionsFr || [],
                        nl: (field as any).optionsNl || []
                      };
                    const dependencyIds = (
                      Array.isArray(field.optionFilter?.dependsOn)
                        ? field.optionFilter?.dependsOn
                        : [field.optionFilter?.dependsOn || '']
                    ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      field.optionFilter,
                      optionSetField,
                      dependencyIds.map(dep => {
                        const selectorFallback =
                          subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                        return toDependencyValue(subRow.values[dep] ?? values[dep] ?? parentRowValues[dep] ?? selectorFallback);
                      })
                    );
                    const currentVal = subRow.values[field.id];
                    const allowedWithCurrent =
                      currentVal && typeof currentVal === 'string' && !allowedField.includes(currentVal)
                        ? [...allowedField, currentVal]
                        : allowedField;
                    const selectedSub = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : null;
                    const allowedWithSelection =
                      selectedSub && selectedSub.length
                        ? selectedSub.reduce((acc, val) => {
                            if (val && !acc.includes(val)) acc.push(val);
                            return acc;
                          }, [...allowedWithCurrent])
                        : allowedWithCurrent;
                    const optsField = buildLocalizedOptions(optionSetField, allowedWithSelection, language);
                    const hideField = shouldHideField(field.visibility, subCtx, {
                      rowId: subRow.id,
                      linePrefix: subKey
                    });
                    if (hideField) return null;
                    const errorKey = `${subKey}__${field.id}__${subRow.id}`;
                    switch (field.type) {
                      case 'CHOICE': {
                        const rawVal = subRow.values[field.id];
                        const choiceVal =
                          Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <select
                              value={choiceVal || ''}
                              onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                            >
                              <option value="">Select…</option>
                              {optsField.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selected = optsField.find(opt => opt.value === choiceVal);
                              if (!selected?.tooltip) return null;
                              const fallbackLabel = resolveFieldLabel(field, language, field.id);
                              const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                              return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
                            })()}
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                      case 'CHECKBOX': {
                        const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <div className="inline-options">
                              {optsField.map(opt => (
                                <label key={opt.value} className="inline">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={e => {
                                      const next = e.target.checked
                                        ? [...selected, opt.value]
                                        : selected.filter(v => v !== opt.value);
                                      handleLineFieldChange(subGroupDef, subRow.id, field, next);
                                    }}
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                            {(() => {
                              const withTooltips = optsField.filter(opt => opt.tooltip && selected.includes(opt.value));
                              if (!withTooltips.length) return null;
                              const fallbackLabel = resolveFieldLabel(field, language, field.id);
                              const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                              return (
                                <div className="muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {withTooltips.map(opt => (
                                    <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      {opt.label}{' '}
                                      <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                      default: {
                        const mapped = field.valueMap
                          ? resolveValueMapValue(field.valueMap, fid => {
                              if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                              if (parentRowValues.hasOwnProperty(fid)) return parentRowValues[fid];
                              return values[fid];
                            })
                          : undefined;
                        const fieldValue = field.valueMap ? mapped : (subRow.values[field.id] as string) || '';
                        return (
                          <div
                            key={field.id}
                            className="field inline-field"
                            data-field-path={errorKey}
                            data-has-error={errors[errorKey] ? 'true' : undefined}
                          >
                            <label>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <input
                              type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                              value={fieldValue}
                              onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                              readOnly={!!field.valueMap}
                            />
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                    }
                  })}
                  <div className="line-actions">
                    <button type="button" onClick={() => removeLineRow(subKey, subRow.id)} style={buttonStyles.negative}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="muted">No items yet. Use “Add line(s)” to start.</div>
          )}
          </div>
        </fieldset>
      </div>,
      document.body
    );
  })();

  const infoOverlayPortal = (() => {
    if (!infoOverlay.open || !infoOverlay.text) return null;
    if (typeof document === 'undefined') return null;
    const title = infoOverlay.title || 'Info';
    const text = infoOverlay.text || '';
    return createPortal(
      <div
        className="webform-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#ffffff',
          zIndex: 10020,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid #e5e7eb',
            background: '#ffffff',
            boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={closeInfoOverlay} style={buttonStyles.negative}>
              ← Back
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>{title}</div>
            </div>
            <button type="button" onClick={closeInfoOverlay} style={buttonStyles.secondary}>
              Close
            </button>
          </div>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
          {text}
        </div>
      </div>,
      document.body
    );
  })();

  return (
    <>
      <style>{`
        .form-card input,
        .form-card select,
        .form-card textarea {
          font-size: 18px;
          line-height: 1.5;
        }
        .form-card .line-item-table td,
        .form-card .line-item-table th {
          font-size: 18px;
        }
        .form-card .line-item-table input,
        .form-card .line-item-table select,
        .form-card .line-item-table textarea {
          font-size: 18px;
        }
        .form-card .field.inline-field,
        .webform-overlay .field.inline-field {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 8px 12px;
          align-items: center;
        }
        .form-card .field.inline-field > label,
        .webform-overlay .field.inline-field > label {
          flex: 1 1 160px;
          min-width: 120px;
          max-width: 220px;
          margin: 0;
          font-weight: 800;
          color: #0f172a;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .form-card .field.inline-field > input,
        .form-card .field.inline-field > select,
        .form-card .field.inline-field > textarea,
        .form-card .field.inline-field > .inline-options,
        .webform-overlay .field.inline-field > input,
        .webform-overlay .field.inline-field > select,
        .webform-overlay .field.inline-field > textarea,
        .webform-overlay .field.inline-field > .inline-options {
          flex: 2 1 260px;
          min-width: 0;
          width: 100%;
        }
        .form-card .field.inline-field > .error,
        .webform-overlay .field.inline-field > .error {
          flex-basis: 100%;
          margin: 0;
        }
        .form-card .field[data-has-error="true"],
        .webform-overlay .field[data-has-error="true"] {
          outline: 3px solid rgba(239, 68, 68, 0.55);
          outline-offset: 2px;
          border-radius: 12px;
          padding: 8px;
          background: #fff7f7;
        }
        .form-card .info-button,
        .webform-overlay .info-button {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          border-radius: 10px;
          padding: 10px 16px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
        }
        @media (max-width: 520px) {
          .form-card .field.inline-field > label,
          .webform-overlay .field.inline-field > label {
            flex-basis: 100%;
            max-width: none;
          }
          .form-card .collapsed-fields-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div className="card form-card">
        {status ? (
          <div
            ref={statusRef}
            role={statusTone === 'error' ? 'alert' : 'status'}
            tabIndex={-1}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              marginBottom: 12,
              border:
                statusTone === 'error'
                  ? '1px solid #fca5a5'
                  : statusTone === 'success'
                  ? '1px solid #86efac'
                  : '1px solid #bae6fd',
              background:
                statusTone === 'error'
                  ? '#fee2e2'
                  : statusTone === 'success'
                  ? '#dcfce7'
                  : '#e0f2fe',
              color: '#0f172a',
              fontWeight: 600
            }}
          >
            {status}
          </div>
        ) : null}
        <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
          {definition.questions.filter(q => !q.header || q.type === 'LINE_ITEM_GROUP').map(renderQuestion)}
        </fieldset>
      </div>
      <div
        className="sticky-submit"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          style={withDisabled(buttonStyles.negative, submitting)}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            errorNavRequestRef.current += 1;
            onDiagnostic?.('validation.navigate.request', { attempt: errorNavRequestRef.current });
            onSubmit();
          }}
          disabled={submitting}
          style={withDisabled(buttonStyles.primary, submitting)}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      {overlay.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 11000
          }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, width: '420px', maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Select lines</h3>
            <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overlay.options.map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    value={opt.value}
                    checked={overlay.selected?.includes(opt.value) || false}
                    disabled={submitting}
                    onChange={e => {
                      setOverlay(prev => {
                        const nextSelected = new Set(prev.selected || []);
                        if (e.target.checked) {
                          nextSelected.add(opt.value);
                        } else {
                          nextSelected.delete(opt.value);
                        }
                        return { ...prev, selected: Array.from(nextSelected) };
                      });
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              {!overlay.options.length && <div className="muted">No options available.</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setOverlay({ open: false, options: [], selected: [] })}
                style={buttonStyles.secondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  if (overlay.groupId && overlay.anchorFieldId) {
                    (overlay.selected || []).forEach(val =>
                      addLineItemRowManual(overlay.groupId!, { [overlay.anchorFieldId!]: val })
                    );
                  }
                  setOverlay({ open: false, options: [], selected: [] });
                }}
                disabled={submitting}
                style={withDisabled(buttonStyles.primary, submitting)}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {subgroupOverlayPortal}
      {infoOverlayPortal}
    </>
  );
};

export default FormView;

