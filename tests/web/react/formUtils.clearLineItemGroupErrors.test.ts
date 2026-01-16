import { clearLineItemGroupErrors } from '../../../src/web/react/components/form/utils';

describe('clearLineItemGroupErrors', () => {
  it('removes group, line, and subgroup errors while keeping other fields', () => {
    const errors = {
      GROUP: 'group error',
      'GROUP__A__row1': 'line error',
      'GROUP::row1::SUB__B__sub1': 'sub error',
      OTHER: 'keep'
    };

    expect(clearLineItemGroupErrors(errors, 'GROUP')).toEqual({ OTHER: 'keep' });
  });
});
