import { WebFormDefinition } from '../../types';
import { LangCode } from '../types';

interface SummaryViewOptions {
  mount: HTMLElement;
  definition: WebFormDefinition;
  language: LangCode;
  payload: Record<string, unknown>;
}

export function renderSummaryView(opts: SummaryViewOptions): void {
  const { mount, definition, language, payload } = opts;
  mount.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = language === 'FR' ? 'Résumé' : language === 'NL' ? 'Samenvatting' : 'Summary';
  mount.appendChild(title);

  definition.questions.forEach(q => {
    const block = document.createElement('div');
    block.style.padding = '8px 0';
    const label = document.createElement('div');
    label.style.fontWeight = '800';
    label.textContent = q.label.en || q.id;
    const value = document.createElement('div');
    const val = payload[q.id];
    value.textContent = Array.isArray(val) ? val.join(', ') : (val as string) || '';
    block.appendChild(label);
    block.appendChild(value);
    mount.appendChild(block);
  });
}
