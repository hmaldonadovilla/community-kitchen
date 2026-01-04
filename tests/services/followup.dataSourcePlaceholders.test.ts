import '../mocks/GoogleAppsScript';
import { DataSourceService } from '../../src/services/webform/dataSources';
import { buildPlaceholderMap } from '../../src/services/webform/followup/placeholders';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

describe('FollowupService dataSource placeholders', () => {
  it('expands dataSource projection placeholders when source headers use Label [ID] format', () => {
    const ss = new MockSpreadsheet();
    const sheet = ss.insertSheet('Distributor Data');
    sheet.setMockData([
      [
        'Distributor Name [DIST_NAME]',
        'Address 1 [DIST_ADDR_1]',
        'Address 2 [DIST_ADDR_2]',
        'City [DIST_CITY]',
        'Region [DIST_REGION]',
        'Country [DIST_COUNTRY]',
        'Post Code [DIST_POST_CODE]'
      ],
      ['Croix-Rouge Belliard', 'Rue Capitaine Crespel 29', '', 'Brussels', '', 'Belgium', '1050']
    ]);

    const questions: any[] = [
      {
        id: 'MP_DISTRIBUTOR',
        type: 'CHOICE',
        qEn: 'Distributor',
        qFr: 'Distributor',
        qNl: 'Distributor',
        required: false,
        status: 'Active',
        options: [],
        optionsFr: [],
        optionsNl: [],
        dataSource: {
          id: 'Distributor Data',
          projection: [
            'DIST_NAME',
            'DIST_EMAIL',
            'DIST_PH',
            'DIST_ADDR_1',
            'DIST_ADDR_2',
            'DIST_CITY',
            'DIST_REGION',
            'DIST_COUNTRY',
            'DIST_POST_CODE'
          ],
          // NOTE: Some configs use reversed mapping (target -> source). Client supports both; backend should too.
          mapping: { value: 'DIST_NAME' },
          limit: 100,
          mode: 'options'
        }
      }
    ];

    const record: any = {
      id: 'rec-1',
      formKey: 'FORM_KEY',
      createdAt: '',
      updatedAt: '',
      status: 'Active',
      pdfUrl: '',
      language: 'EN',
      values: {
        MP_DISTRIBUTOR: 'Croix-Rouge Belliard'
      }
    };

    const dataSources = new DataSourceService(ss as any);
    const placeholders = buildPlaceholderMap({
      record,
      questions,
      lineItemRows: {},
      dataSources
    });

    // Primary value still works
    expect(placeholders['{{MP_DISTRIBUTOR}}']).toBe('Croix-Rouge Belliard');

    // Projection fields should be expanded (no leaked bracket labels like "Address 1 [DIST_ADDR_1]")
    expect(placeholders['{{MP_DISTRIBUTOR.DIST_ADDR_1}}']).toBe('Rue Capitaine Crespel 29');
    expect(placeholders['{{MP_DISTRIBUTOR.DIST_CITY}}']).toBe('Brussels');
    expect(placeholders['{{MP_DISTRIBUTOR.DIST_COUNTRY}}']).toBe('Belgium');
    expect(placeholders['{{MP_DISTRIBUTOR.DIST_POST_CODE}}']).toBe('1050');
  });
});


