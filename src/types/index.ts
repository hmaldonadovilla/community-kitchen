export type BaseQuestionType = 'DATE' | 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'CHOICE' | 'CHECKBOX';
export type QuestionType = BaseQuestionType | 'FILE_UPLOAD' | 'LINE_ITEM_GROUP';

export interface FileUploadConfig {
  destinationFolderId?: string;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
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
}

export interface LineItemGroupConfig {
  minRows?: number;
  maxRows?: number;
  addButtonLabel?: {
    en?: string;
    fr?: string;
    nl?: string;
  };
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
}

export interface FormConfig {
  title: string;
  configSheet: string;
  destinationTab: string;
  description: string;
  formId: string;
  rowIndex: number;
}

export interface FormResult {
  id: string;
  editUrl: string;
  publishedUrl: string;
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
