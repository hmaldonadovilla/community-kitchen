import {
  normalizeOverlayFieldListAction,
  normalizeOverlayFlattenPlacementAction,
  resolveOverlayFlattenedFieldTargetsAction
} from '../../../src/web/react/features/lineItems/domain/overlayFlattenedFields';

describe('overlay flattened fields domain', () => {
  test('normalizes flattened field lists and placement values', () => {
    expect(normalizeOverlayFieldListAction(['A', ' A ', null, 'B', ''])).toEqual(['A', 'B']);
    expect(normalizeOverlayFieldListAction('FIELD')).toEqual(['FIELD']);
    expect(normalizeOverlayFlattenPlacementAction('LEFT')).toBe('left');
    expect(normalizeOverlayFlattenPlacementAction('right')).toBe('right');
    expect(normalizeOverlayFlattenPlacementAction('inline')).toBe('below');
  });

  test('resolves the single target row and configured fields', () => {
    const rows = [
      { id: 'row1', values: { include: false } },
      { id: 'row2', values: { include: true } }
    ];
    const resolved = resolveOverlayFlattenedFieldTargetsAction({
      rows,
      rowFilter: { include: true },
      flattenFields: ['B', 'A'],
      targetFieldsAll: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      matchesRowFilter: rowValues => rowValues.include === true
    });

    expect(resolved).toMatchObject({
      ok: true,
      targetRow: rows[1],
      targetFields: [{ id: 'B' }, { id: 'A' }]
    });
  });

  test('reports row and field resolution skip reasons', () => {
    expect(
      resolveOverlayFlattenedFieldTargetsAction({
        rows: [],
        flattenFields: ['A'],
        targetFieldsAll: [{ id: 'A' }],
        matchesRowFilter: () => true
      })
    ).toMatchObject({ ok: false, reason: 'noRow' });

    expect(
      resolveOverlayFlattenedFieldTargetsAction({
        rows: [{ id: 'one', values: {} }, { id: 'two', values: {} }],
        flattenFields: ['A'],
        targetFieldsAll: [{ id: 'A' }],
        matchesRowFilter: () => true
      })
    ).toMatchObject({ ok: false, reason: 'multipleRows', count: 2 });

    expect(
      resolveOverlayFlattenedFieldTargetsAction({
        rows: [{ id: 'one', values: {} }],
        flattenFields: ['Missing'],
        targetFieldsAll: [{ id: 'A' }],
        matchesRowFilter: () => true
      })
    ).toMatchObject({ ok: false, reason: 'noFields' });
  });
});
