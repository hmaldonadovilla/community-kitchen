const {
  buildOverlaySessionSnapshotKey
} = require('../../../src/web/react/features/overlays/useOverlaySessionController.ts') as {
  buildOverlaySessionSnapshotKey: typeof import('../../../src/web/react/features/overlays/useOverlaySessionController').buildOverlaySessionSnapshotKey;
};

describe('overlay session controller', () => {
  test('builds stable snapshot keys for overlay sessions', () => {
    expect(buildOverlaySessionSnapshotKey('subgroup', ' parent::row::child ')).toBe('subgroup::parent::row::child');
    expect(buildOverlaySessionSnapshotKey('lineItem', 'groupA')).toBe('lineItem::groupA');
    expect(buildOverlaySessionSnapshotKey('lineItem', '  ')).toBe('');
  });
});
