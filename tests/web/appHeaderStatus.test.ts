import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { AppHeaderStatus, shouldRenderAppHeaderSaveNotice } = require('../../src/web/react/components/app/AppHeaderStatus.tsx') as {
  AppHeaderStatus: typeof import('../../src/web/react/components/app/AppHeaderStatus').AppHeaderStatus;
  shouldRenderAppHeaderSaveNotice: typeof import('../../src/web/react/components/app/AppHeaderStatus').shouldRenderAppHeaderSaveNotice;
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
    expect(html).toContain('ck-app-save-status');
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
    expect(html).toContain('ck-app-record-status');
    expect(html).not.toContain('ck-app-save-status');
    expect(html).toContain('data-tone="paused"');
  });

  it('marks only active autosave phases as header save notices', () => {
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'form',
        autoSaveEnabled: true,
        draftSavePhase: 'saving',
        isClosedRecord: false
      })
    ).toBe(true);
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'list',
        autoSaveEnabled: true,
        draftSavePhase: 'saving',
        isClosedRecord: false
      })
    ).toBe(true);
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'form',
        autoSaveEnabled: true,
        draftSavePhase: 'dirty',
        isClosedRecord: false
      })
    ).toBe(false);
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'form',
        autoSaveEnabled: true,
        draftSavePhase: 'idle',
        isClosedRecord: false
      })
    ).toBe(false);
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'form',
        autoSaveEnabled: true,
        draftSavePhase: 'saving',
        isClosedRecord: true
      })
    ).toBe(false);
    expect(
      shouldRenderAppHeaderSaveNotice({
        view: 'form',
        autoSaveEnabled: true,
        draftSavePhase: 'saving',
        isClosedRecord: false,
        hideAutoSaveNotices: true
      })
    ).toBe(false);
  });

  it('keeps the environment tag visible when autosave notices are hidden', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppHeaderStatus, {
        ...baseProps,
        envTag: 'staging',
        draftSavePhase: 'saving',
        hideAutoSaveNotices: true
      })
    );

    expect(html).toContain('ck-env-tag');
    expect(html).toContain('Environment: staging');
    expect(html).not.toContain('ck-app-save-status');
    expect(html).not.toContain('Saving');
  });

  it('renders no markup when there is no header status', () => {
    const html = renderToStaticMarkup(React.createElement(AppHeaderStatus, baseProps));

    expect(html).toBe('');
  });
});
