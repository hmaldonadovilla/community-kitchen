import { resolveDedupDialogCopy } from '../../../src/web/react/app/dedupDialog';

describe('dedupDialog copy', () => {
  it('returns defaults when config is missing', () => {
    const copy = resolveDedupDialogCopy(undefined, 'EN');
    expect(copy.title).toBe('Creating duplicate record for the same customer, service and date is not allowed.');
    expect(copy.intro).toBe('A meal production record already exists for:');
    expect(copy.outro).toBe('What do you want to do?');
    expect(copy.confirmLabel).toBe('Open existing record');
    expect(copy.cancelLabel).toBe('Change customer, service or date');
  });

  it('uses localized overrides when provided', () => {
    const copy = resolveDedupDialogCopy(
      {
        title: { en: 'No duplicates', fr: 'Pas de doublons' },
        intro: { en: 'Record already exists', fr: 'Enregistrement existe deja' },
        outro: { en: 'Next step?', fr: 'Et ensuite?' },
        changeLabel: { en: 'Change details', fr: 'Modifier' },
        openLabel: { en: 'Open existing', fr: 'Ouvrir existant' }
      },
      'FR'
    );

    expect(copy).toEqual({
      title: 'Pas de doublons',
      intro: 'Enregistrement existe deja',
      outro: 'Et ensuite?',
      confirmLabel: 'Ouvrir existant',
      cancelLabel: 'Modifier'
    });
  });
});
