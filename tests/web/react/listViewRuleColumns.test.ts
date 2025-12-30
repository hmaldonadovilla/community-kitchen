import { collectListViewRuleColumnDependencies, evaluateListViewRuleColumnCell } from '../../../src/web/react/app/listViewRuleColumns';

describe('listViewRuleColumns', () => {
  const actionColumn: any = {
    type: 'rule',
    fieldId: 'action',
    label: { en: 'Action' },
    openView: 'form',
    hrefFieldId: 'pdfUrl',
    cases: [
      {
        when: { all: [{ fieldId: 'status', notEquals: 'Closed' }, { fieldId: 'DATE', isNotToday: true }] },
        text: 'Missing',
        style: 'warning',
        icon: 'warning'
      },
      { when: { fieldId: 'status', notEquals: 'Closed' }, text: 'Edit', style: 'link' },
      { when: { fieldId: 'status', equals: 'Closed' }, text: 'View', style: 'link' }
    ]
  };

  it('collects dependencies from nested when conditions', () => {
    const deps = collectListViewRuleColumnDependencies(actionColumn);
    expect(deps.sort()).toEqual(['DATE', 'status', 'pdfUrl'].sort());
  });

  it('returns Missing when date is not today and status is not closed', () => {
    const now = new Date(2025, 11, 30); // 2025-12-30 (local)
    const row = { status: 'In progress', DATE: '2025-12-29' };
    const cell = evaluateListViewRuleColumnCell(actionColumn, row as any, { now });
    expect(cell?.text).toBe('Missing');
    expect(cell?.style).toBe('warning');
    expect(cell?.icon).toBe('warning');
  });

  it('returns Edit when date is today and status is not closed', () => {
    const now = new Date(2025, 11, 30); // 2025-12-30 (local)
    const row = { status: 'In progress', DATE: '2025-12-30' };
    const cell = evaluateListViewRuleColumnCell(actionColumn, row as any, { now });
    expect(cell?.text).toBe('Edit');
    expect(cell?.style).toBe('link');
    expect(cell?.hrefFieldId).toBe('pdfUrl');
  });

  it('returns View when status is closed (case-insensitive)', () => {
    const now = new Date(2025, 11, 30); // 2025-12-30 (local)
    const row = { status: 'CLOSED', DATE: '2025-12-29' };
    const cell = evaluateListViewRuleColumnCell(actionColumn, row as any, { now });
    expect(cell?.text).toBe('View');
    expect(cell?.style).toBe('link');
  });
});


