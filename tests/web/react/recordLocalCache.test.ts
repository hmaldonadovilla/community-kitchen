import type { WebFormDefinition, WebFormSubmission } from '../../../src/types';
import {
  readCachedRecordSnapshot,
  shouldCacheRecordSnapshotLocally,
  writeCachedRecordSnapshot
} from '../../../src/web/react/app/recordLocalCache';

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
};

const createLocalStorageMock = (): LocalStorageLike & { __keys: () => string[] } => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    __keys: () => Array.from(store.keys())
  };
};

const definition = {
  title: 'Meal Production',
  destinationTab: 'Meal Production Data',
  languages: ['EN'],
  questions: [],
  listView: {
    columns: [],
    search: {
      mode: 'date',
      dateFieldId: 'MP_PREP_DATE'
    }
  }
} as WebFormDefinition;

const record = (overrides: Partial<WebFormSubmission> = {}): WebFormSubmission =>
  ({
    id: 'rec-1',
    formKey: 'Config: Meal Production',
    language: 'EN',
    values: {
      MP_PREP_DATE: '2026-05-11',
      MP_DISTRIBUTOR: 'Customer A'
    },
    lineItems: {},
    updatedAt: '2026-05-11T10:00:00.000Z',
    dataVersion: 2,
    ...overrides
  }) as any;

describe('recordLocalCache', () => {
  beforeEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).__CK_CACHE_VERSION__;
  });

  it('stores and reads only past-date record snapshots for the current cache version', () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage, __CK_CACHE_VERSION__: 'cache-a' };
    const now = new Date(2026, 4, 12);

    const written = writeCachedRecordSnapshot({
      definition,
      formKey: 'Config: Meal Production',
      record: record(),
      now,
      cacheVersion: 'cache-a'
    });

    expect(written.written).toBe(1);
    expect(localStorage.__keys()[0]).toContain('cache-a');
    expect(
      readCachedRecordSnapshot({
        definition,
        formKey: 'Config: Meal Production',
        recordId: 'rec-1',
        now,
        cacheVersion: 'cache-a'
      })?.values?.MP_DISTRIBUTOR
    ).toBe('Customer A');
    expect(
      readCachedRecordSnapshot({
        definition,
        formKey: 'Config: Meal Production',
        recordId: 'rec-1',
        now,
        cacheVersion: 'cache-b'
      })
    ).toBeNull();
  });

  it('does not cache current or future dated records', () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const now = new Date(2026, 4, 12);

    const futureRecord = record({
      values: {
        MP_PREP_DATE: '2026-05-12'
      } as any
    });

    expect(shouldCacheRecordSnapshotLocally({ definition, record: futureRecord, now }).eligible).toBe(false);
    expect(
      writeCachedRecordSnapshot({
        definition,
        formKey: 'Config: Meal Production',
        record: futureRecord,
        now
      }).written
    ).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('keeps a newer cached dataVersion when an older snapshot is written later', () => {
    const localStorage = createLocalStorageMock();
    (globalThis as any).window = { localStorage };
    const now = new Date(2026, 4, 12);

    writeCachedRecordSnapshot({
      definition,
      formKey: 'Config: Meal Production',
      record: record({ dataVersion: 3, values: { MP_PREP_DATE: '2026-05-11', MP_DISTRIBUTOR: 'Newer' } as any }),
      now
    });
    writeCachedRecordSnapshot({
      definition,
      formKey: 'Config: Meal Production',
      record: record({ dataVersion: 2, values: { MP_PREP_DATE: '2026-05-11', MP_DISTRIBUTOR: 'Older' } as any }),
      now
    });

    const cached = readCachedRecordSnapshot({
      definition,
      formKey: 'Config: Meal Production',
      recordId: 'rec-1',
      now
    });
    expect((cached as any)?.dataVersion).toBe(3);
    expect(cached?.values?.MP_DISTRIBUTOR).toBe('Newer');
  });
});
