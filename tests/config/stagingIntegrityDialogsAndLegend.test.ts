import fs from 'fs';
import path from 'path';

const STAGING_CONFIG_DIR = path.resolve(__dirname, '../../docs/config/exports/staging');

const readConfig = (fileName: string): any => {
  const filePath = path.join(STAGING_CONFIG_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const findQuestion = (questions: any[], id: string): any => {
  const question = (questions || []).find(entry => entry?.id === id);
  if (!question) throw new Error(`Missing question ${id}`);
  return question;
};

describe('staging integrity dialogs and list legend config', () => {
  test('recipes list legend exposes edit/view/copy icons in 2 columns', () => {
    const cfg = readConfig('config_recipes.json');
    const expectedLegend = [
      { icon: 'edit', text: { en: 'Edit', fr: 'Modifier', nl: 'Bewerken' } },
      { icon: 'view', text: { en: 'View', fr: 'Voir', nl: 'Bekijken' } },
      { icon: 'copy', text: { en: 'Copy', fr: 'Copier', nl: 'Kopieren' } }
    ];

    expect(cfg.form?.listViewLegend).toEqual(expectedLegend);
    expect(cfg.form?.listViewLegendColumns).toBe(2);
    expect(cfg.definition?.listView?.legend).toEqual(expectedLegend);
    expect(cfg.definition?.listView?.legendColumns).toBe(2);

    const formActionCases = cfg.form?.listViewColumns?.find((col: any) => col?.fieldId === 'action')?.cases || [];
    const defActionCases = cfg.definition?.listView?.columns?.find((col: any) => col?.fieldId === 'action')?.cases || [];
    expect(formActionCases.find((entry: any) => entry?.text?.en === 'View')?.icon).toBe('view');
    expect(defActionCases.find((entry: any) => entry?.text?.en === 'View')?.icon).toBe('view');
  });

  test('meal production uses required data integrity dialogs', () => {
    const cfg = readConfig('config_meal_production.json');
    const expectedHomeMessage =
      'A meal production record can only exist when customer, production date, and service are all filled in.\n\n' +
      'Leaving this page now will permanently delete this record and all data and photos already entered.\n\n' +
      'This action cannot be undone.';
    const expectedChangeCustomerMessage =
      'Changing the customer will permanently delete production date and service as well as any data or photos you may have entered after service.\n\n' +
      'A meal production record can only exist when customer, production date, and service are all filled in.\n\n' +
      'If you wish to proceed with the change, make sure you enter the production date and the service before leaving the page otherwise the record will be permanently deleted.\n\n' +
      'This action cannot be undone.';
    const expectedChangeProductionDateMessage =
      'Changing the production date will permanently delete service as well as any data or photos entered after service.\n\n' +
      'A meal production record can only exist when customer, production date, and service are all filled in.\n\n' +
      'If you wish to proceed with the change, make sure you enter the service before leaving the page otherwise the record will be permanently deleted.\n\n' +
      'This action cannot be undone.';

    const assertMainHomeDialog = (root: any) => {
      const dialog = root?.actionBars?.system?.home?.dedupIncompleteDialog;
      expect(dialog?.enabled).toBe(true);
      expect(dialog?.title?.en).toBe('Incomplete meal production record');
      expect(dialog?.message?.en).toBe(expectedHomeMessage);
      expect(dialog?.confirmLabel?.en).toBe('Continue — Delete the record');
      expect(dialog?.cancelLabel?.en).toBe('Cancel — Continue editing');
      expect(dialog?.showCancel).toBe(true);
      expect(dialog?.showCloseButton).toBe(false);
      expect(dialog?.dismissOnBackdrop).toBe(false);
      expect(dialog?.deleteRecordOnConfirm).toBe(true);
    };

    const assertChangeDialogs = (questions: any[]) => {
      const customer = findQuestion(questions, 'MP_DISTRIBUTOR');
      expect(customer?.changeDialog?.when).toEqual({ fieldId: 'MP_PREP_DATE', notEmpty: true });
      expect(customer?.changeDialog?.title?.en).toBe('Change Customer');
      expect(customer?.changeDialog?.message?.en).toBe(expectedChangeCustomerMessage);
      expect(customer?.changeDialog?.confirmLabel?.en).toBe('Continue and delete subsequent data.');
      expect(customer?.changeDialog?.cancelLabel?.en).toBe('Cancel and keep current customer');

      const prepDate = findQuestion(questions, 'MP_PREP_DATE');
      expect(prepDate?.changeDialog?.when).toEqual({
        all: [
          { fieldId: 'MP_SERVICE', notEmpty: true },
          { fieldId: 'MP_PREP_DATE', isInFuture: true }
        ]
      });
      expect(prepDate?.changeDialog?.title?.en).toBe('Change Production date');
      expect(prepDate?.changeDialog?.message?.en).toBe(expectedChangeProductionDateMessage);
      expect(prepDate?.changeDialog?.confirmLabel?.en).toBe('Continue and delete subsequent data.');
      expect(prepDate?.changeDialog?.cancelLabel?.en).toBe('Cancel and keep current production date');
    };

    assertMainHomeDialog(cfg.form);
    assertMainHomeDialog(cfg.definition);
    assertChangeDialogs(cfg.questions);
    assertChangeDialogs(cfg.definition?.questions || []);
  });
});
