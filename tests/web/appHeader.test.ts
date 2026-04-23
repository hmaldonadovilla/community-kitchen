import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { AppHeader } = require('../../src/web/react/components/app/AppHeader.tsx') as {
  AppHeader: typeof import('../../src/web/react/components/app/AppHeader').AppHeader;
};

const baseProps = {
  title: 'Meal Production',
  buildMarker: 'build-1',
  isMobile: false,
  languages: ['EN'],
  language: 'EN' as const,
  onLanguageChange: () => undefined,
  onRefresh: () => undefined,
  onBack: () => undefined,
  backLabel: '← Apps'
};

describe('AppHeader', () => {
  test('renders the Apps back button only for the home layout', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeader, {
        ...baseProps,
        layout: 'home',
        drawerEnabled: true,
        titleRight: React.createElement('span', null, 'Saved')
      })
    );

    expect(html).toContain('data-layout="home"');
    expect(html).toContain('ck-app-back-btn');
    expect(html).toContain('← Apps');
    expect(html).not.toContain('ck-app-avatar-btn');
  });

  test('renders the logo button and no Apps back button for detail layouts', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeader, {
        ...baseProps,
        layout: 'detail',
        drawerEnabled: true,
        logoUrl: 'https://img.test/community-kitchen.png',
        titleRight: React.createElement('span', null, 'Saved')
      })
    );

    expect(html).toContain('data-layout="detail"');
    expect(html).toContain('ck-app-avatar-btn');
    expect(html).toContain('src="https://img.test/community-kitchen.png"');
    expect(html).not.toContain('ck-app-back-btn');
    expect(html).toContain('Meal Production');
  });

  test('renders a static fallback avatar for detail layouts when the drawer is disabled', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeader, {
        ...baseProps,
        layout: 'detail',
        drawerEnabled: false,
        titleRight: React.createElement('span', null, 'Saved')
      })
    );

    expect(html).toContain('data-layout="detail"');
    expect(html).toContain('ck-app-avatar');
    expect(html).toContain('MP');
    expect(html).not.toContain('ck-app-avatar-btn');
    expect(html).not.toContain('ck-app-back-btn');
  });
});
