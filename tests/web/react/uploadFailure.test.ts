import {
  clearUploadFailure,
  createUploadFailureState,
  resolveUploadFailureUserMessage,
  setUploadFailureRetrying
} from '../../../src/web/react/app/uploadFailure';

describe('uploadFailure', () => {
  const target = { scope: 'top' as const, fieldPath: 'PHOTO', questionId: 'PHOTO' };

  it('uses the user-facing fallback while retaining the raw failure for diagnostics', () => {
    const message = resolveUploadFailureUserMessage({
      fallback: 'The photos were not saved. Check the connection and try again.',
      rawMessage: 'Exception: Service timed out'
    });

    const failure = createUploadFailureState({
      target,
      message,
      rawMessage: 'Exception: Service timed out'
    });

    expect(failure).toMatchObject({
      message: 'The photos were not saved. Check the connection and try again.',
      rawMessage: 'Exception: Service timed out',
      retrying: false,
      target
    });
  });

  it('resolves receipt link validation failures through system string fallbacks', () => {
    expect(
      resolveUploadFailureUserMessage({
        fallback: 'The photos were not saved. Check the connection and try again.',
        rawMessage:
          'CK_UPLOAD_LINK_VALIDATION:outOfScope: Receipt evidence link must point to a file in the configured customer Drive.',
        language: 'EN'
      })
    ).toBe('Receipt evidence link must point to a file in the configured customer Drive.');
  });

  it('uses configured receipt link validation messages when present', () => {
    expect(
      resolveUploadFailureUserMessage({
        fallback: 'The photos were not saved. Check the connection and try again.',
        rawMessage: 'CK_UPLOAD_LINK_VALIDATION:notDriveFile: Receipt evidence links must be Google Drive file links.',
        language: 'EN',
        uploadConfig: {
          linkCapture: {
            validation: {
              messages: {
                notDriveFile: {
                  en: 'Scan a Google Drive receipt QR code.'
                }
              }
            }
          }
        }
      })
    ).toBe('Scan a Google Drive receipt QR code.');
  });

  it('maps legacy receipt link validation failures to the same system fallbacks', () => {
    expect(
      resolveUploadFailureUserMessage({
        fallback: 'The photos were not saved. Check the connection and try again.',
        rawMessage: 'Receipt evidence links must be Google Drive file links.',
        language: 'EN'
      })
    ).toBe('Receipt evidence links must be Google Drive file links.');
  });

  it('marks retry state and clears the field failure after success', () => {
    const failures = {
      PHOTO: createUploadFailureState({ target, message: 'The photos were not saved.' })
    };

    const retrying = setUploadFailureRetrying(failures, 'PHOTO', true);
    expect(retrying.PHOTO.retrying).toBe(true);

    const cleared = clearUploadFailure(retrying, 'PHOTO');
    expect(cleared.PHOTO).toBeUndefined();
  });
});
