import './mocks/GoogleAppsScript';
import { ConfigSheet } from '../src/config/ConfigSheet';
import { MockSpreadsheet, MockSheet } from './mocks/GoogleAppsScript';

describe('ConfigSheet', () => {
  let mockSS: MockSpreadsheet;

  beforeEach(() => {
    mockSS = new MockSpreadsheet();
  });

  test('getQuestions reads data and ensures IDs', () => {
    const sheet = mockSS.insertSheet('Config: Test');
    // Mock data with IDs (new format with 11 columns)
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', ''],
      ['Q2', 'DATE', 'Date', 'Date', 'Datum', false, '', '', '', 'Active', '', '', '', '']
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Test');
    
    expect(questions).toBeDefined();
    expect(questions.length).toBe(2);
    expect(questions[0].qNl).toBe('Naam');
    expect(questions[0].required).toBe(true);
    expect(questions[0].options).toEqual([]);
  });

  test('getQuestions preserves ui.summaryVisibility', () => {
    const sheet = mockSS.insertSheet('Config: SummaryVisibility');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q1', 'TEXT', 'ID', 'ID', 'ID', false, '', '', '', 'Active', '{"ui":{"summaryVisibility":"always"}}', '', '', '']
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: SummaryVisibility');
    expect(questions.length).toBe(1);
    expect(questions[0].ui).toEqual({ summaryVisibility: 'always' });
  });

  test('getQuestions preserves ui.hideLabel', () => {
    const sheet = mockSS.insertSheet('Config: HideLabel');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q1', 'TEXT', 'ID', 'ID', 'ID', false, '', '', '', 'Active', '{"ui":{"hideLabel":true}}', '', '', '']
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: HideLabel');
    expect(questions.length).toBe(1);
    expect(questions[0].ui).toEqual({ hideLabel: true });
  });

  test('getQuestions preserves ui.helperText and ui.helperPlacement', () => {
    const sheet = mockSS.insertSheet('Config: HelperText');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q1',
        'TEXT',
        'Created by',
        'Created by',
        'Created by',
        false,
        '',
        '',
        '',
        'Active',
        '{"ui":{"helperText":{"en":"Enter a name"},"helperPlacement":"input control"}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: HelperText');
    expect(questions.length).toBe(1);
    expect(questions[0].ui).toEqual({ helperText: { en: 'Enter a name' }, helperPlacement: 'placeholder' });
  });

  test('getQuestions preserves ui.helperTextBelowLabel and ui.helperTextPlaceholder', () => {
    const sheet = mockSS.insertSheet('Config: DualHelperText');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q1',
        'TEXT',
        'Ingredient name',
        'Ingredient name',
        'Ingredient name',
        false,
        '',
        '',
        '',
        'Active',
        '{"ui":{"helperTextBelowLabel":{"en":"Name must be minimum 2 characters"},"helperTextPlaceholder":{"en":"Enter the ingredient name"}}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: DualHelperText');
    expect(questions.length).toBe(1);
    expect(questions[0].ui).toEqual({
      helperTextBelowLabel: { en: 'Name must be minimum 2 characters' },
      helperTextPlaceholder: { en: 'Enter the ingredient name' }
    });
  });

  test('getQuestions parses changeDialog.cancelAction', () => {
    const sheet = mockSS.insertSheet('Config: ChangeDialogCancelAction');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'DATE',
        'DATE',
        'Date',
        'Date',
        'Datum',
        true,
        '',
        '',
        '',
        'Active',
        '{"changeDialog":{"when":{"fieldId":"DATE","isInFuture":true},"cancelAction":"discardDraftAndGoHome"}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: ChangeDialogCancelAction');
    expect(questions.length).toBe(1);
    expect((questions[0].changeDialog as any)?.cancelAction).toBe('discardDraftAndGoHome');
  });

  test('getQuestions preserves selectionEffects.id (for __ckSelectionEffectId tagging)', () => {
    const sheet = mockSS.insertSheet('Config: SelectionEffectsId');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q1',
        'CHOICE',
        'Trigger',
        'Trigger',
        'Trigger',
        false,
        'Yes,No',
        'Yes,No',
        'Yes,No',
        'Active',
        `{
          "selectionEffects": [
            { "id": "leftover", "type": "addLineItems", "groupId": "LINES", "preset": { "ITEM": "Apple" } }
          ]
        }`,
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: SelectionEffectsId');
    expect(questions.length).toBe(1);
    expect(questions[0].selectionEffects).toBeDefined();
    expect((questions[0].selectionEffects as any)?.[0]?.id).toBe('leftover');
  });

  test('getQuestions parses group.pageSection (visual page sections in edit view)', () => {
    const sheet = mockSS.insertSheet('Config: PageSections');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q1',
        'TEXT',
        'Temp',
        'Temp',
        'Temp',
        false,
        '',
        '',
        '',
        'Active',
        '{"group":{"id":"freezers","title":"Freezers","pageSection":{"id":"storage","title":"Storage","infoText":"These checks are done at the beginning of the shift."}}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: PageSections');
    expect(questions.length).toBe(1);
    expect(questions[0].group).toEqual(
      expect.objectContaining({
        id: 'freezers',
        title: 'Freezers',
        pageSection: {
          id: 'storage',
          title: 'Storage',
          infoText: 'These checks are done at the beginning of the shift.'
        }
      })
    );
  });

  test('getQuestions parses line item ui controls (showItemPill, addButtonPlacement)', () => {
    const sheet = mockSS.insertSheet('Config: LineItemUiControls');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q_LI',
        'LINE_ITEM_GROUP',
        'Meals',
        'Repas',
        'Maaltijden',
        false,
        '',
        '',
        '',
        'Active',
        '{"fields":[{"id":"QTY","type":"NUMBER","labelEn":"Qty"}],"ui":{"mode":"progressive","showItemPill":false,"addButtonPlacement":"bottom","allowRemoveAutoRows":false,"saveDisabledRows":true}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: LineItemUiControls');
    expect(questions.length).toBe(1);
    expect(questions[0].lineItemConfig).toBeDefined();
    expect(questions[0].lineItemConfig!.ui).toEqual(
      expect.objectContaining({
        mode: 'progressive',
        showItemPill: false,
        addButtonPlacement: 'bottom',
        allowRemoveAutoRows: false,
        saveDisabledRows: true
      })
    );
  });

  test('getQuestions preserves lineItemConfig.ui.closeConfirm and closeButtonLabel (openInOverlay)', () => {
    const sheet = mockSS.insertSheet('Config: LineItemUiCloseConfirm');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q_LI',
        'LINE_ITEM_GROUP',
        'Meals',
        'Repas',
        'Maaltijden',
        false,
        '',
        '',
        '',
        'Active',
        '{"fields":[{"id":"ING","type":"CHOICE","labelEn":"Ingredient","required":true}],"ui":{"openInOverlay":true,"closeButtonLabel":{"en":"Back"},"closeConfirm":{"title":{"en":"Missing ingredients"},"body":{"en":"No ingredients have been added. Do you want to exit?"},"confirmLabel":{"en":"Yes"},"cancelLabel":{"en":"No"}}}}',
        '',
        '',
        ''
      ]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: LineItemUiCloseConfirm');
    expect(questions.length).toBe(1);
    expect(questions[0].lineItemConfig).toBeDefined();
    expect(questions[0].lineItemConfig!.ui).toEqual(
      expect.objectContaining({
        openInOverlay: true,
        closeButtonLabel: { en: 'Back' },
        closeConfirm: {
          title: { en: 'Missing ingredients' },
          body: { en: 'No ingredients have been added. Do you want to exit?' },
          confirmLabel: { en: 'Yes' },
          cancelLabel: { en: 'No' }
        }
      })
    );
  });

  test('getQuestions parses REF: syntax', () => {
    const configSheet = mockSS.insertSheet('Config: Ref');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q3', 'CHOICE', 'Color', 'Couleur', 'Kleur', true, 'REF:Options_Q3', '', '', 'Active', '', '', '', '']
    ];
    (configSheet as any).setMockData(exampleRows);

    const optionsSheet = mockSS.insertSheet('Options_Q3');
    const optionRows = [
      ['Opt En', 'Opt Fr', 'Opt Nl'],
      ['Red', 'Rouge', 'Rood'],
      ['Blue', 'Bleu', 'Blauw']
    ];
    (optionsSheet as any).setMockData(optionRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Ref');
    
    expect(questions.length).toBe(1);
    expect(questions[0].options).toEqual(['Red', 'Blue']);
    expect(questions[0].optionsFr).toEqual(['Rouge', 'Bleu']);
    expect(questions[0].optionsNl).toEqual(['Rood', 'Blauw']);
  });

  test('handleOptionEdit creates sheet and updates config', () => {
    const configSheet = mockSS.insertSheet('Config: Edit');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q4', 'CHOICE', 'Size', 'Taille', 'Maat', true, '', '', '', 'Active', '', '', '', 'Edit'] // Selected 'Edit'
    ];
    (configSheet as any).setMockData(exampleRows);

    // Mock event object
    const e = {
      range: {
        getSheet: () => configSheet,
        getColumn: () => 14,
        getRow: () => 2,
        getValue: () => 'Edit',
        setValue: jest.fn(),
        setFormula: jest.fn()
      },
      value: 'Edit'
    };

    // Mock setValue for config update
    const spySetValue = jest.fn();
    const spySetFormula = jest.fn();
    const spyClearContent = jest.fn();
    
    // Mock getRange to return a mock object with setValue/clearContent
    configSheet.getRange = jest.fn().mockImplementation((row, col) => {
       return {
           getValue: () => {
               if (col === 1) return 'Q4'; // ID column
               if (col === 2) return 'CHOICE'; // Type column
               if (col === 7) return ''; // Opt EN
               return null;
           },
           setValue: spySetValue,
           setFormula: spySetFormula,
           clearContent: spyClearContent,
           setFontWeight: jest.fn().mockReturnThis(),
           setValues: jest.fn().mockReturnThis()
       };
    });

    ConfigSheet.handleOptionEdit(mockSS as any, e as any);

    // Verify new sheet created
    const optionsSheet = mockSS.getSheetByName('Options_Q4');
    expect(optionsSheet).toBeDefined();
    
    // Verify config updated
    expect(spySetValue).toHaveBeenCalledWith('REF:Options_Q4');
    expect(spyClearContent).toHaveBeenCalledTimes(2); // Clear FR and NL
    
    // Verify hyperlink formula set (we can't check exact URL easily due to mock ID, but we check it was called)
    // In our mock, e.range.setFormula is called? No, we call range.setFormula in code.
    // Wait, in code: range.setFormula(formula). range is e.range.
    expect(e.range.setFormula).toHaveBeenCalledWith(expect.stringContaining('=HYPERLINK'));
  });

  test('handleOptionEdit restricts option tabs to CHOICE/CHECKBOX', () => {
    const configSheet = mockSS.insertSheet('Config: TypeCheck');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q5', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', 'Edit'] // TEXT type
    ];
    (configSheet as any).setMockData(exampleRows);

    const e = {
      range: {
        getSheet: () => configSheet,
        getColumn: () => 14,
        getRow: () => 2,
        getValue: () => 'Edit',
        setValue: jest.fn()
      },
      value: 'Edit'
    };

    // Mock getRange to return type
    configSheet.getRange = jest.fn().mockImplementation((row, col) => {
       return {
           getValue: () => {
               if (col === 1) return 'Q5';
               if (col === 2) return 'TEXT'; // Invalid type for options
               return null;
           },
           setValue: jest.fn()
       };
    });

    // Mock SpreadsheetApp.getActiveSpreadsheet().toast
    const toastSpy = jest.fn();
    const originalGetActiveSpreadsheet = (global as any).SpreadsheetApp.getActiveSpreadsheet;
    (global as any).SpreadsheetApp.getActiveSpreadsheet = jest.fn().mockReturnValue({
      toast: toastSpy
    });

    ConfigSheet.handleOptionEdit(mockSS as any, e as any);

    // Restore mock
    (global as any).SpreadsheetApp.getActiveSpreadsheet = originalGetActiveSpreadsheet;

    // Verify no sheet created
    const optionsSheet = mockSS.getSheetByName('Options_Q5');
    expect(optionsSheet).toBeUndefined();
    
    // Verify toast called
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('only available for CHOICE'),
      expect.any(String)
    );
  });

  test('getQuestions parses line item config from referenced sheet', () => {
    const configSheet = mockSS.insertSheet('Config: Line');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q6', 'LINE_ITEM_GROUP', 'Items', 'Articles', 'Artikelen', true, '', '', '', 'Active', 'REF:LineItems_Q6', '', '', '']
    ];
    (configSheet as any).setMockData(exampleRows);

    const lineSheet = mockSS.insertSheet('LineItems_Q6');
    const lineRows = [
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['LI1', 'TEXT', 'Item', 'Article', 'Artikel', true, '', '', ''],
      ['LI2', 'CHOICE', 'Unit', 'Unité', 'Eenheid', false, 'Kg,Litre', 'Kg, Litre', 'Kg, Litre']
    ];
    (lineSheet as any).setMockData(lineRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Line');
    expect(questions[0].lineItemConfig).toBeDefined();
    expect(questions[0].lineItemConfig!.fields.length).toBe(2);
    expect(questions[0].lineItemConfig!.fields[1].options).toEqual(['Kg', 'Litre']);
  });

  test('getQuestions preserves selectorOverlay addMode for line items', () => {
    const configSheet = mockSS.insertSheet('Config: LineItemSelectorOverlay');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q_LI2',
        'LINE_ITEM_GROUP',
        'Ingredients',
        'Ingredients',
        'Ingredients',
        false,
        '',
        '',
        '',
        'Active',
        '{"addMode":"selectorOverlay","anchorFieldId":"ING","sectionSelector":{"id":"ITEM_FILTER","labelEn":"Search","placeholder":{"en":"Search items"},"helperText":{"en":"Type to search"}},"fields":[{"id":"ING","type":"CHOICE","labelEn":"Ingredient","options":["A"]},{"id":"QTY","type":"NUMBER","labelEn":"Qty"}]}',
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: LineItemSelectorOverlay');
    expect(questions[0].lineItemConfig?.addMode).toBe('selectorOverlay');
    expect(questions[0].lineItemConfig?.sectionSelector?.placeholderEn).toBe('Search items');
    expect(questions[0].lineItemConfig?.sectionSelector?.helperTextEn).toBe('Type to search');
  });

  test('getQuestions preserves addOverlay copy for line items', () => {
    const configSheet = mockSS.insertSheet('Config: LineItemAddOverlayCopy');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q_LI3',
        'LINE_ITEM_GROUP',
        'Products',
        'Produits',
        'Producten',
        false,
        '',
        '',
        '',
        'Active',
        '{"addMode":"overlay","anchorFieldId":"ITEM","addOverlay":{"title":{"en":"Select items"},"helperText":{"en":"Choose one or more items"},"placeholder":{"en":"Search items"}},"fields":[{"id":"ITEM","type":"CHOICE","labelEn":"Item","options":["A"]}]}',
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: LineItemAddOverlayCopy');
    expect(questions[0].lineItemConfig?.addOverlay).toBeDefined();
    expect((questions[0].lineItemConfig?.addOverlay as any)?.title?.en).toBe('Select items');
    expect((questions[0].lineItemConfig?.addOverlay as any)?.helperText?.en).toBe('Choose one or more items');
    expect((questions[0].lineItemConfig?.addOverlay as any)?.placeholder?.en).toBe('Search items');
  });

  test('getQuestions parses upload config JSON', () => {
    const configSheet = mockSS.insertSheet('Config: Upload');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q7',
        'FILE_UPLOAD',
        'Photo',
        'Photo',
        'Foto',
        true,
        '',
        '',
        '',
        'Active',
        '{"minFiles":2,"maxFiles":3,"maxFileSizeMb":5,"allowedExtensions":["jpg","png"],"allowedMimeTypes":["image/*"],"errorMessages":{"minFiles":{"en":"Need {min} photos"}}, "helperText":{"en":"You can add {count} more photos."}, "linkLabel":{"en":"Photo {n}"}, "ui":{"variant":"progressive","slotIcon":"clip"}, "compression":{"images":true},"destinationFolderId":"abc"}',
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Upload');
    expect(questions[0].uploadConfig).toBeDefined();
    expect(questions[0].uploadConfig!.minFiles).toBe(2);
    expect(questions[0].uploadConfig!.maxFiles).toBe(3);
    expect(questions[0].uploadConfig!.maxFileSizeMb).toBe(5);
    expect(questions[0].uploadConfig!.allowedExtensions).toEqual(['jpg', 'png']);
    expect(questions[0].uploadConfig!.allowedMimeTypes).toEqual(['image/*']);
    expect((questions[0].uploadConfig as any).errorMessages).toBeDefined();
    expect(((questions[0].uploadConfig as any).errorMessages?.minFiles || {}).en).toBe('Need {min} photos');
    expect((questions[0].uploadConfig as any).helperText).toBeDefined();
    expect(((questions[0].uploadConfig as any).helperText || {}).en).toBe('You can add {count} more photos.');
    expect((questions[0].uploadConfig as any).linkLabel).toBeDefined();
    expect(((questions[0].uploadConfig as any).linkLabel || {}).en).toBe('Photo {n}');
    expect((questions[0].uploadConfig as any).ui).toBeDefined();
    expect(((questions[0].uploadConfig as any).ui || {}).variant).toBe('progressive');
    expect(((questions[0].uploadConfig as any).ui || {}).slotIcon).toBe('clip');
    expect((questions[0].uploadConfig as any).compression).toBeDefined();
    expect(questions[0].uploadConfig!.destinationFolderId).toBe('abc');
  });

  test('getQuestions parses BUTTON createRecordPreset config JSON', () => {
    const configSheet = mockSS.insertSheet('Config: Buttons');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'BTN1',
        'BUTTON',
        'Create preset record',
        'Créer un enregistrement',
        'Nieuw record aanmaken',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "button": {
            "action": "createRecordPreset",
            "presetValues": { "TYPE": "AM", "CONSENT": true, "TAGS": ["A", "B"] },
            "placements": ["topBarList", "listBar", "unknownPlacement"]
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Buttons');
    expect(questions.length).toBe(1);
    expect(questions[0].type).toBe('BUTTON');
    expect((questions[0] as any).button).toEqual({
      action: 'createRecordPreset',
      presetValues: { TYPE: 'AM', CONSENT: true, TAGS: ['A', 'B'] },
      placements: ['topBarList', 'listBar']
    });
  });

  test('getQuestions parses BUTTON renderMarkdownTemplate config JSON', () => {
    const configSheet = mockSS.insertSheet('Config: MarkdownButtons');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'BTN_MD',
        'BUTTON',
        'Preview SOP (Markdown)',
        'Aperçu SOP (Markdown)',
        'SOP (Markdown) bekijken',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "button": {
            "action": "renderMarkdownTemplate",
            "templateId": { "EN": "drive-file-id-en", "FR": "drive-file-id-fr" },
            "placements": ["form", "topBar", "unknownPlacement"]
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: MarkdownButtons');
    expect(questions.length).toBe(1);
    expect(questions[0].type).toBe('BUTTON');
    expect((questions[0] as any).button).toEqual({
      action: 'renderMarkdownTemplate',
      templateId: { EN: 'drive-file-id-en', FR: 'drive-file-id-fr' },
      placements: ['form', 'topBar']
    });
  });

  test('getQuestions parses BUTTON openUrlField config JSON', () => {
    const configSheet = mockSS.insertSheet('Config: OpenUrlButtons');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'BTN_URL',
        'BUTTON',
        'Open saved PDF',
        'Ouvrir le PDF',
        'PDF openen',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "button": {
            "action": "openUrlField",
            "fieldId": "pdfUrl",
            "placements": ["summaryBar", "unknownPlacement"]
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: OpenUrlButtons');
    expect(questions.length).toBe(1);
    expect(questions[0].type).toBe('BUTTON');
    expect((questions[0] as any).button).toEqual({
      action: 'openUrlField',
      fieldId: 'pdfUrl',
      placements: ['summaryBar']
    });
  });

  test('getQuestions parses BUTTON renderDocTemplate loadingLabel config JSON', () => {
    const configSheet = mockSS.insertSheet('Config: PdfButtons');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'BTN_PDF',
        'BUTTON',
        'Create PDF',
        'Créer PDF',
        'PDF maken',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "button": {
            "action": "renderDocTemplate",
            "templateId": { "EN": "doc-id-en" },
            "loadingLabel": { "en": "Creating PDF…" },
            "placements": ["form", "topBar", "unknownPlacement"]
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: PdfButtons');
    expect(questions.length).toBe(1);
    expect(questions[0].type).toBe('BUTTON');
    expect((questions[0] as any).button).toEqual({
      action: 'renderDocTemplate',
      templateId: { EN: 'doc-id-en' },
      output: 'pdf',
      previewMode: 'pdf',
      placements: ['form', 'topBar'],
      loadingLabel: { en: 'Creating PDF…' }
    });
  });

  test('getQuestions parses dataSource config JSON for choice fields', () => {
    const configSheet = mockSS.insertSheet('Config: DataSource');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q8',
        'CHOICE',
        'Dish',
        'Plat',
        'Gerecht',
        true,
        '',
        '',
        '',
        'Active',
        `{
          "dataSource": {
            "id": "Recepies Data",
            "projection": ["Dish Name"],
            "limit": 100,
            "mode": "options"
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: DataSource');
    expect(questions[0].dataSource).toBeDefined();
    expect(questions[0].dataSource!.id).toBe('Recepies Data');
    expect(questions[0].dataSource!.projection).toEqual(['Dish Name']);
    expect(questions[0].dataSource!.limit).toBe(100);
    expect(questions[0].dataSource!.mode).toBe('options');
  });

  test('getQuestions resolves optionFilter.optionMapRef from a ref tab', () => {
    const configSheet = mockSS.insertSheet('Config: OptionMapRef');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q1',
        'CHOICE',
        'Category',
        'Catégorie',
        'Categorie',
        true,
        'A,B,C',
        'A,B,C',
        'A,B,C',
        'Active',
        '',
        `{
          "optionFilter": {
            "dependsOn": "Supplier",
            "optionMapRef": { "ref": "REF:Supplier_Map", "keyColumn": "Supplier", "lookupColumn": "Allowed options" }
          }
        }`,
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const mapSheet = mockSS.insertSheet('Supplier_Map');
    (mapSheet as any).setMockData([
      ['Supplier', 'Allowed options'],
      ['VDS', 'Fresh vegetables'],
      ['VDS', 'Dairy'],
      ['*', 'Other']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: OptionMapRef');
    expect(questions.length).toBe(1);
    expect(questions[0].optionFilter).toBeDefined();
    expect(questions[0].optionFilter!.optionMap).toEqual({
      VDS: ['Fresh vegetables', 'Dairy'],
      '*': ['Other']
    });
    expect((questions[0].optionFilter as any).optionMapRef?.ref).toBe('REF:Supplier_Map');
  });

  test('getQuestions resolves valueMap.optionMapRef from a ref tab', () => {
    const configSheet = mockSS.insertSheet('Config: ValueMapRef');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q2',
        'TEXT',
        'Allergens',
        'Allergènes',
        'Allergenen',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "valueMap": {
            "dependsOn": "ING",
            "optionMapRef": { "ref": "REF:Allergen_Map", "keyColumn": "ING", "lookupColumn": "Allergens" }
          }
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const mapSheet = mockSS.insertSheet('Allergen_Map');
    (mapSheet as any).setMockData([
      ['ING', 'Allergens'],
      ['Pesto', 'Milk'],
      ['Pesto', 'Peanuts'],
      ['*', 'None']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: ValueMapRef');
    expect(questions.length).toBe(1);
    expect(questions[0].valueMap).toBeDefined();
    expect(questions[0].valueMap!.optionMap).toEqual({
      Pesto: ['Milk', 'Peanuts'],
      '*': ['None']
    });
    expect((questions[0].valueMap as any).optionMapRef?.ref).toBe('REF:Allergen_Map');
  });

  test('getQuestions resolves optionMapRef inside inline LINE_ITEM_GROUP JSON', () => {
    const configSheet = mockSS.insertSheet('Config: LineItemOptionMapRef');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q3',
        'LINE_ITEM_GROUP',
        'Items',
        'Articles',
        'Artikelen',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "fields": [
            {
              "id": "LI1",
              "type": "CHOICE",
              "labelEn": "Unit",
              "options": ["Dry","Chilled"],
              "optionFilter": {
                "dependsOn": "Supplier",
                "optionMapRef": { "ref": "REF:Supplier_Unit_Map", "keyColumn": "Supplier", "lookupColumn": "Allowed" }
              }
            }
          ]
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const mapSheet = mockSS.insertSheet('Supplier_Unit_Map');
    (mapSheet as any).setMockData([
      ['Supplier', 'Allowed'],
      ['VDS', 'Dry'],
      ['VDS', 'Chilled'],
      ['*', 'Dry']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: LineItemOptionMapRef');
    expect(questions.length).toBe(1);
    expect(questions[0].lineItemConfig).toBeDefined();
    expect(questions[0].lineItemConfig!.fields.length).toBe(1);
    expect(questions[0].lineItemConfig!.fields[0].optionFilter).toBeDefined();
    expect(questions[0].lineItemConfig!.fields[0].optionFilter!.optionMap).toEqual({
      VDS: ['Dry', 'Chilled'],
      '*': ['Dry']
    });
  });

  test('getQuestions supports optionMapRef with multiple key columns (composite keys + fallbacks)', () => {
    const configSheet = mockSS.insertSheet('Config: CompositeOptionMapRef');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q4',
        'CHOICE',
        'Unit',
        'Unité',
        'Eenheid',
        true,
        'Bags,Crates,Boxes',
        'Bags,Crates,Boxes',
        'Bags,Crates,Boxes',
        'Active',
        '',
        `{
          "optionFilter": {
            "dependsOn": ["Product", "Supplier"],
            "optionMapRef": { "ref": "REF:Composite_Map", "keyColumn": ["Product", "Supplier"], "lookupColumn": "Allowed" }
          }
        }`,
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const mapSheet = mockSS.insertSheet('Composite_Map');
    (mapSheet as any).setMockData([
      ['Product', 'Supplier', 'Allowed'],
      ['Carrots', 'Local', 'Crates'],
      ['Carrots', 'Local', 'Bags'],
      // prefix fallback (Product only)
      ['Carrots', '', 'Boxes'],
      // global fallback (wildcard key)
      ['*', '*', 'Bags']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: CompositeOptionMapRef');
    expect(questions.length).toBe(1);
    expect(questions[0].optionFilter).toBeDefined();
    expect(questions[0].optionFilter!.optionMap).toEqual({
      'Carrots||Local': ['Crates', 'Bags'],
      Carrots: ['Boxes'],
      '*': ['Bags']
    });
  });

  test('getQuestions resolves optionFilter.optionMapRef inside LINE_ITEM_GROUP sectionSelector config', () => {
    const configSheet = mockSS.insertSheet('Config: SelectorOptionFilter');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q5',
        'LINE_ITEM_GROUP',
        'Items',
        'Articles',
        'Artikelen',
        false,
        '',
        '',
        '',
        'Active',
        `{
          "sectionSelector": {
            "id": "ITEM_FILTER",
            "labelEn": "Item",
            "options": ["A","B","C"],
            "optionFilter": {
              "dependsOn": "CATEGORY",
              "optionMapRef": { "ref": "REF:Selector_Map", "keyColumn": "CATEGORY", "lookupColumn": "Allowed" }
            }
          },
          "fields": []
        }`,
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const mapSheet = mockSS.insertSheet('Selector_Map');
    (mapSheet as any).setMockData([
      ['CATEGORY', 'Allowed'],
      ['Veg', 'A'],
      ['Veg', 'B'],
      ['*', 'C']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: SelectorOptionFilter');
    expect(questions.length).toBe(1);
    expect(questions[0].lineItemConfig?.sectionSelector).toBeDefined();
    expect(questions[0].lineItemConfig!.sectionSelector!.optionFilter).toBeDefined();
    expect(questions[0].lineItemConfig!.sectionSelector!.optionFilter!.optionMap).toEqual({
      Veg: ['A', 'B'],
      '*': ['C']
    });
  });

  test('getQuestions supports optionMapRef.splitKey (split key cells into multiple keys)', () => {
    const configSheet = mockSS.insertSheet('Config: SplitKey');
    const rows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      [
        'Q6',
        'CHOICE',
        'Ingredient',
        'Ingrédient',
        'Ingrediënt',
        true,
        '',
        '',
        '',
        'Active',
        '',
        `{
          "optionFilter": {
            "dependsOn": "DISH_TYPE",
            "optionMapRef": { "ref": "REF:IngredientsOptions", "keyColumn": "dietaryApplicability", "lookupColumn": "optionEn", "splitKey": true }
          }
        }`,
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(rows);

    const master = mockSS.insertSheet('IngredientsOptions');
    (master as any).setMockData([
      ['optionEn', 'optionFr', 'optionNl', 'dietaryApplicability'],
      ['Rice', 'Riz', 'Rijst', 'Vegan, Vegetarian, No-salt'],
      ['Chicken', 'Poulet', 'Kip', 'Standard, No-salt']
    ]);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: SplitKey');
    expect(questions.length).toBe(1);
    expect(questions[0].optionFilter).toBeDefined();
    expect(questions[0].optionFilter!.optionMap).toEqual({
      Vegan: ['Rice'],
      Vegetarian: ['Rice'],
      'No-salt': ['Rice', 'Chicken'],
      Standard: ['Chicken']
    });
  });
});
