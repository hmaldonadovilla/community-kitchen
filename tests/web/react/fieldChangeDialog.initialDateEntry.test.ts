import {
  finalizeInitialDateChangeDialogEntry,
  shouldSuppressInitialDateChangeDialog
} from '../../../src/web/react/app/fieldChangeDialog';

describe('initial DATE change-dialog guard', () => {
  it('suppresses DATE dialog during first empty->value entry when baseline is empty', () => {
    const inProgress: Record<string, boolean> = {};
    const completed: Record<string, boolean> = {};

    const firstChange = shouldSuppressInitialDateChangeDialog({
      scope: 'top',
      fieldType: 'DATE',
      fieldPath: 'MP_PREP_DATE',
      fieldId: 'MP_PREP_DATE',
      prevValue: '',
      nextValue: '2026-02-09',
      baselineValues: { MP_PREP_DATE: '' } as any,
      initialEntryInProgressByFieldPath: inProgress,
      initialEntryCompletedByFieldPath: completed
    });
    expect(firstChange).toBe(true);

    const secondChange = shouldSuppressInitialDateChangeDialog({
      scope: 'top',
      fieldType: 'DATE',
      fieldPath: 'MP_PREP_DATE',
      fieldId: 'MP_PREP_DATE',
      prevValue: '2026-02-09',
      nextValue: '2026-02-10',
      baselineValues: { MP_PREP_DATE: '' } as any,
      initialEntryInProgressByFieldPath: inProgress,
      initialEntryCompletedByFieldPath: completed
    });
    expect(secondChange).toBe(true);

    expect(
      finalizeInitialDateChangeDialogEntry({
        fieldPath: 'MP_PREP_DATE',
        initialEntryInProgressByFieldPath: inProgress,
        initialEntryCompletedByFieldPath: completed
      })
    ).toBe(true);

    const afterBlur = shouldSuppressInitialDateChangeDialog({
      scope: 'top',
      fieldType: 'DATE',
      fieldPath: 'MP_PREP_DATE',
      fieldId: 'MP_PREP_DATE',
      prevValue: '2026-02-10',
      nextValue: '2026-02-11',
      baselineValues: { MP_PREP_DATE: '' } as any,
      initialEntryInProgressByFieldPath: inProgress,
      initialEntryCompletedByFieldPath: completed
    });
    expect(afterBlur).toBe(false);
  });

  it('does not suppress when baseline already has a value', () => {
    const inProgress: Record<string, boolean> = {};
    const completed: Record<string, boolean> = {};

    const suppress = shouldSuppressInitialDateChangeDialog({
      scope: 'top',
      fieldType: 'DATE',
      fieldPath: 'MP_PREP_DATE',
      fieldId: 'MP_PREP_DATE',
      prevValue: '2026-02-09',
      nextValue: '2026-02-10',
      baselineValues: { MP_PREP_DATE: '2026-02-09' } as any,
      initialEntryInProgressByFieldPath: inProgress,
      initialEntryCompletedByFieldPath: completed
    });

    expect(suppress).toBe(false);
  });

  it('does not suppress for non-top or non-date fields', () => {
    const inProgress: Record<string, boolean> = {};
    const completed: Record<string, boolean> = {};

    expect(
      shouldSuppressInitialDateChangeDialog({
        scope: 'line',
        fieldType: 'DATE',
        fieldPath: 'GROUP__DATE__row1',
        fieldId: 'DATE',
        prevValue: '2026-02-09',
        nextValue: '2026-02-10',
        baselineValues: { DATE: '' } as any,
        initialEntryInProgressByFieldPath: inProgress,
        initialEntryCompletedByFieldPath: completed
      })
    ).toBe(false);

    expect(
      shouldSuppressInitialDateChangeDialog({
        scope: 'top',
        fieldType: 'TEXT',
        fieldPath: 'NAME',
        fieldId: 'NAME',
        prevValue: 'A',
        nextValue: 'B',
        baselineValues: { NAME: '' } as any,
        initialEntryInProgressByFieldPath: inProgress,
        initialEntryCompletedByFieldPath: completed
      })
    ).toBe(false);
  });
});
