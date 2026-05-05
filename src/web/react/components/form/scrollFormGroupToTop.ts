import type { MutableRefObject } from 'react';

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

/**
 * Owner: form group scrolling.
 * Encapsulates sticky-header-aware group scrolling and iOS correction behavior
 * outside FormView so the component only decides when a group should scroll.
 */
export const scrollFormGroupToTop = (params: {
  groupKey: string;
  args?: { behavior?: ScrollBehavior; reason?: string };
  animationRafRef: MutableRefObject<number>;
  onDiagnostic?: DiagnosticLogger;
}) => {
  const { groupKey, args, animationRafRef, onDiagnostic } = params;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const reason = (args?.reason || 'expand').toString();
  const escaped = (groupKey || '').toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = document.querySelector<HTMLElement>(`[data-group-key="${escaped}"]`);
  if (!el) {
    onDiagnostic?.('ui.group.scrollIntoView.miss', { groupKey, reason });
    return;
  }

  const header = document.querySelector<HTMLElement>('.ck-app-header');
  const topBar = document.querySelector<HTMLElement>('.ck-top-action-bar');
  const headerRect = header?.getBoundingClientRect();
  const topBarRect = topBar?.getBoundingClientRect();
  const stickyBottom = Math.max(0, headerRect?.bottom || 0, topBarRect?.bottom || 0);
  const offset = Math.round(stickyBottom + 16);
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport || null;
  const scrollEl = document.scrollingElement as HTMLElement | null;
  const docEl = document.documentElement as HTMLElement | null;
  const bodyEl = document.body as HTMLElement | null;
  const vvPageTop = vv && typeof vv.pageTop === 'number' ? vv.pageTop : null;

  const snapshotScroll = () => {
    const win = typeof window.scrollY === 'number' ? window.scrollY : 0;
    const se = scrollEl && typeof scrollEl.scrollTop === 'number' ? scrollEl.scrollTop : null;
    const doc = docEl && typeof docEl.scrollTop === 'number' ? docEl.scrollTop : null;
    const body = bodyEl && typeof bodyEl.scrollTop === 'number' ? bodyEl.scrollTop : null;
    return { win, se, doc, body };
  };

  const before = snapshotScroll();
  const baseScrollTop = Math.max(
    0,
    before.win || 0,
    before.se || 0,
    before.doc || 0,
    before.body || 0,
    vvPageTop || 0
  );
  const targetTop = Math.max(0, baseScrollTop + rect.top - offset);
  const behavior: ScrollBehavior =
    args?.behavior || (reason.toLowerCase().startsWith('auto') ? 'auto' : 'smooth');

  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1));
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const computeStickyOffset = () => {
    const headerNow = document.querySelector<HTMLElement>('.ck-app-header');
    const topBarNow = document.querySelector<HTMLElement>('.ck-top-action-bar');
    const headerRectNow = headerNow?.getBoundingClientRect();
    const topBarRectNow = topBarNow?.getBoundingClientRect();
    const stickyBottomNow = Math.max(0, headerRectNow?.bottom || 0, topBarRectNow?.bottom || 0);
    const offsetNow = Math.round(stickyBottomNow + 16);
    return { offsetNow };
  };

  const setScrollTop = (top: number) => {
    const next = Math.max(0, top);
    try {
      window.scrollTo(0, next);
    } catch {
      // ignore
    }
    try {
      if (scrollEl) scrollEl.scrollTop = next;
      if (docEl) docEl.scrollTop = next;
      if (bodyEl) bodyEl.scrollTop = next;
    } catch {
      // ignore
    }
  };

  if (isIOS && behavior === 'smooth' && !prefersReducedMotion && typeof window.requestAnimationFrame === 'function') {
    if (animationRafRef.current) {
      try {
        window.cancelAnimationFrame(animationRafRef.current);
      } catch {
        // ignore
      }
      animationRafRef.current = 0;
    }

    const absoluteTop = baseScrollTop + rect.top;
    const initialTargetTop = Math.max(0, absoluteTop - offset);
    const distance = Math.abs(initialTargetTop - baseScrollTop);
    const durationMs = Math.min(420, Math.max(200, Math.round(distance * 0.15 + 180)));
    const startTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

    const easeInOutCubic = (t: number) => {
      const p = Math.max(0, Math.min(1, t));
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    };

    const step = (ts: number) => {
      const now = ts || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
      const p = Math.min(1, Math.max(0, (now - startTime) / durationMs));
      const eased = easeInOutCubic(p);

      const { offsetNow } = computeStickyOffset();
      const targetNow = Math.max(0, absoluteTop - offsetNow);
      const nextTop = baseScrollTop + (targetNow - baseScrollTop) * eased;
      setScrollTop(nextTop);

      if (p < 1) {
        animationRafRef.current = window.requestAnimationFrame(step);
        return;
      }
      animationRafRef.current = 0;
      setScrollTop(targetNow);

      const after = snapshotScroll();
      const rectAfter = el.getBoundingClientRect();
      onDiagnostic?.('ui.group.scrollIntoView', {
        groupKey,
        reason,
        mode: 'customSmooth',
        durationMs,
        offsetPx: offset,
        stickyBottomPx: Math.round(stickyBottom),
        headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
        topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
        rectTopPx: Math.round(rectAfter.top),
        baseScrollTopPx: Math.round(baseScrollTop),
        targetTopPx: Math.round(targetNow),
        scrollYPx: Math.round(window.scrollY),
        scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
        docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
        bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
        vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
        vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
      });
    };

    animationRafRef.current = window.requestAnimationFrame(step);
    return;
  }

  const finalizeAlignment = () => {
    try {
      const { offsetNow } = computeStickyOffset();
      const vvNow = window.visualViewport || null;
      const vvNowPageTop = vvNow && typeof vvNow.pageTop === 'number' ? vvNow.pageTop : null;
      const rectNow = el.getBoundingClientRect();
      const now = snapshotScroll();
      const baseNow = Math.max(
        0,
        now.win || 0,
        now.se || 0,
        now.doc || 0,
        now.body || 0,
        vvNowPageTop || 0
      );
      const targetNow = Math.max(0, baseNow + rectNow.top - offsetNow);
      const misaligned = Math.abs(rectNow.top - offsetNow) > 2;
      if (!misaligned) return;
      if (Math.abs(targetNow - baseNow) < 2) return;

      try {
        window.scrollTo({ top: targetNow, behavior: 'auto' });
      } catch {
        window.scrollTo(0, targetNow);
      }
      try {
        scrollEl?.scrollTo?.({ top: targetNow, behavior: 'auto' });
      } catch {
        // ignore
      }
      try {
        if (scrollEl) scrollEl.scrollTop = targetNow;
        if (docEl) docEl.scrollTop = targetNow;
        if (bodyEl) bodyEl.scrollTop = targetNow;
      } catch {
        // ignore
      }

      onDiagnostic?.('ui.group.scrollIntoView.adjust', {
        groupKey,
        reason,
        rectTopPx: Math.round(rectNow.top),
        offsetPx: Math.round(offsetNow),
        baseScrollTopPx: Math.round(baseNow),
        targetTopPx: Math.round(targetNow),
        vvPageTopPx: vvNow && typeof vvNow.pageTop === 'number' ? Math.round(vvNow.pageTop) : null,
        scrollYPx: Math.round(window.scrollY)
      });
    } catch {
      // ignore
    }
  };

  try {
    window.scrollTo({ top: targetTop, behavior });
    try {
      scrollEl?.scrollTo?.({ top: targetTop, behavior });
    } catch {
      // ignore
    }

    if (behavior !== 'smooth') {
      try {
        if (scrollEl) scrollEl.scrollTop = targetTop;
        if (docEl) docEl.scrollTop = targetTop;
        if (bodyEl) bodyEl.scrollTop = targetTop;
      } catch {
        // ignore
      }
    }

    const after = snapshotScroll();
    onDiagnostic?.('ui.group.scrollIntoView', {
      groupKey,
      reason,
      offsetPx: offset,
      stickyBottomPx: Math.round(stickyBottom),
      headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
      topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
      rectTopPx: Math.round(rect.top),
      baseScrollTopPx: Math.round(baseScrollTop),
      targetTopPx: Math.round(targetTop),
      scrollYPx: Math.round(window.scrollY),
      scrollElTopPx: after.se !== null ? Math.round(after.se) : null,
      docScrollTopPx: after.doc !== null ? Math.round(after.doc) : null,
      bodyScrollTopPx: after.body !== null ? Math.round(after.body) : null,
      vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
      vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
    });

    if (Math.abs(targetTop - baseScrollTop) > 2) {
      window.setTimeout(() => {
        const check = snapshotScroll();
        const moved =
          Math.abs((check.win || 0) - (before.win || 0)) > 2 ||
          Math.abs((check.se || 0) - (before.se || 0)) > 2 ||
          Math.abs((check.doc || 0) - (before.doc || 0)) > 2 ||
          Math.abs((check.body || 0) - (before.body || 0)) > 2;
        if (moved) return;

        try {
          if (scrollEl) scrollEl.scrollTop = targetTop;
          if (docEl) docEl.scrollTop = targetTop;
          if (bodyEl) bodyEl.scrollTop = targetTop;
          window.scrollTo(0, targetTop);
        } catch {
          // ignore
        }
        const forced = snapshotScroll();
        onDiagnostic?.('ui.group.scrollIntoView.force', {
          groupKey,
          reason,
          targetTopPx: Math.round(targetTop),
          scrollYPx: Math.round(window.scrollY),
          scrollElTopPx: forced.se !== null ? Math.round(forced.se) : null,
          docScrollTopPx: forced.doc !== null ? Math.round(forced.doc) : null,
          bodyScrollTopPx: forced.body !== null ? Math.round(forced.body) : null
        });
      }, behavior === 'smooth' ? 260 : 80);
    }

    window.setTimeout(() => finalizeAlignment(), behavior === 'smooth' ? 420 : 120);
  } catch {
    try {
      window.scrollTo(0, targetTop);
      onDiagnostic?.('ui.group.scrollIntoView', {
        groupKey,
        reason,
        offsetPx: offset,
        stickyBottomPx: Math.round(stickyBottom),
        headerBottomPx: headerRect?.bottom ? Math.round(headerRect.bottom) : null,
        topBarBottomPx: topBarRect?.bottom ? Math.round(topBarRect.bottom) : null,
        rectTopPx: Math.round(rect.top),
        baseScrollTopPx: Math.round(baseScrollTop),
        targetTopPx: Math.round(targetTop),
        scrollYPx: Math.round(window.scrollY),
        scrollElTopPx: scrollEl && typeof scrollEl.scrollTop === 'number' ? Math.round(scrollEl.scrollTop) : null,
        docScrollTopPx: docEl && typeof docEl.scrollTop === 'number' ? Math.round(docEl.scrollTop) : null,
        bodyScrollTopPx: bodyEl && typeof bodyEl.scrollTop === 'number' ? Math.round(bodyEl.scrollTop) : null,
        vvPageTopPx: vv && typeof vv.pageTop === 'number' ? Math.round(vv.pageTop) : null,
        vvOffsetTopPx: vv && typeof vv.offsetTop === 'number' ? Math.round(vv.offsetTop) : null
      });
      window.setTimeout(() => finalizeAlignment(), 120);
    } catch {
      // ignore
    }
  }
};
