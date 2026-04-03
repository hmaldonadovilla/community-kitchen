import { isHomePrefetchEligibleDataSource } from '../../../src/web/data/dataSourcePrefetch';

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
});
