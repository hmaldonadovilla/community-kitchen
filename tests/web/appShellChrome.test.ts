import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { AppOrientationBlocker } = require('../../src/web/react/components/app/AppOrientationBlocker.tsx') as {
  AppOrientationBlocker: typeof import('../../src/web/react/components/app/AppOrientationBlocker').AppOrientationBlocker;
};
const { AppRecordLoadingPlaceholder } = require('../../src/web/react/components/app/AppRecordLoadingPlaceholder.tsx') as {
  AppRecordLoadingPlaceholder: typeof import('../../src/web/react/components/app/AppRecordLoadingPlaceholder').AppRecordLoadingPlaceholder;
};

describe('app shell chrome', () => {
  it('renders the orientation blocker dialog', () => {
    const html = renderToStaticMarkup(React.createElement(AppOrientationBlocker, { language: 'EN' }));

    expect(html).toContain('ck-orientation-blocker');
    expect(html).toContain('Rotate your device');
  });

  it('renders record loading feedback with an optional error', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppRecordLoadingPlaceholder, {
        language: 'EN',
        error: 'Could not load record'
      })
    );

    expect(html).toContain('Could not load record');
    expect(html).toContain('Loading record');
  });
});
