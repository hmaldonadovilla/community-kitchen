import { tSystem } from '../../src/web/systemStrings';

describe('systemStrings', () => {
  test('tSystem resolves localized strings', () => {
    expect(tSystem('actions.submit', 'FR', 'Submit')).toBe('Envoyer');
    expect(tSystem('actions.submit', 'NL', 'Submit')).toBe('Verzenden');
    expect(tSystem('common.instruction', 'NL', 'Instruction')).toBe('Instructie');
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
});
