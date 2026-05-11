import { resolveUploadWaitMessage } from '../../../src/web/react/app/uploadWaitMessages';

describe('resolveUploadWaitMessage', () => {
  test('uses localized upload config wait messages first', () => {
    const uploadConfig = {
      waitMessages: {
        save: {
          en: 'Photos are still being saved. Keep this screen open until all photos show `Added`',
          fr: 'Veuillez patienter pendant l’enregistrement de vos photo(s)'
        },
        removeSelected: {
          en: 'Please wait while we remove selected photo(s)',
          fr: 'Veuillez patienter pendant la suppression des photo(s) sélectionnée(s)'
        }
      }
    };

    expect(resolveUploadWaitMessage(uploadConfig, 'FR', 'save')).toBe(
      'Veuillez patienter pendant l’enregistrement de vos photo(s)'
    );
    expect(resolveUploadWaitMessage(uploadConfig, 'EN', 'removeSelected')).toBe(
      'Please wait while we remove selected photo(s)'
    );
  });

  test('falls back to generic file copy', () => {
    expect(resolveUploadWaitMessage({}, 'EN', 'save')).toBe('Please wait while we save your file(s)');
    expect(resolveUploadWaitMessage({}, 'EN', 'removeSelected')).toBe('Please wait while we remove selected file(s)');
  });
});
