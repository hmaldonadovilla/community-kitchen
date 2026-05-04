import React from 'react';

import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';

/**
 * Owner: line item form renderer.
 * Small upload failure notice shared by line-item field renderers. It is purely
 * presentational; upload retry behavior stays injected by the parent renderer.
 */
export const LineItemUploadFailureNotice: React.FC<{
  language: LangCode;
  fieldPath: string;
  failure?: { message: string; retrying?: boolean };
  disabled?: boolean;
  onRetry?: (fieldPath: string) => void;
}> = ({ language, fieldPath, failure, disabled, onRetry }) => {
  if (!failure) return null;
  const retryDisabled = Boolean(disabled || failure.retrying || !onRetry);
  return (
    <div className="ck-upload-failure" role="alert">
      <span>{failure.message}</span>
      <button
        type="button"
        className="ck-upload-failure__retry"
        disabled={retryDisabled}
        onClick={() => onRetry?.(fieldPath)}
      >
        {failure.retrying
          ? tSystem('common.loading', language, 'Loading…')
          : tSystem('files.retrySave', language, 'Try saving photos again')}
      </button>
    </div>
  );
};
