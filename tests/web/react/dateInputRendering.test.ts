import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DateInput } from '../../../src/web/react/components/form/DateInput';
import { FORM_VIEW_STYLES } from '../../../src/web/react/components/form/styles';

describe('DateInput rendering', () => {
  test('uses the formatted overlay value as an intrinsic sizing reference', () => {
    const html = renderToStaticMarkup(
      React.createElement(DateInput, {
        value: '2026-07-17',
        language: 'EN',
        onChange: jest.fn()
      })
    );

    expect(html).toContain('ck-date-input-control--content-sized');
    expect(html).toContain('<span class="ck-date-overlay-sizer" aria-hidden="true">Fri, 17-Jul-2026</span>');
    expect(html).toContain('<div class="ck-date-overlay" aria-hidden="true">Fri, 17-Jul-2026</div>');
  });

  test('keeps an empty native date input at the available field width', () => {
    const html = renderToStaticMarkup(
      React.createElement(DateInput, {
        value: '',
        language: 'EN',
        onChange: jest.fn()
      })
    );

    expect(html).not.toContain('ck-date-input-control--content-sized');
    expect(html).not.toContain('ck-date-overlay-sizer');
    expect(html).not.toContain('ck-date-overlay');
  });

  test('sizes the native control from the hidden formatted-value twin', () => {
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-date-input-control--content-sized\s*\{[^}]*display: inline-block;[^}]*width: auto;[^}]*max-width: 100%;/s
    );
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-date-input-control--content-sized > input\.ck-date-input\s*\{[^}]*position: absolute;[^}]*width: 100%;[^}]*height: 100%;[^}]*min-height: 0;/s
    );
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-date-input-control > input\.ck-date-input\s*\{[^}]*min-height: 0;[^}]*padding-top: var\(--ck-date-overlay-padding-block\);[^}]*line-height: 1\.2;/s
    );
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-date-overlay-sizer\s*\{[^}]*display: inline-block;[^}]*visibility: hidden;[^}]*max-width: 100%;[^}]*overflow: hidden;[^}]*line-height: 1\.2;[^}]*white-space: nowrap;/s
    );
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-ios-basescale \.ck-date-input-control\s*\{[^}]*--ck-date-overlay-padding-end: 22px;/s
    );
    expect(FORM_VIEW_STYLES).not.toContain(
      '.list-toolbar .ck-list-search-control .ck-date-input-control--content-sized'
    );
    expect(FORM_VIEW_STYLES).toMatch(
      /\.ck-line-item-table \.ck-date-input-wrap\s*\{[^}]*display: flex;[^}]*justify-content: flex-end;/s
    );
  });
});
