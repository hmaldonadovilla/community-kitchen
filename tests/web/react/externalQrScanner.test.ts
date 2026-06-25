import { resolveExternalQrScannerLaunch } from '../../../src/web/react/features/uploads/domain/externalQrScanner';

describe('external QR scanner launch', () => {
  it('builds a Firebase-hosted scanner URL with request and return origin', () => {
    expect(
      resolveExternalQrScannerLaunch({
        assetBaseUrl: 'https://community-kitchen-staging-assets.web.app/',
        requestId: 'scan-123',
        targetOrigin: 'https://script.googleusercontent.com'
      })
    ).toEqual({
      url: 'https://community-kitchen-staging-assets.web.app/qr-scanner.html?requestId=scan-123&targetOrigin=https%3A%2F%2Fscript.googleusercontent.com&closeOnResult=0',
      origin: 'https://community-kitchen-staging-assets.web.app'
    });
  });

  it('rejects missing ids and non-HTTPS asset hosts', () => {
    expect(resolveExternalQrScannerLaunch({ assetBaseUrl: 'http://localhost:5000', requestId: 'scan-123' })).toBeNull();
    expect(resolveExternalQrScannerLaunch({ assetBaseUrl: 'https://assets.example.test', requestId: '' })).toBeNull();
  });

  it('includes a localized scanner success message when provided', () => {
    expect(
      resolveExternalQrScannerLaunch({
        assetBaseUrl: 'https://community-kitchen-staging-assets.web.app/',
        requestId: 'scan-123',
        targetOrigin: 'https://script.googleusercontent.com',
        successMessage: 'Ingredient receipt added'
      })?.url
    ).toBe(
      'https://community-kitchen-staging-assets.web.app/qr-scanner.html?requestId=scan-123&targetOrigin=https%3A%2F%2Fscript.googleusercontent.com&closeOnResult=0&successMessage=Ingredient+receipt+added'
    );
  });
});
