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

  it('can preserve selected line errors while clearing the group', () => {
    const errors = {
      GROUP: 'group error',
      'GROUP__A__row1': 'keep this message',
      'GROUP__B__row1': 'line error',
      OTHER: 'keep'
    };

    expect(
      clearLineItemGroupErrors(errors, 'GROUP', {
        preserve: (_key, value) => value === 'keep this message'
      })
    ).toEqual({
      'GROUP__A__row1': 'keep this message',
      OTHER: 'keep'
    });
  });
});
