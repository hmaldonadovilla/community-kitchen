import { buildValidationErrorIndex } from '../../../src/web/react/features/validation/domain/errorIndex';

describe('validation error index domain', () => {
  test('indexes top-level line row errors by group and row id', () => {
    const index = buildValidationErrorIndex({
      MEALS__QTY__row1: 'Required',
      CUSTOMER: 'Required'
    });

    expect(index.rowErrors.has('MEALS::row1')).toBe(true);
    expect(index.subgroupErrors.size).toBe(0);
  });

  test('indexes subgroup errors by subgroup key and parent row key', () => {
    const index = buildValidationErrorIndex({
      'MEALS::row1::DETAILS__NOTE__detail1': 'Required'
    });

    expect(index.subgroupErrors.has('MEALS::row1::DETAILS')).toBe(true);
    expect(index.rowErrors.has('MEALS::row1')).toBe(true);
  });
});
