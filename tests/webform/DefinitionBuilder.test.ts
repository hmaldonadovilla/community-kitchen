import '../mocks/GoogleAppsScript';
import { DefinitionBuilder } from '../../src/services/webform/definitionBuilder';
import { Dashboard } from '../../src/config/Dashboard';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

describe('DefinitionBuilder', () => {
  let ss: MockSpreadsheet;
  let builder: DefinitionBuilder;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-en' },
      emailTemplateId: { EN: 'email-en' },
      statusTransitions: { onEmail: 'Sent' },
      listView: {
        title: { en: 'Pantry Records' },
        headerSortEnabled: false,
        hideHeaderRow: true,
        rowClickEnabled: false,
        legendColumns: 2,
        legendColumnWidths: [25, 75],
        view: { mode: 'cards', toggleEnabled: true, defaultMode: 'cards' },
        search: { mode: 'advanced', fields: ['Q1', 'status'] },
        metric: {
          label: { en: 'portions delivered' },
          groupId: 'MP_MEALS_REQUEST',
          fieldId: 'FINAL_QTY',
          when: { fieldId: 'status', equals: 'Closed' },
          maximumFractionDigits: 0
        },
        columns: [{ type: 'rule', fieldId: 'action', label: { en: 'Action' }, showIn: 'cards', cases: [{ text: 'Edit' }] }]
      },
      listViewMetaColumns: ['createdAt', 'status'],
      listViewLegend: [{ icon: 'warning', text: { en: 'Needs attention' } }],
      createButtonLabel: { EN: 'New' },
      copyCurrentRecordLabel: { EN: 'Duplicate' },
      copyCurrentRecordDropFields: ['Q1'],
      copyCurrentRecordProfile: {
        values: ['Q1'],
        lineItems: [{ groupId: 'LINE_ITEMS', fields: ['A', 'B'] }]
      },
      copyCurrentRecordDialog: {
        title: { EN: 'Copying record' },
        message: { EN: 'Copied into a new draft.' },
        confirmLabel: { EN: 'OK' }
      },
      submissionConfirmationTitle: { EN: 'Confirm submission' },
      submissionConfirmationMessage: { EN: 'Ready to submit?' },
      submissionConfirmationConfirmLabel: { EN: 'Yes, submit' },
      submissionConfirmationCancelLabel: { EN: 'Not yet' },
      dedupDialog: {
        title: { EN: 'No duplicates allowed' },
        intro: { EN: 'Record already exists for:' },
        outro: { EN: 'What would you like to do?' },
        changeLabel: { EN: 'Change details' },
        cancelLabel: { EN: 'Cancel' },
        openLabel: { EN: 'Open existing' }
      },
      languages: ['EN', 'FR', 'NL'],
      defaultLanguage: 'FR',
      languageSelectorEnabled: false,
      createRecordPresetButtonsEnabled: false,
      actionBars: {
        system: {
          home: {
            hideWhenActive: true,
            dedupIncompleteDialog: {
              enabled: true,
              message: { EN: 'Dedup incomplete.' },
              confirmLabel: { EN: 'Continue and delete the record' },
              cancelLabel: { EN: 'Cancel and continue editing' },
              deleteRecordOnConfirm: true
            }
          }
        }
      },
      dedupDeleteOnKeyChange: true,
      fieldDisableRules: [
        {
          id: 'future-date-lock',
          when: { fieldId: 'DATE', isInFuture: true },
          bypassFields: ['COOK']
        }
      ]
    });
    dashboardSheet?.setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Pantry Form', 'Config: Pantry', 'Pantry Responses', 'Desc', '', '', '', followupJson]
    ]);

    const configSheet = ss.insertSheet('Config: Pantry');
    configSheet.setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['Q2', 'FILE_UPLOAD', 'Receipt', 'Reçu', 'Bon', false, '', '', '', 'Active', '{"maxFiles":1}', '', '', '', '']
    ]);

    const dedupSheet = ss.insertSheet('Config: Pantry Dedup');
    dedupSheet.setMockData([
      ['ID', 'Scope', 'Keys', 'Match Mode', 'On Conflict', 'Message'],
      ['rule-1', 'form', 'Q1', 'exact', 'reject', 'Duplicate name']
    ]);

    builder = new DefinitionBuilder(ss as any, new Dashboard(ss as any));
  });

  test('buildDefinition includes dedup rules and list view config', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.dedupRules?.[0]?.id).toBe('rule-1');
    expect(def.listView?.columns.map(col => col.fieldId)).toContain('Q1');
    expect(def.listView?.legend).toEqual([{ icon: 'warning', text: { en: 'Needs attention' } }]);
    expect(def.listView?.title).toEqual({ en: 'Pantry Records' });
    expect(def.listView?.headerSortEnabled).toBe(false);
    expect((def.listView as any)?.hideHeaderRow).toBe(true);
    expect((def.listView as any)?.rowClickEnabled).toBe(false);
    expect((def.listView as any)?.legendColumns).toBe(2);
    expect((def.listView as any)?.legendColumnWidths).toEqual([25, 75]);
    expect(def.listView?.view).toEqual({ mode: 'cards', toggleEnabled: true, defaultMode: 'cards' });
    expect(def.listView?.search).toEqual({ mode: 'advanced', fields: ['Q1', 'status'] });
    expect((def.listView as any)?.metric).toEqual({
      label: { en: 'portions delivered' },
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'FINAL_QTY',
      when: { fieldId: 'status', equals: 'Closed' },
      maximumFractionDigits: 0
    });
    expect(def.fieldDisableRules).toEqual([
      {
        id: 'future-date-lock',
        when: { fieldId: 'DATE', isInFuture: true },
        bypassFields: ['COOK']
      }
    ]);
    const action = (def.listView?.columns || []).find(c => (c as any).type === 'rule' && (c as any).fieldId === 'action') as any;
    expect(action?.showIn).toEqual(['cards']);
    expect(def.createButtonLabel).toEqual({ en: 'New' });
    expect(def.copyCurrentRecordLabel).toEqual({ en: 'Duplicate' });
    expect(def.copyCurrentRecordDropFields).toEqual(['Q1']);
    expect(def.copyCurrentRecordProfile).toEqual({
      values: ['Q1'],
      lineItems: [{ groupId: 'LINE_ITEMS', fields: ['A', 'B'] }]
    });
    expect(def.copyCurrentRecordDialog).toEqual({
      title: { en: 'Copying record' },
      message: { en: 'Copied into a new draft.' },
      confirmLabel: { en: 'OK' }
    });
    expect(def.dedupDialog).toEqual({
      title: { en: 'No duplicates allowed' },
      intro: { en: 'Record already exists for:' },
      outro: { en: 'What would you like to do?' },
      changeLabel: { en: 'Change details' },
      cancelLabel: { en: 'Cancel' },
      openLabel: { en: 'Open existing' }
    });
    const metaColumns = (def.listView?.columns || [])
      .filter((col): col is { fieldId: string; kind: 'meta' } => (col as any).kind === 'meta')
      .map(col => col.fieldId);
    expect(metaColumns).toEqual(['createdAt', 'status']);
  });

  test('buildDefinition respects language config from the dashboard', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.defaultLanguage).toBe('FR');
    expect(def.languageSelectorEnabled).toBe(false);
    // When language selector is disabled, the web app should only expose the default language.
    expect(def.languages).toEqual(['FR']);
  });

  test('buildDefinition includes action bar config and button feature flags from the dashboard', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.createRecordPresetButtonsEnabled).toBe(false);
    expect(def.actionBars?.system?.home?.hideWhenActive).toBe(true);
    expect((def.actionBars as any)?.system?.home?.dedupIncompleteDialog).toEqual({
      enabled: true,
      message: { en: 'Dedup incomplete.' },
      confirmLabel: { en: 'Continue and delete the record' },
      cancelLabel: { en: 'Cancel and continue editing' },
      deleteRecordOnConfirm: true
    });
    expect(def.dedupDeleteOnKeyChange).toBe(true);
  });

  test('buildDefinition includes submission confirmation button label overrides from the dashboard', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.submissionConfirmationConfirmLabel).toEqual({ en: 'Yes, submit' });
    expect(def.submissionConfirmationCancelLabel).toEqual({ en: 'Not yet' });
  });

  test('buildDefinitionFromConfig tolerates bundled questions without options arrays', () => {
    const form: any = {
      title: 'Bundled Ingredients',
      configSheet: 'Config: Ingredients Management',
      destinationTab: 'Ingredients Data'
    };
    const questions: any[] = [
      {
        id: 'CREATED_BY',
        type: 'TEXT',
        qEn: 'Created by',
        qFr: 'Cree par',
        qNl: 'Gemaakt door',
        required: true,
        status: 'Active'
      },
      {
        id: 'CATEGORY',
        type: 'CHOICE',
        qEn: 'Category',
        qFr: 'Categorie',
        qNl: 'Categorie',
        options: ['Dairy'],
        required: true,
        status: 'Active'
      }
    ];

    const def = builder.buildDefinitionFromConfig(form, questions, []);
    expect(def.questions).toHaveLength(2);
    expect(def.questions[0].options).toBeUndefined();
    expect(def.questions[1].options).toEqual({
      en: ['Dairy'],
      fr: [],
      nl: [],
      raw: undefined
    });
  });

  test('buildDefinitionFromConfig resolves optionMapRef dynamically for line item fields', () => {
    const ingredientsSheet = ss.insertSheet('Ingredients Data');
    ingredientsSheet.setMockData([
      [
        'Language',
        'Ingredient name [INGREDIENT_NAME]',
        'Category [CATEGORY]',
        'Allowed unit [ALLOWED_UNIT]',
        'Dietary applicability [DIETARY_APPLICABILITY]',
        'Supplier [SUPPLIER]',
        'Allergen [ALLERGEN]'
      ],
      ['EN', 'Tomato', 'Fresh vegetables', 'kg, gr', 'Vegan, Vegetarian', 'Freshmed', 'None'],
      ['EN', 'Cheese', 'Dairy', 'kg, gr', 'Vegetarian', 'VDS', 'Milk']
    ]);

    const form: any = {
      title: 'Bundled Recipes',
      configSheet: 'Config: Recipes',
      destinationTab: 'Recipes Data'
    };
    const questions: any[] = [
      {
        id: 'RCP_INGREDIENTS',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Ingredients',
        qFr: 'Ingrédients',
        qNl: 'Ingrediënten',
        required: false,
        status: 'Active',
        lineItemConfig: {
          fields: [
            {
              id: 'ING',
              type: 'CHOICE',
              labelEn: 'Ingredient',
              labelFr: 'Ingrédient',
              labelNl: 'Ingrediënt',
              required: true,
              dataSource: {
                id: 'Ingredients Data',
                mode: 'options',
                projection: ['INGREDIENT_NAME', 'DIETARY_APPLICABILITY'],
                statusAllowList: ['Active']
              },
              optionFilter: {
                dependsOn: 'DISH_TYPE',
                optionMapRef: {
                  ref: 'REF:Ingredients Data',
                  keyColumn: 'DIETARY_APPLICABILITY',
                  lookupColumn: 'INGREDIENT_NAME',
                  splitKey: true
                }
              }
            },
            {
              id: 'UNIT',
              type: 'CHOICE',
              labelEn: 'Unit',
              labelFr: 'Unité',
              labelNl: 'Eenheid',
              required: true,
              optionFilter: {
                dependsOn: 'ING',
                optionMapRef: {
                  ref: 'REF:Ingredients Data',
                  keyColumn: 'INGREDIENT_NAME',
                  lookupColumn: 'ALLOWED_UNIT'
                }
              }
            },
            {
              id: 'CAT',
              type: 'TEXT',
              labelEn: 'Category',
              labelFr: 'Catégorie',
              labelNl: 'Categorie',
              required: false,
              valueMap: {
                dependsOn: 'ING',
                optionMapRef: {
                  ref: 'REF:Ingredients Data',
                  keyColumn: 'INGREDIENT_NAME',
                  lookupColumn: 'CATEGORY'
                }
              }
            }
          ]
        }
      }
    ];

    const def = builder.buildDefinitionFromConfig(form, questions, []);
    const lineItemFields = (def.questions[0] as any).lineItemConfig?.fields || [];
    const ingField = lineItemFields.find((f: any) => f.id === 'ING');
    const unitField = lineItemFields.find((f: any) => f.id === 'UNIT');
    const catField = lineItemFields.find((f: any) => f.id === 'CAT');

    expect(ingField.optionFilter.optionMap.Vegan).toEqual(['Tomato']);
    expect(ingField.optionFilter.optionMap.Vegetarian).toEqual(['Tomato', 'Cheese']);
    expect(unitField.optionFilter.optionMap.Tomato).toEqual(['kg', 'gr']);
    expect(catField.valueMap.optionMap.Cheese).toEqual(['Dairy']);
  });
});
