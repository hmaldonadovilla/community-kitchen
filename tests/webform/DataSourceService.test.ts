import '../mocks/GoogleAppsScript';
import { DataSourceService } from '../../src/services/webform/dataSources';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

describe('DataSourceService', () => {
  test('paginates and filters by locale key', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Source');
    sheet.setMockData([
      ['Name', 'Locale', 'Value'],
      ['Alpha', 'EN', '1'],
      ['Beta', 'FR', '2'],
      ['Gamma', 'EN', '3']
    ]);

    const service = new DataSourceService(ss);
    const first = service.fetchDataSource({ id: 'Source', projection: ['Name', 'Value'], localeKey: 'Locale' }, 'EN', undefined, 2);
    expect(first.items.length).toBe(1);
    expect((first.items[0] as any).Name).toBe('Alpha');
    expect(first.nextPageToken).toBeDefined();

    const second = service.fetchDataSource({ id: 'Source', projection: ['Name', 'Value'], localeKey: 'Locale' }, 'EN', undefined, 2, first.nextPageToken);
    expect(second.items.length).toBe(1);
    expect((second.items[0] as any).Name).toBe('Gamma');
    expect(second.nextPageToken).toBeUndefined();
  });

  test('supports bracketed header keys (Label [KEY]) for projection/mapping (DS-A)', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Source');
    sheet.setMockData([
      ['Name [NAME]', 'Locale [LOCALE]', 'Value [VALUE]'],
      ['Alpha', 'EN', '1'],
      ['Beta', 'FR', '2']
    ]);

    const service = new DataSourceService(ss);
    const res = service.fetchDataSource(
      {
        id: 'Source',
        projection: ['NAME', 'VALUE'],
        localeKey: 'LOCALE'
      },
      'EN'
    );

    expect(res.items.length).toBe(1);
    expect((res.items[0] as any).NAME).toBe('Alpha');
    expect((res.items[0] as any).VALUE).toBe('1');
  });

  test('preserves raw projection keys for options-mode mappings (target -> source)', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Distributor Data');
    sheet.setMockData([
      ['Distributor Name [DIST_NAME]', 'Email [DIST_EMAIL]'],
      ['Croix-Rouge Belliard', 'dist@example.com']
    ]);

    const service = new DataSourceService(ss);
    const res = service.fetchDataSource(
      {
        id: 'Distributor Data',
        projection: ['DIST_NAME', 'DIST_EMAIL'],
        // Common UI config: mapping indicates which source column is used as "value"
        // (the frontend reads row[mapping.value]).
        mapping: { value: 'DIST_NAME' }
      },
      'EN'
    );

    expect(res.items.length).toBe(1);
    // Raw keys must exist for the web app
    expect((res.items[0] as any).DIST_NAME).toBe('Croix-Rouge Belliard');
    expect((res.items[0] as any).DIST_EMAIL).toBe('dist@example.com');
    // Alias key is also populated for compatibility
    expect((res.items[0] as any).value).toBe('Croix-Rouge Belliard');
  });
});
