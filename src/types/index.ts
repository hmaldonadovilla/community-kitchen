export type BaseQuestionType = 'DATE' | 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'CHOICE' | 'CHECKBOX';
export type QuestionType = BaseQuestionType | 'FILE_UPLOAD' | 'LINE_ITEM_GROUP';

export interface FileUploadConfig {
  destinationFolderId?: string;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
}

export interface OptionFilter {
  dependsOn: string | string[]; // question/field ID(s) to watch (supports array for composite filters)
  optionMap: Record<string, string[]>; // value -> allowed options (composite keys can be joined values)
}

export type LocalizedString = string | {
  en?: string;
  fr?: string;
  nl?: string;
  [key: string]: string | undefined;
};

export interface ValidationRule {
  when: {
    fieldId: string;
    equals?: string | string[];
    greaterThan?: number | string;
    lessThan?: number | string;
  };
  then: {
    fieldId: string;
    required?: boolean;
    min?: number | string;
    max?: number | string;
    allowed?: string[];
    disallowed?: string[];
  };
  message?: LocalizedString;
}

export interface LineItemFieldConfig {
  id: string;
  type: BaseQuestionType;
  labelEn: string;
  labelFr: string;
  labelNl: string;
  required: boolean;
  options: string[];
  optionsFr: string[];
  optionsNl: string[];
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
}

export interface LineItemGroupConfig {
  minRows?: number;
  maxRows?: number;
  addButtonLabel?: {
    en?: string;
    fr?: string;
    nl?: string;
  };
  anchorFieldId?: string; // field to drive overlay multi-add
  addMode?: 'overlay' | 'inline';
  fields: LineItemFieldConfig[];
}

export interface QuestionConfig {
  id: string;
  type: QuestionType;
  qEn: string;
  qFr: string;
  qNl: string;
  required: boolean;
  options: string[];      // English options
  optionsFr: string[];    // French options
  optionsNl: string[];    // Dutch options
  status: 'Active' | 'Archived';
  uploadConfig?: FileUploadConfig;
  lineItemConfig?: LineItemGroupConfig;
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
}

export interface FormConfig {
  title: string;
  configSheet: string;
  destinationTab: string;
  description: string;
  formId?: string;
  appUrl?: string;
  rowIndex: number;
}

export interface FormResult {
  destinationTab: string;
  appUrl?: string;
}

export interface WebQuestionDefinition {
  id: string;
  type: QuestionType;
  label: {
    en: string;
    fr: string;
    nl: string;
  };
  required: boolean;
  options?: {
    en: string[];
    fr: string[];
    nl: string[];
  };
  lineItemConfig?: LineItemGroupConfig;
  uploadConfig?: FileUploadConfig;
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
}

export interface WebFormDefinition {
  title: string;
  description?: string;
  destinationTab: string;
  languages: Array<'EN' | 'FR' | 'NL'>;
  questions: WebQuestionDefinition[];
}

export interface WebFormSubmission {
  formKey: string;
  language: 'EN' | 'FR' | 'NL';
  // Raw form payload; values can be strings, arrays (checkbox), blobs (file upload), or JSON strings
  values: Record<string, any>;
}
