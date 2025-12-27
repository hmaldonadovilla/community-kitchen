import React, { useEffect, useRef } from 'react';

/**
 * Paired row wrapper used by `.ck-pair-grid`.
 *
 * Goal: keep control rows vertically aligned across the two columns when one label wraps
 * (e.g. long second-column labels). We do this by measuring both labels and setting a
 * per-row CSS variable consumed by `.ck-pair-grid > .field.inline-field > label`.
 */
export const PairedRowGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'ck-pair-grid'
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    const getLabels = (): HTMLElement[] => {
      const labels: HTMLElement[] = [];
      const fieldEls = Array.from(el.children).filter(
        node => node instanceof HTMLElement && node.classList.contains('field') && node.classList.contains('inline-field')
      ) as HTMLElement[];
      fieldEls.forEach(fieldEl => {
        const directLabel = Array.from(fieldEl.children).find(
          ch => ch instanceof HTMLElement && ch.tagName === 'LABEL'
        ) as HTMLElement | undefined;
        if (directLabel) labels.push(directLabel);
      });
      return labels;
    };

    const compute = () => {
      const labels = getLabels();
      if (labels.length < 2) return;
      const heights = labels.map(l => l.getBoundingClientRect().height).filter(h => Number.isFinite(h) && h > 0);
      const max = heights.length ? Math.max(...heights) : 0;
      const next = max ? `${Math.ceil(max)}px` : '0px';
      if (el.style.getPropertyValue('--ck-pair-label-min-height') !== next) {
        el.style.setProperty('--ck-pair-label-min-height', next);
      }
    };

    let raf: number | null = null;
    const schedule = () => {
      if (typeof requestAnimationFrame === 'undefined') {
        compute();
        return;
      }
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        compute();
      });
    };

    // Observe label resizes (wrapping/unwrapping) and also re-attach if DOM changes.
    const ro = new ResizeObserver(schedule);
    const attach = () => {
      ro.disconnect();
      getLabels().forEach(l => ro.observe(l));
      schedule();
    };
    attach();

    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(attach) : null;
    mo?.observe(el, { childList: true, subtree: true });
    globalThis.addEventListener?.('resize', schedule as any);

    return () => {
      globalThis.removeEventListener?.('resize', schedule as any);
      mo?.disconnect();
      ro.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ ['--ck-pair-label-min-height' as any]: '0px' }}>
      {children}
    </div>
  );
};



