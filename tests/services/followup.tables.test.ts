import '../mocks/GoogleAppsScript';
import { QuestionConfig } from '../../src/types';
import {
  extractExcludeWhenDirective,
  extractExcludeWhenWhenDirective,
  extractLineItemPlaceholders,
  extractOrderByDirective,
  extractTableRepeatDirective,
  replaceTableRepeatDirectivePlaceholders
} from '../../src/services/webform/followup/tableDirectives';
import { formatTemplateValue } from '../../src/services/webform/followup/utils';
import { replaceLineItemPlaceholders } from '../../src/services/webform/followup/lineItemPlaceholders';
import { shouldRenderCollapsedOnlyForProgressiveRow } from '../../src/services/webform/followup/progressiveRows';
import { applyOrderBy, consolidateConsolidatedTableRows } from '../../src/services/webform/followup/tableConsolidation';
import { applyMarkdownLineItemBlocks } from '../../src/services/webform/followup/markdownLineItemBlocks';

describe('FollowupService table directives', () => {
  it('extracts GROUP_TABLE directives from table text', () => {
    const table = { getText: () => '{{GROUP_TABLE(MP_MEALS_REQUEST.MEAL_TYPE)}}' };
    expect(extractTableRepeatDirective(table as any)).toEqual({
      kind: 'GROUP_TABLE',
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'MEAL_TYPE'
    });
  });

  it('extracts ROW_TABLE directives from table text', () => {
    const table = { getText: () => '{{ROW_TABLE(MP_MEALS_REQUEST.MEAL_TYPE)}}' };
    expect(extractTableRepeatDirective(table as any)).toEqual({
      kind: 'ROW_TABLE',
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'MEAL_TYPE'
    });
  });

  it('replaces GROUP_TABLE directive using an escaped regex (so the token does not leak into output)', () => {
    const cell = { replaceText: jest.fn() };
    const row = { getNumCells: () => 1, getCell: () => cell };
    const table = { getNumRows: () => 1, getRow: () => row };

    replaceTableRepeatDirectivePlaceholders(
      table as any,
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
    expect(formatTemplateValue('2025-12-21', 'DATE')).toBe('Sun, 21-Dec-2025');
    // Non-DATE fields should keep the raw ISO date string.
    expect(formatTemplateValue('2025-12-21')).toBe('2025-12-21');
  });

  it('formats Date objects using script timezone (avoids UTC day-shift)', () => {
    // Midnight in Europe/Brussels is 23:00Z the previous day (in winter time).
    // If we used toISOString().slice(0,10), this would render as 2026-01-02.
    const sheetDate = new Date('2026-01-03T00:00:00+01:00');
    expect(formatTemplateValue(sheetDate, 'DATE')).toBe('Sat, 03-Jan-2026');
  });

  it('extracts ORDER_BY directives from table text', () => {
    const table = { getText: () => '{{ORDER_BY(CAT ASC, ING:DESC, -QTY)}}' };
    expect(extractOrderByDirective(table as any)).toEqual({
      keys: [
        { key: 'CAT', direction: 'asc' },
        { key: 'ING', direction: 'desc' },
        { key: 'QTY', direction: 'desc' }
      ]
    });
  });

  it('extracts EXCLUDE_WHEN directives from table text', () => {
    const table = { getText: () => '{{EXCLUDE_WHEN(STATUS=Removed|Deleted, CAT=Other)}}' };
    expect(extractExcludeWhenDirective(table as any)).toEqual({
      clauses: [
        { key: 'STATUS', values: ['Removed', 'Deleted'] },
        { key: 'CAT', values: ['Other'] }
      ]
    });
  });

  it('extracts EXCLUDE_WHEN_WHEN directives from table text', () => {
    const table = { getText: () => '{{EXCLUDE_WHEN_WHEN({"fieldId":"STATUS","equals":"Removed"})}}' };
    expect(extractExcludeWhenWhenDirective(table as any)).toEqual({
      raw: '{"fieldId":"STATUS","equals":"Removed"}'
    });
  });

  it('applies ORDER_BY / EXCLUDE_WHEN directives to markdown line-item blocks (subgroup)', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'CAT', type: 'TEXT', labelEn: 'Category', required: false },
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false }
            ]
          } as any
        ]
      }
    } as any;

    const markdown = `
## Category
{{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.CAT}} - {{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.ING}}
{{ORDER_BY(CAT ASC, ING ASC)}}
{{EXCLUDE_WHEN(CAT=Other)}}
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          MEAL_TYPE: 'Dinner',
          MP_INGREDIENTS_LI: [
            { CAT: 'Other', ING: 'Salt' },
            { CAT: 'Fruit', ING: 'Apple' },
            { CAT: 'Fruit', ING: 'Banana' }
          ]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    // Directives removed
    expect(rendered).not.toContain('ORDER_BY(');
    expect(rendered).not.toContain('EXCLUDE_WHEN(');
    // Excluded CAT=Other row removed
    expect(rendered).not.toContain('Other - Salt');
    // Sorted output
    expect(rendered).toContain('Fruit - Apple');
    expect(rendered).toContain('Fruit - Banana');
  });

  it('EXCLUDE_WHEN compares raw values (no boolean formatting)', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'MP_IS_REHEAT', type: 'TEXT', labelEn: 'Reheat', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [{ id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false }]
          } as any
        ]
      }
    } as any;

    const markdown = `
{{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.ING}}
{{EXCLUDE_WHEN(MP_MEALS_REQUEST.MP_IS_REHEAT=Yes)}}
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          MP_IS_REHEAT: 'Yes',
          MP_INGREDIENTS_LI: [{ ING: 'Salt' }]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    expect(rendered).not.toContain('Salt');
  });

  it('EXCLUDE_WHEN uses parent group values when subgroup ids clash', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'QTY', type: 'NUMBER', labelEn: 'Quantity', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'QTY', type: 'NUMBER', labelEn: 'Quantity', required: false },
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false }
            ]
          } as any
        ]
      }
    } as any;

    const markdown = `
{{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.ING}}
{{EXCLUDE_WHEN(MP_MEALS_REQUEST.QTY=0)}}
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          QTY: 5,
          MP_INGREDIENTS_LI: [{ QTY: 0, ING: 'Salt' }]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    expect(rendered).toContain('Salt');
  });

  it('EXCLUDE_WHEN_WHEN supports when clauses for subgroup rows', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'MP_IS_REHEAT', type: 'TEXT', labelEn: 'Reheat', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [{ id: '__ckRowSource', type: 'TEXT', labelEn: 'Source', required: false }]
          } as any
        ]
      }
    } as any;

    const markdown = `
{{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.__ckRowSource}}
{{EXCLUDE_WHEN_WHEN({"fieldId":"MP_IS_REHEAT","equals":"Yes"})}}
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          MP_IS_REHEAT: 'Yes',
          MP_INGREDIENTS_LI: [{ __ckRowSource: 'manual' }]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    expect(rendered).not.toContain('manual');
  });

  it('EXCLUDE_WHEN_WHEN resolves qualified system fields for subgroups', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [{ id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false }]
          } as any
        ]
      }
    } as any;

    const markdown = `
{{MP_MEALS_REQUEST.MP_INGREDIENTS_LI.ING}}
{{EXCLUDE_WHEN_WHEN({"fieldId":"MP_MEALS_REQUEST.MP_INGREDIENTS_LI.__ckRowSource","equals":"manual"})}}
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          MEAL_TYPE: 'Dinner',
          MP_INGREDIENTS_LI: [{ ING: 'Salt', __ckRowSource: 'manual' }]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    expect(rendered).not.toContain('Salt');
  });

  it('markdown line-item blocks tolerate spaces and CONSOLIDATED_TABLE(GROUP.SUBGROUP.FIELD)', () => {
    const group: QuestionConfig = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Meals',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', required: false }] as any,
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'ALLERGEN', type: 'TEXT', labelEn: 'Allergen', required: false },
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', required: false }
            ]
          } as any
        ]
      }
    } as any;

    const markdown = `
| Allergen |
| --- |
| {{ MP_MEALS_REQUEST . MP_INGREDIENTS_LI . ALLERGEN }} |
| {{ CONSOLIDATED_TABLE( MP_MEALS_REQUEST . MP_INGREDIENTS_LI . ALLERGEN ) }} |
`.trim();

    const lineItemRows = {
      MP_MEALS_REQUEST: [
        {
          MEAL_TYPE: 'Dinner',
          MP_INGREDIENTS_LI: [{ ALLERGEN: 'Gluten', ING: 'Flour' }, { ALLERGEN: 'Gluten', ING: 'Bread' }]
        }
      ]
    };

    const rendered = applyMarkdownLineItemBlocks({ markdown, questions: [group], lineItemRows });
    expect(rendered).not.toContain('CONSOLIDATED_TABLE(');
    // Placeholder removed (replaced with value; deduped by consolidated table directive)
    expect(rendered).toContain('Gluten');
    expect(rendered).not.toContain('{{');
  });

  it('in progressive mode, PDF table placeholders populate all fields by default', () => {
    const group: QuestionConfig = {
      id: 'MP_GROUP',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Group',
      qFr: 'Groupe',
      qNl: 'Groep',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        ui: { mode: 'progressive', collapsedFields: [{ fieldId: 'A' }] } as any,
        fields: [
          { id: 'A', type: 'TEXT', labelEn: 'A', labelFr: 'A', labelNl: 'A', required: false },
          { id: 'B', type: 'TEXT', labelEn: 'B', labelFr: 'B', labelNl: 'B', required: false }
        ],
        subGroups: []
      }
    } as any;

    const out = replaceLineItemPlaceholders('{{MP_GROUP.A}}|{{MP_GROUP.B}}', group, { A: 'aaa', B: 'bbb' }, {});
    expect(out).toBe('aaa|bbb');
  });

  it('in progressive mode, PDF can render collapsed-only rows when requested', () => {
    const group: QuestionConfig = {
      id: 'MP_GROUP',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Group',
      qFr: 'Groupe',
      qNl: 'Groep',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        ui: { mode: 'progressive', collapsedFields: [{ fieldId: 'A' }] } as any,
        fields: [
          { id: 'A', type: 'TEXT', labelEn: 'A', labelFr: 'A', labelNl: 'A', required: false },
          { id: 'B', type: 'TEXT', labelEn: 'B', labelFr: 'B', labelNl: 'B', required: false }
        ],
        subGroups: []
      }
    } as any;

    const out = replaceLineItemPlaceholders(
      '{{MP_GROUP.A}}|{{MP_GROUP.B}}',
      group,
      { A: 'aaa', B: 'bbb' },
      { collapsedOnly: true }
    );
    expect(out).toBe('aaa|');
  });

  it('supports ALWAYS_SHOW wrapper placeholders in PDF templates', () => {
    // Extraction: ALWAYS_SHOW should be treated as a placeholder so table rendering can process the row.
    expect(extractLineItemPlaceholders('x {{ALWAYS_SHOW(MP_GROUP.B)}} y')).toEqual([
      { groupId: 'MP_GROUP', subGroupId: undefined, fieldId: 'B' }
    ]);

    const group: QuestionConfig = {
      id: 'MP_GROUP',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Group',
      qFr: 'Groupe',
      qNl: 'Groep',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [
          { id: 'A', type: 'TEXT', labelEn: 'A', labelFr: 'A', labelNl: 'A', required: false },
          { id: 'B', type: 'NUMBER', labelEn: 'B', labelFr: 'B', labelNl: 'B', required: false }
        ],
        subGroups: []
      }
    } as any;

    // Replacement: ALWAYS_SHOW should output the underlying field value (same as a normal placeholder).
    expect(replaceLineItemPlaceholders('{{ALWAYS_SHOW(MP_GROUP.B)}}', group, { A: 'aaa', B: 0 }, {})).toBe('0');
    expect(replaceLineItemPlaceholders('{{ALWAYS_SHOW(MP_GROUP.B)}}', group, { A: 'aaa', B: 12 }, {})).toBe('12');
  });

  it('treats empty subgroup child rows as non-meaningful for progressive collapsed-only detection', () => {
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
        ui: {
          mode: 'progressive',
          collapsedFields: [
            { fieldId: 'MEAL_TYPE', showLabel: false },
            { fieldId: 'QTY', showLabel: true },
            { fieldId: 'FINAL_QTY', showLabel: true }
          ]
        } as any,
        fields: [
          { id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type', labelFr: 'Type', labelNl: 'Type', required: false },
          { id: 'QTY', type: 'NUMBER', labelEn: 'Requested', labelFr: 'Demandé', labelNl: 'Gevraagd', required: false },
          { id: 'FINAL_QTY', type: 'NUMBER', labelEn: 'Final', labelFr: 'Final', labelNl: 'Final', required: false },
          { id: 'RECIPE', type: 'TEXT', labelEn: 'Recipe', labelFr: 'Recette', labelNl: 'Recept', required: false }
        ],
        subGroups: [
          {
            id: 'MP_INGREDIENTS_LI',
            fields: [
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', labelFr: 'Ing', labelNl: 'Ing', required: false },
              { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', labelFr: 'Qté', labelNl: 'Qty', required: false }
            ]
          } as any
        ]
      }
    } as any;

    // Has child rows, but they are empty -> should still be considered "collapsed-only" (inactive).
    const shouldCollapseEmptyChild = shouldRenderCollapsedOnlyForProgressiveRow({
      group,
      ui: (group as any).lineItemConfig.ui,
      fields: (group as any).lineItemConfig.fields,
      row: {
        MEAL_TYPE: 'Vegan',
        QTY: 0,
        FINAL_QTY: 0,
        RECIPE: '',
        MP_INGREDIENTS_LI: [{ ING: '', QTY: 0 }]
      }
    });
    expect(shouldCollapseEmptyChild).toBe(true);

    // If a child row has meaningful values, we should render full rows.
    const shouldNotCollapseMeaningfulChild = shouldRenderCollapsedOnlyForProgressiveRow({
      group,
      ui: (group as any).lineItemConfig.ui,
      fields: (group as any).lineItemConfig.fields,
      row: {
        MEAL_TYPE: 'Vegan',
        QTY: 0,
        FINAL_QTY: 0,
        RECIPE: '',
        MP_INGREDIENTS_LI: [{ ING: 'Onions', QTY: 1 }]
      }
    });
    expect(shouldNotCollapseMeaningfulChild).toBe(false);
  });

  it('applies ORDER_BY sorting for consolidated subgroup tables (multi-key priority)', () => {
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

    const orderBy = {
      keys: [
        { key: 'CAT', direction: 'asc' as const },
        { key: 'ING', direction: 'asc' as const },
        { key: 'QTY', direction: 'desc' as const }
      ]
    };
    const sorted = applyOrderBy({ rows, orderBy, group, opts: { subConfig, subToken: 'MP_INGREDIENTS_LI' } });
    expect(sorted.map((r: any) => `${r.CAT}-${r.ING}-${r.QTY}`)).toEqual(['A-A-1', 'A-B-10', 'A-B-3', 'B-Z-2']);
  });

  it('aggregates NUMBER fields when CONSOLIDATED_TABLE rows share the same non-numeric values', () => {
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

    const aggregated = consolidateConsolidatedTableRows({
      rows,
      placeholders,
      group,
      subConfig,
      targetSubGroupId: 'MP_INGREDIENTS_LI'
    });
    expect(aggregated).toHaveLength(2);
    const byIng = new Map<string, any>(aggregated.map((r: any) => [r.ING, r]));
    expect((byIng.get('Onions') as any)?.QTY).toBe(3.78);
    expect((byIng.get('Pumpkin') as any)?.QTY).toBe(3);
    expect((byIng.get('Onions') as any)?.__COUNT).toBe(3);
    expect((byIng.get('Pumpkin') as any)?.__COUNT).toBe(1);
  });

  it('adds __COUNT when CONSOLIDATED_TABLE de-dupes without numeric fields', () => {
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
              { id: 'ING', type: 'TEXT', labelEn: 'Ingredient', labelFr: 'Ing', labelNl: 'Ing', required: false }
            ]
          }
        ]
      }
    } as any;
    const subConfig = (group as any).lineItemConfig.subGroups[0];

    const placeholders = [
      { groupId: 'MP_MEALS_REQUEST', subGroupId: 'MP_INGREDIENTS_LI', fieldId: 'CAT' },
      { groupId: 'MP_MEALS_REQUEST', subGroupId: 'MP_INGREDIENTS_LI', fieldId: 'ING' }
    ];

    const rows = [
      { CAT: 'Fresh', ING: 'Onions' },
      { CAT: 'Fresh', ING: 'Onions' },
      { CAT: 'Fresh', ING: 'Pumpkin' }
    ];

    const aggregated = consolidateConsolidatedTableRows({
      rows,
      placeholders,
      group,
      subConfig,
      targetSubGroupId: 'MP_INGREDIENTS_LI'
    });
    expect(aggregated).toHaveLength(2);
    const byIng = new Map<string, any>(aggregated.map((r: any) => [r.ING, r]));
    expect((byIng.get('Onions') as any)?.__COUNT).toBe(2);
    expect((byIng.get('Pumpkin') as any)?.__COUNT).toBe(1);
  });
});


