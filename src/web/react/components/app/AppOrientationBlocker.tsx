import React from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export const AppOrientationBlocker: React.FC<{
  language: LangCode;
}> = ({ language }) => (
  <div
    className="ck-orientation-blocker"
    role="dialog"
    aria-modal="true"
    aria-label={tSystem('app.rotatePortraitTitle', language, 'Rotate your device')}
  >
    <div className="ck-orientation-blocker__card">
      <div className="ck-orientation-blocker__title">
        {tSystem('app.rotatePortraitTitle', language, 'Rotate your device')}
      </div>
      <div className="ck-orientation-blocker__body">
        {tSystem('app.rotatePortraitBody', language, 'This form works best in portrait mode. Please rotate back.')}
      </div>
    </div>
  </div>
);
