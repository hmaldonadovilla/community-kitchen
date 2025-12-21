import '../mocks/GoogleAppsScript';
import { FollowupService } from '../../src/services/webform/followup';

const makeService = () =>
  new FollowupService({} as any, {} as any, {
    lookupDataSourceDetails: jest.fn(),
    fetchDataSource: jest.fn()
  } as any);

describe('FollowupService table directives', () => {
  it('extracts GROUP_TABLE directives from table text', () => {
    const service = makeService() as any;
    const table = { getText: () => '{{GROUP_TABLE(MP_MEALS_REQUEST.MEAL_TYPE)}}' };
    expect(service.extractTableRepeatDirective(table)).toEqual({
      kind: 'GROUP_TABLE',
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'MEAL_TYPE'
    });
  });

  it('extracts ROW_TABLE directives from table text', () => {
    const service = makeService() as any;
    const table = { getText: () => '{{ROW_TABLE(MP_MEALS_REQUEST.MEAL_TYPE)}}' };
    expect(service.extractTableRepeatDirective(table)).toEqual({
      kind: 'ROW_TABLE',
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'MEAL_TYPE'
    });
  });

  it('replaces GROUP_TABLE directive using an escaped regex (so the token does not leak into output)', () => {
    const service = makeService() as any;
    const cell = { replaceText: jest.fn() };
    const row = { getNumCells: () => 1, getCell: () => cell };
    const table = { getNumRows: () => 1, getRow: () => row };

    service.replaceTableRepeatDirectivePlaceholders(
      table,
      { groupId: 'MP_MEALS_REQUEST', fieldId: 'MEAL_TYPE' },
      'Dinner',
      'GROUP_TABLE'
    );

    expect(cell.replaceText).toHaveBeenCalledWith(
      '(?i){{GROUP_TABLE\\(MP_MEALS_REQUEST\\.MEAL_TYPE\\)}}',
      'Dinner'
    );
  });
});


