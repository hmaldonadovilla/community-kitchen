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
