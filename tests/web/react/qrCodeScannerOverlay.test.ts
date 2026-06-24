import { isQrScannerSupported } from '../../../src/web/react/features/uploads/components/QrCodeScannerOverlay';

describe('QR code scanner support', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalFileReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
    Reflect.deleteProperty(globalThis, 'BarcodeDetector');
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
    if (originalFileReader) {
      Object.defineProperty(globalThis, 'FileReader', originalFileReader);
    } else {
      Reflect.deleteProperty(globalThis, 'FileReader');
    }
    if (originalImage) {
      Object.defineProperty(globalThis, 'Image', originalImage);
    } else {
      Reflect.deleteProperty(globalThis, 'Image');
    }
  });

  it('supports QR scanning when camera access is available without native BarcodeDetector', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: jest.fn()
        }
      }
    });

    expect(isQrScannerSupported()).toBe(true);
  });

  it('supports QR scanning when image capture fallback is available without live camera access', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {}
      }
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: jest.fn()
      }
    });
    Object.defineProperty(globalThis, 'FileReader', {
      configurable: true,
      value: jest.fn()
    });
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: jest.fn()
    });

    expect(isQrScannerSupported()).toBe(true);
  });

  it('does not offer QR scanning when camera access is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {}
      }
    });

    expect(isQrScannerSupported()).toBe(false);
  });
});
