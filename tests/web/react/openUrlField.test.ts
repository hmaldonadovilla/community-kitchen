import {
  openUrlInNewContext,
  resolveOpenUrlFieldPresentation,
  shouldUseInAppPdfPreview
} from '../../../src/web/react/app/openUrlField';

describe('openUrlField helpers', () => {
  it('does not redirect the current page when a new context is blocked', () => {
    const assignLocation = jest.fn();

    const result = openUrlInNewContext({
      href: 'https://drive.google.com/file/d/file-id/view',
      openWindow: jest.fn(() => null),
      assignLocation,
      allowCurrentWindowNavigation: false
    });

    expect(result).toEqual({ opened: false, method: 'blocked' });
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it('uses the current page fallback only when explicitly allowed', () => {
    const assignLocation = jest.fn();

    const result = openUrlInNewContext({
      href: 'https://drive.google.com/file/d/file-id/view',
      openWindow: jest.fn(() => null),
      assignLocation,
      allowCurrentWindowNavigation: true
    });

    expect(result).toEqual({ opened: true, method: 'currentWindow' });
    expect(assignLocation).toHaveBeenCalledWith('https://drive.google.com/file/d/file-id/view');
  });

  it('selects the in-app PDF preview for iOS standalone PWA saved reports', () => {
    const useInApp = shouldUseInAppPdfPreview({
      action: 'openUrlField',
      fieldId: 'pdfUrl',
      href: 'https://drive.google.com/file/d/file-id/view',
      env: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        navigatorStandalone: true,
        displayModeStandalone: false
      }
    });

    expect(useInApp).toBe(true);
  });

  it('keeps normal iOS Safari as an external link', () => {
    const presentation = resolveOpenUrlFieldPresentation({
      action: 'openUrlField',
      fieldId: 'pdfUrl',
      href: 'https://drive.google.com/file/d/file-id/view',
      env: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        navigatorStandalone: false,
        displayModeStandalone: false
      }
    });

    expect(presentation).toEqual({
      href: 'https://drive.google.com/file/d/file-id/view',
      mode: 'externalLink'
    });
  });

  it('limits the PWA in-app route to the saved pdfUrl report field', () => {
    const presentation = resolveOpenUrlFieldPresentation({
      action: 'openUrlField',
      fieldId: 'otherUrl',
      href: 'https://example.com/document.pdf',
      env: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        navigatorStandalone: true,
        displayModeStandalone: true
      }
    });

    expect(presentation?.mode).toBe('externalLink');
  });
});
