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

// Maps a controlling field's value to a derived readonly value for TEXT fields.
// Schema mirrors OptionFilter for consistency.
export interface ValueMapConfig {
  dependsOn: string | string[];
  optionMap: Record<string, string[]>;
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

export interface AutoIncrementConfig {
  prefix?: string;
  padLength?: number;
  propertyKey?: string;
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
  dataSource?: DataSourceConfig;
  selectionEffects?: SelectionEffect[];
  autoIncrement?: AutoIncrementConfig;
  valueMap?: ValueMapConfig; // readonly derived value for TEXT fields
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
  id?: string;
  label?: LocalizedString;
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
  subGroups?: LineItemGroupConfig[]; // nested line item groups driven by this header group
}

export interface SelectionEffect {
  type: 'addLineItems' | 'addLineItemsFromDataSource';
  groupId: string; // target line item group
  preset?: Record<string, string | number>; // preset field values for simple addLineItems
  triggerValues?: string[]; // which choice/checkbox values trigger this effect (defaults to any)
  dataSource?: DataSourceConfig; // optional override source for data-driven effects
  lookupField?: string; // column/field used to match the selected value
  dataField?: string; // column/field that contains serialized row payloads (e.g., JSON array)
  lineItemMapping?: Record<string, string>; // map of line item field id -> source field key
  clearGroupBeforeAdd?: boolean; // when true (default) clear existing rows before populating
  aggregateBy?: string[]; // optional line-item field ids to treat as non-numeric grouping keys
  aggregateNumericFields?: string[]; // optional explicit list of numeric/sum fields
  rowMultiplierFieldId?: string; // originating line-item field id whose numeric value scales results
  dataSourceMultiplierField?: string; // column/field in the data source describing the default quantity
  scaleNumericFields?: string[]; // override list of mapped numeric fields to scale (defaults to aggregateNumericFields)
}

export interface ListViewSortConfig {
  direction?: 'asc' | 'desc';
  priority?: number;
}

export interface FollowupStatusConfig {
  onPdf?: string;
  onEmail?: string;
  onClose?: string;
}

export type TemplateIdMap = string | Record<string, string>;

export interface EmailRecipientDataSourceConfig {
  type: 'dataSource';
  recordFieldId: string;
  lookupField: string;
  valueField: string;
  dataSource: DataSourceConfig;
  fallbackEmail?: string;
}

export type EmailRecipientEntry = string | EmailRecipientDataSourceConfig;

export interface FollowupConfig {
  pdfTemplateId?: TemplateIdMap;
  pdfFolderId?: string;
  emailTemplateId?: TemplateIdMap;
  emailSubject?: LocalizedString | string;
  emailRecipients?: EmailRecipientEntry[];
  emailCc?: EmailRecipientEntry[];
  emailBcc?: EmailRecipientEntry[];
  statusFieldId?: string;
  statusTransitions?: FollowupStatusConfig;
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
  tooltipField?: string; // optional column used for option tooltips
  tooltipLabel?: LocalizedString | string; // optional localized label for tooltip trigger/header
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
  valueMap?: ValueMapConfig;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  clearOnChange?: boolean;
  dataSource?: DataSourceConfig;
  selectionEffects?: SelectionEffect[];
  listViewSort?: ListViewSortConfig;
  autoIncrement?: AutoIncrementConfig;
}

export interface FormConfig {
  title: string;
  configSheet: string;
  destinationTab: string;
  description: string;
  formId?: string;
  appUrl?: string;
  rowIndex: number;
  followupConfig?: FollowupConfig;
  listViewMetaColumns?: string[];
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
  valueMap?: ValueMapConfig;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  clearOnChange?: boolean;
  dataSource?: DataSourceConfig;
  selectionEffects?: SelectionEffect[];
  listViewSort?: ListViewSortConfig;
  autoIncrement?: AutoIncrementConfig;
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
  followup?: FollowupConfig;
}

export interface WebFormSubmission {
  formKey: string;
  language: 'EN' | 'FR' | 'NL';
  // Raw form payload; values can be strings, arrays (checkbox), blobs (file upload), or JSON strings
  values: Record<string, any>;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  pdfUrl?: string;
}

export interface ListViewColumnConfig {
  fieldId: string;
  label?: LocalizedString;
  kind?: 'question' | 'meta';
}

export interface ListViewConfig {
  title?: LocalizedString;
  columns: ListViewColumnConfig[];
  metaColumns?: string[];
  defaultSort?: {
    fieldId: string;
    direction?: 'asc' | 'desc';
  };
  pageSize?: number;
}

export interface ListViewQueryOptions {
  search?: string;
  filters?: Record<string, string>;
  sort?: {
    fieldId: string;
    direction?: 'asc' | 'desc';
  };
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
  etag?: string;
}

export interface SubmissionBatchResult<T = Record<string, any>> {
  list: PaginatedResult<T>;
  records: Record<string, WebFormSubmission>;
}

export interface FollowupActionResult {
  success: boolean;
  message?: string;
  status?: string;
  pdfUrl?: string;
  fileId?: string;
  updatedAt?: string;
}
