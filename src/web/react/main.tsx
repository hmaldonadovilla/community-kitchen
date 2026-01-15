import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WebFormDefinition } from '../types';

const debugEnabled = (): boolean => {
  try {
    return Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);
  } catch (_) {
    return false;
  }
};

const summarizeOptionMapRefs = (def: WebFormDefinition | undefined): {
  total: number;
  optionFilter: number;
  valueMap: number;
  lineItemOptionFilter: number;
  lineItemValueMap: number;
  refs: string[];
} => {
  const refs = new Set<string>();
  const buckets = {
    total: 0,
    optionFilter: 0,
    valueMap: 0,
    lineItemOptionFilter: 0,
    lineItemValueMap: 0
  };

  const register = (cfg: any, kind: keyof typeof buckets) => {
    if (!cfg) return;
    const ref = cfg?.optionMapRef?.ref;
    if (!ref) return;
    buckets.total += 1;
    buckets[kind] += 1;
    refs.add(ref.toString());
  };

  const visitLineGroup = (group: any) => {
    if (!group || typeof group !== 'object') return;
    const fields = Array.isArray(group.fields) ? group.fields : [];
    fields.forEach((f: any) => {
      register(f?.optionFilter, 'lineItemOptionFilter');
      register(f?.valueMap, 'lineItemValueMap');
    });
    const subGroups = Array.isArray(group.subGroups) ? group.subGroups : [];
    subGroups.forEach(visitLineGroup);
  };

  const questions = def?.questions || [];
  questions.forEach((q: any) => {
    register(q?.optionFilter, 'optionFilter');
    register(q?.valueMap, 'valueMap');
    if (q?.lineItemConfig) visitLineGroup(q.lineItemConfig);
  });

  return { ...buckets, refs: Array.from(refs).sort() };
};

const mount = () => {
  const globalAny = globalThis as any;
  const def: WebFormDefinition | undefined = globalAny.__WEB_FORM_DEF__;
  const formKey: string = globalAny.__WEB_FORM_KEY__ || (def && def.title) || '';
  const record: any = globalAny.__WEB_FORM_RECORD__;
  const rootEl = document.getElementById('react-prototype-root');
  if (!rootEl || !def) return;

  if (debugEnabled() && typeof console !== 'undefined' && typeof console.info === 'function') {
    try {
      console.info('[ReactForm]', 'mount', {
        formKey,
        questions: Array.isArray((def as any).questions) ? (def as any).questions.length : 0
      });
      const summary = summarizeOptionMapRefs(def);
      if (summary.total > 0) {
        console.info('[ReactForm][OptionMapRef]', 'summary', summary);
      }
    } catch (_) {
      // ignore logging failures
    }
  }

  const root = createRoot(rootEl);
  const Root = require('./Root').default as typeof import('./Root').Root;
  root.render(<Root definition={def} formKey={formKey} record={record} />);
};

if (typeof document !== 'undefined') {
  mount();
}

export {};

