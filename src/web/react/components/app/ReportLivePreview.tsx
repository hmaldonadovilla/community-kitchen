import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SummaryVisibility } from '../../../../types';
import { FieldValue, FileUploadConfig, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import { resolveLocalizedString } from '../../../i18n';
import { toOptionSet } from '../../../core';
import { tSystem } from '../../../systemStrings';
import { buildSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';
import { LineItemState } from '../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { EMPTY_DISPLAY, formatDisplayText } from '../../utils/valueDisplay';
import { resolveStatusPillKey } from '../../utils/statusPill';
import { GroupCard } from '../form/GroupCard';
import { resolveGroupSectionKey } from '../form/grouping';
import { CameraIcon, CheckIcon, PaperclipIcon, XIcon, srOnly } from '../form/ui';
import { shouldHideField } from '../../../rules/visibility';
import { getSystemFieldValue } from '../../../rules/systemFields';
import { collectValidationWarnings } from '../../app/submission';
import { FileOverlay } from '../form/overlays/FileOverlay';
import { toUploadItems } from '../form/utils';

const normalizeBooleanLike = (raw: any, fieldType?: string): boolean | null => {
  if (raw === true) return true;
  if (raw === false) return false;

  const t = (fieldType || '').toString().trim().toUpperCase();
  const isBoolType = new Set(['CHECKBOX', 'BOOLEAN', 'YES_NO', 'YESNO', 'TOGGLE', 'SWITCH']).has(t);
  if (isBoolType) {
    if (raw === 1 || raw === '1') return true;
    if (raw === 0 || raw === '0') return false;
  }

  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!s) return null;

  // English/French/Dutch common boolean strings + 1/0.
  const truthy = new Set(['true', 'yes', 'y', 'oui', 'o', 'ja', 'j']);
  const falsy = new Set(['false', 'no', 'n', 'non', 'nee']);
  if (truthy.has(s)) return true;
  if (falsy.has(s)) return false;
  return null;
};

const normalizeSummaryVisibility = (raw: any): SummaryVisibility => {
  const v = (raw || '').toString().trim().toLowerCase();
  if (v === 'always') return 'always';
  if (v === 'never') return 'never';
  return 'inherit';
};

const resolveSummaryHideLabel = (item: any): boolean => {
  const ui = item?.ui;
  if (!ui || typeof ui !== 'object') return false;
  if ((ui as any).summaryHideLabel === true) return true;
  if ((ui as any).summaryHideLabel === false) return false;
  return (ui as any).hideLabel === true;
};

const isVisibleInSummary = (args: {
  item: any;
  ctx: { getValue: (fieldId: string) => any; getLineValue?: (rowId: string, fieldId: string) => any };
  rowId?: string;
  linePrefix?: string;
}): boolean => {
  const mode = normalizeSummaryVisibility(args.item?.ui?.summaryVisibility);
  if (mode === 'never') return false;
  const hidden = shouldHideField(args.item?.visibility, args.ctx as any, { rowId: args.rowId, linePrefix: args.linePrefix });
  if (hidden && mode !== 'always') return false;
  return true;
};

type OpenFilesOverlayFn = (args: { title: string; value: FieldValue; uploadConfig?: FileUploadConfig }) => void;

type RenderPreviewOpts = {
  fileTitle?: string;
  onOpenFiles?: OpenFilesOverlayFn;
};

const renderValueForPreview = (
  value: any,
  fieldType: string | undefined,
  language: LangCode,
  optionSet?: any,
  uploadConfig?: FileUploadConfig,
  opts?: RenderPreviewOpts
): React.ReactNode => {
  if (fieldType === 'FILE_UPLOAD') {
    const items = toUploadItems(value as any);
    if (!items.length) return EMPTY_DISPLAY;

    const count = items.length;
    const slotIconType = ((uploadConfig as any)?.ui?.slotIcon || 'camera').toString().trim().toLowerCase();
    const SlotIcon = (slotIconType === 'clip' ? PaperclipIcon : CameraIcon) as React.FC<{ size?: number }>;
    const title = (opts?.fileTitle || tSystem('files.title', language, 'Photos')).toString();

    return (
      <button
        type="button"
        className="ck-file-icon"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          opts?.onOpenFiles?.({ title, value: value as any, uploadConfig });
        }}
        aria-label={tSystem('files.open', language, 'Open photos')}
      >
        <SlotIcon size={32} />
        <span className="ck-file-icon__badge">{count}</span>
      </button>
    );
  }
  if (fieldType === 'PARAGRAPH') {
    const raw = value === undefined || value === null ? '' : String(value);
    if (!raw.trim()) return EMPTY_DISPLAY;
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{raw}</div>;
  }

  // Improve readability for boolean-like values in Summary/PDF previews.
  const bool = normalizeBooleanLike(value, fieldType);
  if (bool !== null) {
    return (
      <span
        role="img"
        aria-label={bool ? tSystem('values.yes', language, 'Yes') : tSystem('values.no', language, 'No')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: bool ? '#16a34a' : '#dc2626'
        }}
      >
        {bool ? <CheckIcon size={28} /> : <XIcon size={28} />}
      </span>
    );
  }

  return formatDisplayText(value, { language, optionSet, fieldType });
};

type RecordMeta = {
  id?: string;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pdfUrl?: string;
};

const MetaCard: React.FC<{
  label: React.ReactNode;
  hideLabel?: boolean;
  children: React.ReactNode;
  fieldPath?: string;
}> = ({ label, hideLabel, children, fieldPath }) => (
  <div
    data-field-path={fieldPath}
    style={{
      border: '1px solid rgba(148,163,184,0.25)',
      background: 'rgba(248,250,252,0.7)',
      borderRadius: 14,
      padding: 12,
      height: '100%',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }}
  >
    {hideLabel ? (
      <div style={srOnly}>{label}</div>
    ) : (
      <div
        className="muted"
        style={{
          fontWeight: 800,
          marginBottom: 6,
          minWidth: 0,
          whiteSpace: 'normal',
          overflow: 'visible',
          textOverflow: 'clip',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {label}
      </div>
    )}
    <div
      style={{
        fontWeight: 800,
        wordBreak: 'break-word',
        minWidth: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end'
      }}
    >
      {children}
    </div>
  </div>
);

const LineItemRowCard: React.FC<{
  group: WebQuestionDefinition;
  row: { id: string; values: Record<string, any> };
  idx: number;
  language: LangCode;
  lineItems: LineItemState;
  values: Record<string, FieldValue>;
  warningByField?: Record<string, string[]>;
  expandAllSubgroups?: boolean;
  onOpenFiles?: OpenFilesOverlayFn;
}> = ({ group, row, idx, language, lineItems, values, warningByField, expandAllSubgroups, onOpenFiles }) => {
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>(() => {
    if (!expandAllSubgroups) return {};
    const init: Record<string, boolean> = {};
    (group.lineItemConfig?.subGroups || []).forEach(sub => {
      const subKey = resolveSubgroupKey(sub as any);
      if (subKey) init[subKey] = true;
    });
    return init;
  });
  const anchorId = group.lineItemConfig?.anchorFieldId;
  const fields = (group.lineItemConfig?.fields || []).filter(f => f.id !== 'ITEM_FILTER');
  const subGroups = group.lineItemConfig?.subGroups || [];

  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = key && warningByField ? (warningByField as any)[key] : undefined;
    return Array.isArray(list) ? list.filter(Boolean).map((m: any) => (m || '').toString()) : [];
  };
  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = warningsFor(fieldPath);
    if (!msgs.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {msgs.map((m, idx) => (
          <div key={`${fieldPath}-warning-${idx}`} className="warning">
            {m}
          </div>
        ))}
      </div>
    );
  };

  const groupCtx = useMemo(
    () => ({
      getValue: (fid: string) => values[fid],
      getLineValue: (_rowId: string, fid: string) => row.values[fid]
    }),
    [row.values, values]
  );

  const visibleFields = useMemo(
    () =>
      fields.filter(field =>
        isVisibleInSummary({
          item: field,
          ctx: groupCtx,
          rowId: row.id,
          linePrefix: group.id
        })
      ),
    [fields, group.id, groupCtx, row.id]
  );

  const anchorValue = anchorId ? row.values[anchorId] : undefined;
  const anchorField = anchorId ? (fields.find(f => f.id === anchorId) as any) : undefined;
  const anchorOptionSet = anchorField ? toOptionSet(anchorField) : undefined;
  const canUseAnchorAsTitle =
    !!anchorId &&
    !!anchorField &&
    isVisibleInSummary({ item: anchorField, ctx: groupCtx, rowId: row.id, linePrefix: group.id }) &&
    anchorValue !== undefined &&
    anchorValue !== null &&
    anchorValue !== '';
  const title =
    canUseAnchorAsTitle
      ? formatDisplayText(anchorValue, { language, optionSet: anchorOptionSet, fieldType: (anchorField as any)?.type })
      : `${resolveLabel(group, language)} #${idx + 1}`;

  const toggleSub = (subKey: string) => {
    setOpenSubs(prev => ({ ...prev, [subKey]: !prev[subKey] }));
  };

  return (
    <div
      style={{
        border: '1px solid rgba(15,23,42,0.12)',
        background: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(219, 206, 194, 0.6)',
          fontWeight: 900,
          color: '#0f172a'
        }}
      >
        {title}
      </div>

      <div style={{ padding: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {visibleFields.map((field, fieldIdx) => {
              const stripe = fieldIdx % 2 === 1;
              const label = resolveFieldLabel(field as any, language, field.id);
              const hideLabel = resolveSummaryHideLabel(field);
              const v = row.values[field.id];
              const optionSet = toOptionSet(field as any);
              // Avoid duplicating the anchor field if it's already used as the title.
              if (anchorId && field.id === anchorId) return null;
              const fieldPath = `${group.id}__${field.id}__${row.id}`;
              if (hideLabel) {
                return (
                  <tr key={field.id}>
                    <td
                      colSpan={2}
                      style={{
                        padding: '10px 10px',
                        borderBottom: '1px solid rgba(148,163,184,0.25)',
                        background: stripe ? 'rgba(241,245,249,0.55)' : 'transparent',
                        fontWeight: 700,
                        wordBreak: 'break-word'
                      }}
                    >
                      <span style={srOnly}>{label}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-field-path={fieldPath}>
                        <div>
                          {renderValueForPreview(v, (field as any)?.type, language, optionSet, (field as any)?.uploadConfig, {
                            fileTitle: `${label} — ${title}`,
                            onOpenFiles
                          })}
                        </div>
                        {renderWarnings(fieldPath)}
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={field.id}>
                  <td
                    style={{
                      width: '42%',
                      padding: '10px 10px',
                      borderBottom: '1px solid rgba(148,163,184,0.25)',
                      background: stripe ? 'rgba(241,245,249,0.55)' : 'transparent',
                      color: '#475569',
                      fontWeight: 700,
                      wordBreak: 'break-word'
                    }}
                  >
                    {label}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      borderBottom: '1px solid rgba(148,163,184,0.25)',
                      background: stripe ? 'rgba(241,245,249,0.55)' : 'transparent',
                      fontWeight: 700,
                      wordBreak: 'break-word'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-field-path={fieldPath}>
                      <div>
                        {renderValueForPreview(v, (field as any)?.type, language, optionSet, (field as any)?.uploadConfig, {
                          fileTitle: `${label} — ${title}`,
                          onOpenFiles
                        })}
                      </div>
                      {renderWarnings(fieldPath)}
                    </div>
                  </td>
                </tr>
              );
            })}

            {subGroups.map(sub => {
              const subKey = resolveSubgroupKey(sub as any);
              if (!subKey) return null;
              const childKey = buildSubgroupKey(group.id, row.id, subKey);
              const childRows = lineItems[childKey] || [];
              if (!childRows.length) return null;

              const subLabel = (sub as any)?.label ? resolveLabel(sub as any, language) : subKey;
              const subFieldsAll = (((sub as any)?.fields ?? []) as any[]).filter((f: any) => f?.id && f.id !== 'ITEM_FILTER');
              const subFields = subFieldsAll.filter((sf: any) =>
                // Subgroup visibility is evaluated per subgroup row. We include a field if it is visible for at least one row.
                childRows.some(cr => {
                  const subCtx = {
                    ...groupCtx,
                    getLineValue: (_rowId: string, fid: string) => (cr as any)?.values?.[fid]
                  };
                  return isVisibleInSummary({ item: sf, ctx: subCtx, rowId: (cr as any)?.id, linePrefix: subKey });
                })
              );
              if (!subFields.length) return null;
              const open = expandAllSubgroups ? true : !!openSubs[subKey];

              return (
                <React.Fragment key={subKey}>
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: '10px 10px',
                        borderBottom: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(241,245,249,0.6)',
                        fontWeight: 900,
                        color: '#0f172a'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {subLabel}
                        </div>
                        {expandAllSubgroups ? (
                          <span className="muted" style={{ fontWeight: 900 }}>
                            ({childRows.length})
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleSub(subKey)}
                            style={{
                              border: '1px solid rgba(29,78,216,0.35)',
                              background: 'rgba(29,78,216,0.12)',
                              color: '#1d4ed8',
                              borderRadius: 999,
                              padding: '8px 12px',
                              fontWeight: 900,
                              cursor: 'pointer',
                              minHeight: 34,
                              boxShadow: '0 1px 0 rgba(15,23,42,0.06)'
                            }}
                          >
                            {open ? tSystem('summary.hide', language, 'Hide') : tSystem('summary.show', language, 'Show')}{' '}
                            {open ? '▾' : '▸'} ({childRows.length})
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={2} style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                            <thead>
                              <tr>
                                    {subFields.map((sf: any) => {
                                      const headerLabel = resolveFieldLabel(sf, language, sf.id);
                                      const hideHeaderLabel = resolveSummaryHideLabel(sf);
                                      return (
                                        <th
                                          key={`${subKey}.${sf.id}`}
                                          style={{
                                            textAlign: 'left',
                                            padding: '8px 8px',
                                            borderBottom: '1px solid rgba(148,163,184,0.25)',
                                            color: '#475569',
                                            fontWeight: 800
                                          }}
                                        >
                                          {hideHeaderLabel ? <span style={srOnly}>{headerLabel}</span> : headerLabel}
                                        </th>
                                      );
                                    })}
                              </tr>
                            </thead>
                            <tbody>
                              {childRows.map((cr, crIdx) => (
                                <tr key={cr.id} style={{ background: crIdx % 2 === 1 ? 'rgba(241,245,249,0.55)' : 'transparent' }}>
                                  {subFields.map((sf: any) => {
                                    const subCtx = {
                                      ...groupCtx,
                                      getLineValue: (_rowId: string, fid: string) => (cr as any)?.values?.[fid]
                                    };
                                    const visible = isVisibleInSummary({
                                      item: sf,
                                      ctx: subCtx,
                                      rowId: (cr as any)?.id,
                                      linePrefix: subKey
                                    });
                                    if (!visible) {
                                      return (
                                        <td
                                          key={`${cr.id}.${sf.id}`}
                                          style={{
                                            padding: '8px 8px',
                                            borderBottom: '1px solid rgba(148,163,184,0.18)'
                                          }}
                                        />
                                      );
                                    }
                                    const fieldPath = `${childKey}__${sf.id}__${cr.id}`;
                                    return (
                                      <td
                                        key={`${cr.id}.${sf.id}`}
                                        style={{
                                          padding: '8px 8px',
                                          borderBottom: '1px solid rgba(148,163,184,0.18)',
                                          fontWeight: 700,
                                          verticalAlign: 'top',
                                          wordBreak: 'break-word'
                                        }}
                                      >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-field-path={fieldPath}>
                                          <div>
                                            {renderValueForPreview(
                                              cr?.values?.[sf.id],
                                              sf?.type,
                                              language,
                                              toOptionSet(sf),
                                              (sf as any)?.uploadConfig,
                                              {
                                                fileTitle: `${resolveFieldLabel(sf, language, sf.id)} — ${subLabel} — ${title}`,
                                                onOpenFiles
                                              }
                                            )}
                                          </div>
                                          {renderWarnings(fieldPath)}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ReportLivePreview: React.FC<{
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  recordMeta?: RecordMeta;
}> = ({ definition, language, values, lineItems, recordMeta }) => {
  const resolveVisibilityValue = (fieldId: string): FieldValue | undefined => {
    const direct = values[fieldId];
    if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
    const sys = getSystemFieldValue(fieldId, recordMeta as any);
    if (sys !== undefined) return sys as FieldValue;
    // Mirror FormView behavior: allow visibility rules to "see" the first non-empty line-item occurrence.
    for (const rows of Object.values(lineItems || {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const v = (row as any)?.values?.[fieldId];
        if (v !== undefined && v !== null && v !== '') return v as FieldValue;
      }
    }
    return undefined;
  };

  const summaryCtx = useMemo(
    () => ({
      getValue: (fid: string) => resolveVisibilityValue(fid)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, lineItems, recordMeta]
  );

  const summaryQuestions = useMemo(() => {
    const raw = definition.questions.filter(q => q.type !== 'BUTTON');
    return raw.filter(q => isVisibleInSummary({ item: q, ctx: summaryCtx }));
  }, [definition.questions, summaryCtx]);

  type Section = {
    key: string;
    title?: string;
    collapsible: boolean;
    defaultCollapsed: boolean;
    questions: WebQuestionDefinition[];
    order: number;
  };

  const topSections = useMemo(() => {
    const map = new Map<string, Section>();
    let order = 0;
    summaryQuestions.forEach(q => {
      const groupCfg: any = (q as any)?.group;
      const key = resolveGroupSectionKey(groupCfg);
      let title: string | undefined;
      if (groupCfg?.title) {
        title = resolveLocalizedString(groupCfg.title, language, '');
      } else if (groupCfg?.header) {
        title = tSystem('summary.headerSection', language, 'Header');
      }
      const collapsible = groupCfg?.collapsible === undefined ? !!title : !!groupCfg.collapsible;
      const defaultCollapsed = groupCfg?.defaultCollapsed === undefined ? false : !!groupCfg.defaultCollapsed;

      const existing = map.get(key);
      if (existing) {
        existing.questions.push(q);
        if (existing.title === undefined && title) existing.title = title;
        existing.collapsible = existing.collapsible || collapsible;
        existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
      } else {
        map.set(key, { key, title, collapsible, defaultCollapsed, questions: [q], order: order++ });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [language, summaryQuestions]);

  const summaryExpandAll = Boolean(definition.groupBehavior?.summaryExpandAll);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (summaryExpandAll) return {};
    const init: Record<string, boolean> = {};
    topSections.forEach(s => {
      if (s.collapsible && s.defaultCollapsed) init[`summary:${s.key}`] = true;
    });
    return init;
  });

  // Ensure newly added sections respect defaultCollapsed without resetting user toggles.
  useEffect(() => {
    if (summaryExpandAll) return;
    setCollapsedSections(prev => {
      const next = { ...prev };
      topSections.forEach(s => {
        const k = `summary:${s.key}`;
        if (next[k] === undefined && s.collapsible && s.defaultCollapsed) next[k] = true;
      });
      return next;
    });
  }, [summaryExpandAll, topSections]);

  const warningInfo = useMemo(
    () =>
      collectValidationWarnings({
        definition,
        language,
        values,
        lineItems,
        phase: 'submit',
        uiView: 'summary'
      }),
    [definition, language, lineItems, values]
  );
  const statusText = (recordMeta?.status || '').toString().trim();
  const statusKey = useMemo(
    () => resolveStatusPillKey(statusText, definition.followup?.statusTransitions),
    [definition.followup?.statusTransitions, statusText]
  );

  const warningsFor = (fieldPath: string): string[] => {
    const key = (fieldPath || '').toString();
    const list = (warningInfo as any)?.byField?.[key];
    return Array.isArray(list) ? list.filter(Boolean).map((m: any) => (m || '').toString()) : [];
  };

  const renderWarnings = (fieldPath: string): React.ReactNode => {
    const msgs = warningsFor(fieldPath);
    if (!msgs.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {msgs.map((m, idx) => (
          <div key={`${fieldPath}-warning-${idx}`} className="warning">
            {m}
          </div>
        ))}
      </div>
    );
  };

  const [filesOverlay, setFilesOverlay] = useState<{
    open: boolean;
    title: string;
    items: Array<string | File>;
    uploadConfig?: FileUploadConfig;
  }>({ open: false, title: '', items: [] });

  const closeFilesOverlay = useCallback(() => {
    setFilesOverlay(prev => ({ ...prev, open: false }));
  }, []);

  const openFilesOverlay = useCallback<OpenFilesOverlayFn>(
    ({ title, value, uploadConfig }) => {
      const items = toUploadItems(value);
      if (!items.length) return;
      setFilesOverlay({
        open: true,
        title: title || tSystem('files.title', language, 'Photos'),
        items,
        uploadConfig
      });
    },
    [language]
  );

  type SectionItem =
    | { kind: 'single'; q: WebQuestionDefinition }
    | { kind: 'pair'; left: WebQuestionDefinition; right: WebQuestionDefinition; key: string }
    | { kind: 'lineItemGroup'; q: WebQuestionDefinition };

  const buildSectionItems = (questions: WebQuestionDefinition[]): SectionItem[] => {
    const used = new Set<string>();
    const items: SectionItem[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q || used.has(q.id)) continue;

      if (q.type === 'LINE_ITEM_GROUP') {
        used.add(q.id);
        items.push({ kind: 'lineItemGroup', q });
        continue;
      }

      const pairKey = q.type !== 'PARAGRAPH' && (q as any)?.pair ? (q as any).pair.toString() : '';
      if (pairKey) {
        for (let j = i + 1; j < questions.length; j++) {
          const cand = questions[j];
          if (!cand || used.has(cand.id)) continue;
          if (cand.type === 'LINE_ITEM_GROUP') continue;
          if (cand.type === 'PARAGRAPH') continue;
          const candKey = (cand as any)?.pair ? (cand as any).pair.toString() : '';
          if (candKey && candKey === pairKey) {
            used.add(q.id);
            used.add(cand.id);
            items.push({ kind: 'pair', left: q, right: cand, key: `${pairKey}:${q.id}:${cand.id}` });
            break;
          }
        }
        if (used.has(q.id)) continue;
      }

      used.add(q.id);
      items.push({ kind: 'single', q });
    }
    return items;
  };

  const renderLineItemGroup = (group: WebQuestionDefinition): React.ReactNode => {
    const rows = lineItems[group.id] || [];
    if (!rows.length) return null;
    const groupLabel = resolveLabel(group, language);
    const hideGroupLabel = resolveSummaryHideLabel(group);
    return (
      <div data-field-path={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hideGroupLabel ? (
          <div style={srOnly}>{groupLabel}</div>
        ) : (
          <div className="muted" style={{ fontWeight: 800 }}>
            {groupLabel}
          </div>
        )}
        {renderWarnings(group.id)}

        {rows.map((row, idx) => (
          <LineItemRowCard
            key={row.id}
            group={group}
            row={row}
            idx={idx}
            language={language}
            lineItems={lineItems}
            values={values}
            warningByField={(warningInfo as any)?.byField || {}}
            expandAllSubgroups={summaryExpandAll}
            onOpenFiles={openFilesOverlay}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {warningInfo.top.length ? (
        <div
          role="status"
          style={{
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
            {warningInfo.top.map((w: { message: string; fieldPath: string }, idx: number) => (
              <button
                key={`${idx}-${w.fieldPath}-${w.message}`}
                type="button"
                onClick={() => {
                  const key = (w.fieldPath || '').toString();
                  if (!key || typeof document === 'undefined') return;

                  // Expand the containing section if needed (top-level questions).
                  const parts = key.split('__');
                  const isTopLevel = parts.length !== 3 && !key.includes('::');
                  if (isTopLevel) {
                    const section = topSections.find(s => (s.questions || []).some(q => q && q.id === key));
                    if (section) {
                      const sectionKey = `summary:${section.key}`;
                      setCollapsedSections(prev => (prev[sectionKey] ? { ...prev, [sectionKey]: false } : prev));
                    }
                  }

                  requestAnimationFrame(() => {
                    const el = document.querySelector<HTMLElement>(`[data-field-path="${key}"]`);
                    if (!el) return;
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  });
                }}
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

      {statusText || recordMeta?.pdfUrl ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {statusText ? (
            <MetaCard label={tSystem('list.meta.status', language, 'Status')}>
              <span
                className="ck-status-pill"
                title={statusText}
                aria-label={`Status: ${statusText}`}
                data-status-key={statusKey || undefined}
              >
                {statusText}
              </span>
            </MetaCard>
          ) : null}
          {recordMeta?.pdfUrl ? (
            <MetaCard label={tSystem('summary.pdf', language, 'PDF')}>
              <a
                href={recordMeta.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0f172a', textDecoration: 'underline' }}
                onClick={e => e.stopPropagation()}
              >
                {tSystem('summary.openPdf', language, 'Open PDF')}
              </a>
            </MetaCard>
          ) : null}
        </div>
      ) : null}

      {topSections.map(section => {
        const sectionKey = `summary:${section.key}`;
        const canCollapse = section.collapsible && !summaryExpandAll;
        const collapsed = canCollapse ? !!collapsedSections[sectionKey] : false;
        const body = (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              alignItems: 'stretch'
            }}
          >
            {buildSectionItems(section.questions).map(item => {
              if (item.kind === 'lineItemGroup') {
                const node = renderLineItemGroup(item.q);
                if (!node) return null;
                return (
                  <div key={item.q.id} style={{ gridColumn: '1 / -1' }}>
                    {node}
                  </div>
                );
              }
              if (item.kind === 'pair') {
                const leftLabel = resolveLabel(item.left, language);
                const rightLabel = resolveLabel(item.right, language);
                const leftValue = values[item.left.id];
                const rightValue = values[item.right.id];
                const hideLeftLabel = resolveSummaryHideLabel(item.left);
                const hideRightLabel = resolveSummaryHideLabel(item.right);
                return (
                  <div
                    key={item.key}
                    style={{
                      gridColumn: '1 / -1',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 12,
                      alignItems: 'stretch'
                    }}
                  >
                    <MetaCard label={leftLabel} hideLabel={hideLeftLabel} fieldPath={item.left.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          {renderValueForPreview(
                            leftValue,
                            item.left.type,
                            language,
                            toOptionSet(item.left as any),
                            (item.left as any)?.uploadConfig,
                            { fileTitle: leftLabel, onOpenFiles: openFilesOverlay }
                          )}
                        </div>
                        {renderWarnings(item.left.id)}
                      </div>
                    </MetaCard>
                    <MetaCard label={rightLabel} hideLabel={hideRightLabel} fieldPath={item.right.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          {renderValueForPreview(
                            rightValue,
                            item.right.type,
                            language,
                            toOptionSet(item.right as any),
                            (item.right as any)?.uploadConfig,
                            { fileTitle: rightLabel, onOpenFiles: openFilesOverlay }
                          )}
                        </div>
                        {renderWarnings(item.right.id)}
                      </div>
                    </MetaCard>
                  </div>
                );
              }
              const q = item.q;
              const label = resolveLabel(q, language);
              const value = values[q.id];
              const optionSet = toOptionSet(q as any);
              const hideLabel = resolveSummaryHideLabel(q);

              // Consent checkboxes: display the same ✔/✖ icon, but prefix it before the label (like a checklist line).
              const hasAnyOption = !!(
                (optionSet?.en && optionSet.en.length) ||
                (optionSet?.fr && optionSet.fr.length) ||
                (optionSet?.nl && optionSet.nl.length)
              );
              const isConsentCheckbox = q.type === 'CHECKBOX' && !(q as any)?.dataSource && !hasAnyOption;
              if (isConsentCheckbox) {
                const checked = normalizeBooleanLike(value, q.type) === true;
                if (hideLabel) {
                  return (
                    <div key={q.id} style={{ gridColumn: '1 / -1' }}>
                      <MetaCard label={label} hideLabel={true} fieldPath={q.id}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div>
                            {renderValueForPreview(value, q.type, language, optionSet, (q as any)?.uploadConfig, {
                              fileTitle: label,
                              onOpenFiles: openFilesOverlay
                            })}
                          </div>
                          {renderWarnings(q.id)}
                        </div>
                      </MetaCard>
                    </div>
                  );
                }
                const labelNode = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: checked ? '#16a34a' : '#dc2626'
                      }}
                    >
                      {checked ? <CheckIcon size={22} /> : <XIcon size={22} />}
                    </span>
                    <span>{label}</span>
                  </span>
                );
                return (
                  <div key={q.id} style={{ gridColumn: '1 / -1' }}>
                    <MetaCard label={labelNode} fieldPath={q.id}>
                      {renderWarnings(q.id)}
                    </MetaCard>
                  </div>
                );
              }

              const card = (
                <MetaCard label={label} hideLabel={hideLabel} fieldPath={q.id}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>
                      {renderValueForPreview(value, q.type, language, optionSet, (q as any)?.uploadConfig, {
                        fileTitle: label,
                        onOpenFiles: openFilesOverlay
                      })}
                    </div>
                    {renderWarnings(q.id)}
                  </div>
                </MetaCard>
              );

              // Reserve the whole row for top-level PARAGRAPH fields (so they don't share a line on wider screens).
              if (q.type === 'PARAGRAPH') {
                return (
                  <div key={q.id} style={{ gridColumn: '1 / -1' }}>
                    {card}
                  </div>
                );
              }

              return <React.Fragment key={q.id}>{card}</React.Fragment>;
            })}
          </div>
        );

        return (
          <GroupCard
            key={sectionKey}
            groupKey={sectionKey}
            title={section.title}
            language={language}
            collapsible={canCollapse}
            collapsed={collapsed}
            onToggleCollapsed={
              canCollapse
                ? () => setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
                : undefined
            }
            progress={null}
          >
            {body}
          </GroupCard>
        );
      })}

      {filesOverlay.open ? (
        <FileOverlay
          open={filesOverlay.open}
          language={language}
          title={filesOverlay.title || tSystem('files.title', language, 'Photos')}
          submitting={false}
          readOnly={true}
          items={filesOverlay.items}
          uploadConfig={filesOverlay.uploadConfig as any}
          onAdd={() => {}}
          onClearAll={() => {}}
          onRemoveAt={() => {}}
          onClose={closeFilesOverlay}
        />
      ) : null}
    </div>
  );
};


