import { resolveFieldLabel, resolveLabel } from '../../../src/web/react/utils/labels';

describe('resolveFieldLabel', () => {
  test('resolves line-item field labels from labelEn/labelFr/labelNl', () => {
    const field = { labelEn: 'Name', labelFr: 'Nom', labelNl: 'Naam' };
    expect(resolveFieldLabel(field, 'EN', 'fallback')).toBe('Name');
    expect(resolveFieldLabel(field, 'FR', 'fallback')).toBe('Nom');
    expect(resolveFieldLabel(field, 'NL', 'fallback')).toBe('Naam');
  });

  test('resolves question labels from label object', () => {
    const question = { label: { en: 'Amount', fr: 'Montant', nl: 'Bedrag' } };
    expect(resolveFieldLabel(question, 'FR', 'fallback')).toBe('Montant');
    expect(resolveFieldLabel(question, 'NL', 'fallback')).toBe('Bedrag');
  });
});

describe('resolveLabel', () => {
  test('falls back to a humanized label when no localized label exists', () => {
    const question = { id: 'MP_UNLOCK_FOR_EDIT' } as any;
    expect(resolveLabel(question, 'EN')).toBe('Unlock for edit');
  });
});

