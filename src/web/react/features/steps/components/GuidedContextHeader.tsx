import React, { useMemo } from 'react';

import type { FieldValue, LangCode, OptionSet, WebQuestionDefinition } from '../../../../types';
import {
  type GuidedContextHeaderPart,
  resolveGuidedContextHeaderValue
} from '../domain/guidedContextHeader';

/**
 * Owner: guided steps UI.
 * Renders the configured context header for the active guided step. It reads
 * already-owned form values through injected props; it does not mutate state.
 */
export const GuidedContextHeader: React.FC<{
  language: LangCode;
  parts: GuidedContextHeaderPart[];
  separator: string;
  values: Record<string, FieldValue>;
  questionById: Map<string, WebQuestionDefinition>;
  resolveOptionSet: (question: WebQuestionDefinition) => OptionSet;
}> = ({ language, parts, separator, values, questionById, resolveOptionSet }) => {
  const displayParts = useMemo(
    () =>
      parts
        .map(part => {
          const question = questionById.get(part.id) || null;
          return {
            part,
            value: resolveGuidedContextHeaderValue({
              part,
              question,
              raw: values[part.id],
              values,
              language,
              optionSet: question ? resolveOptionSet(question) : undefined
            })
          };
        })
        .filter(entry => !!entry.value),
    [language, parts, questionById, resolveOptionSet, values]
  );

  if (!displayParts.length) return null;

  return (
    <div role="note" className="ck-guided-context-header">
      {displayParts.map((entry, idx) => (
        <React.Fragment key={`ctx:${entry.part.id}:${entry.part.displayField || ''}:${idx}`}>
          {idx > 0 ? separator : ''}
          {entry.value}
        </React.Fragment>
      ))}
    </div>
  );
};
