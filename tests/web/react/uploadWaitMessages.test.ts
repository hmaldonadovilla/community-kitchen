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
  });

  test('preserves an explicitly blank localized title', () => {
    expect(resolveUploadWaitTitle({ waitMessages: { title: { en: '' } } }, 'EN', 'save')).toBe('');
  });

  test('falls back to generic file copy', () => {
    expect(resolveUploadWaitTitle({}, 'EN', 'save')).toBe('Please wait');
    expect(resolveUploadWaitMessage({}, 'EN', 'save')).toBe('Please wait while we save your file(s)');
    expect(resolveUploadWaitMessage({}, 'EN', 'removeSelected')).toBe('Please wait while we remove selected file(s)');
  });
});
