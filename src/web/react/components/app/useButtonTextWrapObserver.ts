import { useEffect } from 'react';

import { buttonHasWrappedText, ensureButtonTextSpans } from '../../app/buttonTextWrap';
import type { LangCode } from '../../../types';
import type { View } from '../../types';

export const useButtonTextWrapObserver = (args: { view: View; language: LangCode }) => {
  const { view, language } = args;

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    let rafId: number | null = null;
    const scan = () => {
      rafId = null;
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.forEach(button => {
        ensureButtonTextSpans(button);
        const wrapped = buttonHasWrappedText(button);
        button.classList.toggle('ck-button-wrap-left', wrapped);
      });
    };
    const schedule = () => {
      if (rafId !== null) return;
      rafId = globalThis.requestAnimationFrame(scan);
    };

    schedule();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    globalThis.addEventListener?.('resize', schedule as any);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener?.('resize', schedule as any);
      if (rafId !== null) globalThis.cancelAnimationFrame(rafId);
    };
  }, [view, language]);
};
