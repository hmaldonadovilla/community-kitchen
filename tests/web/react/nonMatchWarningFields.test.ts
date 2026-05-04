import {
  resolveNonMatchWarningFieldIds,
  whenContainsFieldId
} from '../../../src/web/react/app/nonMatchWarningFields';
import { ROW_NON_MATCH_OPTIONS_KEY } from '../../../src/web/react/app/lineItems';

describe('nonMatchWarningFields', () => {
  it('finds target field ids in nested when clauses', () => {
    expect(
      whenContainsFieldId(
        {
          all: [
            { fieldId: 'OTHER' },
            {
              any: [{ fieldId: ROW_NON_MATCH_OPTIONS_KEY }]
            }
          ]
        },
        ROW_NON_MATCH_OPTIONS_KEY
      )
    ).toBe(true);

    expect(whenContainsFieldId({ not: { fieldId: 'OTHER' } }, ROW_NON_MATCH_OPTIONS_KEY)).toBe(false);
  });

  it('resolves fields whose warning validation depends on non-match metadata', () => {
    const fields = [
      {
        id: 'WARNING_TEXT',
        validationRules: [{ level: 'warning', when: { fieldId: ROW_NON_MATCH_OPTIONS_KEY } }]
      },
      {
        id: 'WARN_ALIAS',
        validationRules: [{ level: 'warn', when: [{ fieldId: ROW_NON_MATCH_OPTIONS_KEY }] }]
      },
      {
        id: 'ERROR_FIELD',
        validationRules: [{ level: 'error', when: { fieldId: ROW_NON_MATCH_OPTIONS_KEY } }]
      },
      {
        id: 'NO_RULE',
        validationRules: []
      }
    ];

    expect(resolveNonMatchWarningFieldIds(fields)).toEqual(['WARNING_TEXT', 'WARN_ALIAS']);
  });

  it('treats missing validation level as warning-compatible', () => {
    expect(
      resolveNonMatchWarningFieldIds([
        {
          id: 'IMPLICIT_WARNING',
          validationRules: [{ when: { fieldId: ROW_NON_MATCH_OPTIONS_KEY } }]
        }
      ])
    ).toEqual(['IMPLICIT_WARNING']);
  });
});
