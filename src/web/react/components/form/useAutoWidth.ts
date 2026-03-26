import React from 'react';

type AutoWidthOptions = {
  min?: number;
  max?: number;
  extra?: number;
  visible?: boolean;
};

export const useAutoWidth = (
  text: string,
  { min = 44, max = 160, extra = 18, visible = true }: AutoWidthOptions = {}
) => {
  const rootRef = React.useRef<HTMLElement | null>(null);
  const mirrorRef = React.useRef<HTMLSpanElement | null>(null);
  const [width, setWidth] = React.useState(min);

  const update = React.useCallback(() => {
    if (!visible) return;
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const displayText = `${text || ''}`;
    const mirrorWidth = Math.ceil(mirror.getBoundingClientRect().width);
    const heuristicWidth = Math.ceil(displayText.length * 9.5);
    const measured = Math.max(mirrorWidth, heuristicWidth) + extra;
    const nextWidth = Math.max(min, Math.min(max, measured));
    setWidth(nextWidth);
  }, [extra, max, min, text, visible]);

  React.useLayoutEffect(() => {
    let cancelled = false;
    const rafId = globalThis.requestAnimationFrame(() => {
      if (!cancelled) update();
    });

    const fontsReady = (document as any)?.fonts?.ready;
    if (fontsReady && typeof fontsReady.then === 'function') {
      fontsReady.then(() => {
        globalThis.requestAnimationFrame(() => {
          if (!cancelled) update();
        });
      });
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && rootRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (!cancelled) update();
      });
      resizeObserver.observe(rootRef.current);
    }

    globalThis.addEventListener('resize', update);
    return () => {
      cancelled = true;
      globalThis.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      globalThis.removeEventListener('resize', update);
    };
  }, [update]);

  return { width, rootRef, mirrorRef };
};
