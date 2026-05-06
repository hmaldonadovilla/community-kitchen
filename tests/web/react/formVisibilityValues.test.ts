import {
  resolveTopValueFromSources,
  resolveVisibilityValueFromSources
} from '../../../src/web/react/components/form/formVisibilityValues';

describe('form visibility value helpers', () => {
  const resolveNoDataSourceCount = () => undefined;

  test('resolves top values from datasource counts before direct values', () => {
    expect(
      resolveTopValueFromSources({
        fieldId: 'COUNT',
        sourceValues: { COUNT: 3 },
        resolveDataSourceCountValue: fieldId => (fieldId === 'COUNT' ? 7 : undefined),
        recordMeta: null
      })
    ).toBe(7);
  });

  test('ignores empty top values and scans line item values for visibility', () => {
    expect(
      resolveVisibilityValueFromSources({
        fieldId: 'MEAL',
        sourceValues: { MEAL: '' },
        resolveDataSourceCountValue: resolveNoDataSourceCount,
        recordMeta: null,
        lineItems: {
          rows: [
            { id: 'row-1', values: { OTHER: 'ignored' } },
            { id: 'row-2', values: { MEAL: 'Adassi' } }
          ]
        }
      })
    ).toBe('Adassi');
  });

  test('top value lookup does not scan line item values', () => {
    expect(
      resolveTopValueFromSources({
        fieldId: 'MEAL',
        sourceValues: { MEAL: '' },
        resolveDataSourceCountValue: resolveNoDataSourceCount,
        recordMeta: null
      })
    ).toBeUndefined();
  });
});
