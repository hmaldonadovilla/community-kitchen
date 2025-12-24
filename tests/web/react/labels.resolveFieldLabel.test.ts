import { resolveFieldLabel } from '../../../src/web/react/utils/labels';

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


