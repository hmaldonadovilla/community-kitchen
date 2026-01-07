import { resolveTemplateIdForRecord } from '../../../src/web/react/app/templateId';

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
});


