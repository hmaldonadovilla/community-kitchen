import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAllowedOptions,
  buildLocalizedOptions,
  shouldHideField,
  computeTotals,
  loadOptionsFromDataSource,
  optionKey,
  toDependencyValue,
  toOptionSet
} from '../../core';
import { resolveLocalizedString } from '../../i18n';
import { tSystem } from '../../systemStrings';
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  OptionSet,
  QuestionGroupConfig,
  VisibilityContext,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../types';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { FormErrors, LineItemState, OptionState } from '../types';
import { isEmptyValue } from '../utils/values';
import {
  applyUploadConstraints,
  describeUploadItem,
  resolveUploadRemainingHelperText,
  resolveRowDisclaimerText,
  toDateInputValue,
  toUploadItems
} from './form/utils';
import { buttonStyles, PlusIcon, RequiredStar, srOnly, UploadIcon, withDisabled } from './form/ui';
import { FileOverlay } from './form/overlays/FileOverlay';
import { InfoOverlay } from './form/overlays/InfoOverlay';
import { LineOverlayState, LineSelectOverlay } from './form/overlays/LineSelectOverlay';
import { InfoTooltip } from './form/InfoTooltip';
import { LineItemGroupQuestion } from './form/LineItemGroupQuestion';
import { GroupedPairedFields } from './form/GroupedPairedFields';
import { PairedRowGrid } from './form/PairedRowGrid';
import { resolveGroupSectionKey } from './form/grouping';
import { computeChoiceControlVariant, resolveNoneLabel, type OptionLike } from './form/choiceControls';
import { buildSelectorOptionSet, resolveSelectorLabel } from './form/lineItemSelectors';
import { NumberStepper } from './form/NumberStepper';
import { applyValueMapsToForm, resolveValueMapValue } from './form/valueMaps';
import {
  buildLineContextId,
  parseSubgroupKey,
  resolveSubgroupKey,
  seedSubgroupDefaults
} from '../app/lineItems';

interface SubgroupOverlayState {
  open: boolean;
  subKey?: string;
}

interface InfoOverlayState {
  open: boolean;
  title?: string;
  text?: string;
}

interface FileOverlayState {
  open: boolean;
  title?: string;
  scope?: 'top' | 'line';
  // Top-level upload field
  question?: WebQuestionDefinition;
  // Line-item / subgroup upload field
  group?: WebQuestionDefinition;
  rowId?: string;
  field?: any;
  fieldPath?: string;
}

// keep context ids consistent with App.tsx so auto-generated rows from selection effects
// can be reconciled when loading existing records

type StatusTone = 'info' | 'success' | 'error';

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
  onSubmit: (ctx: { collapsedRows: Record<string, boolean>; collapsedSubgroups: Record<string, boolean> }) => Promise<void>;
  /**
   * Allows the app shell (bottom action bar) to trigger submit while preserving
   * FormView-specific behavior (e.g., validation navigation).
   */
  submitActionRef?: React.MutableRefObject<(() => void) | null>;
  submitting: boolean;
  errors: FormErrors;
  setErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  status?: string | null;
  statusTone?: StatusTone | null;
  warningTop?: Array<{ message: string; fieldPath: string }>;
  warningByField?: Record<string, string[]>;
  onStatusClear?: () => void;
  optionState: OptionState;
  setOptionState: React.Dispatch<React.SetStateAction<OptionState>>;
  ensureOptions: (q: WebQuestionDefinition) => void;
  ensureLineOptions: (groupId: string, field: any) => void;
  /**
   * External request to scroll to a newly added row (e.g., selectionEffects-created rows).
   * Format matches internal anchors: `${groupKey}__${rowId}`.
   */
  externalScrollAnchor?: string | null;
  onExternalScrollConsumed?: () => void;
  onSelectionEffect?: (
    q: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    }
  ) => void;
  /**
   * Optional immediate upload hook. Used to upload FILE_UPLOAD fields as soon as the user adds files.
   * The handler should:
   * - ensure the record exists (create draft if needed),
   * - upload the File(s) to Drive,
   * - update the field value to the resulting URL(s),
   * - and persist the URL(s) (draft save).
   */
  onUploadFiles?: (args: {
    scope: 'top' | 'line';
    fieldPath: string;
    questionId?: string;
    groupId?: string;
    rowId?: string;
    fieldId?: string;
    items: Array<string | File>;
    uploadConfig?: any;
  }) => Promise<{ success: boolean; message?: string }>;
  /**
   * Optional handler for BUTTON fields (Doc template preview / report rendering).
   */
  onReportButton?: (buttonId: string) => void;
  reportBusy?: boolean;
  reportBusyId?: string | null;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}

const FormView: React.FC<FormViewProps> = ({
  definition,
  language,
  values,
  setValues,
  lineItems,
  setLineItems,
  onSubmit,
  submitActionRef,
  submitting,
  errors,
  setErrors,
  status,
  statusTone,
  warningTop,
  warningByField,
  onStatusClear,
  optionState,
  setOptionState,
  ensureOptions,
  ensureLineOptions,
  externalScrollAnchor,
  onExternalScrollConsumed,
  onSelectionEffect,
  onUploadFiles,
  onReportButton,
  reportBusy,
  reportBusyId,
  onDiagnostic
}) => {
  const ROW_SOURCE_KEY = '__ckRowSource';
  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = key && warningByField ? (warningByField as any)[key] : undefined;
    return Array.isArray(list) ? list.filter(Boolean).map(m => (m || '').toString()) : [];
  };
  const hasWarning = (fieldPath: string): boolean => warningsFor(fieldPath).length > 0;
  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = warningsFor(fieldPath);
    if (!msgs.length) return null;
    return msgs.map((m, idx) => (
      <div key={`${fieldPath}-warning-${idx}`} className="warning">
        {m}
      </div>
    ));
  };
  const [overlay, setOverlay] = useState<LineOverlayState>({ open: false, options: [], selected: [] });
  const [subgroupOverlay, setSubgroupOverlay] = useState<SubgroupOverlayState>({ open: false });
  const [infoOverlay, setInfoOverlay] = useState<InfoOverlayState>({ open: false });
  const [fileOverlay, setFileOverlay] = useState<FileOverlayState>({ open: false });
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
  const choiceVariantLogRef = useRef<Record<string, string>>({});
  const hideLabelLoggedRef = useRef<Set<string>>(new Set());
  const groupScrollAnimRafRef = useRef(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const valuesRef = useRef(values);
  const lineItemsRef = useRef(lineItems);

  useEffect(() => {
    valuesRef.current = values;
    lineItemsRef.current = lineItems;
  }, [values, lineItems]);

  useEffect(() => {
    if (!externalScrollAnchor) return;
    setPendingScrollAnchor(externalScrollAnchor);
    onExternalScrollConsumed?.();
    onDiagnostic?.('ui.autoscroll.external', { anchor: externalScrollAnchor });
  }, [externalScrollAnchor, onDiagnostic, onExternalScrollConsumed]);

  // Expose an imperative submit action so the bottom action bar can trigger the same submit
  // behavior (including the "scroll to first error" flow) without duplicating logic in App.tsx.
  useEffect(() => {
    if (!submitActionRef) return;
    submitActionRef.current = () => {
      if (submitting) return;
      // Ensure status/progress messages are visible immediately when submit starts.
      try {
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (_) {
        // ignore
      }
      errorNavRequestRef.current += 1;
      onDiagnostic?.('validation.navigate.request', { attempt: errorNavRequestRef.current });
      void onSubmit({ collapsedRows, collapsedSubgroups }).catch((err: any) => {
        onDiagnostic?.('submit.exception', { message: err?.message || err || 'unknown' });
      });
    };
    return () => {
      submitActionRef.current = null;
    };
  }, [collapsedRows, collapsedSubgroups, onDiagnostic, onSubmit, submitActionRef, submitting]);

  const hasCopyDerived = useMemo(() => {
    const hasInFields = (fields: any[]): boolean =>
      Array.isArray(fields) && fields.some(f => f && f.derivedValue && (f.derivedValue.op || '').toString() === 'copy');
    return (definition.questions || []).some(q => {
      if ((q as any).derivedValue && ((q as any).derivedValue.op || '').toString() === 'copy') return true;
      if (q.type !== 'LINE_ITEM_GROUP') return false;
      if (hasInFields(q.lineItemConfig?.fields || [])) return true;
      const subs = q.lineItemConfig?.subGroups || [];
      return subs.some(sub => hasInFields(((sub as any).fields || []) as any[]));
    });
  }, [definition.questions]);

  const hideLabelQuestionIds = useMemo(() => {
    return (definition.questions || []).filter(q => q.ui?.hideLabel === true).map(q => q.id);
  }, [definition.questions]);

  useEffect(() => {
    if (!onDiagnostic) return;
    (hideLabelQuestionIds || []).forEach(id => {
      const fieldId = (id || '').toString().trim();
      if (!fieldId) return;
      if (hideLabelLoggedRef.current.has(fieldId)) return;
      hideLabelLoggedRef.current.add(fieldId);
      onDiagnostic('ui.field.hideLabel', { fieldId });
    });
  }, [hideLabelQuestionIds, onDiagnostic]);

  const blurRecomputeTimerRef = useRef<number | null>(null);

  const shallowEqualFieldValue = (a: FieldValue, b: FieldValue): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      const aa = Array.isArray(a) ? a : [a];
      const bb = Array.isArray(b) ? b : [b];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i += 1) {
        if ((aa[i] as any) !== (bb[i] as any)) return false;
      }
      return true;
    }
    return false;
  };

  const diffValues = (a: Record<string, FieldValue>, b: Record<string, FieldValue>): string[] => {
    const changed: string[] = [];
    const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
    keys.forEach(k => {
      if (!shallowEqualFieldValue((a as any)[k], (b as any)[k])) changed.push(k);
    });
    return changed;
  };

  const lineItemsEqual = (a: LineItemState, b: LineItemState): boolean => {
    if (a === b) return true;
    const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
    for (const key of keys) {
      const ra = (a as any)[key] || [];
      const rb = (b as any)[key] || [];
      if (ra.length !== rb.length) return false;
      for (let i = 0; i < ra.length; i += 1) {
        const rowA = ra[i];
        const rowB = rb[i];
        if (!rowA || !rowB) return false;
        if (rowA.id !== rowB.id) return false;
        const va = rowA.values || {};
        const vb = rowB.values || {};
        const vKeys = Array.from(new Set([...Object.keys(va), ...Object.keys(vb)]));
        for (const fid of vKeys) {
          if (!shallowEqualFieldValue((va as any)[fid], (vb as any)[fid])) return false;
        }
      }
    }
    return true;
  };

  const recomputeDerivedOnBlur = useCallback(
    (meta?: { fieldPath?: string; tag?: string }) => {
      if (!hasCopyDerived) return;
      const currentValues = valuesRef.current;
      const currentLineItems = lineItemsRef.current;
      const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, currentValues, currentLineItems, {
        mode: 'blur'
      });

      const changedFields = diffValues(currentValues, nextValues);
      const lineChanged = !lineItemsEqual(currentLineItems, nextLineItems);
      if (!changedFields.length && !lineChanged) return;

      if (changedFields.length) setValues(nextValues);
      if (lineChanged) setLineItems(nextLineItems);
      onDiagnostic?.('derived.blur.apply', {
        fieldPath: meta?.fieldPath,
        tag: meta?.tag,
        changedCount: changedFields.length,
        changedFields: changedFields.slice(0, 12),
        lineItemsChanged: lineChanged
      });
    },
    [definition, hasCopyDerived, onDiagnostic, setLineItems, setValues]
  );

  useEffect(() => {
    if (!hasCopyDerived) return;
    const handler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
      const root = target.closest('.form-card') || target.closest('.webform-overlay');
      if (!root) return;
      const fieldPath = (target.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
      }
      blurRecomputeTimerRef.current = window.setTimeout(() => {
        blurRecomputeTimerRef.current = null;
        recomputeDerivedOnBlur({ fieldPath, tag });
      }, 0);
    };
    document.addEventListener('focusout', handler, true);
    return () => {
      document.removeEventListener('focusout', handler, true);
      if (blurRecomputeTimerRef.current !== null) {
        window.clearTimeout(blurRecomputeTimerRef.current);
        blurRecomputeTimerRef.current = null;
      }
    };
  }, [hasCopyDerived, recomputeDerivedOnBlur]);

  const groupSections = useMemo(() => {
    type GroupSection = {
      key: string;
      title?: string;
      collapsible: boolean;
      defaultCollapsed: boolean;
      isHeader: boolean;
      questions: WebQuestionDefinition[];
      order: number;
    };

    const resolveGroupKey = (group?: QuestionGroupConfig): string => {
      if (!group) return '__default__';
      if (group.id) return group.id.toString();
      if (group.header) return '__header__';
      const rawTitle: any = group.title;
      if (typeof rawTitle === 'string') {
        const t = rawTitle.trim();
        if (t) return `title:${t}`;
      }
      if (rawTitle && typeof rawTitle === 'object') {
        const t = (rawTitle.en || rawTitle.fr || rawTitle.nl || '').toString().trim();
        if (t) return `title:${t}`;
      }
      return '__default__';
    };

    const map = new Map<string, GroupSection>();
    let order = 0;

    (definition.questions || []).forEach(q => {
      const legacyHeader = !!(q as any).header;
      const group: QuestionGroupConfig | undefined =
        (q as any).group ||
        (legacyHeader
          ? {
              header: true,
              title: { en: 'Header', fr: 'Header', nl: 'Header' },
              collapsible: true
            }
          : undefined);

      const isHeader = !!group?.header;
      const key = resolveGroupKey(group);
      const title = group?.title ? resolveLocalizedString(group.title as any, language, isHeader ? 'Header' : '') : undefined;
      const collapsible = group?.collapsible !== undefined ? !!group.collapsible : !!title;
      const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          title,
          collapsible,
          defaultCollapsed,
          isHeader,
          questions: [q],
          order: order++
        });
        return;
      }

      existing.questions.push(q);
      if (!existing.title && title) existing.title = title;
      existing.isHeader = existing.isHeader || isHeader;
      existing.collapsible = existing.collapsible || collapsible;
      existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.isHeader !== b.isHeader) return a.isHeader ? -1 : 1;
      return a.order - b.order;
    });
  }, [definition.questions, language]);

  const questionIdToGroupKey = useMemo(() => {
    const map: Record<string, string> = {};
    groupSections.forEach(section => {
      section.questions.forEach(q => {
        map[q.id] = section.key;
      });
    });
    return map;
  }, [groupSections]);

  const nestedGroupMeta = useMemo(() => {
    const collapsibleDefaults: Array<{ key: string; defaultCollapsed: boolean }> = [];
    const lineFieldToGroupKey: Record<string, string> = {};
    const subgroupFieldToGroupKey: Record<string, string> = {};

    const pushSectionDefaults = (prefix: string, fields: any[]) => {
      const sectionMeta = new Map<string, { defaultCollapsed: boolean; collapsible: boolean; titlePresent: boolean }>();
      (fields || []).forEach(field => {
        const group: QuestionGroupConfig | undefined = (field as any)?.group;
        const sectionKey = resolveGroupSectionKey(group);
        const titlePresent = !!(group && (group as any).title !== undefined && (group as any).title !== null && `${(group as any).title}`.trim());
        const collapsible = group?.collapsible !== undefined ? !!group.collapsible : titlePresent;
        const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;
        const existing = sectionMeta.get(sectionKey);
        if (!existing) {
          sectionMeta.set(sectionKey, { collapsible, defaultCollapsed, titlePresent });
        } else {
          existing.collapsible = existing.collapsible || collapsible;
          existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
          existing.titlePresent = existing.titlePresent || titlePresent;
        }
      });
      sectionMeta.forEach((meta, sectionKey) => {
        if (!meta.collapsible) return;
        collapsibleDefaults.push({ key: `${prefix}:${sectionKey}`, defaultCollapsed: meta.defaultCollapsed });
      });
    };

    (definition.questions || []).forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;

      const fields = q.lineItemConfig?.fields || [];
      fields.forEach(field => {
        const sectionKey = resolveGroupSectionKey((field as any)?.group);
        lineFieldToGroupKey[`${q.id}__${field.id}`] = `li:${q.id}:${sectionKey}`;
      });
      pushSectionDefaults(`li:${q.id}`, fields);

      (q.lineItemConfig?.subGroups || []).forEach(sub => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const subFields = (sub as any).fields || [];
        subFields.forEach((field: any) => {
          const sectionKey = resolveGroupSectionKey((field as any)?.group);
          subgroupFieldToGroupKey[`${q.id}::${subId}__${field.id}`] = `sub:${q.id}:${subId}:${sectionKey}`;
        });
        pushSectionDefaults(`sub:${q.id}:${subId}`, subFields);
      });
    });

    return { collapsibleDefaults, lineFieldToGroupKey, subgroupFieldToGroupKey };
  }, [definition.questions]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      groupSections.forEach(section => {
        if (!section.collapsible) return;
        if (next[section.key] === undefined) {
          next[section.key] = !!section.defaultCollapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groupSections]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      (nestedGroupMeta.collapsibleDefaults || []).forEach(entry => {
        if (next[entry.key] === undefined) {
          next[entry.key] = !!entry.defaultCollapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [nestedGroupMeta.collapsibleDefaults]);

  const autoCollapseGroups = Boolean(definition.groupBehavior?.autoCollapseOnComplete);
  const autoOpenNextIncomplete = Boolean(definition.groupBehavior?.autoOpenNextIncomplete);
  const autoScrollOnExpand =
    definition.groupBehavior?.autoScrollOnExpand !== undefined
      ? Boolean(definition.groupBehavior.autoScrollOnExpand)
      : autoCollapseGroups;

  const topLevelGroupKeySet = useMemo(() => {
    // Only top-level groups (exclude header group).
    return new Set(groupSections.filter(s => !s.isHeader).map(s => s.key));
  }, [groupSections]);

  const scrollGroupToTop = useCallback(
    (groupKey: string, args?: { behavior?: ScrollBehavior; reason?: string }) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const reason = (args?.reason || 'expand').toString();
      const escaped = (groupKey || '').toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = document.querySelector<HTMLElement>(`[data-group-key="${escaped}"]`);
      if (!el) {
        onDiagnostic?.('ui.group.scrollIntoView.miss', { groupKey, reason });
        return;
      }

      const header = document.querySelector<HTMLElement>('.ck-app-header');
      const topBar = document.querySelector<HTMLElement>('.ck-top-action-bar');
      const headerRect = header?.getBoundingClientRect();
      const topBarRect = topBar?.getBoundingClientRect();
      // Use the bottom edge of the sticky stack (header + top action bar) for a reliable offset.
      const stickyBottom = Math.max(0, headerRect?.bottom || 0, topBarRect?.bottom || 0);
      const offset = Math.round(stickyBottom + 16);
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport || null;
      const scrollEl = document.scrollingElement as HTMLElement | null;
      const docEl = document.documentElement as HTMLElement | null;
      const bodyEl = document.body as HTMLElement | null;
      const vvPageTop = vv && typeof vv.pageTop === 'number' ? vv.pageTop : null;

      const snapshotScroll = () => {
        const win = typeof window.scrollY === 'number' ? window.scrollY : 0;
        const se = scrollEl && typeof scrollEl.scrollTop === 'number' ? scrollEl.scrollTop : null;
        const doc = docEl && typeof docEl.scrollTop === 'number' ? docEl.scrollTop : null;
        const body = bodyEl && typeof bodyEl.scrollTop === 'number' ? bodyEl.scrollTop : null;
        return { win, se, doc, body };
      };

      const before = snapshotScroll();
      const baseScrollTop = Math.max(
        0,
        before.win || 0,
        before.se || 0,
        before.doc || 0,
        before.body || 0,
        vvPageTop || 0
      );
      const targetTop = Math.max(0, baseScrollTop + rect.top - offset);
      const behavior: ScrollBehavior =
        args?.behavior || (reason.toLowerCase().startsWith('auto') ? 'auto' : 'smooth');

      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
          // iPadOS 13+ reports as MacIntel but has touch points.
          (navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1));
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const computeStickyOffset = () => {
        const headerNow = document.querySelector<HTMLElement>('.ck-app-header');
        const topBarNow = document.querySelector<HTMLElement>('.ck-top-action-bar');
        const headerRectNow = headerNow?.getBoundingClientRect();
        const topBarRectNow = topBarNow?.getBoundingClientRect();
        const stickyBottomNow = Math.max(0, headerRectNow?.bottom || 0, topBarRectNow?.bottom || 0);
        const offsetNow = Math.round(stickyBottomNow + 16);
        return { offsetNow, stickyBottomNow, headerRectNow, topBarRectNow };
      };

      const setScrollTop = (top: number) => {
        const next = Math.max(0, top);
        try {
          window.scrollTo(0, next);
        } catch (_) {
          // ignore
        }
        try {
          if (scrollEl) scrollEl.scrollTop = next;
          if (docEl) docEl.scrollTop = next;
          if (bodyEl) bodyEl.scrollTop = next;
        } catch (_) {
          // ignore
        }
      };

      // iOS smooth scrolling can drift while the browser chrome animates, which makes any single
      // precomputed target land slightly under the sticky header. For manual expand/collapse we
      // run a single custom smooth animation that re-applies the intended target each frame, so
      // there's no visible "correction jump" at the end.
      if (isIOS && behavior === 'smooth' && !prefersReducedMotion && typeof window.requestAnimationFrame === 'function') {
        // Cancel any in-flight scroll animation.
        if (groupScrollAnimRafRef.current) {
          try {
            window.cancelAnimationFrame(groupScrollAnimRafRef.current);
          } catch (_) {
            // ignore
          }
          groupScrollAnimRafRef.current = 0;
        }

        const absoluteTop = baseScrollTop + rect.top;
        const initialTargetTop = Math.max(0, absoluteTop - offset);
        const distance = Math.abs(initialTargetTop - baseScrollTop);
        const durationMs = Math.min(420, Math.max(200, Math.round(distance * 0.15 + 180)));
        const startTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

        const easeInOutCubic = (t: number) => {
          const p = Math.max(0, Math.min(1, t));
          return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        };

        const step = (ts: number) => {
          const now = ts || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
          const p = Math.min(1, Math.max(0, (now - startTime) / durationMs));
          const eased = easeInOutCubic(p);

          const { offsetNow } = computeStickyOffset();
          const targetNow = Math.max(0, absoluteTop - offsetNow);
          const nextTop = baseScrollTop + (targetNow - baseScrollTop) * eased;
          setScrollTop(nextTop);

          if (p < 1) {
            groupScrollAnimRafRef.current = window.requestAnimationFrame(step);
            return;
          }
          groupScrollAnimRafRef.current = 0;
          setScrollTop(targetNow);

          const after = snapshotScroll();
          const rectAfter = el.getBoundingClientRect();
          onDiagnostic?.('ui.group.scrollIntoView', {
            groupKey,
            reason,
            mode: 'customSmooth',
            durationMs,
            offsetPx: offset,
            stickyBottomPx: Math.round(stickyBottom),
            headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
            topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
            rectTopPx: Math.round(rectAfter.top),
            baseScrollTopPx: Math.round(baseScrollTop),
            targetTopPx: Math.round(targetNow),
            scrollYPx: Math.round(window.scrollY),
            scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
            docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
            bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
            vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
            vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
          });
        };

        groupScrollAnimRafRef.current = window.requestAnimationFrame(step);
        return;
      }

      const finalizeAlignment = () => {
        try {
          const { offsetNow } = computeStickyOffset();
          const vvNow = window.visualViewport || null;
          const vvNowPageTop = vvNow && typeof vvNow.pageTop === 'number' ? vvNow.pageTop : null;
          const rectNow = el.getBoundingClientRect();
          const now = snapshotScroll();
          const baseNow = Math.max(
            0,
            now.win || 0,
            now.se || 0,
            now.doc || 0,
            now.body || 0,
            vvNowPageTop || 0
          );
          const targetNow = Math.max(0, baseNow + rectNow.top - offsetNow);
          const misaligned = Math.abs(rectNow.top - offsetNow) > 2;
          if (!misaligned) return;
          if (Math.abs(targetNow - baseNow) < 2) return;

          // Use non-smooth scrolling for the correction pass (smooth can drift on iOS during viewport changes).
          try {
            window.scrollTo({ top: targetNow, behavior: 'auto' });
          } catch (_) {
            window.scrollTo(0, targetNow);
          }
          try {
            scrollEl?.scrollTo?.({ top: targetNow, behavior: 'auto' });
          } catch (_) {
            // ignore
          }
          try {
            if (scrollEl) scrollEl.scrollTop = targetNow;
            if (docEl) docEl.scrollTop = targetNow;
            if (bodyEl) bodyEl.scrollTop = targetNow;
          } catch (_) {
            // ignore
          }

          onDiagnostic?.('ui.group.scrollIntoView.adjust', {
            groupKey,
            reason,
            rectTopPx: Math.round(rectNow.top),
            offsetPx: Math.round(offsetNow),
            baseScrollTopPx: Math.round(baseNow),
            targetTopPx: Math.round(targetNow),
            vvPageTopPx: vvNow && typeof vvNow.pageTop === 'number' ? Math.round(vvNow.pageTop) : null,
            scrollYPx: Math.round(window.scrollY)
          });
        } catch (_) {
          // ignore
        }
      };

      try {
        // Try the browser's preferred scrolling mechanism first.
        window.scrollTo({ top: targetTop, behavior });
        // Some iOS webviews ignore window.scrollTo but respect scrollingElement.
        try {
          scrollEl?.scrollTo?.({ top: targetTop, behavior });
        } catch (_) {
          // ignore
        }

        // For non-smooth scroll, also assign common scrollTop targets directly.
        if (behavior !== 'smooth') {
          try {
            if (scrollEl) scrollEl.scrollTop = targetTop;
            if (docEl) docEl.scrollTop = targetTop;
            if (bodyEl) bodyEl.scrollTop = targetTop;
          } catch (_) {
            // ignore
          }
        }

        const after = snapshotScroll();
        onDiagnostic?.('ui.group.scrollIntoView', {
          groupKey,
          reason,
          offsetPx: offset,
          stickyBottomPx: Math.round(stickyBottom),
          headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
          topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
          rectTopPx: Math.round(rect.top),
          baseScrollTopPx: Math.round(baseScrollTop),
          targetTopPx: Math.round(targetTop),
          scrollYPx: Math.round(window.scrollY),
          scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
          docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
          bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
          vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
          vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
        });

        // Verify and force-scroll if nothing moved (common iOS/webview failure mode).
        if (Math.abs(targetTop - baseScrollTop) > 2) {
          window.setTimeout(() => {
            const check = snapshotScroll();
            const moved =
              Math.abs((check.win || 0) - (before.win || 0)) > 2 ||
              Math.abs((check.se || 0) - (before.se || 0)) > 2 ||
              Math.abs((check.doc || 0) - (before.doc || 0)) > 2 ||
              Math.abs((check.body || 0) - (before.body || 0)) > 2;
            if (moved) return;

            try {
              if (scrollEl) scrollEl.scrollTop = targetTop;
              if (docEl) docEl.scrollTop = targetTop;
              if (bodyEl) bodyEl.scrollTop = targetTop;
              window.scrollTo(0, targetTop);
            } catch (_) {
              // ignore
            }
            const forced = snapshotScroll();
            onDiagnostic?.('ui.group.scrollIntoView.force', {
              groupKey,
              reason,
              targetTopPx: Math.round(targetTop),
              scrollYPx: Math.round(window.scrollY),
              scrollElTopPx: forced.se !== null ? Math.round(forced.se) : null,
              docScrollTopPx: forced.doc !== null ? Math.round(forced.doc) : null,
              bodyScrollTopPx: forced.body !== null ? Math.round(forced.body) : null
            });
          }, behavior === 'smooth' ? 260 : 80);
        }

        // Post-scroll alignment pass: iOS can drift during smooth scroll (viewport chrome/safe area changes).
        window.setTimeout(() => finalizeAlignment(), behavior === 'smooth' ? 420 : 120);
      } catch (_) {
        try {
          window.scrollTo(0, targetTop);
          onDiagnostic?.('ui.group.scrollIntoView', {
            groupKey,
            reason,
            offsetPx: offset,
            stickyBottomPx: Math.round(stickyBottom),
            headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
            topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
            rectTopPx: Math.round(rect.top),
            baseScrollTopPx: Math.round(baseScrollTop),
            targetTopPx: Math.round(targetTop),
            scrollYPx: Math.round(window.scrollY),
            scrollElTopPx: scrollEl && typeof scrollEl.scrollTop === 'number' ? Math.round(scrollEl.scrollTop) : null,
            docScrollTopPx: docEl && typeof docEl.scrollTop === 'number' ? Math.round(docEl.scrollTop) : null,
            bodyScrollTopPx: bodyEl && typeof bodyEl.scrollTop === 'number' ? Math.round(bodyEl.scrollTop) : null,
            vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
            vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
          });
          window.setTimeout(() => finalizeAlignment(), 120);
        } catch (_) {
          // ignore
        }
      }
    },
    [onDiagnostic]
  );

  const scheduleScrollGroupToTop = useCallback(
    (groupKey: string, args?: { behavior?: ScrollBehavior; reason?: string }) => {
      if (!autoScrollOnExpand) return;
      if (!topLevelGroupKeySet.has(groupKey)) return;
      if (typeof window === 'undefined') return;
      // Double rAF to allow the DOM to reflow after expanding/collapsing.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollGroupToTop(groupKey, args));
      });
    },
    [autoScrollOnExpand, scrollGroupToTop, topLevelGroupKeySet]
  );

  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      setCollapsedGroups(prev => {
        const nextCollapsed = !prev[groupKey];
        onDiagnostic?.('ui.group.toggle', { groupKey, collapsed: nextCollapsed });
        if (!nextCollapsed) {
          scheduleScrollGroupToTop(groupKey, { reason: 'toggle' });
        }
        return { ...prev, [groupKey]: nextCollapsed };
      });
    },
    [onDiagnostic, scheduleScrollGroupToTop]
  );

  const renderChoiceControl = useCallback(
    (args: {
      fieldPath: string;
      value: string;
      options: OptionLike[];
      required: boolean;
      override?: string | null;
      onChange: (next: string) => void;
    }) => {
      const { fieldPath, value, options, required, override, onChange } = args;
      const decision = computeChoiceControlVariant(options, required, override);

      const prev = choiceVariantLogRef.current[fieldPath];
      if (prev !== decision.variant) {
        choiceVariantLogRef.current[fieldPath] = decision.variant;
        onDiagnostic?.('ui.choiceControl.variant', {
          fieldPath,
          variant: decision.variant,
          optionCount: options.length,
          required,
          override: (override || 'auto').toString(),
          booleanDetected: decision.booleanDetected
        });
      }

      switch (decision.variant) {
        case 'segmented': {
          return (
            <div className="ck-choice-control ck-segmented" role="radiogroup" aria-label="Options">
              {options.map(opt => {
                const active = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={active ? 'active' : undefined}
                    role="radio"
                    aria-checked={active}
                    title={opt.label}
                    onClick={() => {
                      if (!required && active) {
                        onChange('');
                        return;
                      }
                      onChange(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          );
        }
        case 'radio': {
          const name = `ck-radio-${fieldPath}`;
          const noneLabel = resolveNoneLabel(language);
          const radioOptions = required ? options : [{ value: '', label: noneLabel }, ...options];
          return (
            <div className="ck-choice-control ck-radio-list" role="radiogroup" aria-label="Options">
              {radioOptions.map(opt => (
                <label key={opt.value || '__none__'} className="ck-radio-row">
                  <input
                    type="radio"
                    name={name}
                    value={opt.value}
                    checked={(value || '') === (opt.value || '')}
                    onChange={e => onChange(e.target.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          );
        }
        case 'switch': {
          const map = decision.booleanMap;
          if (!map) {
            // fallback
            return (
              <select value={value || ''} onChange={e => onChange(e.target.value)}>
                <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
                {options.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            );
          }
          const checked = value === map.trueValue;
          return (
            <div className="ck-choice-control ck-switch-control">
              <label className="ck-switch" aria-label="Toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => onChange(e.target.checked ? map.trueValue : map.falseValue)}
                />
                <span className="ck-switch-track" aria-hidden="true" />
              </label>
            </div>
          );
        }
        case 'select':
        default:
          return (
            <select value={value || ''} onChange={e => onChange(e.target.value)}>
              <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
      }
    },
    [language, onDiagnostic]
  );

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

  // NOTE: Must be declared AFTER `questionIdToGroupKey`, `nestedGroupMeta`, and `openSubgroupOverlay` are initialized.
  // Otherwise production bundles can hit a TDZ "Cannot access X before initialization" when evaluating hook deps.
  const navigateToFieldKey = useCallback(
    (fieldKey: string) => {
      const key = (fieldKey || '').toString();
      if (!key) return;
      if (typeof document === 'undefined') return;

      const expandGroupForQuestionId = (questionId: string): boolean => {
        const groupKey = questionIdToGroupKey[questionId];
        if (!groupKey) return false;
        setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
        return true;
      };

      const ensureMountedForKey = (): boolean => {
        const parts = key.split('__');
        if (parts.length !== 3) {
          // Top-level question key: ensure its group card is expanded.
          return expandGroupForQuestionId(key);
        }
        const prefix = parts[0];
        const fieldId = parts[1];
        const rowId = parts[2];
        const subgroupInfo = parseSubgroupKey(prefix);
        if (subgroupInfo) {
          expandGroupForQuestionId(subgroupInfo.parentGroupId);
          const collapseKey = `${subgroupInfo.parentGroupId}::${subgroupInfo.parentRowId}`;
          setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
          const nestedKey =
            nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.parentGroupId}::${subgroupInfo.subGroupId}__${fieldId}`];
          if (nestedKey) {
            setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
          }
          if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
            openSubgroupOverlay(prefix);
            onDiagnostic?.('validation.navigate.openSubgroup', { key, subKey: prefix, source: 'click' });
          }
          return true;
        }

        expandGroupForQuestionId(prefix);
        const collapseKey = `${prefix}::${rowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        return true;
      };

      const scrollToKey = (): boolean => {
        const target = document.querySelector<HTMLElement>(`[data-field-path="${key}"]`);
        if (!target) return false;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
        try {
          focusable?.focus({ preventScroll: true } as any);
        } catch (_) {
          // ignore
        }
        return true;
      };

      const requestedMount = ensureMountedForKey();
      requestAnimationFrame(() => {
        const found = scrollToKey();
        if (!found && requestedMount) {
          // wait for state-driven DOM mount (expanded row / subgroup overlay)
          requestAnimationFrame(() => scrollToKey());
          setTimeout(() => scrollToKey(), 80);
        }
      });
    },
    [
      nestedGroupMeta.lineFieldToGroupKey,
      nestedGroupMeta.subgroupFieldToGroupKey,
      onDiagnostic,
      openSubgroupOverlay,
      questionIdToGroupKey,
      subgroupOverlay.open,
      subgroupOverlay.subKey
    ]
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

  const closeFileOverlay = useCallback(() => {
    setFileOverlay({ open: false });
    onDiagnostic?.('upload.overlay.close');
  }, [onDiagnostic]);

  const openFileOverlay = useCallback(
    (next: Omit<FileOverlayState, 'open'>) => {
      if (submitting) return;
      // Close multi-add overlay if open to avoid stacking confusion.
      if (overlay.open) {
        setOverlay({ open: false, options: [], selected: [] });
      }
      setFileOverlay({ open: true, ...next });
      onDiagnostic?.('upload.overlay.open', { scope: next.scope, title: next.title });
    },
    [onDiagnostic, overlay.open, submitting]
  );

  useEffect(() => {
    if (!pendingScrollAnchor) return;
    if (typeof document === 'undefined') return;
    const anchor = pendingScrollAnchor;
    const sep = anchor.lastIndexOf('__');
    const targetGroupKey = sep >= 0 ? anchor.slice(0, sep) : anchor;
    const targetSubgroupInfo = parseSubgroupKey(targetGroupKey);

    // Ensure the target row is actually rendered before attempting to scroll to it.
    // This makes selectionEffect-created rows discoverable even when their parent group is collapsed,
    // or when the target is a subgroup that requires the full-page overlay to be opened.
    try {
      if (targetSubgroupInfo) {
        const groupCardKey = (questionIdToGroupKey as any)[targetSubgroupInfo.parentGroupId] || targetSubgroupInfo.parentGroupId;
        if (groupCardKey) {
          setCollapsedGroups(prev => (prev[groupCardKey] === false ? prev : { ...prev, [groupCardKey]: false }));
        }
        const rowCollapseKey = `${targetSubgroupInfo.parentGroupId}::${targetSubgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[rowCollapseKey] === false ? prev : { ...prev, [rowCollapseKey]: false }));
        // Expand inline subgroup if present; if not present (progressive mode), we'll fall back to opening the overlay
        // after a few retries below.
        setCollapsedSubgroups(prev => (prev[targetGroupKey] === false ? prev : { ...prev, [targetGroupKey]: false }));
      } else {
        const groupCardKey = (questionIdToGroupKey as any)[targetGroupKey] || targetGroupKey;
        if (groupCardKey) {
          setCollapsedGroups(prev => (prev[groupCardKey] === false ? prev : { ...prev, [groupCardKey]: false }));
        }
      }
    } catch (_) {
      // ignore visibility preparation failures
    }

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
      // If we're trying to scroll to a subgroup row and it's not mounted (common in progressive mode),
      // open the full-page subgroup overlay after a short delay.
      if (
        targetSubgroupInfo &&
        tries === 4 &&
        (!subgroupOverlay.open || subgroupOverlay.subKey !== targetGroupKey)
      ) {
        openSubgroupOverlay(targetGroupKey);
        onDiagnostic?.('ui.autoscroll.openSubgroupOverlay', { anchor, subKey: targetGroupKey });
      }
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

  // visualViewport bottom inset is handled globally in App.tsx so the bottom action bar works across views.

  useEffect(() => {
    const anyOpen = subgroupOverlay.open || infoOverlay.open || fileOverlay.open;
    if (!anyOpen) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fileOverlay.open) {
          closeFileOverlay();
          return;
        }
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
  }, [
    closeFileOverlay,
    closeInfoOverlay,
    closeSubgroupOverlay,
    fileOverlay.open,
    infoOverlay.open,
    subgroupOverlay.open
  ]);
  useEffect(() => {
    if (!status || !statusRef.current) return;
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;

    const el = statusRef.current;
    const headerEl = document.querySelector<HTMLElement>('.ck-app-header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const minTop = Math.max(0, headerH + 8);
    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top >= minTop && rect.bottom >= minTop && rect.top <= window.innerHeight - 12;
    if (alreadyVisible) return;

    try {
      el.focus();
    } catch (_) {
      // ignore
    }
    // Respect sticky header by using scroll-margin-top on the element.
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

  const handleFileFieldChange = (
    question: WebQuestionDefinition,
    items: Array<string | File>,
    errorMessage?: string
  ) => {
    if (onStatusClear) onStatusClear();
    setValues(prev => ({ ...prev, [question.id]: items as unknown as FieldValue }));
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
    const existing = toUploadItems(values[question.id]);
    const { items, errorMessage } = applyUploadConstraints(question, existing, incoming, language);
    handleFileFieldChange(question, items, errorMessage);
    const accepted = Math.max(0, items.length - existing.length);
    if (errorMessage) {
      announceUpload(question.id, errorMessage);
      onDiagnostic?.('upload.error', { questionId: question.id, error: errorMessage });
    } else if (accepted > 0) {
      announceUpload(
        question.id,
        `Added ${accepted} file${accepted > 1 ? 's' : ''}. ${items.length} total selected.`
      );
    } else {
      announceUpload(question.id, 'Files unchanged.');
    }
    onDiagnostic?.('upload.add', {
      questionId: question.id,
      attempted: incoming.length,
      accepted: accepted,
      total: items.length,
      error: Boolean(errorMessage)
    });

    // Immediate upload: upload accepted files now, then persist URLs via draft save (handled by App).
    if (onUploadFiles && accepted > 0) {
      announceUpload(question.id, `Uploading ${accepted} file${accepted > 1 ? 's' : ''}…`);
      void onUploadFiles({
        scope: 'top',
        fieldPath: question.id,
        questionId: question.id,
        items,
        uploadConfig: (question as any)?.uploadConfig
      }).then(res => {
        if (!res?.success) {
          announceUpload(question.id, res?.message || 'Upload failed.');
          return;
        }
        announceUpload(question.id, 'Uploaded.');
      });
    }
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
    const existing = toUploadItems(values[question.id]);
    if (!existing.length) return;
    const removed = existing[index];
    const next = existing.filter((_, idx) => idx !== index);
    handleFileFieldChange(question, next);
    onDiagnostic?.('upload.remove', { questionId: question.id, removed: describeUploadItem(removed as any), remaining: next.length });
    announceUpload(
      question.id,
      removed ? `Removed ${describeUploadItem(removed as any)}. ${next.length} remaining.` : `Removed file. ${next.length} remaining.`
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
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
        mode: 'init'
      });
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
      const { values: nextValues, lineItems: recomputed } = applyValueMapsToForm(definition, values, nextLineItems, {
        mode: 'init'
      });
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
    const { values: nextValues, lineItems: nextLineItems } = applyValueMapsToForm(definition, baseValues, lineItems, {
      mode: 'change'
    });
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
    const { values: nextValues, lineItems: finalLineItems } = applyValueMapsToForm(definition, values, updatedLineItems, {
      mode: 'change'
    });
    setLineItems(finalLineItems);
    setValues(nextValues);
    setErrors(prev => {
      const next = { ...prev };
      delete next[group.id];
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

  const processIncomingFilesForLineField = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    incoming: File[];
  }) => {
    const { group, rowId, field, fieldPath, incoming } = args;
    if (!incoming.length) return;
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    const pseudo = { uploadConfig: field.uploadConfig } as unknown as WebQuestionDefinition;
    const { items: files, errorMessage } = applyUploadConstraints(pseudo, existingFiles, incoming, language);

    handleLineFieldChange(group, rowId, field, files as unknown as FieldValue);
    setErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[fieldPath] = errorMessage;
      } else {
        delete next[fieldPath];
      }
      return next;
    });

    const accepted = Math.max(0, files.length - existingFiles.length);
    if (errorMessage) {
      announceUpload(fieldPath, errorMessage);
      onDiagnostic?.('upload.error', { fieldPath, error: errorMessage, scope: 'line' });
    } else if (accepted > 0) {
      announceUpload(fieldPath, `Added ${accepted} file${accepted > 1 ? 's' : ''}. ${files.length} total selected.`);
    } else {
      announceUpload(fieldPath, 'Files unchanged.');
    }
    onDiagnostic?.('upload.add', {
      fieldPath,
      attempted: incoming.length,
      accepted,
      total: files.length,
      error: Boolean(errorMessage),
      scope: 'line'
    });

    // Immediate upload: upload accepted files now, then persist URLs via draft save (handled by App).
    if (onUploadFiles && accepted > 0) {
      announceUpload(fieldPath, `Uploading ${accepted} file${accepted > 1 ? 's' : ''}…`);
      void onUploadFiles({
        scope: 'line',
        fieldPath,
        groupId: group.id,
        rowId,
        fieldId: field.id,
        items: files,
        uploadConfig: field.uploadConfig
      }).then(res => {
        if (!res?.success) {
          announceUpload(fieldPath, res?.message || 'Upload failed.');
          return;
        }
        announceUpload(fieldPath, 'Uploaded.');
      });
    }
  };

  const handleLineFileInputChange = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    list: FileList | null;
  }) => {
    const { group, rowId, field, fieldPath, list } = args;
    if (!list || !list.length) {
      resetNativeFileInput(fieldPath);
      return;
    }
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(list) });
    resetNativeFileInput(fieldPath);
  };

  const handleLineFileDrop = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    event: React.DragEvent<HTMLDivElement>;
  }) => {
    const { group, rowId, field, fieldPath, event } = args;
    event.preventDefault();
    if (submitting) return;
    if (!event.dataTransfer?.files?.length) return;
    processIncomingFilesForLineField({ group, rowId, field, fieldPath, incoming: Array.from(event.dataTransfer.files) });
    onDiagnostic?.('upload.drop', { fieldPath, count: event.dataTransfer.files.length, scope: 'line' });
    resetDrag(fieldPath);
  };

  const removeLineFile = (args: {
    group: WebQuestionDefinition;
    rowId: string;
    field: any;
    fieldPath: string;
    index: number;
  }) => {
    const { group, rowId, field, fieldPath, index } = args;
    const existingRows = lineItems[group.id] || [];
    const currentRow = existingRows.find(r => r.id === rowId);
    const existingFiles = toUploadItems((currentRow?.values || {})[field.id] as any);
    if (!existingFiles.length) return;
    const removed = existingFiles[index];
    const next = existingFiles.filter((_, idx) => idx !== index);
    handleLineFieldChange(group, rowId, field, next as unknown as FieldValue);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    onDiagnostic?.('upload.remove', { fieldPath, removed: describeUploadItem(removed as any), remaining: next.length, scope: 'line' });
    announceUpload(
      fieldPath,
      removed ? `Removed ${describeUploadItem(removed as any)}. ${next.length} remaining.` : `Removed file. ${next.length} remaining.`
    );
  };

  const clearLineFiles = (args: { group: WebQuestionDefinition; rowId: string; field: any; fieldPath: string }) => {
    const { group, rowId, field, fieldPath } = args;
    handleLineFieldChange(group, rowId, field, [] as unknown as FieldValue);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldPath];
      return copy;
    });
    resetDrag(fieldPath);
    resetNativeFileInput(fieldPath);
    announceUpload(fieldPath, 'Cleared all files.');
    onDiagnostic?.('upload.clear', { fieldPath, scope: 'line' });
  };

  const renderOptions = (q: WebQuestionDefinition): OptionSet => {
    ensureOptions(q);
    return optionState[optionKey(q.id)] || toOptionSet(q);
  };

  const resolveVisibilityValue = useCallback(
    (fieldId: string): FieldValue | undefined => {
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
    },
    [lineItems, values]
  );

  const topLevelGroupProgress = useMemo(() => {
    // Mirror the progress logic used in the group header UI.
    const isQuestionComplete = (q: WebQuestionDefinition): boolean => {
      if (q.type === 'LINE_ITEM_GROUP') {
        const rows = (lineItems[q.id] || []) as any[];
        return rows.length > 0;
      }
      const mappedValue = (q as any).valueMap
        ? resolveValueMapValue((q as any).valueMap, (fieldId: string) => values[fieldId], {
            language,
            targetOptions: toOptionSet(q as any)
          })
        : undefined;
      const raw = (q as any).valueMap ? mappedValue : (values[q.id] as any);
      return !isEmptyValue(raw as any);
    };

    const groups = (groupSections || []).filter(s => s && !s.isHeader && s.collapsible);
    return groups
      .map(section => {
        const visible = (section.questions || []).filter(
          q =>
            !shouldHideField(q.visibility, {
              getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
            })
        );
        if (!visible.length) return null;

        const requiredQs = visible.filter(q => !!q.required);
        const totalRequired = requiredQs.length;
        const requiredComplete = requiredQs.reduce((acc, q) => (isQuestionComplete(q) ? acc + 1 : acc), 0);
        const complete = totalRequired > 0 && requiredComplete >= totalRequired;
        return { key: section.key, complete, totalRequired, requiredComplete };
      })
      .filter(Boolean) as Array<{ key: string; complete: boolean; totalRequired: number; requiredComplete: number }>;
  }, [groupSections, language, lineItems, resolveVisibilityValue, values]);

  const prevGroupCompleteRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!autoCollapseGroups) return;
    if (!topLevelGroupProgress.length) return;

    const prevComplete = prevGroupCompleteRef.current || {};
    const nextComplete: Record<string, boolean> = {};
    topLevelGroupProgress.forEach(g => {
      nextComplete[g.key] = g.complete;
    });
    prevGroupCompleteRef.current = nextComplete;

    const completedNow = topLevelGroupProgress
      .filter(g => g.complete && !prevComplete[g.key])
      .map(g => g.key);
    if (!completedNow.length) return;

    // Choose the last group (in visual order) that just completed as the anchor for "open next".
    const anchorKey = completedNow[completedNow.length - 1];
    const anchorIdx = topLevelGroupProgress.findIndex(g => g.key === anchorKey);

    const findNextIncomplete = (): string | undefined => {
      if (!autoOpenNextIncomplete) return undefined;
      if (anchorIdx < 0) return undefined;

      const n = topLevelGroupProgress.length;
      for (let step = 1; step <= n; step += 1) {
        const idx = (anchorIdx + step) % n;
        const cand = topLevelGroupProgress[idx];
        if (!cand) continue;
        if (cand.totalRequired <= 0) continue;
        if (!cand.complete) return cand.key;
      }
      return undefined;
    };

    const nextOpenKey = findNextIncomplete();

    setCollapsedGroups(prev => {
      let changed = false;
      const next = { ...prev };
      completedNow.forEach(key => {
        if (next[key] !== true) {
          next[key] = true;
          changed = true;
        }
      });
      if (nextOpenKey) {
        if (next[nextOpenKey] !== false) {
          next[nextOpenKey] = false;
          changed = true;
        }
      }

      if (changed) {
        onDiagnostic?.('ui.group.autoCollapse', {
          completed: completedNow,
          opened: nextOpenKey || null
        });
      }
      return changed ? next : prev;
    });

    if (nextOpenKey) {
      scheduleScrollGroupToTop(nextOpenKey, { reason: 'autoOpenNext' });
    }
  }, [autoCollapseGroups, autoOpenNextIncomplete, onDiagnostic, scheduleScrollGroupToTop, topLevelGroupProgress]);

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
    const forceStackedLabel = q.ui?.labelLayout === 'stacked';
    const hideFieldLabel = q.ui?.hideLabel === true;
    const labelStyle = hideFieldLabel ? srOnly : undefined;

    switch (q.type) {
      case 'BUTTON': {
        const action = ((q as any)?.button?.action || '').toString().trim();
        const placementsRaw = (q as any)?.button?.placements;
        const placements = Array.isArray(placementsRaw) && placementsRaw.length ? placementsRaw : ['form'];
        const showInForm = placements.includes('form');
        // Inline BUTTON fields are currently only used for report rendering.
        if (!showInForm || action !== 'renderDocTemplate') return null;

        const label = resolveLabel(q, language);
        const busyThis = !!reportBusy && reportBusyId === q.id;
        const disabled = submitting || !onReportButton || !!reportBusy;
        return (
          <div
            key={q.id}
            className="field inline-field ck-full-width"
            data-field-path={q.id}
          >
            <label style={srOnly}>{label}</label>
            <button
              type="button"
              onClick={() => onReportButton?.(q.id)}
              disabled={disabled}
              style={withDisabled(buttonStyles.secondary, disabled)}
            >
              {busyThis ? 'Rendering…' : label}
            </button>
          </div>
        );
      }
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE':
        const mappedValue = q.valueMap
          ? resolveValueMapValue(q.valueMap, fieldId => values[fieldId], { language, targetOptions: toOptionSet(q) })
          : undefined;
        const inputValueRaw = q.valueMap ? (mappedValue || '') : ((values[q.id] as any) ?? '');
        const inputValue = q.type === 'DATE' ? toDateInputValue(inputValueRaw) : inputValueRaw;
        if (q.type === 'NUMBER') {
          const numberText =
            inputValue === undefined || inputValue === null ? '' : (inputValue as any).toString();
          return (
            <div
              key={q.id}
              className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label style={labelStyle}>
                {resolveFieldLabel(q, language, q.id)}
                {(q as any).required && <RequiredStar />}
              </label>
              <NumberStepper
                value={numberText}
                disabled={submitting}
                readOnly={!!q.valueMap}
                ariaLabel={resolveFieldLabel(q, language, q.id)}
                onChange={next => handleFieldChange(q, next)}
              />
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        return (
          <div
            key={q.id}
            className={`${q.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
              forceStackedLabel ? ' ck-label-stacked' : ''
            }${q.type === 'DATE' && !forceStackedLabel ? ' ck-date-inline' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {q.type === 'PARAGRAPH' ? (
              <textarea
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap}
                rows={((q as any)?.ui as any)?.paragraphRows || 4}
              />
            ) : (
              <input
                type={q.type === 'DATE' ? 'date' : 'text'}
                value={inputValue}
                onChange={e => handleFieldChange(q, e.target.value)}
                readOnly={!!q.valueMap}
              />
            )}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      case 'CHOICE': {
        const rawVal = values[q.id];
        const choiceValue = Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
        return (
          <div
            key={q.id}
            className={`field inline-field ck-full-width${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {renderChoiceControl({
              fieldPath: q.id,
              value: choiceValue || '',
              options: opts,
              required: !!q.required,
              override: q.ui?.control,
              onChange: next => handleFieldChange(q, next)
            })}
            {(() => {
              const selected = opts.find(opt => opt.value === choiceValue);
              const fallbackLabel = resolveLabel(q, language);
              const tooltipLabel = resolveLocalizedString(q.dataSource?.tooltipLabel, language, fallbackLabel);
              return <InfoTooltip text={selected?.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
            })()}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'CHECKBOX': {
        const hasAnyOption = !!((optionSet.en && optionSet.en.length) || (optionSet.fr && optionSet.fr.length) || (optionSet.nl && optionSet.nl.length));
        const isConsentCheckbox = !q.dataSource && !hasAnyOption;
        const selected = Array.isArray(values[q.id]) ? (values[q.id] as string[]) : [];
        if (isConsentCheckbox) {
          const consentLabel = resolveLabel(q, language);
          return (
            <div
              key={q.id}
              className={`field inline-field ck-consent-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
              data-field-path={q.id}
              data-has-error={errors[q.id] ? 'true' : undefined}
              data-has-warning={hasWarning(q.id) ? 'true' : undefined}
            >
              <label>
                <input
                  type="checkbox"
                  checked={!!values[q.id]}
                  aria-label={hideFieldLabel ? consentLabel : undefined}
                  onChange={e => handleFieldChange(q, e.target.checked)}
                />
                {!hideFieldLabel ? (
                  <span className="ck-consent-text">
                    {consentLabel}
                    {q.required && <RequiredStar />}
                  </span>
                ) : null}
              </label>
              {errors[q.id] && <div className="error">{errors[q.id]}</div>}
              {renderWarnings(q.id)}
            </div>
          );
        }
        return (
          <div
            key={q.id}
            className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
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
                        const next = e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value);
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
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'FILE_UPLOAD': {
        const items = toUploadItems(values[q.id]);
        const uploadConfig = q.uploadConfig || {};
        const allowedDisplay = (uploadConfig.allowedExtensions || []).map(ext =>
          ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
        );
        const allowedMimeDisplay = (uploadConfig.allowedMimeTypes || [])
          .map(v => (v !== undefined && v !== null ? v.toString().trim() : ''))
          .filter(Boolean);
        const acceptAttr = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean).join(',') || undefined;
        const maxed = uploadConfig.maxFiles ? items.length >= uploadConfig.maxFiles : false;
        const helperParts: string[] = [];
        if (uploadConfig.minFiles && uploadConfig.minFiles > 1) {
          helperParts.push(
            tSystem(
              uploadConfig.minFiles === 1 ? 'files.minFilesOne' : 'files.minFilesMany',
              language,
              uploadConfig.minFiles === 1 ? '1 file required' : '{count} files required',
              { count: uploadConfig.minFiles }
            )
          );
        }
        if (uploadConfig.maxFiles) {
          helperParts.push(
            tSystem(
              uploadConfig.maxFiles === 1 ? 'files.maxFilesOne' : 'files.maxFilesMany',
              language,
              uploadConfig.maxFiles === 1 ? '1 file max' : '{count} files max',
              { count: uploadConfig.maxFiles }
            )
          );
        }
        if (uploadConfig.maxFileSizeMb) {
          helperParts.push(tSystem('files.maxSizeEach', language, '≤ {mb} MB each', { mb: uploadConfig.maxFileSizeMb }));
        }
        const allowedAll = [...allowedDisplay, ...allowedMimeDisplay].filter(Boolean);
        if (allowedAll.length) {
          helperParts.push(tSystem('files.allowed', language, 'Allowed: {exts}', { exts: allowedAll.join(', ') }));
        }
        const remainingSlots =
          uploadConfig.maxFiles && uploadConfig.maxFiles > items.length ? uploadConfig.maxFiles - items.length : null;
        const dragActive = !!dragState[q.id];
        return (
          <div
            key={q.id}
            className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
            data-field-path={q.id}
            data-has-error={errors[q.id] ? 'true' : undefined}
            data-has-warning={hasWarning(q.id) ? 'true' : undefined}
          >
            <label style={labelStyle}>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <div className="ck-upload-row">
            <div
              role="button"
              tabIndex={0}
                aria-disabled={maxed || submitting}
                className="ck-upload-dropzone"
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
                  padding: '10px 12px',
                  background: dragActive ? '#e0f2fe' : maxed || submitting ? '#f1f5f9' : '#f8fafc',
                color: '#0f172a',
                  cursor: maxed || submitting ? 'not-allowed' : 'pointer',
                transition: 'border-color 120ms ease, background 120ms ease',
                  boxShadow: dragActive ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
                  flex: 1,
                  minWidth: 0,
                  minHeight: 'var(--control-height)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10
                }}
              >
                <UploadIcon />
                {items.length ? <span className="pill">{items.length}</span> : null}
                <span style={srOnly}>
                  {dragActive ? 'Release to upload files' : maxed ? 'Maximum files selected' : 'Click to browse'}
                </span>
              </div>
              <button
                type="button"
                className="ck-upload-files-btn"
                onClick={() =>
                  openFileOverlay({
                    scope: 'top',
                    title: resolveLabel(q, language),
                    question: q,
                    fieldPath: q.id
                  })
                }
                disabled={submitting}
                style={withDisabled(buttonStyles.secondary, submitting)}
                title={helperParts.length ? helperParts.join(' | ') : undefined}
              >
                {tSystem('files.title', language, 'Files')}
                {items.length ? ` (${items.length})` : ''}
              </button>
              {remainingSlots ? (
                <div className="ck-upload-helper muted">
                  {resolveUploadRemainingHelperText({ uploadConfig, language, remaining: remainingSlots })}
                </div>
              ) : null}
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
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
            {renderWarnings(q.id)}
          </div>
        );
      }
      case 'LINE_ITEM_GROUP': {
            return (
          <LineItemGroupQuestion
            key={q.id}
            q={q}
            ctx={{
              definition,
              language,
              values,
              setValues,
              lineItems,
              setLineItems,
              submitting,
              errors,
              setErrors,
              warningByField,
              optionState,
              setOptionState,
              ensureLineOptions,
              renderChoiceControl,
              openInfoOverlay,
              openFileOverlay,
              openSubgroupOverlay,
              addLineItemRowManual,
              removeLineRow,
              handleLineFieldChange,
              collapsedGroups,
              toggleGroupCollapsed,
              collapsedRows,
              setCollapsedRows,
              collapsedSubgroups,
              setCollapsedSubgroups,
              subgroupSelectors,
              setSubgroupSelectors,
              subgroupBottomRefs,
              fileInputsRef,
              dragState,
              incrementDrag,
              decrementDrag,
              resetDrag,
              uploadAnnouncements,
              handleLineFileInputChange,
              handleLineFileDrop,
              removeLineFile,
              clearLineFiles,
              errorIndex,
              setOverlay,
              onDiagnostic
            }}
          />
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

    const expandGroupForQuestionId = (questionId: string): boolean => {
      const groupKey = questionIdToGroupKey[questionId];
      if (!groupKey) return false;
      setCollapsedGroups(prev => (prev[groupKey] === false ? prev : { ...prev, [groupKey]: false }));
      return true;
    };

    const ensureMountedForError = (): boolean => {
      const parts = firstKey.split('__');
      if (parts.length !== 3) {
        // Top-level question error: ensure its group card is expanded.
        return expandGroupForQuestionId(firstKey);
      }
      const prefix = parts[0];
      const fieldId = parts[1];
      const rowId = parts[2];
      const subgroupInfo = parseSubgroupKey(prefix);
      if (subgroupInfo) {
        expandGroupForQuestionId(subgroupInfo.parentGroupId);
        const collapseKey = `${subgroupInfo.parentGroupId}::${subgroupInfo.parentRowId}`;
        setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
        const nestedKey = nestedGroupMeta.subgroupFieldToGroupKey[`${subgroupInfo.parentGroupId}::${subgroupInfo.subGroupId}__${fieldId}`];
        if (nestedKey) {
          setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
        }
        if (!subgroupOverlay.open || subgroupOverlay.subKey !== prefix) {
          openSubgroupOverlay(prefix);
          onDiagnostic?.('validation.navigate.openSubgroup', { key: firstKey, subKey: prefix });
        }
        return true;
      }

      expandGroupForQuestionId(prefix);
      const collapseKey = `${prefix}::${rowId}`;
      setCollapsedRows(prev => (prev[collapseKey] === false ? prev : { ...prev, [collapseKey]: false }));
      const nestedKey = nestedGroupMeta.lineFieldToGroupKey[`${prefix}__${fieldId}`];
      if (nestedKey) {
        setCollapsedGroups(prev => (prev[nestedKey] === false ? prev : { ...prev, [nestedKey]: false }));
      }
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
  }, [
    errors,
    nestedGroupMeta.lineFieldToGroupKey,
    nestedGroupMeta.subgroupFieldToGroupKey,
    onDiagnostic,
    openSubgroupOverlay,
    questionIdToGroupKey,
    subgroupOverlay.open,
    subgroupOverlay.subKey
  ]);

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
          <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.secondary}>
            <PlusIcon />
            Add line
          </button>
        );
      }
      if (subConfig.addMode === 'overlay' && subConfig.anchorFieldId) {
                        return (
                          <button
                            type="button"
            style={buttonStyles.secondary}
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
            <PlusIcon />
            {resolveLocalizedString(subConfig.addButtonLabel, language, 'Add lines')}
                          </button>
                        );
                      }
                      return (
        <button type="button" onClick={() => addLineItemRowManual(subKey)} style={buttonStyles.secondary}>
          <PlusIcon />
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              gap: 12
            }}
          >
            <div />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 40, color: '#0f172a', letterSpacing: -0.4 }}>{subLabel}</div>
              <div className="muted" style={{ fontWeight: 700, marginTop: 8, fontSize: 24 }}>
                {parentLabel}
                {parentRowIdx >= 0
                  ? ` · ${tSystem('overlay.row', language, 'Row')} ${parentRowIdx + 1}`
                  : parsed?.parentRowId
                  ? ` · ${parsed.parentRowId}`
                  : ''}
                {` · ${tSystem(
                  orderedRows.length === 1 ? 'overlay.itemsOne' : 'overlay.itemsMany',
                  language,
                  orderedRows.length === 1 ? '{count} item' : '{count} items',
                  { count: orderedRows.length }
                )}`}
                          </div>
            </div>
            <div style={{ justifySelf: 'end' }}>
              <button type="button" onClick={closeSubgroupOverlay} style={buttonStyles.secondary}>
                {tSystem('common.close', language, 'Close')}
              </button>
            </div>
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
                                    <option value="">{tSystem('common.selectPlaceholder', language, 'Select…')}</option>
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
              const isAutoRow =
                !!subRow.autoGenerated || (subRow.values && (subRow.values as any)[ROW_SOURCE_KEY] === 'auto');
              const anchorFieldId =
                subConfig?.anchorFieldId !== undefined && subConfig?.anchorFieldId !== null ? subConfig.anchorFieldId.toString() : '';
              const anchorField = anchorFieldId ? (subConfig?.fields || []).find(f => f.id === anchorFieldId) : undefined;
              const showAnchorTitle = !!anchorField && isAutoRow;
              const rowDisclaimerText = resolveRowDisclaimerText({
                ui: subConfig?.ui as any,
                language,
                rowValues: (subRow.values || {}) as any,
                autoGenerated: isAutoRow
              });

              const anchorTitleLabel = (() => {
                if (!showAnchorTitle || !anchorField) return '';
                const rawVal = (subRow.values || {})[anchorField.id];
                if (anchorField.type === 'CHOICE') {
                  ensureLineOptions(subKey, anchorField);
                  const optionSetField: OptionSet =
                    optionState[optionKey(anchorField.id, subKey)] || {
                      en: anchorField.options || [],
                      fr: (anchorField as any).optionsFr || [],
                      nl: (anchorField as any).optionsNl || []
                    };
                  const dependencyIds = (
                    Array.isArray((anchorField as any).optionFilter?.dependsOn)
                      ? (anchorField as any).optionFilter?.dependsOn
                      : [(anchorField as any).optionFilter?.dependsOn || '']
                  ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                  const allowedField = computeAllowedOptions(
                    (anchorField as any).optionFilter,
                    optionSetField,
                    dependencyIds.map((dep: string) => {
                      const selectorFallback = subSelectorCfg && dep === subSelectorCfg.id ? subgroupSelectors[subKey] : undefined;
                      return toDependencyValue(subRow.values?.[dep] ?? values[dep] ?? parentRowValues[dep] ?? selectorFallback);
                    })
                  );
                  const choiceVal =
                    Array.isArray(rawVal) && rawVal.length ? (rawVal as any[])[0]?.toString?.() : (rawVal as any)?.toString?.();
                  const choiceValStr = (choiceVal || '').toString();
                  const allowedWithCurrent =
                    choiceValStr && !allowedField.includes(choiceValStr) ? [...allowedField, choiceValStr] : allowedField;
                  const optsField = buildLocalizedOptions(optionSetField, allowedWithCurrent, language);
                  const selectedOpt = optsField.find(opt => opt.value === choiceValStr);
                  return (selectedOpt?.label || choiceValStr || '').toString();
                }
                if (Array.isArray(rawVal)) return rawVal.map(v => (v ?? '').toString()).filter(Boolean).join(', ');
                return rawVal === undefined || rawVal === null ? '' : rawVal.toString();
              })();

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
                  {showAnchorTitle ? (
                    <div style={{ marginBottom: rowDisclaimerText ? 6 : 10 }}>
                      <div className="ck-row-title">{anchorTitleLabel || '—'}</div>
                    </div>
                  ) : null}
                  {rowDisclaimerText ? (
                    <div className="ck-row-disclaimer" style={{ marginBottom: 10 }}>
                      {rowDisclaimerText}
                    </div>
                  ) : null}
                  {!isAutoRow && !rowDisclaimerText && (
                                <div style={{ marginBottom: 8 }}>
                                  <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
                        {resolveLocalizedString({ en: 'Manual', fr: 'Manuel', nl: 'Handmatig' }, language, 'Manual')}
                                  </span>
                                </div>
                              )}
                  {(() => {
                    const renderSubField = (field: any) => {
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
                      ).filter((dep: unknown): dep is string => typeof dep === 'string' && !!dep);
                                const allowedField = computeAllowedOptions(
                                  field.optionFilter,
                                  optionSetField,
                        dependencyIds.map((dep: string) => {
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
                      const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                                if (hideField) return null;
                      const fieldPath = `${subKey}__${field.id}__${subRow.id}`;
                      const forceStackedSubFieldLabel = (field as any)?.ui?.labelLayout === 'stacked';
                      const hideLabel = Boolean((field as any)?.ui?.hideLabel);
                      const labelStyle = hideLabel ? srOnly : undefined;

                                switch (field.type) {
                                  case 'CHOICE': {
                                    const rawVal = subRow.values[field.id];
                                    const choiceVal =
                                      Array.isArray(rawVal) && rawVal.length ? (rawVal as string[])[0] : (rawVal as string);
                                    return (
                            <div
                              key={field.id}
                              className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                                        <label style={labelStyle}>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                              {renderChoiceControl({
                                fieldPath,
                                value: choiceVal || '',
                                options: optsField,
                                required: !!field.required,
                                override: (field as any)?.ui?.control,
                                onChange: next => handleLineFieldChange(subGroupDef, subRow.id, field, next)
                              })}
                                        {(() => {
                                          const selected = optsField.find(opt => opt.value === choiceVal);
                                          if (!selected?.tooltip) return null;
                                          const fallbackLabel = resolveFieldLabel(field, language, field.id);
                                const tooltipLabel = resolveLocalizedString(field.dataSource?.tooltipLabel, language, fallbackLabel);
                                return <InfoTooltip text={selected.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />;
                                        })()}
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  }
                                  case 'CHECKBOX': {
                          const hasAnyOption =
                            !!((optionSetField.en && optionSetField.en.length) ||
                              ((optionSetField as any).fr && (optionSetField as any).fr.length) ||
                              ((optionSetField as any).nl && (optionSetField as any).nl.length));
                          const isConsentCheckbox = !(field as any).dataSource && !hasAnyOption;
                                    const selected = Array.isArray(subRow.values[field.id]) ? (subRow.values[field.id] as string[]) : [];
                                    if (isConsentCheckbox) {
                                      return (
                                        <div
                                          key={field.id}
                                          className={`field inline-field ck-consent-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
                                          data-field-path={fieldPath}
                                          data-has-error={errors[fieldPath] ? 'true' : undefined}
                                          data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                                        >
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={!!subRow.values[field.id]}
                                              onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.checked)}
                                            />
                                            <span className="ck-consent-text" style={labelStyle}>
                                              {resolveFieldLabel(field, language, field.id)}
                                              {field.required && <RequiredStar />}
                                            </span>
                                          </label>
                                          {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                          {renderWarnings(fieldPath)}
                                        </div>
                                      );
                                    }
                                    return (
                                      <div
                                        key={field.id}
                                        className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
                                        data-field-path={fieldPath}
                                        data-has-error={errors[fieldPath] ? 'true' : undefined}
                                        data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
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
                                                <span
                                                  key={opt.value}
                                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                >
                                                  {opt.label}{' '}
                                                  <InfoTooltip text={opt.tooltip} label={tooltipLabel} onOpen={openInfoOverlay} />
                                                </span>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                        {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                                        {renderWarnings(fieldPath)}
                                      </div>
                                    );
                                  }
                        case 'FILE_UPLOAD': {
                          const items = toUploadItems(subRow.values[field.id] as any);
                          const uploadConfig = (field as any).uploadConfig || {};
                          const allowedDisplay = (uploadConfig.allowedExtensions || []).map((ext: string) =>
                            ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`
                          );
                          const acceptAttr = allowedDisplay.length ? allowedDisplay.join(',') : undefined;
                          const maxed = uploadConfig.maxFiles ? items.length >= uploadConfig.maxFiles : false;
                          const dragActive = !!dragState[fieldPath];
                                    return (
                            <div
                              key={field.id}
                              className={`field inline-field${forceStackedSubFieldLabel ? ' ck-label-stacked' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                                        <label style={labelStyle}>
                                          {resolveFieldLabel(field, language, field.id)}
                                          {field.required && <RequiredStar />}
                                        </label>
                              <div className="ck-upload-row">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-disabled={maxed || submitting}
                                  className="ck-upload-dropzone"
                                  onClick={() => {
                                    if (maxed || submitting) return;
                                    fileInputsRef.current[fieldPath]?.click();
                                  }}
                                  onKeyDown={e => {
                                    if (maxed || submitting) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      fileInputsRef.current[fieldPath]?.click();
                                    }
                                  }}
                                  onDragEnter={e => {
                                    e.preventDefault();
                                    if (submitting) return;
                                    incrementDrag(fieldPath);
                                  }}
                                  onDragOver={e => e.preventDefault()}
                                  onDragLeave={e => {
                                    e.preventDefault();
                                    if (submitting) return;
                                    decrementDrag(fieldPath);
                                  }}
                                  onDrop={e =>
                                    handleLineFileDrop({ group: subGroupDef, rowId: subRow.id, field, fieldPath, event: e })
                                  }
                              style={{
                                    border: dragActive ? '2px solid #0ea5e9' : '1px dashed #94a3b8',
                                    borderRadius: 12,
                                    padding: '10px 12px',
                                    background: dragActive ? '#e0f2fe' : maxed || submitting ? '#f1f5f9' : '#f8fafc',
                                    color: '#0f172a',
                                    cursor: maxed || submitting ? 'not-allowed' : 'pointer',
                                    transition: 'border-color 120ms ease, background 120ms ease',
                                    boxShadow: dragActive ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
                                flex: 1,
                                    minWidth: 0,
                                    minHeight: 'var(--control-height)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10
                                  }}
                                >
                                  <UploadIcon />
                                  {items.length ? <span className="pill">{items.length}</span> : null}
                                  <span style={srOnly}>
                                    {dragActive
                                      ? 'Release to upload files'
                                      : maxed
                                        ? 'Maximum files selected'
                                        : 'Click to browse'}
                                      </span>
                                  </div>
                                <button
                                  type="button"
                                  className="ck-upload-files-btn"
                                  onClick={() =>
                                    openFileOverlay({
                                      scope: 'line',
                                      title: resolveFieldLabel(field, language, field.id),
                                      group: subGroupDef,
                                      rowId: subRow.id,
                                      field,
                                      fieldPath
                                    })
                                  }
                                  disabled={submitting}
                                  style={withDisabled(buttonStyles.secondary, submitting)}
                                >
                                  {tSystem('files.title', language, 'Files')}
                                  {items.length ? ` (${items.length})` : ''}
                                </button>
                              </div>
                              <div style={srOnly} aria-live="polite">
                                {uploadAnnouncements[fieldPath] || ''}
                            </div>
                              <input
                                ref={el => {
                                  fileInputsRef.current[fieldPath] = el;
                                }}
                                type="file"
                                multiple={!uploadConfig.maxFiles || uploadConfig.maxFiles > 1}
                                accept={acceptAttr}
                                style={{ display: 'none' }}
                                onChange={e =>
                                  handleLineFileInputChange({
                                    group: subGroupDef,
                                    rowId: subRow.id,
                                    field,
                                    fieldPath,
                                    list: e.target.files
                                  })
                                }
                              />
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
                      </div>
                    );
                        }
                        default: {
                          const mapped = field.valueMap
                            ? resolveValueMapValue(
                                field.valueMap,
                                fid => {
                                  if (subRow.values.hasOwnProperty(fid)) return subRow.values[fid];
                                  if (parentRowValues.hasOwnProperty(fid)) return parentRowValues[fid];
                                  return values[fid];
                                },
                                { language, targetOptions: toOptionSet(field) }
                              )
                            : undefined;
                          const fieldValueRaw = field.valueMap ? mapped : ((subRow.values[field.id] as any) ?? '');
                          const fieldValue = field.type === 'DATE' ? toDateInputValue(fieldValueRaw) : fieldValueRaw;
                          return (
                            <div
                              key={field.id}
                              className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
                                forceStackedSubFieldLabel ? ' ck-label-stacked' : ''
                              }${field.type === 'DATE' && !forceStackedSubFieldLabel ? ' ck-date-inline' : ''}`}
                              data-field-path={fieldPath}
                              data-has-error={errors[fieldPath] ? 'true' : undefined}
                              data-has-warning={hasWarning(fieldPath) ? 'true' : undefined}
                            >
                              <label style={labelStyle}>
                                {resolveFieldLabel(field, language, field.id)}
                                {field.required && <RequiredStar />}
                    </label>
                              <input
                                type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                                value={fieldValue}
                                onChange={e => handleLineFieldChange(subGroupDef, subRow.id, field, e.target.value)}
                                readOnly={!!field.valueMap}
                              />
                              {errors[fieldPath] && <div className="error">{errors[fieldPath]}</div>}
                              {renderWarnings(fieldPath)}
          </div>
        );
      }
                      }
                    };

                    const visibleFields = (subConfig?.fields || [])
                      .filter(field => {
                      const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                      return !hideField;
                      })
                      .filter(field => !(showAnchorTitle && anchorFieldId && field.id === anchorFieldId));

                    const contextPrefix = parsed ? `sub:${parsed.parentGroupId}:${parsed.subGroupId}` : `sub:${subKey}`;

                    return (
                      <GroupedPairedFields
                        contextPrefix={contextPrefix}
                        fields={visibleFields}
                        language={language}
                        collapsedGroups={collapsedGroups}
                        toggleGroupCollapsed={toggleGroupCollapsed}
                        renderField={renderSubField}
                        hasError={(field: any) => !!errors[`${subKey}__${field.id}__${subRow.id}`]}
                        isComplete={(field: any) => {
                          const mapped = field.valueMap
                            ? resolveValueMapValue(
                                field.valueMap,
                                (fid: string) => {
                                  if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fid)) return subRow.values[fid];
                                  if (Object.prototype.hasOwnProperty.call(parentRowValues || {}, fid)) return parentRowValues[fid];
                                  return values[fid];
                                },
                                { language, targetOptions: toOptionSet(field) }
                              )
                            : undefined;
                          const raw = field.valueMap ? mapped : (subRow.values || {})[field.id];
                          return !isEmptyValue(raw as any);
                        }}
                      />
                    );
                  })()}
                  <div className="line-actions">
                    <button type="button" onClick={() => removeLineRow(subKey, subRow.id)} style={buttonStyles.negative}>
                      {tSystem('lineItems.remove', language, 'Remove')}
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

  const fileOverlayPortal = (() => {
    if (!fileOverlay.open) return null;
    if (typeof document === 'undefined') return null;

    const title = fileOverlay.title || tSystem('files.title', language, 'Files');
    const isTop = fileOverlay.scope === 'top' && !!fileOverlay.question;
    const isLine =
      fileOverlay.scope === 'line' &&
      !!fileOverlay.group &&
      !!fileOverlay.rowId &&
      !!fileOverlay.field &&
      !!fileOverlay.fieldPath;

    if (!isTop && !isLine) return null;

    const fieldPath = isTop ? (fileOverlay.question!.id || '') : (fileOverlay.fieldPath || '');
    const uploadConfig: any = isTop ? (fileOverlay.question as any)?.uploadConfig || {} : (fileOverlay.field as any)?.uploadConfig || {};
    const items = (() => {
      if (isTop) return toUploadItems(values[(fileOverlay.question as any).id]);
      const groupId = (fileOverlay.group as any).id;
      const rowId = fileOverlay.rowId as string;
      const fieldId = (fileOverlay.field as any).id;
      const existingRows = lineItems[groupId] || [];
      const row = existingRows.find(r => r.id === rowId);
      return toUploadItems((row?.values || {})[fieldId] as any);
    })();

    const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;

    const onAdd = () => {
      if (submitting) return;
      if (maxed) return;
      fileInputsRef.current[fieldPath]?.click();
    };

    const onClearAll = () => {
      if (submitting) return;
      if (isTop) {
        clearFiles(fileOverlay.question!);
      } else {
        clearLineFiles({
          group: fileOverlay.group!,
          rowId: fileOverlay.rowId as string,
          field: fileOverlay.field,
          fieldPath: fileOverlay.fieldPath as string
        });
      }
    };

    const onRemoveAt = (idx: number) => {
      if (submitting) return;
      if (isTop) {
        removeFile(fileOverlay.question!, idx);
      } else {
        removeLineFile({
          group: fileOverlay.group!,
          rowId: fileOverlay.rowId as string,
          field: fileOverlay.field,
          fieldPath: fileOverlay.fieldPath as string,
          index: idx
        });
      }
    };

    return (
      <FileOverlay
        open={fileOverlay.open}
        language={language}
        title={title}
        submitting={submitting}
        items={items}
        uploadConfig={uploadConfig}
        onAdd={onAdd}
        onClearAll={onClearAll}
        onRemoveAt={onRemoveAt}
        onClose={closeFileOverlay}
      />
    );
  })();

  const infoOverlayPortal = (
    <InfoOverlay
      open={infoOverlay.open}
      language={language}
      title={infoOverlay.title || ''}
      text={infoOverlay.text || ''}
      onClose={closeInfoOverlay}
    />
  );

  return (
    <>
      <div className="ck-form-sections">
        {warningTop && warningTop.length ? (
          <div
            role="status"
            style={{
              scrollMarginTop: 'calc(var(--safe-top) + 140px)',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid #fdba74',
              background: '#ffedd5',
              color: '#0f172a',
              fontWeight: 800,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div>{tSystem('validation.warningsTitle', language, 'Warnings')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 700 }}>
              {warningTop.map((w, idx) => (
                <button
                  key={`${idx}-${w.fieldPath}-${w.message}`}
                  type="button"
                  onClick={() => navigateToFieldKey(w.fieldPath)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  {w.message}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {status ? (
          <div
            ref={statusRef}
            role={statusTone === 'error' ? 'alert' : 'status'}
            tabIndex={-1}
            onClick={() => {
              if (statusTone !== 'error') return;
              const keys = Object.keys(errors || {});
              if (!keys.length) return;
              navigateToFieldKey(keys[0]);
            }}
            style={{
              scrollMarginTop: 'calc(var(--safe-top) + 140px)',
              padding: '14px 16px',
              borderRadius: 14,
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
              fontWeight: 800,
              cursor: statusTone === 'error' && Object.keys(errors || {}).length ? 'pointer' : undefined
            }}
          >
            {status}
          </div>
        ) : null}

        <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
          <div className="ck-group-stack">
            {groupSections.map(section => {
            const visible = (section.questions || []).filter(
              q =>
                !shouldHideField(q.visibility, {
                  getValue: (fieldId: string) => resolveVisibilityValue(fieldId)
                })
            );
            if (!visible.length) return null;

            const isCollapsed = section.collapsible ? !!collapsedGroups[section.key] : false;

            const requiredProgress = (() => {
              const isComplete = (q: WebQuestionDefinition): boolean => {
                if (q.type === 'LINE_ITEM_GROUP') {
                  const rows = (lineItems[q.id] || []) as any[];
                  return rows.length > 0;
                }
                const mappedValue = (q as any).valueMap
                  ? resolveValueMapValue((q as any).valueMap, (fieldId: string) => values[fieldId], {
                      language,
                      targetOptions: toOptionSet(q as any)
                    })
                  : undefined;
                const raw = (q as any).valueMap ? mappedValue : (values[q.id] as any);
                return !isEmptyValue(raw as any);
              };

              // PARAGRAPH is a textarea input in this app, so it should count toward progress like any other field.
              const requiredQs = visible.filter(q => !!q.required);
              const optionalQs = visible.filter(q => !q.required);

              const totalRequired = requiredQs.length;
              const requiredComplete = requiredQs.reduce((acc, q) => (isComplete(q) ? acc + 1 : acc), 0);

              const optionalComplete =
                totalRequired > 0 && requiredComplete >= totalRequired
                  ? optionalQs.reduce((acc, q) => (isComplete(q) ? acc + 1 : acc), 0)
                  : 0;

              const numerator = requiredComplete + optionalComplete;
              return { numerator, requiredComplete, totalRequired };
            })();

            const requiredProgressClass =
              requiredProgress.totalRequired > 0
                ? requiredProgress.requiredComplete >= requiredProgress.totalRequired
                  ? 'ck-progress-good'
                  : 'ck-progress-bad'
                : 'ck-progress-neutral';
            const expandLabel = tSystem('lineItems.expand', language, 'Expand');
            const collapseLabel = tSystem('lineItems.collapse', language, 'Collapse');

            const sectionHasError = (() => {
              const keys = Object.keys(errors || {});
              if (!keys.length) return false;
              for (const q of section.questions) {
                if (keys.includes(q.id)) return true;
                const prefix1 = `${q.id}__`;
                const prefix2 = `${q.id}::`;
                if (keys.some(k => k.startsWith(prefix1) || k.startsWith(prefix2))) return true;
              }
              return false;
            })();

            const isPairable = (q: WebQuestionDefinition): boolean => {
              if (!q.pair) return false;
              if (q.type === 'LINE_ITEM_GROUP') return false;
              if (q.type === 'PARAGRAPH') return false;
              if (q.type === 'BUTTON') return false;
              return true;
            };

            const used = new Set<string>();
            const rows: WebQuestionDefinition[][] = [];
            for (let i = 0; i < visible.length; i++) {
              const q = visible[i];
              if (used.has(q.id)) continue;
              const pairKey = q.pair ? q.pair.toString() : '';
              if (!pairKey || !isPairable(q)) {
                used.add(q.id);
                rows.push([q]);
                continue;
              }
              let match: WebQuestionDefinition | null = null;
              for (let j = i + 1; j < visible.length; j++) {
                const cand = visible[j];
                if (used.has(cand.id)) continue;
                if ((cand.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
                  match = cand;
                  break;
                }
              }
              if (match) {
                used.add(q.id);
                used.add(match.id);
                rows.push([q, match]);
              } else {
                used.add(q.id);
                rows.push([q]);
              }
            }

            return (
              <div
                key={section.key}
                className="card form-card ck-group-card"
                data-group-key={section.key}
                data-has-error={sectionHasError ? 'true' : undefined}
              >
                {section.title ? (
                  section.collapsible ? (
                    <button
                      type="button"
                      className="ck-group-header ck-group-header--clickable"
                      onClick={() => toggleGroupCollapsed(section.key)}
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} section ${section.title} (${requiredProgress.numerator}/${requiredProgress.totalRequired})`}
                    >
                      <div className="ck-group-title">{section.title}</div>
                      <span
                        className={`ck-progress-pill ${requiredProgressClass}`}
                        title={`${requiredProgress.numerator}/${requiredProgress.totalRequired}`}
                        aria-hidden="true"
                      >
                        <span>
                          {requiredProgress.numerator}/{requiredProgress.totalRequired}
                        </span>
                        <span className="ck-progress-label">{isCollapsed ? expandLabel : collapseLabel}</span>
                        <span className="ck-progress-caret">{isCollapsed ? '▸' : '▾'}</span>
                      </span>
                    </button>
                  ) : (
                    <div className="ck-group-header">
                      <div className="ck-group-title">{section.title}</div>
                    </div>
                  )
                ) : null}

                {!isCollapsed && (
                  <div className="ck-group-body">
                    <div className="ck-form-grid">
                      {rows.map(row => {
                        if (row.length === 2) {
                          const hasDate = row[0].type === 'DATE' || row[1].type === 'DATE';
                          return (
                            <PairedRowGrid
                              key={`${row[0].id}__${row[1].id}`}
                              className={`ck-pair-grid${hasDate ? ' ck-pair-has-date' : ''}`}
                            >
                              {renderQuestion(row[0])}
                              {renderQuestion(row[1])}
                            </PairedRowGrid>
                          );
                        }
                        return renderQuestion(row[0]);
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </fieldset>
      </div>
      <LineSelectOverlay
        overlay={overlay}
        setOverlay={setOverlay}
        language={language}
        submitting={submitting}
        addLineItemRowManual={addLineItemRowManual}
      />
      {subgroupOverlayPortal}
      {fileOverlayPortal}
      {infoOverlayPortal}
    </>
  );
};

export default FormView;

