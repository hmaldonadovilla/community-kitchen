import React from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode } from '../../../types';

const normalizeDomIdPart = (value: string): string =>
  value
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Renders neutral section-level instructions that users should read before
 * completing the controls directly below.
 */
export const SectionInstruction: React.FC<{
  className?: string;
  id?: string;
  label?: string;
  language: LangCode;
  text: string;
}> = ({ className, id, label, language, text }) => {
  const bodyText = (text || '').toString().trim();
  if (!bodyText) return null;

  const normalizedId = id ? normalizeDomIdPart(id) : '';
  const labelText = (label || tSystem('common.instruction', language, 'Instruction')).toString().trim();
  const classes = ['ck-section-instruction', className].filter(Boolean).join(' ');

  return (
    <div
      id={normalizedId || undefined}
      className={classes}
      role="note"
      aria-label={labelText}
    >
      <p className="ck-section-instruction__text">{bodyText}</p>
    </div>
  );
};
