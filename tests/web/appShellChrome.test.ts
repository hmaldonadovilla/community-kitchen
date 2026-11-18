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

  it.each(['portrait-primary', 'portrait-secondary'])(
    'keeps a %s phone usable when the keyboard makes the viewport landscape',
    screenOrientationType => {
      expect(
        resolveMobileViewportState({
          width: 393,
          height: 300,
          userAgent: 'Mozilla/5.0 iPhone',
          orientationLandscape: true,
          screenOrientationType
        })
      ).toEqual({ isMobile: true, isLandscape: false, isCompact: false });
    }
  );

  it.each(['landscape-primary', 'landscape-secondary'])(
    'still detects a phone rotated to %s even when the viewport reports portrait',
    screenOrientationType => {
      expect(
        resolveMobileViewportState({
          width: 393,
          height: 500,
          userAgent: 'Mozilla/5.0 iPhone',
          orientationLandscape: false,
          screenOrientationType
        })
      ).toEqual({ isMobile: true, isLandscape: true, isCompact: true });
    }
  );

  it.each([
    [0, false],
    [180, false],
    [90, true],
    [-90, true]
  ])('uses legacy iOS orientation %s when the Screen Orientation API is unavailable', (legacyOrientationAngle, expected) => {
    expect(
      resolveMobileViewportState({
        width: 393,
        height: 300,
        userAgent: 'Mozilla/5.0 iPhone',
        orientationLandscape: true,
        legacyOrientationAngle: legacyOrientationAngle as number,
        screenWidth: 393,
        screenHeight: 852
      }).isLandscape
    ).toBe(expected);
  });

  it('uses screen dimensions when a mobile embedded browser has no orientation API', () => {
    const viewport = {
      width: 980,
      height: 650,
      userAgent: 'Mozilla/5.0 iPhone',
      orientationLandscape: true
    };

    expect(resolveMobileViewportState({ ...viewport, screenWidth: 393, screenHeight: 852 }).isLandscape).toBe(false);
    expect(resolveMobileViewportState({ ...viewport, screenWidth: 852, screenHeight: 393 }).isLandscape).toBe(true);
  });

  it('continues using the viewport for narrow desktop windows on landscape monitors', () => {
    expect(
      resolveMobileViewportState({
        width: 500,
        height: 800,
        userAgent: 'Mozilla/5.0',
        orientationLandscape: false,
        screenOrientationType: 'landscape-primary',
        screenWidth: 1920,
        screenHeight: 1080
      }).isLandscape
    ).toBe(false);
  });
});
