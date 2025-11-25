import { WebFormDefinition } from '../../types';
import { LangCode } from '../types';

interface FollowupAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface FollowupViewOptions {
  mount: HTMLElement;
  definition: WebFormDefinition;
  language: LangCode;
  actions?: FollowupAction[];
}

export function renderFollowupView(opts: FollowupViewOptions): void {
  const { mount, language, actions = [] } = opts;
  mount.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = language === 'FR' ? 'Suivi' : language === 'NL' ? 'Vervolg' : 'Follow-up';
  mount.appendChild(title);

  if (!actions.length) {
    const empty = document.createElement('div');
    empty.textContent = language === 'FR' ? 'Aucune action disponible.' : language === 'NL' ? 'Geen acties beschikbaar.' : 'No follow-up actions available.';
    mount.appendChild(empty);
    return;
  }

  actions.forEach(action => {
    const btn = document.createElement(action.href ? 'a' : 'button');
    btn.textContent = action.label;
    (btn as any).style = 'display:inline-block;margin:4px 6px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;text-decoration:none;color:#0f172a;background:#fff;';
    if (action.href) {
      (btn as HTMLAnchorElement).href = action.href;
      (btn as HTMLAnchorElement).target = '_blank';
    } else if (action.onClick) {
      btn.addEventListener('click', action.onClick);
    }
    mount.appendChild(btn);
  });
}
