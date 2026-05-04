import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { AppHeaderStatus } = require('../../src/web/react/components/app/AppHeaderStatus.tsx') as {
  AppHeaderStatus: typeof import('../../src/web/react/components/app/AppHeaderStatus').AppHeaderStatus;
};

describe('AppHeaderStatus', () => {
  const baseProps = {
    language: 'EN' as const,
    view: 'form',
    autoSaveEnabled: true,
    draftSavePhase: 'idle' as const,
    draftSaveMessage: undefined,
    isClosedRecord: false
  };

  it('renders environment and autosave status when present', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeaderStatus, {
        ...baseProps,
        envTag: 'staging',
        draftSavePhase: 'saving'
      })
    );

    expect(html).toContain('ck-env-tag');
    expect(html).toContain('Environment: staging');
    expect(html).toContain('Saving');
    expect(html).toContain('data-tone="saving"');
  });

  it('renders closed read-only status even when autosave is idle', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeaderStatus, {
        ...baseProps,
        isClosedRecord: true
      })
    );

    expect(html).toContain('Closed (read-only)');
    expect(html).toContain('data-tone="paused"');
  });

  it('renders no markup when there is no header status', () => {
    const html = renderToStaticMarkup(React.createElement(AppHeaderStatus, baseProps));

    expect(html).toBe('');
  });
});
