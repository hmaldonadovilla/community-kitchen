import React from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export const AppRecordLoadingPlaceholder: React.FC<{
  language: LangCode;
  error?: string | null;
}> = ({ language, error }) => (
  <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
    {error ? <div className="error">{error}</div> : null}
    <div className="status">{tSystem('summary.loadingRecord', language, 'Loading record…')}</div>
  </div>
);
