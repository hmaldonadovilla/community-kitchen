import React, { useEffect, useMemo, useState } from 'react';
import { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../types';
import { resolveLocalizedString } from '../../../i18n';
import { toOptionSet } from '../../../core';
import { tSystem } from '../../../systemStrings';
import { buildSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';
import { LineItemState } from '../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { EMPTY_DISPLAY, formatDisplayText } from '../../utils/valueDisplay';
import { GroupCard } from '../form/GroupCard';
import { resolveGroupSectionKey } from '../form/grouping';

type UploadLink = { url: string; label?: string };

const looksLikeUrl = (s: string) => /^https?:\/\/\S+$/i.test((s || '').trim());

const extractUploadLinks = (value: any): UploadLink[] => {
  const links: UploadLink[] = [];
  const push = (url: any, label?: any) => {
    const u = String(url ?? '').trim();
    if (!u) return;
    // Allow comma/newline separated URL strings.
    u.split(/[,\n]+/g)
      .map((p: string) => p.trim())
      .filter(Boolean)
      .forEach((part: string) => {
        if (!looksLikeUrl(part)) return;
        links.push({ url: part, label: label !== undefined && label !== null ? String(label) : undefined });
      });
  };

  if (Array.isArray(value)) {
    value.forEach(v => {
      if (!v) return;
      if (typeof v === 'string') {
        push(v);
        return;
      }
      if (typeof v === 'object') {
        const obj: any = v;
        if (typeof obj.url === 'string') push(obj.url, obj.name || obj.label);
      }
    });
  } else if (typeof value === 'object' && value) {
    const obj: any = value;
    if (typeof obj.url === 'string') push(obj.url, obj.name || obj.label);
  } else if (typeof value === 'string') {
    push(value);
  }

  // De-dupe by URL, preserving order.
  const seen = new Set<string>();
  const ordered: UploadLink[] = [];
  links.forEach(l => {
    if (!l?.url) return;
    if (seen.has(l.url)) return;
    seen.add(l.url);
    ordered.push(l);
  });
  return ordered;
};

const renderValueForPreview = (
  value: any,
  fieldType: string | undefined,
  language: LangCode,
  optionSet?: any
): React.ReactNode => {
  if (fieldType === 'FILE_UPLOAD') {
    const links = extractUploadLinks(value);
    if (!links.length) return EMPTY_DISPLAY;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {links.map((l, idx) => (
          <a
            key={`${l.url}-${idx}`}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#1d4ed8', textDecoration: 'underline', fontWeight: 800 }}
            onClick={e => e.stopPropagation()}
          >
            {l.label || tSystem('files.fileN', language, 'File {n}', { n: idx + 1 })}
          </a>
        ))}
      </div>
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

const MetaCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div
    style={{
      border: '1px solid rgba(148,163,184,0.25)',
      background: 'rgba(248,250,252,0.7)',
      borderRadius: 14,
      padding: 12
    }}
  >
    <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{children}</div>
  </div>
);

const LineItemRowCard: React.FC<{
  group: WebQuestionDefinition;
  row: { id: string; values: Record<string, any> };
  idx: number;
  language: LangCode;
  lineItems: LineItemState;
}> = ({ group, row, idx, language, lineItems }) => {
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});
  const anchorId = group.lineItemConfig?.anchorFieldId;
  const fields = (group.lineItemConfig?.fields || []).filter(f => f.id !== 'ITEM_FILTER');
  const subGroups = group.lineItemConfig?.subGroups || [];

  const anchorValue = anchorId ? row.values[anchorId] : undefined;
  const anchorField = anchorId ? (fields.find(f => f.id === anchorId) as any) : undefined;
  const anchorOptionSet = anchorField ? toOptionSet(anchorField) : undefined;
  const title =
    anchorId && anchorValue
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
            {fields.map(field => {
              const label = resolveFieldLabel(field as any, language, field.id);
              const v = row.values[field.id];
              const optionSet = toOptionSet(field as any);
              // Avoid duplicating the anchor field if it's already used as the title.
              if (anchorId && field.id === anchorId) return null;
              return (
                <tr key={field.id}>
                  <td
                    style={{
                      width: '42%',
                      padding: '10px 10px',
                      borderBottom: '1px solid rgba(148,163,184,0.25)',
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
                      fontWeight: 700,
                      wordBreak: 'break-word'
                    }}
                  >
                    {renderValueForPreview(v, (field as any)?.type, language, optionSet)}
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
              const subFields = (((sub as any)?.fields ?? []) as any[]).filter((f: any) => f?.id && f.id !== 'ITEM_FILTER');
              const open = !!openSubs[subKey];

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
                                {subFields.map((sf: any) => (
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
                                    {resolveFieldLabel(sf, language, sf.id)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {childRows.map(cr => (
                                <tr key={cr.id}>
                                  {subFields.map((sf: any) => (
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
                                      {renderValueForPreview(cr?.values?.[sf.id], sf?.type, language, toOptionSet(sf))}
                                    </td>
                                  ))}
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
  const topQuestions = useMemo(
    () => definition.questions.filter(q => q.type !== 'LINE_ITEM_GROUP' && q.type !== 'BUTTON'),
    [definition.questions]
  );

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
    topQuestions.forEach(q => {
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
  }, [language, topQuestions]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    topSections.forEach(s => {
      if (s.collapsible && s.defaultCollapsed) init[`summary:${s.key}`] = true;
    });
    return init;
  });

  // Ensure newly added sections respect defaultCollapsed without resetting user toggles.
  useEffect(() => {
    setCollapsedSections(prev => {
      const next = { ...prev };
      topSections.forEach(s => {
        const k = `summary:${s.key}`;
        if (next[k] === undefined && s.collapsible && s.defaultCollapsed) next[k] = true;
      });
      return next;
    });
  }, [topSections]);

  const lineGroups = useMemo(
    () => definition.questions.filter(q => q.type === 'LINE_ITEM_GROUP'),
    [definition.questions]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {recordMeta?.pdfUrl ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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
        </div>
      ) : null}

      {topSections.map(section => {
        const sectionKey = `summary:${section.key}`;
        const collapsed = section.collapsible ? !!collapsedSections[sectionKey] : false;
        const body = (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12
            }}
          >
            {section.questions.map((q: WebQuestionDefinition) => {
              const label = resolveLabel(q, language);
              const value = values[q.id];
              return (
                <MetaCard key={q.id} label={label}>
                  {renderValueForPreview(value, q.type, language, toOptionSet(q as any))}
                </MetaCard>
              );
            })}
          </div>
        );

        return (
          <GroupCard
            key={sectionKey}
            groupKey={sectionKey}
            title={section.title}
            collapsible={section.collapsible}
            collapsed={collapsed}
            onToggleCollapsed={
              section.collapsible
                ? () => setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
                : undefined
            }
            progress={null}
          >
            {body}
          </GroupCard>
        );
      })}

      {lineGroups.map((group: WebQuestionDefinition) => {
        const rows = lineItems[group.id] || [];
        if (!rows.length) return null;

        return (
          <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="muted" style={{ fontWeight: 800 }}>
              {resolveLabel(group, language)}
            </div>

            {rows.map((row, idx) => (
              <LineItemRowCard key={row.id} group={group} row={row} idx={idx} language={language} lineItems={lineItems} />
            ))}
          </div>
        );
      })}
    </div>
  );
};


