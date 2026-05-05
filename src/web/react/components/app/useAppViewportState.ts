import { useEffect, useRef, useState } from 'react';

type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;

export type AppViewportState = {
  isMobile: boolean;
  isCompact: boolean;
  isLandscape: boolean;
  blockLandscape: boolean;
};

export const resolveMobileViewportState = (args: {
  width: number;
  height: number;
  userAgent?: string;
  orientationLandscape?: boolean;
}): Omit<AppViewportState, 'blockLandscape'> => {
  const widthBased = args.width <= 900;
  const shortBased = args.height <= 520;
  const landscapeBased = args.orientationLandscape ?? args.width > args.height;
  const uaBased = /Mobi|Android|iPhone|iPad|iPod/i.test(args.userAgent || '');
  const isMobile = widthBased || uaBased;
  return {
    isMobile,
    isLandscape: landscapeBased,
    isCompact: isMobile && shortBased && landscapeBased
  };
};

export const useAppViewportState = (args: {
  portraitOnlyEnabled: boolean;
  language: string;
  onDiagnostic?: DiagnosticHandler;
}): AppViewportState => {
  const { portraitOnlyEnabled, language, onDiagnostic } = args;
  const [viewportState, setViewportState] = useState<Omit<AppViewportState, 'blockLandscape'>>({
    isMobile: false,
    isCompact: false,
    isLandscape: false
  });
  const vvBottomRef = useRef<number>(-1);
  const bottomBarHeightRef = useRef<number>(-1);

  useEffect(() => {
    const updateMobile = () => {
      if (typeof window === 'undefined') return;
      const orientationLandscape =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(orientation: landscape)').matches
          : undefined;
      setViewportState(
        resolveMobileViewportState({
          width: window.innerWidth,
          height: window.innerHeight,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          orientationLandscape
        })
      );
    };
    updateMobile();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateMobile);
      window.addEventListener('orientationchange', updateMobile);
      return () => {
        window.removeEventListener('resize', updateMobile);
        window.removeEventListener('orientationchange', updateMobile);
      };
    }
    return undefined;
  }, []);

  const blockLandscape = portraitOnlyEnabled && viewportState.isMobile && viewportState.isLandscape;

  useEffect(() => {
    if (!portraitOnlyEnabled) return;
    onDiagnostic?.('ui.portraitOnly.enabled', { enabled: true });

    try {
      const screenAny = (globalThis as any).screen;
      const orientation = screenAny?.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        Promise.resolve()
          .then(() => orientation.lock('portrait'))
          .then(() => onDiagnostic?.('ui.orientation.lock.ok', { mode: 'portrait' }))
          .catch((err: any) =>
            onDiagnostic?.('ui.orientation.lock.failed', {
              mode: 'portrait',
              message: (err?.message || err?.toString?.() || 'lock failed').toString()
            })
          );
      } else {
        onDiagnostic?.('ui.orientation.lock.unavailable', { mode: 'portrait' });
      }
    } catch (err: any) {
      onDiagnostic?.('ui.orientation.lock.failed', {
        mode: 'portrait',
        message: (err?.message || err?.toString?.() || 'lock failed').toString()
      });
    }
  }, [onDiagnostic, portraitOnlyEnabled]);

  useEffect(() => {
    if (!portraitOnlyEnabled) return;
    if (!viewportState.isMobile) return;
    onDiagnostic?.(blockLandscape ? 'ui.orientation.blocked' : 'ui.orientation.allowed', {
      landscape: viewportState.isLandscape,
      blocked: blockLandscape
    });
  }, [blockLandscape, onDiagnostic, portraitOnlyEnabled, viewportState.isLandscape, viewportState.isMobile]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const header = document.querySelector<HTMLElement>('.ck-app-header');
      if (!header) return;
      const height = header.offsetHeight || 0;
      root.style.setProperty('--ck-header-height', `${height}px`);
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [language, viewportState.isCompact, viewportState.isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    if (!root) return;

    if (!visualViewport) {
      root.style.setProperty('--vv-bottom', '0px');
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const bottom = Math.max(0, window.innerHeight - (visualViewport.height + visualViewport.offsetTop));
      root.style.setProperty('--vv-bottom', `${bottom}px`);
      if (vvBottomRef.current !== bottom) {
        vvBottomRef.current = bottom;
        onDiagnostic?.('ui.viewport.vvBottom', {
          bottomPx: bottom,
          innerHeight: window.innerHeight,
          vvHeight: visualViewport.height,
          vvOffsetTop: visualViewport.offsetTop
        });
      }
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    schedule();
    visualViewport.addEventListener('resize', schedule);
    visualViewport.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      visualViewport.removeEventListener('resize', schedule);
      visualViewport.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [onDiagnostic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    const cssVar = '--ck-bottom-bar-height';
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;

    const update = () => {
      raf = 0;
      const bar = document.querySelector<HTMLElement>('.ck-bottom-bar');

      if (bar !== observed) {
        resizeObserver?.disconnect();
        observed = bar;
        if (resizeObserver && bar) resizeObserver.observe(bar);
      }

      if (!bar) {
        root.style.removeProperty(cssVar);
        if (bottomBarHeightRef.current !== -1) {
          bottomBarHeightRef.current = -1;
          onDiagnostic?.('ui.actionBars.bottomBarHeight', { heightPx: null });
        }
        return;
      }

      const height = Math.max(0, Math.round(bar.getBoundingClientRect().height));
      root.style.setProperty(cssVar, `${height}px`);
      if (bottomBarHeightRef.current !== height) {
        bottomBarHeightRef.current = height;
        onDiagnostic?.('ui.actionBars.bottomBarHeight', { heightPx: height });
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => schedule());
    }

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      resizeObserver?.disconnect();
    };
  }, [onDiagnostic]);

  return {
    ...viewportState,
    blockLandscape
  };
};
