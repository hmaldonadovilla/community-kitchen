import { QuestionConfig } from '../../src/types';
import { applyHtmlLineItemBlocks } from '../../src/services/webform/followup/htmlLineItemBlocks';

describe('applyHtmlLineItemBlocks', () => {
  it('scopes GROUP_TABLE rows to the matching group value', () => {
    const group: QuestionConfig = {
      id: 'MP_ING',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Ingredients',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [
          { id: 'CAT', labelEn: 'Category', type: 'TEXT' } as any,
          { id: 'ING', labelEn: 'Ingredient', type: 'TEXT' } as any
        ],
        subGroups: []
      }
    } as any;

    const html = `
      <table>
        <tbody>
          {{GROUP_TABLE(MP_ING.CAT)}}
          <tr>
            <td>{{MP_ING.CAT}}</td>
            <td>{{MP_ING.ING}}</td>
          </tr>
        </tbody>
      </table>
    `;

    const lineItemRows = {
      MP_ING: [
        { CAT: 'Fresh veg', ING: 'Apple' },
        { CAT: 'Proteins', ING: 'Beef' }
      ]
    };

    const rendered = applyHtmlLineItemBlocks({ html, questions: [group], lineItemRows });

    // One table per distinct CAT value
    expect(rendered.match(/<table/gi)?.length).toBe(2);

    // Each row should only appear in its matching grouped table (no cross-duplication)
    expect(rendered.match(/Apple/gi)?.length).toBe(1);
    expect(rendered.match(/Beef/gi)?.length).toBe(1);
  });

  it('resolves CONSOLIDATED_ROW inside ROW_TABLE sections in HTML', () => {
    const group: QuestionConfig = {
      id: 'MP_DISH',
      type: 'LINE_ITEM_GROUP',
      qEn: 'Dishes',
      required: false,
      status: 'Active',
      options: [],
      optionsFr: [],
      optionsNl: [],
      lineItemConfig: {
        fields: [{ id: 'NAME', labelEn: 'Name', type: 'TEXT' } as any],
        subGroups: [
          {
            id: 'MP_ING',
            fields: [{ id: 'ALLERGEN', labelEn: 'Allergen', type: 'TEXT' } as any]
          } as any
        ]
      }
    } as any;

    const html = `
      <table>
        {{ROW_TABLE(MP_DISH.NAME)}}
        <tr>
          <td>{{MP_DISH.NAME}}</td>
          <td>{{CONSOLIDATED_ROW(MP_DISH.MP_ING.ALLERGEN)}}</td>
        </tr>
      </table>
    `;

    const lineItemRows = {
      MP_DISH: [
        { NAME: 'Meal A', MP_ING: [{ ALLERGEN: 'Gluten' }, { ALLERGEN: 'Milk' }] },
        { NAME: 'Meal B', MP_ING: [] }
      ]
    };

    const rendered = applyHtmlLineItemBlocks({ html, questions: [group], lineItemRows });

    // One table per dish
    expect(rendered.match(/<table/gi)?.length).toBe(2);
    expect(rendered).toContain('Meal A');
    expect(rendered).toContain('Meal B');
    expect(rendered).toContain('Gluten, Milk');
    expect(rendered).toContain('None');
  });
});
