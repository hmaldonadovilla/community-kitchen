import { __test__ } from '../../../src/web/react/app/runSelectionEffectsForAncestors';

describe('runSelectionEffectsForAncestors value comparison', () => {
  test('treats numeric strings and numbers as equal', () => {
    expect(__test__.areFieldValuesEqual(449 as any, '449' as any)).toBe(true);
    expect(__test__.areFieldValuesEqual('449.0' as any, 449 as any)).toBe(true);
    expect(__test__.areFieldValuesEqual('-3' as any, -3 as any)).toBe(true);
  });

  test('does not treat different numeric values as equal', () => {
    expect(__test__.areFieldValuesEqual(449 as any, '450' as any)).toBe(false);
  });

  test('does not coerce non-numeric strings', () => {
    expect(__test__.areFieldValuesEqual('449 portions' as any, 449 as any)).toBe(false);
  });
});
