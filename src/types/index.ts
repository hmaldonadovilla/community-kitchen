export type BaseQuestionType = 'DATE' | 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'CHOICE' | 'CHECKBOX';
export type QuestionType = BaseQuestionType | 'FILE_UPLOAD' | 'LINE_ITEM_GROUP' | 'BUTTON';
// Line item fields cannot themselves be nested LINE_ITEM_GROUPs, but they can support FILE_UPLOAD.
export type LineItemFieldType = BaseQuestionType | 'FILE_UPLOAD';

/**
 * Config-level default values (stored payload values, not localized labels).
 *
 * Notes:
 * - For CHOICE: use the underlying option value (typically the EN option key).
 * - For CHECKBOX:
 *   - consent checkbox (no options + no dataSource): use boolean
 *   - multi-select checkbox: use string[] (or a single string for one default option)
 */
export type DefaultValue = string | number | boolean | string[];

/**
 * SelectionEffect preset values for `addLineItems`.
 *
 * These can be literal values (string/number/boolean/string[]) or special reference strings
 * like `$row.FIELD_ID` / `$top.FIELD_ID` (resolved at runtime).
 */
export type PresetValue = string | number | boolean | string[];

export type ChoiceControl = 'auto' | 'select' | 'radio' | 'segmented' | 'switch';

export type LabelLayout = 'auto' | 'stacked';

export type ButtonPlacement =
  | 'form'
  | 'formSummaryMenu'
  | 'summaryBar'
  | 'topBar'
  | 'topBarList'
  | 'topBarForm'
  | 'topBarSummary'
  | 'listBar';

export type ButtonOutput = 'pdf';

export type ButtonPreviewMode = 'pdf' | 'live';

/**
 * UI-only button field.
 *
 * Primary use case: render a Google Doc template (with placeholders / consolidated directives)
 * into a PDF preview from the web app.
 */
export type ButtonAction = 'renderDocTemplate' | 'createRecordPreset';

export interface RenderDocTemplateButtonConfig {
  action: 'renderDocTemplate';
  /**
   * Google Doc template id (or language map).
   */
  templateId: TemplateIdMap;
  /**
   * Output format. Currently only PDF.
   */
  output?: ButtonOutput;
  /**
   * Preview mode for the web app overlay.
   * - pdf: clicking the button immediately renders a PDF (current behavior)
   * - live: clicking the button opens a fast in-app preview (no Drive files),
   *   and the user can optionally generate a PDF on demand.
   */
  previewMode?: ButtonPreviewMode;
  /**
   * Where this button should surface in the web UI.
   * - form: rendered inline as a normal field in the form view
   * - formSummaryMenu: appears in the Summary button menu while editing
   * - summaryBar: appears in the bottom action bar on the Summary view (menu if multiple)
   * - topBar: appears in the action bar directly under the header (all views)
   * - topBarList/topBarForm/topBarSummary: show in the top action bar only on the matching view
   * - listBar: appears in the bottom action bar on the list view (menu if multiple)
   */
  placements?: ButtonPlacement[];
  /**
   * Optional Drive folder to write generated PDFs to (defaults to follow-up folder / spreadsheet parent).
   */
  folderId?: string;
}

export interface CreateRecordPresetButtonConfig {
  action: 'createRecordPreset';
  /**
   * Field values to prefill when creating a new record.
   *
   * Important: these are stored values (not localized labels).
   * For CHOICE, use the underlying option value (typically the EN option key).
   */
  presetValues: Record<string, DefaultValue>;
  placements?: ButtonPlacement[];
}

export type ButtonConfig = RenderDocTemplateButtonConfig | CreateRecordPresetButtonConfig;

export interface QuestionUiConfig {
  /**
   * Control variant for single-choice questions.
   * - auto: choose based on option count / boolean detection
   * - select: native dropdown
   * - radio: radio list
   * - segmented: iOS-like segmented control (best for <= 3 options)
   * - switch: iOS switch (best for boolean / non-required fields)
   */
  control?: ChoiceControl;
  /**
   * Label/control layout hint.
   * - auto: default behavior (inline on full-width rows; stacked in 2-up grids)
   * - stacked: force label above control even for full-width rows
   */
  labelLayout?: LabelLayout;
}

export interface FileUploadConfig {
  destinationFolderId?: string;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
}

export type SheetColumnRef = string | number;

/**
 * Sheet-driven option/value maps.
 *
 * Allows non-developers to maintain mappings directly in a spreadsheet tab instead of writing JSON objects.
 *
 * The referenced tab should have a header row (row 1). Data is read from row 2 onward.
 * Each row contributes one (key -> lookup) entry; repeated keys are merged.
 */
export interface OptionMapRefConfig {
  /**
   * Sheet/tab reference.
   * - `REF:TabName` (recommended, consistent with other ref patterns)
   * - `TabName` (also accepted)
   */
  ref: string;
  /**
   * Column holding the lookup key (dependency value or composite key).
   * Accepts:
   * - 1-based index (e.g. 1)
   * - Column letter (e.g. "A")
   * - Header label (e.g. "Supplier")
   */
  keyColumn: SheetColumnRef;
  /**
   * Column holding the lookup value(s) (allowed options / derived values).
   * Accepts:
   * - 1-based index (e.g. 2)
   * - Column letter (e.g. "B")
   * - Header label (e.g. "Allowed Options")
   */
  lookupColumn: SheetColumnRef;
  /**
   * Optional delimiter to split multiple values stored in a single cell.
   * Defaults to splitting on common separators like comma/semicolon/newline.
   */
  delimiter?: string;
}

export interface OptionFilter {
  dependsOn: string | string[]; // question/field ID(s) to watch (supports array for composite filters)
  optionMap: Record<string, string[]>; // value -> allowed options (composite keys can be joined values)
  optionMapRef?: OptionMapRefConfig; // optional source reference (resolved into optionMap at load time)
}

// Maps a controlling field's value to a derived readonly value for TEXT fields.
// Schema mirrors OptionFilter for consistency.
export interface ValueMapConfig {
  dependsOn: string | string[];
  optionMap: Record<string, string[]>;
  optionMapRef?: OptionMapRefConfig; // optional source reference (resolved into optionMap at load time)
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
    /**
     * Optional cross-field numeric constraint: interpret the target numeric value as needing to be >=
     * the numeric value of another field.
     *
     * Notes:
     * - The referenced field is resolved in the current scope (line-item first, then parent/top).
     * - If the referenced field is empty or not numeric, the constraint is skipped.
     * - If both `min` and `minFieldId` are provided, `min` wins.
     */
    minFieldId?: string;
    max?: number | string;
    /**
     * Optional cross-field numeric constraint: interpret the target numeric value as needing to be <=
     * the numeric value of another field.
     *
     * Notes:
     * - The referenced field is resolved in the current scope (line-item first, then parent/top).
     * - If the referenced field is empty or not numeric, the constraint is skipped.
     * - If both `max` and `maxFieldId` are provided, `max` wins.
     */
    maxFieldId?: string;
    allowed?: string[];
    disallowed?: string[];
  };
  message?: LocalizedString;
  /**
   * Optional phase scoping. Defaults to "both".
   * - submit: apply only on form submission
   * - followup: apply only on follow-up actions
   * - both: apply everywhere
   */
  phase?: 'submit' | 'followup' | 'both';
}

export type DerivedValueWhen = 'always' | 'empty';

export interface DerivedValueAddDaysConfig {
  op: 'addDays';
  /**
   * Field ID whose value is used as the base date.
   */
  dependsOn: string;
  /**
   * Number of days to add (can be negative).
   */
  offsetDays?: number;
  /**
   * When to apply the derived value:
   * - always: recompute on every change (default for addDays)
   * - empty: only set when the target field is empty (allows user overrides)
   */
  when?: DerivedValueWhen;
  /**
   * Optional flag to indicate the field is system-managed and may be hidden in UI.
   * (Hiding still uses existing visibility config; this flag is informational.)
   */
  hidden?: boolean;
}

export interface DerivedValueTodayConfig {
  op: 'today';
  /**
   * When to apply the derived value:
   * - empty: default for today (prefill behavior)
   * - always: recompute on every change
   */
  when?: DerivedValueWhen;
  hidden?: boolean;
}

export interface TimeOfDayThreshold {
  /**
   * Threshold time (local) before which this value applies.
   * Examples: "10h", "12:30", 15 (treated as 15h).
   * When omitted, this entry acts as the fallback value.
   */
  before?: string | number;
  /**
   * Value to set on the target field when the threshold matches.
   */
  value: string;
}

export interface DerivedValueTimeOfDayMapConfig {
  op: 'timeOfDayMap';
  /**
   * Optional source field ID used to read a date/time value.
   * When omitted, the current time ("now") is used.
   */
  dependsOn?: string;
  /**
   * Threshold mapping evaluated in ascending order: the first entry where
   * current time-of-day < before wins. The last entry may omit "before" to act
   * as a fallback.
   */
  thresholds: TimeOfDayThreshold[];
  /**
   * When to apply the derived value:
   * - empty: default for timeOfDayMap (prefill/default behavior)
   * - always: recompute on every change
   */
  when?: DerivedValueWhen;
  hidden?: boolean;
}

export interface DerivedValueCopyConfig {
  op: 'copy';
  /**
   * Field ID whose value is copied into the target field.
   *
   * Useful for "defaulting" numeric fields (or other scalar values) from another input.
   */
  dependsOn: string;
  /**
   * When to apply the derived value:
   * - empty: default for copy (behaves like a default; allows user overrides)
   * - always: keep in sync with the source field
   */
  when?: DerivedValueWhen;
  /**
   * Control when the derived value is applied during editing.
   * - change: apply on every onChange (default for most derived ops)
   * - blur: apply only after the user leaves the input (prevents mid-typing churn)
   *
   * Defaults to "blur" for `copy`.
   */
  applyOn?: 'change' | 'blur';
  /**
   * Copy mode:
   * - replace: behave like a direct copy (default)
   * - allowIncrease: for numeric values, allow the user to increase above the source, but never below it
   * - allowDecrease: for numeric values, allow the user to decrease below the source, but never above it
   *
   * Only applies when `when: "always"` and both source + target are numeric.
   */
  copyMode?: 'replace' | 'allowIncrease' | 'allowDecrease';
  hidden?: boolean;
}

export type DerivedValueConfig =
  | DerivedValueAddDaysConfig
  | DerivedValueTodayConfig
  | DerivedValueTimeOfDayMapConfig
  | DerivedValueCopyConfig;

export interface AutoIncrementConfig {
  prefix?: string;
  padLength?: number;
  propertyKey?: string;
}

export interface LineItemCollapsedFieldConfig {
  fieldId: string;
  /**
   * When false, the collapsed view omits the label and only shows the control/value.
   * Defaults to true.
   */
  showLabel?: boolean;
}

export interface LineItemGroupUiConfig {
  /**
   * Optional UI mode for rendering this line item group.
   * - undefined: default/table-like editor (existing behavior)
   * - progressive: collapsed-by-default rows with gated expand
   */
  mode?: 'progressive' | 'default';
  /**
   * Fields to show (and allow editing) while the row is collapsed.
   * Expand is gated by these fields when expandGate = 'collapsedFieldsValid'.
   */
  collapsedFields?: LineItemCollapsedFieldConfig[];
  /**
   * Controls when the expand toggle becomes enabled.
   * - collapsedFieldsValid: enabled only when collapsedFields are filled and pass configured validation rules
   * - always: always enabled
   */
  expandGate?: 'collapsedFieldsValid' | 'always';
  /**
   * Default collapsed state for each row. When omitted and mode=progressive, defaults to true.
   */
  defaultCollapsed?: boolean;
  /**
   * Optional per-row disclaimer shown in the UI (works for both line item groups and subgroups).
   * Supports localization and simple template interpolation using row field values.
   *
   * Placeholders: use `{{FIELD_ID}}` to insert the row's field value.
   * Includes `{{__ckRowSource}}` (auto/manual) and `{{__ckRowSourceLabel}}` (localized).
   */
  rowDisclaimer?: RowDisclaimerConfig;
}

export interface RowDisclaimerRule {
  /**
   * Optional condition evaluated against the current row values.
   * - fieldId is required; comparisons use the raw row value (arrays use first element).
   */
  when?: VisibilityCondition;
  /**
   * Localized disclaimer text (supports placeholders like {{FIELD_ID}}).
   */
  text: LocalizedString;
}

export type RowDisclaimerConfig =
  | LocalizedString
  | {
      /**
       * Optional default template (supports placeholders like {{FIELD_ID}}).
       */
      template?: LocalizedString;
      /**
       * Optional ordered list of conditional disclaimer rules; first match wins.
       */
      cases?: RowDisclaimerRule[];
      /**
       * Optional fallback text when no cases match and no template is set.
       */
      fallback?: LocalizedString;
    };

export interface LineItemFieldConfig {
  id: string;
  type: LineItemFieldType;
  labelEn: string;
  labelFr: string;
  labelNl: string;
  required: boolean;
  /**
   * Optional default value used when creating new rows (manual/auto/selectionEffect) or when the field is missing.
   *
   * This is applied only when the row value is missing (not present), so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * Optional group card configuration for the edit view (works inside line item rows + subgroup overlays).
   */
  group?: QuestionGroupConfig;
  /**
   * Optional "pair key" that controls 2-up layout in the edit view.
   * Fields with the same pair key render next to each other; unpaired fields take the full row.
   */
  pair?: string;
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
  derivedValue?: DerivedValueConfig; // computed value (e.g., add days)
  uploadConfig?: FileUploadConfig;
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
  ui?: LineItemGroupUiConfig;
  minRows?: number;
  maxRows?: number;
  addButtonLabel?: {
    en?: string;
    fr?: string;
    nl?: string;
  };
  anchorFieldId?: string; // field to drive overlay multi-add
  addMode?: 'overlay' | 'inline' | 'auto';
  sectionSelector?: LineItemSelectorConfig;
  totals?: LineItemTotalConfig[];
  fields: LineItemFieldConfig[];
  subGroups?: LineItemGroupConfig[]; // nested line item groups driven by this header group
}

export interface SelectionEffect {
  type: 'addLineItems' | 'addLineItemsFromDataSource';
  groupId: string; // target line item group
  preset?: Record<string, PresetValue>; // preset field values for simple addLineItems (supports $row./$top. references)
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

export interface AutoSaveConfig {
  /**
   * Enable draft autosave while editing in the React web app.
   */
  enabled?: boolean;
  /**
   * Debounce interval before sending a background save. Defaults to 2000ms.
   */
  debounceMs?: number;
  /**
   * Status value written to the sheet when autosaving drafts. Defaults to "In progress".
   */
  status?: string;
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

export interface QuestionGroupConfig {
  /**
   * Optional stable identifier for this group (recommended if you have multiple groups).
   * If omitted, the UI will fall back to grouping by title (or "header" for header groups).
   */
  id?: string;
  /**
   * Marks this as the "header group" (fields previously rendered in the sticky header).
   * This group is rendered in the form body as a collapsible card.
   */
  header?: boolean;
  /**
   * Optional title rendered at the top of the group card.
   * Can be localized (en/fr/nl) or a plain string.
   */
  title?: LocalizedString | string;
  /**
   * Whether this group card can be collapsed/expanded.
   * Defaults to true when a title is present.
   */
  collapsible?: boolean;
  /**
   * Initial collapsed state for collapsible groups.
   */
  defaultCollapsed?: boolean;
}

export interface QuestionConfig {
  id: string;
  type: QuestionType;
  qEn: string;
  qFr: string;
  qNl: string;
  required: boolean;
  /**
   * Optional default value used when creating a new record (or when the field is missing in a saved record).
   *
   * This is applied only when the field has no value in the payload (i.e., missing), so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * @deprecated Replaced by `group: { header: true, title: "Header" }` (rendered in the form body).
   * When true, this field is rendered in the sticky header area of the edit view (still editable).
   */
  header?: boolean;
  /**
   * Optional group card configuration for the edit view.
   */
  group?: QuestionGroupConfig;
  /**
   * Optional "pair key" that controls 2-up layout in the edit view.
   * Fields with the same pair key render next to each other; unpaired fields take the full row.
   */
  pair?: string;
  listView?: boolean;
  /**
   * Optional config for BUTTON fields.
   */
  button?: ButtonConfig;
  options: string[];      // English options
  optionsFr: string[];    // French options
  optionsNl: string[];    // Dutch options
  status: 'Active' | 'Archived';
  uploadConfig?: FileUploadConfig;
  lineItemConfig?: LineItemGroupConfig;
  optionFilter?: OptionFilter;
  valueMap?: ValueMapConfig;
  derivedValue?: DerivedValueConfig;
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
  /**
   * Enabled languages for the web app UI (max 3).
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   * When omitted, the app auto-detects languages based on which label columns have values.
   */
  languages?: Array<'EN' | 'FR' | 'NL'>;
  /**
   * Default language used when opening the app (and when language selection is disabled).
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  defaultLanguage?: 'EN' | 'FR' | 'NL';
  /**
   * When false, hides language selection in the web app and forces `defaultLanguage`.
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  languageSelectorEnabled?: boolean;
  /**
   * Optional draft autosave behavior for the web edit view.
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  autoSave?: AutoSaveConfig;
  /**
   * Enable/disable the Summary view in the React web app.
   * When false, list-row clicks always open the Form view (closed records will be read-only).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  summaryViewEnabled?: boolean;
  /**
   * Enable/disable the "Copy current record" action in the React web app.
   * When false, the Create button always creates a new record (no copy option).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  copyCurrentRecordEnabled?: boolean;
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
  /**
   * Optional default value used when creating a new record (or when the field is missing in a saved record).
   *
   * This is applied only when the field is missing from the payload, so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * @deprecated Replaced by `group: { header: true, title: "Header" }` (rendered in the form body).
   * When true, this field is rendered in the sticky header area of the edit view (still editable).
   */
  header?: boolean;
  /**
   * Optional group card configuration for the edit view.
   */
  group?: QuestionGroupConfig;
  /**
   * Optional "pair key" that controls 2-up layout in the edit view.
   * Fields with the same pair key render next to each other; unpaired fields take the full row.
   */
  pair?: string;
  listView?: boolean;
  /**
   * Optional config for BUTTON fields.
   */
  button?: ButtonConfig;
  options?: {
    en: string[];
    fr: string[];
    nl: string[];
  };
  lineItemConfig?: LineItemGroupConfig;
  uploadConfig?: FileUploadConfig;
  optionFilter?: OptionFilter;
  valueMap?: ValueMapConfig;
  derivedValue?: DerivedValueConfig;
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
  /**
   * Default language used when opening the app (and when language selection is disabled).
   */
  defaultLanguage?: 'EN' | 'FR' | 'NL';
  /**
   * When false, hides language selection in the web app and forces `defaultLanguage`.
   */
  languageSelectorEnabled?: boolean;
  questions: WebQuestionDefinition[];
  dataSources?: DataSourceConfig[];
  listView?: ListViewConfig;
  dedupRules?: DedupRule[];
  startRoute?: 'list' | 'form' | 'summary' | string;
  followup?: FollowupConfig;
  /**
   * Optional draft autosave behavior for the web edit view.
   */
  autoSave?: AutoSaveConfig;
  /**
   * Enable/disable the Summary view in the React web app.
   * When false, list-row clicks always open the Form view (closed records will be read-only).
   */
  summaryViewEnabled?: boolean;
  /**
   * Enable/disable the "Copy current record" action in the React web app.
   * When false, the Create button always creates a new record (no copy option).
   */
  copyCurrentRecordEnabled?: boolean;
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
