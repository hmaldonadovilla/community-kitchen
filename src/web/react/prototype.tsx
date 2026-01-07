import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LangCode, WebFormDefinition, WebQuestionDefinition } from '../types';

declare const google: any;

type SubmissionResponse = { success: boolean; message?: string; meta?: { id?: string; createdAt?: string; updatedAt?: string } };
type FollowupResponse = { success: boolean; message?: string; status?: string; pdfUrl?: string; fileId?: string };

const getRunner = () => google?.script?.run;

const runAppsScript = <T,>(fnName: string, ...args: any[]): Promise<T> => {
  return new Promise((resolve, reject) => {
    const runner = getRunner();
    if (!runner || typeof runner.withSuccessHandler !== 'function') {
      reject(new Error('google.script.run is unavailable.'));
      return;
    }
    try {
      runner
        .withSuccessHandler((res: T) => resolve(res))
        .withFailureHandler((err: any) => reject(err?.message ? new Error(err.message) : err || new Error('Request failed')))[fnName](...args);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Request failed'));
    }
  });
};

const saveSubmission = (payload: any) => runAppsScript<SubmissionResponse>('saveSubmissionWithId', payload);
const triggerFollowup = (formKey: string, recordId: string, action: string) =>
  runAppsScript<FollowupResponse>('triggerFollowupAction', formKey, recordId, action);

const resolveLabel = (q: WebQuestionDefinition, language: LangCode) => {
  const key = (language || 'en').toString().toLowerCase();
  const label: any = (q as any)?.label;
  return (label && label[key]) || (label && label.en) || q.id;
};

const resolveOptions = (q: WebQuestionDefinition, language: LangCode): string[] => {
  const key = (language || 'en').toString().toLowerCase();
  const opts = (q.options && (q.options as any)[key]) || (q.options && (q.options as any).en) || [];
  return Array.isArray(opts) ? opts : [];
};

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const buildFilePayload = async (files: FileList | File[] | undefined | null, maxFiles?: number) => {
  if (!files) return [];
  const list = Array.from(files);
  const sliced = maxFiles ? list.slice(0, maxFiles) : list;
  const payloads = await Promise.all(
    sliced.map(async file => ({
      name: file.name,
      type: file.type,
      dataUrl: await toDataUrl(file)
    }))
  );
  return payloads;
};

interface AppProps {
  definition: WebFormDefinition;
  formKey: string;
}

const PrototypeApp: React.FC<AppProps> = ({ definition, formKey }) => {
  const initialLang = definition.languages?.[0] || 'EN';
  const [language, setLanguage] = useState<LangCode>(initialLang);
  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<SubmissionResponse['meta'] | null>(null);
  const [followupResult, setFollowupResult] = useState<FollowupResponse | null>(null);
  const [followupId, setFollowupId] = useState<string>('');

  const formId = useMemo(() => formKey || definition.title || 'Form', [formKey, definition.title]);

  const handleChange = (id: string, value: any) => {
    setValues(prev => ({ ...prev, [id]: value }));
  };

  const handleCheckbox = (id: string, option: string, checked: boolean) => {
    setValues(prev => {
      const current = Array.isArray(prev[id]) ? prev[id] : [];
      const next = checked ? [...current, option] : current.filter((v: string) => v !== option);
      return { ...prev, [id]: next };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setStatus('Submitting…');
    setFollowupResult(null);
    try {
      const payloadValues: Record<string, any> = { ...values };
      for (const q of definition.questions) {
        if (q.type === 'FILE_UPLOAD') {
          const raw = values[q.id] as FileList | File[] | undefined;
          payloadValues[q.id] = await buildFilePayload(raw, q.uploadConfig?.maxFiles);
        }
      }
      // Send values both flattened (legacy server expectation) and nested for future parity.
      const payload = {
        formKey: formId,
        language: (language || initialLang).toString().toUpperCase(),
        ...payloadValues,
        values: payloadValues
      };
      const res = await saveSubmission(payload);
      if (!res?.success) {
        setStatus(res?.message || 'Submit failed');
        return;
      }
      setLastMeta(res.meta || null);
      if (res.meta?.id) {
        setFollowupId(res.meta.id);
      }
      setStatus(res.message || 'Submitted successfully');
    } catch (err: any) {
      setStatus(err?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFollowup = async (action: string) => {
    if (!followupId) {
      setFollowupResult({ success: false, message: 'Record ID is required.' });
      return;
    }
    setFollowupResult({ success: true, message: 'Running…' });
    try {
      const res = await triggerFollowup(formId, followupId, action);
      setFollowupResult(res);
    } catch (err: any) {
      setFollowupResult({ success: false, message: err?.message || 'Follow-up failed' });
    }
  };

  const renderField = (q: WebQuestionDefinition) => {
    const label = resolveLabel(q, language);
    switch (q.type) {
      case 'TEXT':
      case 'PARAGRAPH':
      case 'NUMBER':
      case 'DATE':
        return (
          <div key={q.id} className="field">
            <label>
              <span>{label}</span>
            </label>
            {q.type === 'PARAGRAPH' ? (
              <textarea value={values[q.id] || ''} onChange={e => handleChange(q.id, e.target.value)} />
            ) : (
              <input
                type={q.type === 'NUMBER' ? 'number' : q.type === 'DATE' ? 'date' : 'text'}
                value={values[q.id] || ''}
                onChange={e => handleChange(q.id, e.target.value)}
              />
            )}
          </div>
        );
      case 'CHOICE': {
        const opts = resolveOptions(q, language);
        return (
          <div key={q.id} className="field">
            <label>{label}</label>
            <select value={values[q.id] || ''} onChange={e => handleChange(q.id, e.target.value)}>
              <option value="">Select…</option>
              {opts.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case 'CHECKBOX': {
        const opts = resolveOptions(q, language);
        const current = Array.isArray(values[q.id]) ? values[q.id] : [];
        return (
          <div key={q.id} className="field">
            <label>{label}</label>
            <div className="inline-options">
              {opts.map(opt => (
                <label key={opt} className="inline">
                  <input
                    type="checkbox"
                    checked={current.includes(opt)}
                    onChange={e => handleCheckbox(q.id, opt, e.target.checked)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }
      case 'FILE_UPLOAD':
        return (
          <div key={q.id} className="field">
            <label>{label}</label>
            <input
              type="file"
              multiple={!!q.uploadConfig?.maxFiles && q.uploadConfig.maxFiles > 1}
              onChange={e => handleChange(q.id, e.target.files)}
            />
          </div>
        );
      default:
        return (
          <div key={q.id} className="field">
            <label>{label}</label>
            <p className="muted">Prototype currently skips this field type.</p>
          </div>
        );
    }
  };

  return (
    <div className="page">
      <header>
        <h1>{definition.title || 'React Prototype'}</h1>
        <p className="muted">Prototype to validate React + Apps Script bridge (upload, PDF/email flows).</p>
        <div className="controls">
          <label>
            Language:
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {(definition.languages || ['EN']).map(lang => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Form key: {formId}</span>
        </div>
      </header>

      <section className="card">
        <h2>Submission</h2>
        {definition.questions.map(renderField)}
        <button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        {status && <div className="status">{status}</div>}
        {lastMeta?.id && (
          <div className="status">
            Record ID: <strong>{lastMeta.id}</strong>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Follow-up Actions</h2>
        <label>
          Record ID:
          <input value={followupId} onChange={e => setFollowupId(e.target.value)} placeholder="Use last submission ID" />
        </label>
        <div className="actions">
          <button onClick={() => handleFollowup('CREATE_PDF')}>Create PDF</button>
          <button onClick={() => handleFollowup('SEND_EMAIL')}>Send Email</button>
          <button onClick={() => handleFollowup('CLOSE_RECORD')}>Close Record</button>
        </div>
        {followupResult && (
          <div className="status">
            {followupResult.success ? 'Success' : 'Failed'}: {followupResult.message || followupResult.status || ''}
            {followupResult.pdfUrl && (
              <>
                {' '}
                | PDF: <a href={followupResult.pdfUrl} target="_blank" rel="noreferrer">link</a>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const mount = () => {
  const globalAny = globalThis as any;
  const def: WebFormDefinition | undefined = globalAny.__WEB_FORM_DEF__;
  const formKey: string = globalAny.__WEB_FORM_KEY__ || (def && def.title) || '';
  const rootEl = document.getElementById('react-prototype-root');
  if (!rootEl || !def) return;
  const root = createRoot(rootEl);
  root.render(<PrototypeApp definition={def} formKey={formKey} />);
};

if (typeof document !== 'undefined') {
  mount();
}

export {};
