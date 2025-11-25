import { WebFormDefinition } from '../../types';

type View = 'form' | 'list' | 'summary' | 'followup';

interface ViewContext {
  renderForm: () => void;
  renderList?: () => void;
  renderSummary?: () => void;
  renderFollowup?: () => void;
}

export function createViewRouter(definition: WebFormDefinition, ctx: ViewContext) {
  let current: View = 'form';
  const listeners: Array<(next: View, prev: View) => void> = [];

  function render(view: View) {
    current = view;
    switch (view) {
      case 'form':
        ctx.renderForm();
        break;
      case 'list':
        ctx.renderList?.();
        break;
      case 'summary':
        ctx.renderSummary?.();
        break;
      case 'followup':
        ctx.renderFollowup?.();
        break;
      default:
        ctx.renderForm();
    }
    listeners.forEach(l => l(view, current));
  }

  return {
    get current() {
      return current;
    },
    goTo: (view: View) => render(view),
    onChange: (listener: (next: View, prev: View) => void) => {
      listeners.push(listener);
    }
  };
}
