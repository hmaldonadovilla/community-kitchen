import { WebFormDefinition } from '../../../src/web/types';
import {
  buildFormDefinitionCacheKey,
  readCachedFormDefinition,
  writeCachedFormDefinition,
  StorageLike
} from '../../../src/web/data/formDefinitionCache';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }
}

describe('formDefinitionCache', () => {
  test('buildFormDefinitionCacheKey is stable', () => {
    expect(buildFormDefinitionCacheKey('Config: Meal', 'v123')).toBe('ck.formDef.v1::v123::Config: Meal');
  });

  test('read/write cached form definition', () => {
    const storage = new MemoryStorage();
    const definition: WebFormDefinition = { title: 'Meal Production', questions: [] } as any;

    writeCachedFormDefinition({ storage, formKey: 'Config: Meal', cacheVersion: 'v1', definition });
    const res = readCachedFormDefinition({ storage, formKey: 'Config: Meal', cacheVersion: 'v1' });
    expect(res?.title).toBe('Meal Production');
  });

  test('invalid JSON evicts cache entry', () => {
    const storage = new MemoryStorage();
    const key = buildFormDefinitionCacheKey('Config: Meal', 'v1');
    storage.setItem(key, '{not-json');
    const res = readCachedFormDefinition({ storage, formKey: 'Config: Meal', cacheVersion: 'v1' });
    expect(res).toBeNull();
    expect(storage.has(key)).toBe(false);
  });
});

