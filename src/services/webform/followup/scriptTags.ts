/**
 * Utilities for handling <script> tags inside HTML templates.
 *
 * Security model:
 * - Drive-sourced HTML templates must not contain <script> tags (rejected).
 * - Bundled templates (bundle:...) may include <script> tags for small, reviewed UI behaviors.
 *
 * Even for bundled templates, we must still prevent script injection via user-entered values.
 * The approach:
 * - Extract template-authored <script> blocks into unique markers
 * - Strip any remaining <script> tags after placeholder replacement
 * - Restore the extracted template-authored scripts at the end
 */

export const containsScriptTag = (html: string): boolean => {
  return /<script\b/i.test((html || '').toString());
};

export const stripScriptTags = (html: string): string => {
  return (html || '').toString().replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
};

export type ExtractedScriptBlock = { marker: string; scriptTag: string };

const makeNonce = (): string => {
  try {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  } catch (_) {
    return `${Date.now()}`;
  }
};

export const extractScriptTags = (
  html: string
): {
  html: string;
  extracted: ExtractedScriptBlock[];
} => {
  const input = (html || '').toString();
  if (!input || !input.toLowerCase().includes('<script')) return { html: input, extracted: [] };

  const extracted: ExtractedScriptBlock[] = [];
  const nonce = makeNonce();
  const out = input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, (scriptTag: string) => {
    const idx = extracted.length;
    const marker = `<!--CK_SCRIPT_${nonce}_${idx}-->`;
    extracted.push({ marker, scriptTag });
    return marker;
  });

  return { html: out, extracted };
};

export const restoreScriptTags = (html: string, extracted: ExtractedScriptBlock[]): string => {
  let out = (html || '').toString();
  (extracted || []).forEach(block => {
    if (!block || !block.marker) return;
    out = out.replace(block.marker, block.scriptTag || '');
  });
  return out;
};

