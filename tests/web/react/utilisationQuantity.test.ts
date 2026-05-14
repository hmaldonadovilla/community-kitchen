import {
  resolveLocalUtilisationQuantityForVisibility,
  resolveUtilisationQuantityFromValues
} from '../../../src/web/react/features/lineItems/domain/utilisationQuantity';

describe('utilisation quantity helpers', () => {
  test('resolves quantities only when selected or no selected field is configured', () => {
    expect(resolveUtilisationQuantityFromValues({ selected: true, quantity: '3.5' }, 'selected', 'quantity')).toBe(3.5);
    expect(resolveUtilisationQuantityFromValues({ selected: false, quantity: '3.5' }, 'selected', 'quantity')).toBe(0);
    expect(resolveUtilisationQuantityFromValues({ quantity: '2' }, '', 'quantity')).toBe(2);
    expect(resolveUtilisationQuantityFromValues(null, 'selected', 'quantity')).toBe(0);
  });

  test('uses local draft quantity when present', () => {
    expect(
      resolveLocalUtilisationQuantityForVisibility({
        draftValues: { selected: true, quantity: '4' },
        outputValues: { selected: true, quantity: '2' },
        committedValues: { selected: true, quantity: '1' },
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity'
      })
    ).toBe(4);
  });

  test('falls back to committed quantity when selected draft explicitly clears quantity', () => {
    expect(
      resolveLocalUtilisationQuantityForVisibility({
        draftValues: { selected: true, quantity: '' },
        outputValues: { selected: true, quantity: '2' },
        committedValues: { selected: true, quantity: '5' },
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity'
      })
    ).toBe(5);
  });

  test('does not fall back when draft is explicitly unselected', () => {
    expect(
      resolveLocalUtilisationQuantityForVisibility({
        draftValues: { selected: false, quantity: '' },
        outputValues: { selected: true, quantity: '2' },
        committedValues: { selected: true, quantity: '5' },
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity'
      })
    ).toBe(0);
  });
});
