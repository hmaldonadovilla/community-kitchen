import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { QrScannerPendingBlockingOverlay } from '../../../src/web/react/features/uploads/components/FormFileOverlay';

describe('QR scanner pending blocking overlay', () => {
  test('uses the configured scan wait copy while relevant transactions are pending', () => {
    const html = renderToStaticMarkup(
      React.createElement(QrScannerPendingBlockingOverlay, {
        pendingCount: 2,
        language: 'EN',
        uploadConfig: {
          waitMessages: {
            title: { en: '' },
            scan: { en: 'Wait until every receipt scan has finished.' }
          }
        }
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Wait until every receipt scan has finished.');
    expect(html).not.toContain('QR scanning is not available');
  });

  test('renders nothing after the pending transaction count reaches zero', () => {
    const html = renderToStaticMarkup(
      React.createElement(QrScannerPendingBlockingOverlay, {
        pendingCount: 0,
        language: 'EN',
        uploadConfig: {}
      })
    );

    expect(html).toBe('');
  });
});
