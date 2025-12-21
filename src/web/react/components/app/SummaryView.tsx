import React, { useMemo } from 'react';
import { optionKey } from '../../../core';
import { resolveLocalizedString } from '../../../i18n';
import { FieldValue, LangCode, LineItemRowState, WebFormDefinition, WebQuestionDefinition, WebFormSubmission } from '../../../types';
import { buildSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';
import { LineItemState, OptionState } from '../../types';
import { resolveFieldLabel, resolveLabel } from '../../utils/labels';
import { formatFieldValue, renderValueWithTooltip, resolveTooltipText } from './tooltips';

export type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

const splitUrlList = (raw: string): string[] => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return commaParts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
  return [trimmed];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const pad2 = (n: number) => n.toString().padStart(2, '0');
    // Force dd/mm/yyyy formatting while keeping the user's local timezone for the time components.
    return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}, ${pad2(parsed.getHours())}:${pad2(
      parsed.getMinutes()
    )}:${pad2(parsed.getSeconds())}`;
  } catch (_) {
    return value;
  }
};

export const SummaryView: React.FC<{
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  optionState: OptionState;
  tooltipState: Record<string, Record<string, string>>;
  lastSubmissionMeta: SubmissionMeta | null;
  recordLoadError: string | null;
  selectedRecordId: string;
  recordLoadingId: string | null;
  currentRecord: WebFormSubmission | null;
  isMobile: boolean;
  onDuplicate: () => void;
}> = ({
  definition,
  language,
  values,
  lineItems,
  optionState,
  tooltipState,
  lastSubmissionMeta,
  recordLoadError,
  selectedRecordId,
  recordLoadingId,
  currentRecord,
  isMobile
}) => {

  const summaryRecordId = lastSubmissionMeta?.id || selectedRecordId || '';
  const summaryTitle = useMemo(() => {
    const candidate = definition.questions.find(q => q.type !== 'LINE_ITEM_GROUP' && values[q.id]);
    const raw = candidate ? values[candidate.id] : null;
    if (Array.isArray(raw)) return (raw[0] as any)?.toString?.() || definition.title || 'Submission';
    return (raw as any)?.toString?.() || definition.title || 'Submission';
  }, [definition.questions, definition.title, values]);

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
            const parentLabel = parentAnchorId ? formatFieldValue(parent.values[parentAnchorId]) : parent.id;
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
                  style={{
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                    maxWidth: `${Math.max(18, Math.floor(100 / Math.max(1, fieldColumns.length)))}%`
                  }}
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
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <div className="muted">Summary</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{summaryTitle}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Updated {formatDateTime(lastSubmissionMeta?.updatedAt)} · Status {lastSubmissionMeta?.status || '—'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          margin: '16px 0'
        }}
      >
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
        <div>
          <div className="muted">Language</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{(language || 'en').toString().toUpperCase()}</div>
        </div>
      </div>

      <hr />

      {recordLoadError && (
        <div className="error" style={{ marginBottom: 12 }}>
          {recordLoadError}
        </div>
      )}

      {selectedRecordId && recordLoadingId === selectedRecordId && !currentRecord && <div className="status">Loading record…</div>}

      {(!selectedRecordId || currentRecord) &&
        definition.questions.map(q => {
          if (q.type === 'BUTTON') {
            return null;
          }
          if (q.type === 'LINE_ITEM_GROUP') {
            return (
              <div key={q.id} className="field">
                <div className="muted">{resolveLabel(q, language)}</div>
                {renderLineSummaryTable(q)}
              </div>
            );
          }

          if (q.type === 'FILE_UPLOAD') {
            const raw = values[q.id] ?? currentRecord?.values?.[q.id];
            const files = Array.isArray(raw) ? raw : raw ? [raw] : [];
            const urls: Array<{ url: string; name: string }> = [];
            files.forEach(f => {
              if (typeof f === 'string') {
                splitUrlList(f).forEach(u => {
                  const trimmed = u.trim();
                  if (!trimmed) return;
                  urls.push({ url: trimmed, name: trimmed.split('/').pop() || 'File' });
                });
                return;
              }
              if (f && typeof f === 'object') {
                const any = f as any;
                const url = (any.url || any.dataUrl || any.link || '').toString().trim();
                const name = any.name || (url ? url.split('/').pop() : '') || 'File';
                if (url) urls.push({ url, name });
              }
            });
            const items = urls.filter(entry => /^https?:\/\//i.test(entry.url));
            return (
              <div key={q.id} className="field">
                <div className="muted">{resolveLabel(q, language)}</div>
                {items.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((file, idx) => (
                      <a
                        key={`${file.url}-${idx}`}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}
                      >
                        {file.name}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="muted">No response</div>
                )}
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
                <div style={showParagraphStyle}>{renderValueWithTooltip(value, tooltipText, tooltipLabel, true)}</div>
              )}
            </div>
          );
        })}
    </div>
  );
};



