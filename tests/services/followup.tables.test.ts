import '../mocks/GoogleAppsScript';
import { FollowupService } from '../../src/services/webform/followup';
import { QuestionConfig } from '../../src/types';

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

  it('formats DATE fields as EEE, dd-MMM-yyyy', () => {
    const service = makeService() as any;
    expect(service.formatTemplateValue('2025-12-21', 'DATE')).toBe('Sun, 21-Dec-2025');
    // Non-DATE fields should keep the raw ISO date string.
    expect(service.formatTemplateValue('2025-12-21')).toBe('2025-12-21');
  });

  it('extracts ORDER_BY directives from table text', () => {
    const service = makeService() as any;
    const table = { getText: () => '{{ORDER_BY(CAT ASC, ING:DESC, -QTY)}}' };
    expect(service.extractOrderByDirective(table)).toEqual({
      keys: [
        { key: 'CAT', direction: 'asc' },
        { key: 'ING', direction: 'desc' },
        { key: 'QTY', direction: 'desc' }
      ]
    });
  });

  it('applies ORDER_BY sorting for consolidated subgroup tables (multi-key priority)', () => {
    const service = makeService() as any;
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      qFr: 'Repas',
      qNl: 'Maaltijden',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [
          { id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', labelFr: 'Type', labelNl: 'Type', required: false }
        ],
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'CAT', type: 'TEXT', labelEn: 'Category', labelFr: 'Cat', labelNl: 'Cat', required: false },
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', labelFr: 'Ing', labelNl: 'Ing', required: false },
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', labelFr: 'Qté', labelNl: 'Qty', required: false }
            ]
          }
        ]
      }
    } as any;

    const subConfig = (group as any).lineItemConfig.subGroups[0];
    const rows = [
      { CAT: 'B', ING: 'Z', QTY: 2 },
      { CAT: 'A', ING: 'B', QTY: 10 },
      { CAT: 'A', ING: 'A', QTY: 1 },
      { CAT: 'A', ING: 'B', QTY: 3 }
    ];

    const orderBy = { keys: [{ key: 'CAT', direction: 'asc' }, { key: 'ING', direction: 'asc' }, { key: 'QTY', direction: 'desc' }] };
    const sorted = service.applyOrderBy(rows, orderBy, group, { subConfig, subToken: 'MP_INGREDIENTS_LI' });
    expect(sorted.map((r: any) => `${r.CAT}-${r.ING}-${r.QTY}`)).toEqual(['A-A-1', 'A-B-10', 'A-B-3', 'B-Z-2']);
  });

  it('aggregates NUMBER fields when CONSOLIDATED_TABLE rows share the same non-numeric values', () => {
    const service = makeService() as any;
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      qFr: 'Repas',
      qNl: 'Maaltijden',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [],
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'CAT', type: 'TEXT', labelEn: 'Category', labelFr: 'Cat', labelNl: 'Cat', required: false },
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', labelFr: 'Ing', labelNl: 'Ing', required: false },
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', labelFr: 'Qté', labelNl: 'Qty', required: false }
            ]
          }
        ]
      }
    } as any;
    const subConfig = (group as any).lineItemConfig.subGroups[0];

    const placeholders = [
      { groupId: 'MP_MEALS_REQUEST', subGroupId: 'MP_INGREDIENTS_LI', fieldId: 'CAT' },
      { groupId: 'MP_MEALS_REQUEST', subGroupId: 'MP_INGREDIENTS_LI', fieldId: 'ING' },
      { groupId: 'MP_MEALS_REQUEST', subGroupId: 'MP_INGREDIENTS_LI', fieldId: 'QTY' }
    ];

    const rows = [
      { CAT: 'Fresh', ING: 'Onions', QTY: 1.111 },
      { CAT: 'Fresh', ING: 'Onions', QTY: 2.222 },
      { CAT: 'Fresh', ING: 'Pumpkin', QTY: 3 },
      { CAT: 'Fresh', ING: 'Onions', QTY: '0.444' }
    ];

    const aggregated = service.consolidateConsolidatedTableRows(rows, placeholders, group, subConfig, 'MP_INGREDIENTS_LI');
    expect(aggregated).toHaveLength(2);
    const byIng = new Map<string, any>(aggregated.map((r: any) => [r.ING, r]));
    expect((byIng.get('Onions') as any)?.QTY).toBe(3.78);
    expect((byIng.get('Pumpkin') as any)?.QTY).toBe(3);
  });
});


