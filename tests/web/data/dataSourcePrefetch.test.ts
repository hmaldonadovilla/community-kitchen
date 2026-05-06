import {
  collectDataSourceConfigsForPrefetch,
  isHomePrefetchEligibleDataSource
} from '../../../src/web/data/dataSourcePrefetch';

describe('dataSourcePrefetch', () => {
  it('allows config-driven home prefetch override for transactional datasources', () => {
    expect(
      isHomePrefetchEligibleDataSource({
        id: 'Leftover Inventory Data',
        formKey: 'Config: Leftover Inventory',
        mode: 'options',
        prefetchOnHome: true,
        statusFieldId: 'LEFTOVER_STATUS',
        statusAllowList: ['available']
      } as any)
    ).toBe(true);
  });

  it('still blocks transactional datasources without the override', () => {
    expect(
      isHomePrefetchEligibleDataSource({
        id: 'Leftover Inventory Data',
        formKey: 'Config: Leftover Inventory',
        mode: 'options',
        statusFieldId: 'LEFTOVER_STATUS',
        statusAllowList: ['available']
      } as any)
    ).toBe(false);
  });

  it('does not collect server-only follow-up data sources for client prefetch', () => {
    const configs = collectDataSourceConfigsForPrefetch({
      questions: [
        {
          id: 'customer',
          dataSource: {
            id: 'Distributor Data',
            projection: ['NICKNAME']
          }
        }
      ],
      followup: {
        emailRecipients: [
          {
            dataSource: {
              id: 'Distributor Data',
              projection: ['NICKNAME', 'DIST_EMAIL']
            }
          }
        ]
      }
    } as any);

    expect(configs.map(config => config.projection)).toEqual([['NICKNAME']]);
  });
});
