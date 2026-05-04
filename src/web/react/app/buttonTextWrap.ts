/**
 * Owner: app shell UI instrumentation.
 * Detects action buttons whose visible text wraps so CSS can align multi-line
 * labels consistently. This module is DOM-only and must not own app state.
 */

const isWrapScanHiddenElement = (el: HTMLElement): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === 'svg' || tag === 'path' || tag === 'img' || tag === 'script' || tag === 'style') return true;
  if ((el.getAttribute('aria-hidden') || '').toString().trim().toLowerCase() === 'true') return true;
  const className = typeof el.className === 'string' ? el.className : '';
  if (/\bsr-only\b|\bvisually-hidden\b/i.test(className)) return true;
  const style = globalThis.getComputedStyle?.(el);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  const clip = (style.clip || '').toString().toLowerCase();
  const clipPath = (style.clipPath || '').toString().toLowerCase();
  const width = Number.parseFloat((style.width || '').toString());
  const height = Number.parseFloat((style.height || '').toString());
  const tiny = Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
  if (tiny && style.overflow === 'hidden') return true;
  if (style.overflow === 'hidden' && (clip.includes('rect(0') || clipPath.includes('inset(50%'))) return true;
  return false;
};

const collectButtonTextNodes = (root: Node): Text[] => {
  const out: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) out.push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isWrapScanHiddenElement(el)) return;
    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes[i]);
    }
  };
  walk(root);
  return out;
};

export const ensureButtonTextSpans = (button: HTMLButtonElement) => {
  const directNodes = Array.from(button.childNodes);
  directNodes.forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const raw = (node.textContent || '').toString();
    if (!raw.replace(/\s+/g, ' ').trim()) return;
    const span = document.createElement('span');
    span.className = 'ck-button-text';
    span.textContent = raw;
    button.replaceChild(span, node);
  });
};

export const buttonHasWrappedText = (button: HTMLButtonElement): boolean => {
  if (!button.isConnected) return false;
  const style = globalThis.getComputedStyle?.(button);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const textNodes = collectButtonTextNodes(button);
  if (!textNodes.length) return false;

  const range = document.createRange();
  const lines = new Set<number>();
  try {
    textNodes.forEach(node => {
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      rects.forEach(rect => {
        if (rect.width <= 0 || rect.height <= 0) return;
        lines.add(Math.round(rect.top));
      });
    });
  } finally {
    range.detach?.();
  }
  return lines.size > 1;
};
