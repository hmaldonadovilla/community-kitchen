import React, { useCallback, useEffect, useState } from 'react';
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

const buildInitialLineItems = (definition: BootstrapContext['definition'], recordValues?: Record<string, any>): LineItemState => {
  const state: LineItemState = {};
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
      const parsedRows = (rows || []).map((r, idx) => ({
        id: `${q.id}_${idx}_${Math.random().toString(16).slice(2)}`,
        values: r || {}
      }));
      if (!parsedRows.length && q.lineItemConfig?.addMode !== 'overlay') {
        const minRows = Math.max(1, q.lineItemConfig?.minRows || 1);
        for (let i = 0; i < minRows; i += 1) {
          parsedRows.push({ id: `${q.id}_${i}_${Math.random().toString(16).slice(2)}`, values: {} });
        }
      }
      state[q.id] = parsedRows;
    });
  return state;
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

const App: React.FC<BootstrapContext> = ({ definition, formKey, record }) => {
  const [language, setLanguage] = useState<LangCode>(normalizeLanguage(definition.languages?.[0] || record?.language));
  const [values, setValues] = useState<Record<string, FieldValue>>(() => normalizeRecordValues(definition, record?.values));
  const [lineItems, setLineItems] = useState<LineItemState>(() => buildInitialLineItems(definition, record?.values));
  const [view, setView] = useState<View>('form');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<'info' | 'success' | 'error' | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(record?.id || '');
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] = useState<WebFormSubmission | null>(record || null);
  const [followupMessage, setFollowupMessage] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>({});
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
  const clearStatus = useCallback(() => {
    setStatus(null);
    setStatusLevel(null);
    logEvent('status.cleared');
  }, [logEvent]);

  const handleSubmitAnother = useCallback(() => {
    setValues(normalizeRecordValues(definition));
    setLineItems(buildInitialLineItems(definition));
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
      setValues(normalizedValues);
      setLineItems(buildInitialLineItems(definition, normalizedValues));
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
    if (!selectedRecordId || selectedRecordSnapshot) return;
    const cached = listCache.records[selectedRecordId];
    if (cached) {
      setSelectedRecordSnapshot(cached);
    }
  }, [selectedRecordId, selectedRecordSnapshot, listCache.records]);

  const ensureOptions = (q: WebQuestionDefinition) => {
    if (!q.dataSource) return;
    const key = optionKey(q.id);
    if (optionState[key]) return;
    loadOptionsFromDataSource(q.dataSource, language).then(res => {
      if (res) {
        setOptionState(prev => ({ ...prev, [key]: res }));
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
    handleSelectionEffects(
      definition,
      question,
      value as any,
      language,
      {
        addLineItemRow: (groupId: string, preset?: Record<string, string | number>) => {
          setLineItems(prev => {
            const rows = prev[groupId] || [];
            const newRow: LineItemRowState = {
              id: `${groupId}_${Math.random().toString(16).slice(2)}`,
              values: { ...(preset || {}) }
            };
            return { ...prev, [groupId]: [...rows, newRow] };
          });
        },
        clearLineItems: (groupId: string) => {
          setLineItems(prev => ({ ...prev, [groupId]: [] }));
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
        });
      } else if (q.required && !questionHidden && isEmptyValue(values[q.id])) {
        allErrors[q.id] = 'This field is required.';
      }
    });
    setErrors(allErrors);
    return !Object.keys(allErrors).length;
  };

  const buildPayload = async (): Promise<SubmissionPayload> => {
    const payloadValues: Record<string, any> = { ...values };
    for (const q of definition.questions) {
      if (q.type === 'FILE_UPLOAD') {
        const raw = values[q.id] as FileList | File[] | undefined | null;
        payloadValues[q.id] = await buildFilePayload(raw, q.uploadConfig?.maxFiles);
      }
    }
    definition.questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        const rows = lineItems[q.id] || [];
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
      const nextValues = normalizeRecordValues(definition, sourceRecord.values || {});
      setValues(nextValues);
      setLineItems(buildInitialLineItems(definition, nextValues));
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
    const selectorColumn = selector
      ? [
          {
            id: selector.id,
            label: resolveSelectorLabel(selector, language),
            getValue: () => values[selector.id]
          }
        ]
      : [];
    const fieldColumns = (group.lineItemConfig?.fields || []).map(field => ({
      id: field.id,
      label: resolveFieldLabel(field, language, field.id),
      getValue: (row: LineItemRowState) => row.values[field.id]
    }));
    const columns = [...selectorColumn, ...fieldColumns];
    return (
      <div className="line-summary-table">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.id}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {columns.map(col => (
                  <td key={col.id}>{formatFieldValue(col.getValue(row))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page">
      <header>
        <h1>{definition.title || 'Form'}</h1>
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
              return (
                <div key={q.id} className="field">
                  <div className="muted">{resolveLabel(q, language)}</div>
                  {value.length ? <div>{(value as string[]).join(', ')}</div> : <div className="muted">No response</div>}
                </div>
              );
            }
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
                  <div style={showParagraphStyle}>{value as string}</div>
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

