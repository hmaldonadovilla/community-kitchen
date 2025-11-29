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

export interface VisibilityCondition {
  fieldId: string;
  equals?: string | string[];
  greaterThan?: number | string;
  lessThan?: number | string;
}

export interface VisibilityConfig {
  showWhen?: VisibilityCondition;
  hideWhen?: VisibilityCondition;
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
  visibility?: VisibilityConfig;
}

export interface LineItemSelectorConfig {
  id: string;
  labelEn?: string;
  labelFr?: string;
  labelNl?: string;
  options?: string[];
  optionsFr?: string[];
  optionsNl?: string[];
  optionsRef?: string;
  required?: boolean;
}

export interface LineItemTotalConfig {
  type: 'sum' | 'count';
  fieldId?: string; // required for sum, ignored for count
  label?: LocalizedString;
  decimalPlaces?: number;
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
  sectionSelector?: LineItemSelectorConfig;
  totals?: LineItemTotalConfig[];
  fields: LineItemFieldConfig[];
}

export interface SelectionEffect {
  type: 'addLineItems';
  groupId: string; // target line item group
  preset?: Record<string, string | number>; // preset field values
  triggerValues?: string[]; // which choice/checkbox values trigger this effect (defaults to any)
}

export interface DataSourceConfig {
  id: string;
  ref?: string; // optional reference key used by backend
  mode?: 'options' | 'prefill' | 'list';
  sheetId?: string; // optional sheet id when sourcing from another file
  tabName?: string; // tab name for the source table
  localeKey?: string; // optional column used to scope localized rows
  projection?: string[]; // limit columns returned
  limit?: number; // optional max rows
  mapping?: Record<string, string>; // optional map from source column -> target field id
}

export interface QuestionConfig {
  id: string;
  type: QuestionType;
  qEn: string;
  qFr: string;
  qNl: string;
  required: boolean;
  listView?: boolean;
  options: string[];      // English options
  optionsFr: string[];    // French options
  optionsNl: string[];    // Dutch options
  status: 'Active' | 'Archived';
  uploadConfig?: FileUploadConfig;
  lineItemConfig?: LineItemGroupConfig;
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  clearOnChange?: boolean;
  dataSource?: DataSourceConfig;
  selectionEffects?: SelectionEffect[];
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
  listView?: boolean;
  options?: {
    en: string[];
    fr: string[];
    nl: string[];
  };
  lineItemConfig?: LineItemGroupConfig;
  uploadConfig?: FileUploadConfig;
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  clearOnChange?: boolean;
  dataSource?: DataSourceConfig;
  selectionEffects?: SelectionEffect[];
}

export interface WebFormDefinition {
  title: string;
  description?: string;
  destinationTab: string;
  languages: Array<'EN' | 'FR' | 'NL'>;
  questions: WebQuestionDefinition[];
  dataSources?: DataSourceConfig[];
  listView?: ListViewConfig;
  dedupRules?: DedupRule[];
  startRoute?: 'list' | 'form' | 'summary' | string;
}

export interface WebFormSubmission {
  formKey: string;
  language: 'EN' | 'FR' | 'NL';
  // Raw form payload; values can be strings, arrays (checkbox), blobs (file upload), or JSON strings
  values: Record<string, any>;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListViewColumnConfig {
  fieldId: string;
  label?: LocalizedString;
}

export interface ListViewConfig {
  columns: ListViewColumnConfig[];
  defaultSort?: {
    fieldId: string;
    direction?: 'asc' | 'desc';
  };
  pageSize?: number;
}

export interface DedupRule {
  id: string;
  scope?: 'form' | string; // optionally point to a dataSourceId
  keys: string[];
  matchMode?: 'exact' | 'caseInsensitive';
  onConflict?: 'reject' | 'ignore' | 'merge';
  message?: LocalizedString;
  mergeHandlerKey?: string; // only when onConflict = merge
}

export interface RecordMetadata {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface SubmissionBatchResult<T = Record<string, any>> {
  list: PaginatedResult<T>;
  records: Record<string, WebFormSubmission>;
}
