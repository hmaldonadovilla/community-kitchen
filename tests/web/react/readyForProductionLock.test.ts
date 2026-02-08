import {
  removeUnlockParamFromHref,
  parseUnlockRecordIdFromSearch,
  resolveReadyForProductionUnlockStatus,
  resolveUnlockRecordId,
  shouldBypassReadyForProductionLock
} from '../../../src/web/react/app/readyForProductionLock';

describe('readyForProductionLock', () => {
  it('parses unlock record id from query string', () => {
    expect(parseUnlockRecordIdFromSearch('?form=Config%3A%20Meal%20Production&unlock=abc-123')).toBe('abc-123');
    expect(parseUnlockRecordIdFromSearch('unlock=abc-123')).toBe('abc-123');
    expect(parseUnlockRecordIdFromSearch('?unlock=')).toBeUndefined();
    expect(parseUnlockRecordIdFromSearch('')).toBeUndefined();
  });

  it('resolves unlock from request params before URL-derived values', () => {
    expect(
      resolveUnlockRecordId({
        requestParams: { unlock: 'rec-server' },
        search: '?unlock=rec-url'
      })
    ).toEqual({ unlockRecordId: 'rec-server', source: 'requestParams' });
  });

  it('falls back to hash/search parsing when request params are unavailable', () => {
    expect(
      resolveUnlockRecordId({
        search: '',
        hash: '#/form?unlock=rec-hash'
      })
    ).toEqual({ unlockRecordId: 'rec-hash', source: 'hash' });

    expect(
      resolveUnlockRecordId({
        search: '?form=Config%3A%20Meal%20Production&unlock=rec-search'
      })
    ).toEqual({ unlockRecordId: 'rec-search', source: 'search' });
  });

  it('removes unlock param from URL after consumption while keeping other params', () => {
    expect(
      removeUnlockParamFromHref(
        'https://example.test/exec?form=Config%3A%20Meal%20Production&unlock=rec-1&foo=bar'
      )
    ).toEqual({
      href: 'https://example.test/exec?form=Config%3A+Meal+Production&foo=bar',
      changed: true
    });

    expect(removeUnlockParamFromHref('https://example.test/exec?form=Config%3A%20Meal%20Production')).toEqual({
      href: 'https://example.test/exec?form=Config%3A%20Meal%20Production',
      changed: false
    });
  });

  it('also removes unlock from hash query params', () => {
    expect(
      removeUnlockParamFromHref('https://example.test/exec#/form?unlock=rec-1&step=order')
    ).toEqual({
      href: 'https://example.test/exec#/form?step=order',
      changed: true
    });
  });

  it('bypasses only the ready-for-production lock rule for the matching record', () => {
    expect(
      shouldBypassReadyForProductionLock({
        activeRuleId: 'ready-for-production-order-lock',
        unlockRecordId: 'rec-1',
        recordId: 'rec-1'
      })
    ).toBe(true);

    expect(
      shouldBypassReadyForProductionLock({
        activeRuleId: 'ready-for-production-order-lock',
        unlockRecordId: 'rec-2',
        recordId: 'rec-1'
      })
    ).toBe(false);

    expect(
      shouldBypassReadyForProductionLock({
        activeRuleId: 'future-date-lock',
        unlockRecordId: 'rec-1',
        recordId: 'rec-1'
      })
    ).toBe(false);
  });

  it('reads unlockStatus from the dedicated lock rule', () => {
    expect(
      resolveReadyForProductionUnlockStatus([
        { id: 'other-lock', unlockStatus: 'Draft' },
        { id: 'ready-for-production-order-lock', unlockStatus: 'In progress' }
      ])
    ).toBe('In progress');

    expect(resolveReadyForProductionUnlockStatus([{ id: 'ready-for-production-order-lock' }])).toBeUndefined();
    expect(resolveReadyForProductionUnlockStatus(undefined)).toBeUndefined();
  });
});
