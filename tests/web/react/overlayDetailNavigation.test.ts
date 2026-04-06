import { shouldAutoOpenSubgroupForPendingAnchor } from '../../../src/web/react/features/overlays/domain/overlayDetailNavigation';

describe('shouldAutoOpenSubgroupForPendingAnchor', () => {
  test('keeps the parent line-item overlay active for nested detail rows', () => {
    expect(
      shouldAutoOpenSubgroupForPendingAnchor({
        targetParentGroupKey: 'MP_MEALS_REQUEST::req_1::MP_TYPE_LI',
        lineItemOverlayOpen: true,
        lineItemOverlayGroupId: 'MP_MEALS_REQUEST::req_1::MP_TYPE_LI',
        subgroupOverlayOpen: false,
        subgroupOverlaySubKey: ''
      })
    ).toBe(false);
  });

  test('keeps the parent subgroup overlay active for overlay-detail rows', () => {
    expect(
      shouldAutoOpenSubgroupForPendingAnchor({
        targetParentGroupKey: 'MP_MEALS_REQUEST::req_1::MP_TYPE_LI',
        lineItemOverlayOpen: false,
        lineItemOverlayGroupId: '',
        subgroupOverlayOpen: true,
        subgroupOverlaySubKey: 'MP_MEALS_REQUEST::req_1::MP_TYPE_LI'
      })
    ).toBe(false);
  });

  test('still allows subgroup autoscroll outside the parent overlay-detail shell', () => {
    expect(
      shouldAutoOpenSubgroupForPendingAnchor({
        targetParentGroupKey: 'MP_MEALS_REQUEST::req_1::MP_TYPE_LI',
        lineItemOverlayOpen: false,
        lineItemOverlayGroupId: '',
        subgroupOverlayOpen: false,
        subgroupOverlaySubKey: ''
      })
    ).toBe(true);
  });
});
