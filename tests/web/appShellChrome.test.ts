import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { AppOrientationBlocker } = require('../../src/web/react/components/app/AppOrientationBlocker.tsx') as {
  AppOrientationBlocker: typeof import('../../src/web/react/components/app/AppOrientationBlocker').AppOrientationBlocker;
};
const { AppRecordLoadingPlaceholder } = require('../../src/web/react/components/app/AppRecordLoadingPlaceholder.tsx') as {
  AppRecordLoadingPlaceholder: typeof import('../../src/web/react/components/app/AppRecordLoadingPlaceholder').AppRecordLoadingPlaceholder;
};
const { resolveMobileViewportState } = require('../../src/web/react/components/app/useAppViewportState.ts') as {
  resolveMobileViewportState: typeof import('../../src/web/react/components/app/useAppViewportState').resolveMobileViewportState;
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

  it('derives mobile, landscape, and compact viewport state', () => {
    expect(
      resolveMobileViewportState({
        width: 1024,
        height: 700,
        userAgent: 'Mozilla/5.0',
        orientationLandscape: false
      })
    ).toEqual({ isMobile: false, isLandscape: false, isCompact: false });

    expect(
      resolveMobileViewportState({
        width: 844,
        height: 390,
        userAgent: 'Mozilla/5.0',
        orientationLandscape: true
      })
    ).toEqual({ isMobile: true, isLandscape: true, isCompact: true });

    expect(
      resolveMobileViewportState({
        width: 1200,
        height: 800,
        userAgent: 'Mozilla/5.0 iPhone'
      })
    ).toEqual({ isMobile: true, isLandscape: true, isCompact: false });
  });
});
