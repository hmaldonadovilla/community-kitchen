import { FollowupService } from '../../src/services/webform/followup';
import { QuestionConfig, WebFormSubmission } from '../../src/types';

const makeService = () =>
  new FollowupService({} as any, {} as any, {
    lookupDataSourceDetails: jest.fn(),
    fetchDataSource: jest.fn()
  } as any);

const subgroupQuestion: QuestionConfig = {
  id: 'MP_DISHES',
  type: 'LINE_ITEM_GROUP',
  qEn: 'Dishes',
  qFr: 'Plats',
  qNl: 'Gerechten',
  required: false,
  status: 'Active',
  options: [],
  optionsFr: [],
  optionsNl: [],
  lineItemConfig: {
    fields: [{ id: 'RECIPE', type: 'TEXT', labelEn: 'Recipe', labelFr: 'Recette', labelNl: 'Recept', required: false }],
    subGroups: [
      {
        id: 'INGREDIENTS',
        fields: [
          { id: 'ALLERGEN', type: 'TEXT', labelEn: 'Allergen', labelFr: 'Allergène', labelNl: 'Allergeen', required: false }
        ]
      }
    ]
  }
} as any;

describe('FollowupService subgroup helpers', () => {
  it('collects nested subgroup rows with parent linkage', () => {
    const service = makeService() as any;
    const record: WebFormSubmission = {
      id: 'rec1',
      formKey: 'FORM',
      language: 'EN',
      createdAt: '',
      updatedAt: '',
      status: '',
      values: {
        MP_DISHES: [
          { RECIPE: 'Dish 1', INGREDIENTS: [{ ALLERGEN: 'Milk' }, { ALLERGEN: 'Peanuts' }] }
        ]
      }
    };

    const map = service.collectLineItemRows(record, [subgroupQuestion]);
    expect(map['MP_DISHES']).toHaveLength(1);
    expect(map['MP_DISHES.INGREDIENTS']).toHaveLength(2);
    expect(map['MP_DISHES.INGREDIENTS'][0].__parent).toBeDefined();
  });

  it('builds consolidated placeholders for subgroups', () => {
    const service = makeService() as any;
    const placeholders: Record<string, string> = {};
    const lineItemRows = {
      MP_DISHES: [
        { RECIPE: 'A', INGREDIENTS: [{ ALLERGEN: 'Milk' }, { ALLERGEN: 'Peanuts' }] },
        { RECIPE: 'B', INGREDIENTS: [{ ALLERGEN: 'Milk' }] }
      ]
    };

    service.addConsolidatedPlaceholders(placeholders, [subgroupQuestion], lineItemRows);
    expect(placeholders['{{CONSOLIDATED(MP_DISHES.INGREDIENTS.ALLERGEN)}}']).toBe('Milk, Peanuts');
  });
});

