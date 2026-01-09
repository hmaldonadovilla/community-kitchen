import { buildPageSectionBlocks } from '../src/web/react/components/form/grouping';

describe('buildPageSectionBlocks', () => {
  test('groups consecutive groups by pageSectionKey and preserves order', () => {
    const groups = [
      { key: 'a', pageSectionKey: 'title:Storage', pageSectionTitle: 'Storage', pageSectionInfoText: 'Beginning', isHeader: false },
      { key: 'b', pageSectionKey: 'title:Storage', pageSectionTitle: 'Storage', pageSectionInfoText: '', isHeader: false },
      { key: 'c', pageSectionKey: '__none__', pageSectionTitle: '', pageSectionInfoText: '', isHeader: false },
      { key: 'd', pageSectionKey: 'title:Storage', pageSectionTitle: 'Storage', pageSectionInfoText: '', isHeader: false },
      { key: 'e', pageSectionKey: 'title:Cleaning', pageSectionTitle: 'Cleaning', pageSectionInfoText: 'End of shift', isHeader: false },
      { key: 'f', pageSectionKey: 'title:Cleaning', pageSectionTitle: 'Cleaning', pageSectionInfoText: '', isHeader: false }
    ];

    const blocks = buildPageSectionBlocks(groups as any);
    expect(blocks.map((b: any) => b.kind)).toEqual(['pageSection', 'group', 'pageSection', 'pageSection']);

    expect((blocks[0] as any).kind).toBe('pageSection');
    expect((blocks[0] as any).key).toBe('title:Storage');
    expect((blocks[0] as any).title).toBe('Storage');
    expect((blocks[0] as any).infoText).toBe('Beginning');
    expect(((blocks[0] as any).groups || []).map((g: any) => g.key)).toEqual(['a', 'b']);

    expect((blocks[1] as any).kind).toBe('group');
    expect((blocks[1] as any).group.key).toBe('c');

    expect((blocks[2] as any).kind).toBe('pageSection');
    expect((blocks[2] as any).key).toBe('title:Storage');
    expect(((blocks[2] as any).groups || []).map((g: any) => g.key)).toEqual(['d']);

    expect((blocks[3] as any).kind).toBe('pageSection');
    expect((blocks[3] as any).key).toBe('title:Cleaning');
    expect((blocks[3] as any).title).toBe('Cleaning');
    expect((blocks[3] as any).infoText).toBe('End of shift');
    expect(((blocks[3] as any).groups || []).map((g: any) => g.key)).toEqual(['e', 'f']);
  });

  test('does not wrap header groups', () => {
    const groups = [
      { key: 'h', pageSectionKey: 'title:Storage', pageSectionTitle: 'Storage', isHeader: true },
      { key: 'a', pageSectionKey: 'title:Storage', pageSectionTitle: 'Storage', isHeader: false }
    ];

    const blocks = buildPageSectionBlocks(groups as any);
    expect(blocks.map((b: any) => b.kind)).toEqual(['group', 'pageSection']);
    expect((blocks[0] as any).group.key).toBe('h');
    expect(((blocks[1] as any).groups || []).map((g: any) => g.key)).toEqual(['a']);
  });
});

