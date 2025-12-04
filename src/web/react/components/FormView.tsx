import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  FieldValue,
  LangCode,
  LineItemRowState,
  LineItemSelectorConfig,
  OptionSet,
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

const buildLineContextId = (groupId: string, rowId: string, fieldId?: string) => `${groupId}::${fieldId || 'field'}::${rowId}`;

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
  setValues: (updater: (prev: Record<string, FieldValue>) => Record<string, FieldValue>) => void;
  lineItems: LineItemState;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  onSubmit: () => Promise<void>;
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

const FormView: React.FC<FormViewProps> = ({
  definition,
  language,
  values,
  setValues,
  lineItems,
  setLineItems,
  onSubmit,
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
  const [overlay, setOverlay] = useState<LineOverlayState>({ open: false, options: [], selected: [] });
  const statusRef = useRef<HTMLDivElement | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragState, setDragState] = useState<Record<string, boolean>>({});
  const dragCounterRef = useRef<Record<string, number>>({});
  const [uploadAnnouncements, setUploadAnnouncements] = useState<Record<string, string>>({});
  const firstErrorRef = useRef<string | null>(null);
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

  const addLineItemRow = (groupId: string, preset?: Record<string, any>) => {
    setLineItems(prev => {
      const current = prev[groupId] || [];
      const row: LineItemRowState = {
        id: `${groupId}_${Math.random().toString(16).slice(2)}`,
        values: { ...(preset || {}) }
      };
      return { ...prev, [groupId]: [...current, row] };
    });
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
      return { ...prev, [groupId]: rows.filter(r => r.id !== rowId) };
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

  const updateLineValue = (groupId: string, rowId: string, fieldId: string, value: FieldValue) => {
    setLineItems(prev => {
      const rows = prev[groupId] || [];
      const next = rows.map(row => (row.id === rowId ? { ...row, values: { ...row.values, [fieldId]: value } } : row));
      return { ...prev, [groupId]: next };
    });
  };

  const handleFieldChange = (q: WebQuestionDefinition, value: FieldValue) => {
    if (onStatusClear) onStatusClear();
    setValues(prev => ({ ...prev, [q.id]: value }));
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
    const nextRowValues = { ...(currentRow?.values || {}), [field.id]: value };
    updateLineValue(group.id, rowId, field.id, value);
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
          const contextId = buildLineContextId(group.id, rowId, effectField.id);
          const nextValue = rowComplete ? nextRowValues[effectField.id] : null;
          onSelectionEffect(effectField as WebQuestionDefinition, nextValue, {
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

  const renderQuestion = (q: WebQuestionDefinition) => {
    const optionSet = renderOptions(q);
    const dependencyValues = (dependsOn: string | string[]) => {
      const ids = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
      return ids.map(id => toDependencyValue(values[id]));
    };
    const allowed = computeAllowedOptions(q.optionFilter, optionSet, dependencyValues(q.optionFilter?.dependsOn || []));
    const opts = buildLocalizedOptions(optionSet, allowed, language);
    const hidden = shouldHideField(q.visibility, {
      getValue: (fieldId: string) => values[fieldId]
    });
    if (hidden) return null;

    switch (q.type) {
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE':
        return (
          <div key={q.id} className="field" data-field-path={q.id}>
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            {q.type === 'PARAGRAPH' ? (
              <textarea value={(values[q.id] as string) || ''} onChange={e => handleFieldChange(q, e.target.value)} />
            ) : (
              <input
                type={q.type === 'NUMBER' ? 'number' : q.type === 'DATE' ? 'date' : 'text'}
                value={(values[q.id] as string) || ''}
                onChange={e => handleFieldChange(q, e.target.value)}
              />
            )}
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      case 'CHOICE':
        return (
          <div key={q.id} className="field" data-field-path={q.id}>
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <select value={(values[q.id] as string) || ''} onChange={e => handleFieldChange(q, e.target.value)}>
              <option value="">Select…</option>
              {opts.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors[q.id] && <div className="error">{errors[q.id]}</div>}
          </div>
        );
      case 'CHECKBOX': {
        const selected = Array.isArray(values[q.id]) ? (values[q.id] as string[]) : [];
        return (
          <div key={q.id} className="field" data-field-path={q.id}>
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
          <div key={q.id} className="field" data-field-path={q.id}>
            <label>
              {resolveLabel(q, language)}
              {q.required && <RequiredStar />}
            </label>
            <div
              role="button"
              tabIndex={0}
              aria-disabled={maxed}
              onClick={() => {
                if (maxed) return;
                fileInputsRef.current[q.id]?.click();
              }}
              onKeyDown={e => {
                if (maxed) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputsRef.current[q.id]?.click();
                }
              }}
              onDragEnter={e => {
                e.preventDefault();
                incrementDrag(q.id);
              }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => {
                e.preventDefault();
                decrementDrag(q.id);
              }}
              onDrop={e => handleFileDrop(q, e)}
              style={{
                border: dragActive ? '2px solid #0ea5e9' : '1px dashed #94a3b8',
                borderRadius: 12,
                padding: '16px',
                background: dragActive ? '#e0f2fe' : maxed ? '#f1f5f9' : '#f8fafc',
                color: '#0f172a',
                cursor: maxed ? 'not-allowed' : 'pointer',
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
                className="secondary"
                onClick={() => clearFiles(q)}
                style={{ marginBottom: 12 }}
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
                onClick={async () => {
                  const anchorField = (q.lineItemConfig?.fields || []).find(f => f.id === q.lineItemConfig?.anchorFieldId);
                  if (!anchorField || anchorField.type !== 'CHOICE') {
                    addLineItemRow(q.id);
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
                  const localized = buildLocalizedOptions(opts, allowed.length ? allowed : opts.en || [], language);
                  setOverlay({
                    open: true,
                    options: localized.map(opt => ({ value: opt.value, label: opt.label })),
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
            <button type="button" onClick={() => addLineItemRow(q.id)}>
              {resolveLocalizedString(q.lineItemConfig?.addButtonLabel, language, 'Add line')}
            </button>
          );
        };

        return (
          <div key={q.id} className="card" data-field-path={q.id}>
            <h3>{resolveLabel(q, language)}</h3>
            {(lineItems[q.id] || []).map(row => {
              const groupCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => row.values[fid]
              };
              const totals = computeTotals({ config: q.lineItemConfig!, rows: lineItems[q.id] || [] }, language);
              return (
                <div key={row.id} className="line-item-row">
                  {(q.lineItemConfig?.fields || []).map(field => {
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
                    ).filter((dep): dep is string => typeof dep === 'string' && !!dep);
                    const allowedField = computeAllowedOptions(
                      field.optionFilter,
                      optionSetField,
                      dependencyIds.map(dep => toDependencyValue(row.values[dep] ?? values[dep]))
                    );
                    const optsField = buildLocalizedOptions(optionSetField, allowedField, language);
                    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
                    if (hideField) return null;
                    const errorKey = `${q.id}__${field.id}__${row.id}`;
                    switch (field.type) {
                      case 'CHOICE':
                        return (
                          <div key={field.id} className="field inline-field" data-field-path={errorKey}>
                            <label>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <select
                              value={(row.values[field.id] as string) || ''}
                              onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            >
                              <option value="">Select…</option>
                              {optsField.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      case 'CHECKBOX': {
                        const selected = Array.isArray(row.values[field.id]) ? (row.values[field.id] as string[]) : [];
                        return (
                          <div key={field.id} className="field inline-field" data-field-path={errorKey}>
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
                                      handleLineFieldChange(q, row.id, field, next);
                                    }}
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                      }
                      default:
                        return (
                          <div key={field.id} className="field inline-field" data-field-path={errorKey}>
                            <label>
                              {resolveFieldLabel(field, language, field.id)}
                              {field.required && <RequiredStar />}
                            </label>
                            <input
                              type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'}
                              value={(row.values[field.id] as string) || ''}
                              onChange={e => handleLineFieldChange(q, row.id, field, e.target.value)}
                            />
                            {errors[errorKey] && <div className="error">{errors[errorKey]}</div>}
                          </div>
                        );
                    }
                  })}
                  <div className="line-actions">
                    <button type="button" className="secondary" onClick={() => removeLineRow(q.id, row.id)}>
                      Remove
                    </button>
                  </div>
                  {totals.length ? (
                    <div className="line-totals">
                      {totals.map(t => (
                        <span key={t.key} className="pill">
                          {t.label}: {t.value.toFixed(t.decimalPlaces || 0)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="line-item-toolbar">
              {selectorCfg && (
                <div className="section-selector" data-field-path={selectorCfg.id}>
                  <label>
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
              {renderAddButton()}
            </div>
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

  useEffect(() => {
    const keys = Object.keys(errors || {});
    if (!keys.length) {
      firstErrorRef.current = null;
      return;
    }
    const firstKey = keys[0];
    if (firstErrorRef.current === firstKey) return;
    firstErrorRef.current = firstKey;
    if (typeof document === 'undefined') return;
    const target = document.querySelector<HTMLElement>(`[data-field-path="${firstKey}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = target.querySelector<HTMLElement>('input, select, textarea, button');
    try {
      focusable?.focus({ preventScroll: true } as any);
    } catch (_) {
      // ignore focus issues
    }
  }, [errors]);

  return (
    <>
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
        {definition.questions.map(renderQuestion)}
      </div>
      <div className="sticky-submit">
        <button type="button" onClick={onSubmit} disabled={submitting}>
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
            zIndex: 9999
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
              <button type="button" className="secondary" onClick={() => setOverlay({ open: false, options: [], selected: [] })}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (overlay.groupId && overlay.anchorFieldId) {
                    (overlay.selected || []).forEach(val => addLineItemRow(overlay.groupId!, { [overlay.anchorFieldId!]: val }));
                  }
                  setOverlay({ open: false, options: [], selected: [] });
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FormView;

