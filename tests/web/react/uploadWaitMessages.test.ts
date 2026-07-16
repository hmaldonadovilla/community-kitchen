import { resolveUploadWaitMessage, resolveUploadWaitTitle } from '../../../src/web/react/app/uploadWaitMessages';

describe('resolveUploadWaitMessage', () => {
  test('uses localized upload config wait messages first', () => {
    const uploadConfig = {
      waitMessages: {
        title: {
          en: 'Uploading'
        },
        save: {
          en: 'Photos are still being saved. Keep this screen open until all photos show `Added`'
        },
        removeSelected: {
          en: 'Please wait while we remove selected photo(s)'
        },
        scanTitle: {
          en: 'Checking receipts'
        },
        scan: {
          en: 'Wait until all receipt scans have finished processing'
        }
      }
    };

    expect(resolveUploadWaitTitle(uploadConfig, 'EN', 'save')).toBe('Uploading');
    expect(resolveUploadWaitMessage(uploadConfig, 'EN', 'save')).toBe(
      'Photos are still being saved. Keep this screen open until all photos show `Added`'
    );
    expect(resolveUploadWaitMessage(uploadConfig, 'EN', 'removeSelected')).toBe(
      'Please wait while we remove selected photo(s)'
    );
    expect(resolveUploadWaitTitle(uploadConfig, 'EN', 'scan')).toBe('Checking receipts');
    expect(resolveUploadWaitMessage(uploadConfig, 'EN', 'scan')).toBe(
      'Wait until all receipt scans have finished processing'
    );
  });

  test('preserves an explicitly blank localized title', () => {
    expect(resolveUploadWaitTitle({ waitMessages: { title: { en: '' } } }, 'EN', 'save')).toBe('');
  });

  test('falls back to generic file copy without a title', () => {
    expect(resolveUploadWaitTitle({}, 'EN', 'save')).toBe('');
    expect(resolveUploadWaitMessage({}, 'EN', 'save')).toBe('Please wait while we save your file(s)');
    expect(resolveUploadWaitMessage({}, 'EN', 'removeSelected')).toBe('Please wait while we remove selected file(s)');
    expect(resolveUploadWaitMessage({}, 'EN', 'scan')).toBe('Please wait until all scans have finished processing.');
  });
});
