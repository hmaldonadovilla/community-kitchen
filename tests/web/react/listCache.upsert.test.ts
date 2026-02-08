import { removeListCacheRowPure, upsertListCacheRowPure, ListCacheState } from '../../../src/web/react/app/listCache';
import { WebFormDefinition } from '../../../src/types';

const baseDefinition: WebFormDefinition = {
  title: 'Test',
  questions: [],
  listView: {
    columns: [{ fieldId: 'name', label: 'Name' }]
  }
} as any;

const blankState: ListCacheState = { response: null, records: {} };

describe('upsertListCacheRowPure', () => {
  it('updates an existing record and list row while preserving unknown fields', () => {
    const prev: ListCacheState = {
      response: {
        items: [{ id: 'r1', name: 'Old Name', status: 'Draft', createdAt: 't1' }],
        totalCount: 1
      } as any,
      records: {
        r1: {
          id: 'r1',
          formKey: 'f',
          language: 'en',
          createdAt: 't1',
          updatedAt: 't1',
          status: 'Draft',
          values: { name: 'Old Name', keepMe: 'x' }
        } as any
      }
    };

    const next = upsertListCacheRowPure({
      prev,
      update: {
        recordId: 'r1',
        values: { name: 'New Name', extra: 'ignore' },
        updatedAt: 't2',
        status: 'Closed',
        dataVersion: 5,
        rowNumber: 4
      },
      definition: baseDefinition,
      formKey: 'f',
      language: 'en'
    });

    expect(next.records.r1.values).toMatchObject({ name: 'New Name', keepMe: 'x' });
    expect((next.records.r1 as any).dataVersion).toBe(5);
    expect((next.records.r1 as any).__rowNumber).toBe(4);
    expect(next.response?.items?.[0]).toMatchObject({
      id: 'r1',
      name: 'New Name',
      status: 'Closed',
      createdAt: 't1',
      updatedAt: 't2'
    });
    expect((next.response?.items?.[0] as any).extra).toBeUndefined();
  });

  it('inserts a new row when the record is not yet cached', () => {
    const definition: WebFormDefinition = {
      ...baseDefinition,
      listView: {
        columns: [{ fieldId: 'name', label: 'Name' }, { fieldId: 'age', label: 'Age' }]
      }
    } as any;

    const prev: ListCacheState = {
      response: { items: [{ id: 'existing', name: 'E' }], totalCount: 1 } as any,
      records: {}
    };

    const next = upsertListCacheRowPure({
      prev,
      update: {
        recordId: 'new1',
        values: { name: 'Alice', age: 30 },
        createdAt: 't0',
        status: 'Draft'
      },
      definition,
      formKey: 'f',
      language: 'en'
    });

    expect(next.records.new1).toBeDefined();
    expect(next.records.new1.values).toMatchObject({ name: 'Alice', age: 30 });
    expect(next.response?.items?.[0]).toMatchObject({ id: 'new1', name: 'Alice', age: 30, status: 'Draft' });
    expect(next.response?.items?.length).toBe(2);
    expect(next.response?.totalCount).toBe(2);
  });

  it('returns previous state when recordId is empty', () => {
    const prev = { ...blankState };
    const next = upsertListCacheRowPure({
      prev,
      update: { recordId: '' },
      definition: baseDefinition,
      formKey: 'f',
      language: 'en'
    });
    expect(next).toBe(prev);
  });
});

describe('removeListCacheRowPure', () => {
  it('removes the record snapshot and list row when present', () => {
    const prev: ListCacheState = {
      response: {
        items: [
          { id: 'r1', name: 'Row 1' },
          { id: 'r2', name: 'Row 2' }
        ],
        totalCount: 2
      } as any,
      records: {
        r1: { id: 'r1', values: { name: 'Row 1' } } as any,
        r2: { id: 'r2', values: { name: 'Row 2' } } as any
      }
    };

    const next = removeListCacheRowPure({
      prev,
      remove: { recordId: 'r1' }
    });

    expect(next.records.r1).toBeUndefined();
    expect(next.records.r2).toBeDefined();
    expect(next.response?.items?.map((row: any) => row.id)).toEqual(['r2']);
    expect(next.response?.totalCount).toBe(1);
  });

  it('returns previous state when nothing matches', () => {
    const prev: ListCacheState = {
      response: {
        items: [{ id: 'r1', name: 'Row 1' }],
        totalCount: 1
      } as any,
      records: {
        r1: { id: 'r1', values: { name: 'Row 1' } } as any
      }
    };

    const next = removeListCacheRowPure({
      prev,
      remove: { recordId: 'missing' }
    });

    expect(next).toBe(prev);
  });
});
