import { resolveTemplateIdForRecord } from '../../../src/web/react/app/templateId';

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  } as Storage;
};

const installWindowStorage = () => {
  const win = {
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    addEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  };
  (globalThis as any).window = win;
  return win;
};

describe('resolveTemplateIdForRecord', () => {
  it('resolves language map', () => {
    const id = resolveTemplateIdForRecord({ EN: 'A', FR: 'B' }, {}, 'FR');
    expect(id).toBe('B');
  });

  it('resolves cases selector by record values', () => {
    const id = resolveTemplateIdForRecord(
      {
        cases: [
          { when: { fieldId: 'SHIFT', equals: 'AM' }, templateId: 'T_AM' },
          { when: { fieldId: 'SHIFT', equals: 'PM' }, templateId: 'T_PM' }
        ],
        default: 'T_DEFAULT'
      },
      { SHIFT: 'PM' },
      'EN'
    );
    expect(id).toBe('T_PM');
  });
});

describe('renderBundledHtmlTemplateClient (bundle: local render)', () => {
  afterEach(() => {
    const win = (globalThis as any).window;
    win?.localStorage?.clear?.();
    win?.sessionStorage?.clear?.();
    delete (globalThis as any).window;
    jest.resetModules();
  });

  it('does not fetch dataSource details when template has no projection placeholders', async () => {
    const fetchDataSource = jest.fn(async () => ({ items: [] }));
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_DISTRIBUTOR',
          type: 'CHOICE',
          label: { en: 'Distributor', fr: 'Distributor', nl: 'Distributor' },
          required: false,
          dataSource: { id: 'DS1', mapping: { DIST_NAME: 'value' }, projection: ['DIST_NAME'] }
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_DISTRIBUTOR: 'Croix' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      fetchDataSource,
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{MP_DISTRIBUTOR}}</div>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Croix');
    expect(fetchDataSource).not.toHaveBeenCalled();
  });

  it('fetches dataSource details when template contains projection placeholders and replaces them', async () => {
    const fetchDataSource = jest.fn(async () => ({
      items: [{ DIST_NAME: 'Croix', DIST_ADDR_1: 'Rue Example 1' }]
    }));
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_DISTRIBUTOR',
          type: 'CHOICE',
          label: { en: 'Distributor', fr: 'Distributor', nl: 'Distributor' },
          required: false,
          dataSource: { id: 'DS1', mapping: { DIST_NAME: 'value' }, projection: ['DIST_NAME'] }
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_DISTRIBUTOR: 'Croix' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      fetchDataSource,
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{MP_DISTRIBUTOR.DIST_ADDR_1}}</div>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Rue Example 1');
    expect(fetchDataSource).toHaveBeenCalledTimes(1);
  });

  it('uses persisted datasource cache for projection placeholders before fetching', async () => {
    const win = installWindowStorage();
    win.localStorage.setItem(
      'ck.ds.DS_CACHE.EN.v4.default.cached',
      JSON.stringify({
        savedAtMs: Date.now(),
        response: {
          items: [{ DIST_NAME: 'Croix', DIST_ADDR_1: 'Rue Cached 7' }]
        }
      })
    );
    const diagnostics: Array<[string, Record<string, any> | undefined]> = [];
    const fetchDataSource = jest.fn(async () => ({
      items: [{ DIST_NAME: 'Croix', DIST_ADDR_1: 'Rue Server 9' }]
    }));
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_DISTRIBUTOR',
          type: 'CHOICE',
          label: { en: 'Distributor', fr: 'Distributor', nl: 'Distributor' },
          required: false,
          dataSource: { id: 'DS_CACHE', mapping: { DIST_NAME: 'value' }, projection: ['DIST_NAME'] }
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_DISTRIBUTOR: 'Croix' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      fetchDataSource,
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{MP_DISTRIBUTOR.DIST_ADDR_1}}</div>',
      onDiagnostic: (event, payload) => diagnostics.push([event, payload])
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Rue Cached 7');
    expect(res.html).not.toContain('Rue Server 9');
    expect(fetchDataSource).not.toHaveBeenCalled();
    expect(diagnostics.some(([event]) => event === 'htmlTemplate.dataSourceDetails.cache.hit')).toBe(true);
  });

  it('fetches projection dataSource details in parallel for bundled templates', async () => {
    let active = 0;
    let maxActive = 0;
    const fetchDataSource = jest.fn(async (req: any) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active -= 1;
      if ((req?.source?.id || '').toString() === 'DS2') {
        return { items: [{ DIST_B_NAME: 'Beta', DIST_B_ADDR: 'Rue B' }] };
      }
      return { items: [{ DIST_A_NAME: 'Alpha', DIST_A_ADDR: 'Rue A' }] };
    });
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'DIST_A',
          type: 'CHOICE',
          label: { en: 'A', fr: 'A', nl: 'A' },
          required: false,
          dataSource: { id: 'DS1', mapping: { DIST_A_NAME: 'value' }, projection: ['DIST_A_NAME'] }
        },
        {
          id: 'DIST_B',
          type: 'CHOICE',
          label: { en: 'B', fr: 'B', nl: 'B' },
          required: false,
          dataSource: { id: 'DS2', mapping: { DIST_B_NAME: 'value' }, projection: ['DIST_B_NAME'] }
        }
      ]
    };

    const payload: any = {
      formKey: 'F',
      language: 'EN',
      id: 'R1',
      values: { DIST_A: 'Alpha', DIST_B: 'Beta' }
    };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      fetchDataSource,
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{DIST_A.DIST_A_ADDR}} {{DIST_B.DIST_B_ADDR}}</div>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Rue A');
    expect(res.html).toContain('Rue B');
    expect(fetchDataSource).toHaveBeenCalledTimes(2);
    expect(maxActive).toBeGreaterThanOrEqual(2);
  });

  it('replaces {{LABEL(FIELD_ID)}} placeholders using configured question labels', async () => {
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_COOK_NAME',
          type: 'TEXT',
          label: { en: 'Responsible cook', fr: 'Cuisinier responsable', nl: 'Verantwoordelijke kok' },
          required: false
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_COOK_NAME: 'Haven' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{LABEL(MP_COOK_NAME)}} {{MP_COOK_NAME}}</div>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Responsible cook');
    expect(res.html).toContain('Haven');
    expect(res.html).not.toContain('{{LABEL(MP_COOK_NAME)}}');
  });

  it('caches fetched dataSource details per selected value (no duplicate fetch)', async () => {
    const fetchDataSource = jest.fn(async () => ({
      items: [{ DIST_NAME: 'Croix', DIST_ADDR_1: 'Rue Example 1' }]
    }));
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_DISTRIBUTOR',
          type: 'CHOICE',
          label: { en: 'Distributor', fr: 'Distributor', nl: 'Distributor' },
          required: false,
          dataSource: { id: 'DS1', mapping: { DIST_NAME: 'value' }, projection: ['DIST_NAME'] }
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_DISTRIBUTOR: 'Croix' } };

    const render = () =>
      renderBundledHtmlTemplateClient({
        definition,
        payload,
        templateIdMap: 'bundle:test.html',
        fetchDataSource,
        parseBundledTemplateId: () => 'test.html',
        getBundledTemplateRaw: () => '<div>{{MP_DISTRIBUTOR.DIST_ADDR_1}}</div>'
      });

    const r1 = await render();
    const r2 = await render();

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(fetchDataSource).toHaveBeenCalledTimes(1);
  });

  it('retries dataSource details fetch when google.script.run is temporarily unavailable', async () => {
    const fetchDataSource = jest
      .fn()
      .mockRejectedValueOnce(new Error('google.script.run is unavailable.'))
      .mockResolvedValueOnce({ items: [{ DIST_NAME: 'Croix', DIST_ADDR_1: 'Rue Example 1' }] });
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_DISTRIBUTOR',
          type: 'CHOICE',
          label: { en: 'Distributor', fr: 'Distributor', nl: 'Distributor' },
          required: false,
          dataSource: { id: 'DS1', mapping: { DIST_NAME: 'value' }, projection: ['DIST_NAME'] }
        }
      ]
    };

    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { MP_DISTRIBUTOR: 'Croix' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      fetchDataSource,
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{MP_DISTRIBUTOR.DIST_ADDR_1}}</div>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Rue Example 1');
    expect(fetchDataSource).toHaveBeenCalledTimes(2);
  });

  it('renders mp.ing_recipe.html locally from a filtered overlay payload', async () => {
    const fetchDataSource = jest.fn(async () => ({
      items: [
        {
          QFTD5RD2EM: 'Bulgur & vegetable sauce',
          REC_INST: 'Simmer gently.'
        }
      ]
    }));
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'Meal Production',
      destinationTab: 'MP',
      languages: ['EN'],
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals' },
          lineItemConfig: {
            fields: [{ id: 'MEAL_TYPE', type: 'TEXT', labelEn: 'Meal type' }],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_TYPE', type: 'TEXT', labelEn: 'Prep type' },
                  { id: 'PREP_QTY', type: 'NUMBER', labelEn: 'Prep quantity' },
                  {
                    id: 'RECIPE',
                    type: 'CHOICE',
                    labelEn: 'Recipe',
                    dataSource: {
                      id: 'Recipes Data',
                      mapping: { QFTD5RD2EM: 'value' },
                      projection: ['QFTD5RD2EM', 'REC_INST']
                    }
                  }
                ],
                subGroups: [
                  {
                    id: 'MP_INGREDIENTS_LI',
                    fields: [
                      { id: 'ING', type: 'TEXT', labelEn: 'Ingredient' },
                      { id: 'QTY', type: 'NUMBER', labelEn: 'Quantity' },
                      { id: 'UNIT', type: 'TEXT', labelEn: 'Unit' },
                      { id: 'CAT', type: 'TEXT', labelEn: 'Category' },
                      { id: 'ALLERGEN', type: 'TEXT', labelEn: 'Allergen' }
                    ]
                  }
                ]
              }
            ]
          }
        }
      ]
    };
    const payload: any = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'MP-1',
      values: {
        MP_MEALS_REQUEST: [
          {
            id: 'meal-1',
            MEAL_TYPE: 'Vegetarian',
            MP_TYPE_LI: [
              {
                id: 'prep-1',
                PREP_TYPE: 'Cook',
                PREP_QTY: 2,
                RECIPE: 'Bulgur & vegetable sauce',
                MP_INGREDIENTS_LI: [
                  {
                    id: 'ing-1',
                    ING: 'Bulgur',
                    QTY: 2,
                    UNIT: 'kg',
                    CAT: 'Dry carbohydrates',
                    ALLERGEN: 'Gluten'
                  },
                  {
                    id: 'ing-2',
                    ING: 'Salt',
                    QTY: 1,
                    UNIT: 'Tbsp',
                    CAT: 'Herbs - spices - condiments',
                    ALLERGEN: 'None'
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: { EN: 'bundle:mp.ing_recipe.html' },
      fetchDataSource
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('Bulgur');
    expect(res.html).toContain('2 kg');
    expect(res.html).toContain('Salt');
    expect(res.html).toContain('Simmer gently.');
    expect(fetchDataSource).toHaveBeenCalledTimes(1);
  });

  it('preserves template-authored <script> blocks for bundled templates', async () => {
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [{ id: 'FIELD', type: 'TEXT', label: { en: 'Field', fr: 'Field', nl: 'Field' }, required: false }]
    };
    const payload: any = { formKey: 'F', language: 'EN', id: 'R1', values: { FIELD: 'hello' } };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{FIELD}}</div><script>window.__ck_trusted = 1;</script>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('hello');
    expect(res.html).toContain('<script');
    expect(res.html).toContain('__ck_trusted');
  });

  it('strips <script> injected via user-entered values even for bundled templates', async () => {
    const { renderBundledHtmlTemplateClient } = require('../../../src/web/react/app/bundledHtmlClientRenderer') as typeof import('../../../src/web/react/app/bundledHtmlClientRenderer');

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [{ id: 'FIELD', type: 'TEXT', label: { en: 'Field', fr: 'Field', nl: 'Field' }, required: false }]
    };
    const payload: any = {
      formKey: 'F',
      language: 'EN',
      id: 'R1',
      values: { FIELD: '<script>window.__ck_injected = 1;</script>hello' }
    };

    const res = await renderBundledHtmlTemplateClient({
      definition,
      payload,
      templateIdMap: 'bundle:test.html',
      parseBundledTemplateId: () => 'test.html',
      getBundledTemplateRaw: () => '<div>{{FIELD}}</div><script>window.__ck_trusted = 1;</script>'
    });

    expect(res.success).toBe(true);
    expect(res.html).toContain('hello');
    expect(res.html).toContain('__ck_trusted');
    expect(res.html).not.toContain('__ck_injected');
  });
});
