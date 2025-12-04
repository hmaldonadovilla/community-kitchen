import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WebFormDefinition } from '../types';

const mount = () => {
  const globalAny = globalThis as any;
  const def: WebFormDefinition | undefined = globalAny.__WEB_FORM_DEF__;
  const formKey: string = globalAny.__WEB_FORM_KEY__ || (def && def.title) || '';
  const record: any = globalAny.__WEB_FORM_RECORD__;
  const rootEl = document.getElementById('react-prototype-root');
  if (!rootEl || !def) return;
  const root = createRoot(rootEl);
  root.render(<App definition={def} formKey={formKey} record={record} />);
};

if (typeof document !== 'undefined') {
  mount();
}

export {};

