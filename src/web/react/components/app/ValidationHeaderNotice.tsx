import React, { useMemo } from 'react';
import type { LangCode } from '../../../types';
import type { FormErrors } from '../../types';
import { tSystem } from '../../../systemStrings';

export const ValidationHeaderNotice: React.FC<{
  language: LangCode;
  errors: FormErrors;
  warnings: Array<{ message: string; fieldPath: string }>;
  hideErrorBanner?: boolean;
  errorMessageOverride?: string;
  onDismiss: () => void;
  onNavigateToField: (fieldPath: string) => void;
}> = ({ language, errors, warnings, hideErrorBanner, errorMessageOverride, onDismiss, onNavigateToField }) => {
  const errorKeys = useMemo(() => Object.keys(errors || {}), [errors]);
  const errorCount = hideErrorBanner ? 0 : errorKeys.length;
  const warningCount = Array.isArray(warnings) ? warnings.length : 0;

  if (!errorCount && !warningCount) return null;

  const firstErrorKey = errorCount ? errorKeys[0] : null;
  const hideLabel = tSystem('common.hide', language, 'Hide');
  const errorMessage =
    (errorMessageOverride || '').toString().trim() ||
    tSystem('validation.fixErrors', language, 'You are almost done. Some required checks are missing. Review the highlighted sections.');

  return (
    <div className="ck-validation-notice">
      {errorCount ? (
        <div className="ck-validation-banner ck-validation-banner--error" role="alert">
          <button
            type="button"
            className="ck-validation-banner__link"
            onClick={() => {
              if (!firstErrorKey) return;
              onNavigateToField(firstErrorKey);
            }}
          >
            {errorMessage}
          </button>
          <button type="button" className="ck-validation-banner__hide" onClick={onDismiss}>
            {hideLabel}
          </button>
        </div>
      ) : null}

      {warningCount ? (
        <div className="ck-validation-banner ck-validation-banner--warning" role="status">
          <div className="ck-validation-banner__titleRow">
            <div className="ck-validation-banner__title">
              {tSystem('validation.warningsTitle', language, 'Warnings')}
              {warningCount ? ` (${warningCount})` : ''}
            </div>
            {!errorCount ? (
              <button type="button" className="ck-validation-banner__hide" onClick={onDismiss}>
                {hideLabel}
              </button>
            ) : null}
          </div>
          <div className="ck-validation-banner__list">
            {(warnings || []).slice(0, 3).map((w, idx) => (
              <button
                key={`${idx}-${w.fieldPath}-${w.message}`}
                type="button"
                className="ck-validation-banner__warning"
                onClick={() => onNavigateToField(w.fieldPath)}
              >
                {w.message}
              </button>
            ))}
            {warningCount > 3 ? (
              <div className="ck-validation-banner__more">
                {tSystem('common.more', language, '+{count} more', { count: warningCount - 3 })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

