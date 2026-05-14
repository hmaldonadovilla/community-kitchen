import { tSystem, tSystemOptional } from '../../src/web/systemStrings';

describe('systemStrings', () => {
  test('tSystem falls back to English for unsupported languages', () => {
    expect(tSystem('actions.submit', 'FR', 'Submit')).toBe('Submit');
    expect(tSystem('actions.submit', 'NL', 'Submit')).toBe('Submit');
    expect(tSystem('common.instruction', 'NL', 'Instruction')).toBe('Instruction');
  });

  test('tSystem formats templates', () => {
    const rendered = tSystem('draft.saveFailed', 'FR', 'Draft save failed: {message}', { message: 'Boom' });
    expect(rendered).toContain('Boom');
  });

  test('blocking upload fallback copy is generic', () => {
    expect(tSystem('files.waitSave', 'EN', '')).toContain('file');
    expect(tSystem('files.waitRemoveSelected', 'EN', '')).toContain('file');
    expect(tSystem('navigation.waitPhotos', 'EN', '')).toContain('files');
  });

  test('navigation wait messages distinguish app opening from returning home', () => {
    expect(tSystem('navigation.waitForms', 'EN', '')).toBe('Please wait while we open the app. This may take a few seconds.');
    expect(tSystem('navigation.waitHome', 'EN', '')).toBe(
      'Please wait while we open the Community Kitchen Home page. This may take a few seconds.'
    );
  });

  test('optional system strings preserve explicitly blank values', () => {
    expect(tSystemOptional('navigation.waitSavingTitle', 'EN', 'Saving…')).toBe('');
    expect(tSystem('navigation.waitSaving', 'EN', '')).toBe('Do not leave this page while your changes are being saved');
  });
});
