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

  it('supports per-case openView overrides and rowClick inheritance from the column', () => {
    const col: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      openView: { target: 'form', rowClick: true },
      cases: [
        { when: { fieldId: 'status', equals: 'Closed' }, text: 'View', style: 'link', openView: 'summary' },
        { when: { fieldId: 'status', notEquals: 'Closed' }, text: 'Edit', style: 'link' }
      ]
    };
    const now = new Date(2025, 11, 30);

    const closed = evaluateListViewRuleColumnCell(col, { status: 'Closed' } as any, { now });
    expect(closed?.openView).toBe('summary');
    expect(closed?.rowClick).toBe(true);

    const open = evaluateListViewRuleColumnCell(col, { status: 'In progress' } as any, { now });
    expect(open?.openView).toBe('form');
    expect(open?.rowClick).toBe(true);
  });

  it('supports per-case button openView with per-case openButtonId', () => {
    const col: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      cases: [{ text: 'Preview', openView: 'button', openButtonId: '__ckQIdx=2' }]
    };
    const cell = evaluateListViewRuleColumnCell(col, { status: 'Anything' } as any);
    expect(cell?.openView).toBe('button');
    expect(cell?.openButtonId).toBe('__ckQIdx=2');
  });

  it('supports copy/submit openView targets', () => {
    const colCopy: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      cases: [{ text: 'Copy', openView: 'copy' }]
    };
    const copy = evaluateListViewRuleColumnCell(colCopy, { status: 'Anything' } as any);
    expect(copy?.openView).toBe('copy');

    const colSubmit: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      cases: [{ text: 'Submit', openView: 'submit' }]
    };
    const submit = evaluateListViewRuleColumnCell(colSubmit, { status: 'Anything' } as any);
    expect(submit?.openView).toBe('submit');
  });

  it('supports inline actions rendered from a single rule case', () => {
    const col: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      openView: 'summary',
      cases: [
        {
          when: { fieldId: 'status', equals: 'Closed' },
          text: 'Actions',
          hideText: true,
          actions: [
            { text: 'View', hideText: true, icon: 'view', openView: 'summary' },
            { text: 'Copy', hideText: true, icon: 'copy', openView: 'copy' }
          ]
        }
      ]
    };
    const cell = evaluateListViewRuleColumnCell(col, { status: 'Closed' } as any);
    expect(cell?.hideText).toBe(true);
    expect(Array.isArray(cell?.actions)).toBe(true);
    expect(cell?.actions?.length).toBe(2);
    expect(cell?.actions?.[0]?.openView).toBe('summary');
    expect(cell?.actions?.[1]?.openView).toBe('copy');
    expect(cell?.actions?.[1]?.icon).toBe('copy');
  });

  it('collects href dependencies from inline actions', () => {
    const col: any = {
      type: 'rule',
      fieldId: 'action',
      label: { en: 'Action' },
      cases: [
        {
          text: 'Actions',
          actions: [
            { text: 'View', icon: 'view', hrefFieldId: 'pdfUrl' },
            { text: 'Copy', icon: 'copy' }
          ]
        }
      ],
      default: {
        text: 'Fallback',
        actions: [{ text: 'Open', icon: 'view', hrefFieldId: 'altUrl' }]
      }
    };
    const deps = collectListViewRuleColumnDependencies(col);
    expect(deps.sort()).toEqual(['pdfUrl', 'altUrl'].sort());
  });
});

