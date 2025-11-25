import { LangCode, WebFormDefinition } from '../types';
import { resolveLocalizedString } from '../i18n';

interface LanguageUpdateOptions {
  language: LangCode;
  root?: Document | HTMLElement;
  definition?: WebFormDefinition;
}

export function updateLanguageLabels(options: LanguageUpdateOptions): void {
  const { language, root = document } = options;
  const langKey = (language || 'en').toString().toLowerCase();

  root.querySelectorAll<HTMLElement>('[data-en-label]').forEach(el => {
    const label = (el as any).dataset?.[`${langKey}Label`] || (el as any).dataset?.enLabel || '';
    const textTarget = (el as HTMLElement).querySelector?.<HTMLElement>('[data-label-text]');
    if (textTarget) {
      textTarget.textContent = label;
    } else {
      el.textContent = label;
    }
  });

  root.querySelectorAll<HTMLOptionElement>('option[data-en-label]').forEach(opt => {
    const label = (opt as any).dataset?.[`${langKey}Label`] || (opt as any).dataset?.enLabel || '';
    opt.textContent = label;
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-default-label]').forEach(btn => {
    const defaultLabel = (btn as any).dataset?.defaultLabel || '+ Add line';
    let labels;
    try {
      labels = (btn as any).dataset?.addLabels ? JSON.parse((btn as any).dataset.addLabels) : undefined;
    } catch (_) {
      labels = undefined;
    }
    btn.textContent = resolveLocalizedString(labels, language, defaultLabel);
  });
}
