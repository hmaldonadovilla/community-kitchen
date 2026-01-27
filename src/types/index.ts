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

/**
 * Option ordering for CHOICE/CHECKBOX inputs in the web app.
 * - alphabetical: sort by the localized label (default)
 * - source: preserve source order (as defined in config sheets / optionFilter / data sources)
 */
export type OptionSortMode = 'alphabetical' | 'source';

/**
 * Summary view visibility behavior for a field.
 * - inherit: follow normal `visibility` rules (default)
 * - always: show even if hidden by `visibility`
 * - never: never show in summary (even if visible in form)
 */
export type SummaryVisibility = 'inherit' | 'always' | 'never';

export type ActionBarView = 'list' | 'form' | 'summary';
export type ActionBarPosition = 'top' | 'bottom';

/**
 * System buttons that can appear in the top/bottom action bars.
 */
export type ActionBarSystemButton = 'home' | 'create' | 'edit' | 'summary' | 'actions' | 'submit';

export type ActionBarMenuBehavior = 'auto' | 'menu' | 'inline';
export type SummaryButtonBehavior = 'auto' | 'navigate' | 'menu';

export interface ActionBarSystemItemConfig {
  type: 'system';
  id: ActionBarSystemButton;
  /**
   * When true, hide this button when it is "active" for the current view.
   * Example: hide Home while on the Home (list) view.
   */
  hideWhenActive?: boolean;
  /**
   * Menu behavior for `actions` (and `create`):
   * - auto: 1 button -> render inline; 2+ -> actions menu (default)
   * - menu: always render a menu trigger (even if only 1)
   * - inline: always render all matched custom buttons inline
   */
  menuBehavior?: ActionBarMenuBehavior;
  /**
   * Which custom BUTTON placements should populate the Actions menu (or inline list).
   * When omitted, the UI uses view-specific defaults (listBar/summaryBar/formSummaryMenu).
   */
  placements?: ButtonPlacement[];
  /**
   * Optional filter for which custom button actions to include when this system item sources custom buttons.
   * Useful for:
   * - Create menu: include only `createRecordPreset`
   * - Actions menu: include only `renderDocTemplate` / `renderMarkdownTemplate`
   */
  actions?: ButtonAction[];
  /**
   * Control how the Summary button behaves on the form (edit) view.
   * - auto: open a menu when `formSummaryMenu` custom buttons exist; otherwise navigate
   * - navigate: always navigate to Summary (if enabled)
   * - menu: always open the menu (if enabled)
   */
  summaryBehavior?: SummaryButtonBehavior;
  /**
   * Override whether the Create menu should include "Copy current record".
   * When omitted, falls back to `copyCurrentRecordEnabled`.
   */
  showCopyCurrentRecord?: boolean;
}

export interface ActionBarCustomItemConfig {
  type: 'custom';
  /**
   * Which BUTTON placements should be included.
   * Example: ["topBar", "topBarList"] or ["listBar"].
   */
  placements: ButtonPlacement[];
  /**
   * How to render these buttons.
   * - inline: render each custom button as a standalone pill
   * - menu: render a single menu trigger listing these buttons
   */
  display?: 'inline' | 'menu';
  /**
   * Optional label for the menu trigger when display=menu.
   */
  label?: LocalizedString | string;
  /**
   * Optional filter by action type (e.g. only show createRecordPreset buttons).
   */
  actions?: ButtonAction[];
}

export type ActionBarItemConfig = ActionBarSystemButton | ActionBarSystemItemConfig | ActionBarCustomItemConfig;

export interface ActionBarViewConfig {
  /**
   * Buttons rendered inside the capsule (left side).
   */
  items?: ActionBarItemConfig[];
  /**
   * Primary buttons rendered outside the capsule (right side), e.g. Submit.
   */
  primary?: ActionBarItemConfig[];
}

export interface ActionBarsConfig {
  top?: Partial<Record<ActionBarView, ActionBarViewConfig>> & { sticky?: boolean };
  bottom?: Partial<Record<ActionBarView, ActionBarViewConfig>>;
  system?: {
    home?: { hideWhenActive?: boolean };
  };
}

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
export type ButtonAction =
  | 'renderDocTemplate'
  | 'renderMarkdownTemplate'
  | 'renderHtmlTemplate'
  | 'createRecordPreset'
  | 'listViewSearchPreset'
  | 'updateRecord'
  | 'openUrlField';

export type ButtonNavigateTo = 'auto' | 'form' | 'summary' | 'list';

export interface ButtonConfirmConfig {
  /**
   * Optional dialog title.
   */
  title?: LocalizedString | string;
  /**
   * Confirmation message shown before the action runs.
   */
  message: LocalizedString | string;
  /**
   * Optional confirm button label.
   */
  confirmLabel?: LocalizedString | string;
  /**
   * Optional cancel button label.
   */
  cancelLabel?: LocalizedString | string;
}

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
   * Optional localized loading label shown to the user while the PDF is being generated.
   * Defaults to the built-in system string (e.g. "Generating PDF…").
   */
  loadingLabel?: LocalizedString;
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

export interface RenderMarkdownTemplateButtonConfig {
  /**
   * Render a Markdown template stored in Google Drive (plain text / .md file) using the same placeholder
   * rules as Doc templates (e.g., `{{FIELD_ID}}`, consolidated placeholders, etc).
   *
   * The rendered Markdown is converted to HTML for a fast in-app preview.
   */
  action: 'renderMarkdownTemplate';
  /**
   * Google Drive file id (or language map) for the Markdown template.
   */
  templateId: TemplateIdMap;
  placements?: ButtonPlacement[];
}

export interface RenderHtmlTemplateButtonConfig {
  /**
   * Render an HTML template stored in Google Drive (text/html or text/plain) using the same placeholder
   * rules as Doc templates (e.g., `{{FIELD_ID}}`, consolidated placeholders, line-item directives, etc).
   *
   * The rendered HTML is displayed directly in the web app.
   */
  action: 'renderHtmlTemplate';
  /**
   * Google Drive file id (or language map) for the HTML template.
   */
  templateId: TemplateIdMap;
  placements?: ButtonPlacement[];
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

export interface ListViewSearchPresetButtonConfig {
  /**
   * Trigger a predefined search query in the list view.
   *
   * Note: these buttons render only in the list view (cards mode, when results are hidden).
   */
  action: 'listViewSearchPreset';
  /**
   * Optional search mode override (defaults to `listView.search.mode`).
   */
  mode?: 'text' | 'date' | 'advanced';
  /**
   * Keyword to search for (text or advanced modes).
   */
  keyword?: string;
  /**
   * Date to search for (YYYY-MM-DD) when `mode` is `date`.
   */
  dateValue?: string;
  /**
   * Advanced field filters (AND-ed together).
   */
  fieldFilters?: Record<string, string | string[]>;
}

export interface UpdateRecordButtonConfig {
  /**
   * Update an existing record (draft save), then optionally navigate to another view.
   *
   * Primary use case: "Re-open" a record whose status matches `statusTransitions.onClose`
   * (set status to `statusTransitions.reOpened` or another non-closed value, then navigate to Form).
   */
  action: 'updateRecord';
  /**
   * Fields to update.
   *
   * Notes:
   * - `status` updates the system Status column (or the configured followup `statusFieldId`).
   * - `values` updates question fields (top-level only; does not support updating line-item groups/files).
   */
  set: {
    status?: string | null;
    values?: Record<string, DefaultValue | null>;
  };
  /**
   * Optional confirmation dialog shown before applying the update.
   */
  confirm?: ButtonConfirmConfig;
  /**
   * After a successful update, navigate to the specified view.
   * - auto: preserve current behavior (no forced navigation)
   */
  navigateTo?: ButtonNavigateTo;
  placements?: ButtonPlacement[];
}

export interface OpenUrlFieldButtonConfig {
  /**
   * Open (redirect to) the URL stored in a field of the current record.
   * Intended for quick access to saved PDFs, Drive links, or external resources.
   */
  action: 'openUrlField';
  /**
   * Field id containing the URL.
   * Can be a question id or a meta field like `pdfUrl`.
   */
  fieldId: string;
  placements?: ButtonPlacement[];
}

export type ButtonConfig =
  | RenderDocTemplateButtonConfig
  | RenderMarkdownTemplateButtonConfig
  | RenderHtmlTemplateButtonConfig
  | CreateRecordPresetButtonConfig
  | ListViewSearchPresetButtonConfig
  | UpdateRecordButtonConfig
  | OpenUrlFieldButtonConfig;

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
  /**
   * When true, visually hide the field label in the edit view (kept for accessibility).
   *
   * Use this sparingly: labels help users understand fields. This is mainly useful when a field is already
   * clearly explained by surrounding UI, or when you render your own label elsewhere.
   */
  hideLabel?: boolean;
  /**
   * When true, render the field value as a read-only label in the edit view.
   */
  renderAsLabel?: boolean;
  /**
   * Summary-only override for label visibility.
   *
   * - When omitted, the Summary view inherits from `hideLabel`.
   * - When `true`, hide the label in the native Summary view (kept for accessibility).
   * - When `false`, show the label in the native Summary view (even if `hideLabel` is true).
   *
   * Note: This applies to the built-in React Summary view (`ReportLivePreview`). It does not affect custom HTML templates.
   */
  summaryHideLabel?: boolean;
  /**
   * Whether this field should appear in the Summary view.
   * Default is `inherit` (only show when the field is visible in the Form view).
   */
  summaryVisibility?: SummaryVisibility;
  /**
   * For PARAGRAPH fields, controls the textarea height (visible rows).
   * Default when omitted: 4.
   */
  paragraphRows?: number;
  /**
   * For CHOICE fields rendered as a select, enable a type-to-search input for long option lists.
   *
   * - true: always use the searchable control (even for smaller lists)
   * - false: always use the native select (no search)
   * - undefined: auto (enabled only when option count is "large")
   */
  choiceSearchEnabled?: boolean;
  /**
   * Optional disclaimer section appended below PARAGRAPH fields.
   *
   * The UI renders this as a non-editable block by default and keeps the stored value in sync by
   * appending the generated section to the paragraph content. Set `editable` to true to allow
   * editing the injected section directly in the textarea.
   */
  paragraphDisclaimer?: ParagraphDisclaimerConfig;
  /**
   * Optional field-driven overlay open actions.
   *
   * When configured, the field can render as a button (after `when` matches)
   * to open a line-item group overlay with optional row filters + UI overrides.
   */
  overlayOpenActions?: LineItemOverlayOpenActionConfig[];
}

export interface ParagraphDisclaimerConfig {
  /**
   * Line item group id to scan for non-match flags (`__ckNonMatchOptions`).
   */
  sourceGroupId: string;
  /**
   * Optional subgroup id to scan (aggregates all rows across parent rows).
   */
  sourceSubGroupId?: string;
  /**
   * Line item field id to use as the item label (defaults to anchorFieldId or first field).
   */
  itemFieldId?: string;
  /**
   * Optional section title shown before the disclaimer bullets.
   */
  title?: LocalizedString | string;
  /**
   * Template for each mismatch line. Supports {key} / {value} and {items} / {keys} placeholders.
   */
  listMessage?: LocalizedString | string;
  /**
   * Optional extra bullet shown after the per-key list.
   */
  message?: LocalizedString | string;
  /**
   * Optional separator inserted before the disclaimer section (defaults to "---").
   */
  separator?: string;
  /**
   * When true, render the disclaimer inside the textarea so it can be edited.
   * Defaults to false (non-editable disclaimer block).
   */
  editable?: boolean;
}

export interface FileUploadConfig {
  destinationFolderId?: string;
  /**
   * Minimum number of files required to satisfy validation for this FILE_UPLOAD field.
   * When set, the form will block submit until at least this many files are attached.
   */
  minFiles?: number;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
  /**
   * Allowed MIME types for uploads. Supports wildcards like "image/*" and "video/*".
   * When provided, files must match at least one MIME type OR an allowed extension (if extensions are also provided).
   */
  allowedMimeTypes?: string[];
  /**
   * Optional localized override messages for upload validation errors.
   * Templates may include variables like {field}, {name}, {min}, {max}, {mb}, {exts}, {types}.
   */
  errorMessages?: FileUploadErrorMessages;
  /**
   * Optional client-side compression settings (applied before uploading to Drive).
   * Note: Video compression is not performed by default (see docs).
   */
  compression?: FileUploadCompressionConfig;
  /**
   * Optional helper text shown under the upload control (e.g., "You can add 3 more photos.").
   *
   * - When omitted, the UI falls back to the built-in system strings.
   * - Supports template variables like {count}.
   */
  helperText?: FileUploadHelperText;
  /**
   * Optional localized label template for links shown for uploaded items (Summary/PDF).
   *
   * Example:
   * - { "en": "Photo {n}", "fr": "Photo {n}", "nl": "Foto {n}" }
   *
   * Variables:
   * - {n}: 1-based index of the file within this field
   */
  linkLabel?: LocalizedString;
  /**
   * Optional UI customization for how the upload control is rendered.
   * When omitted, the default dropzone + Files button UI is used.
   */
  ui?: FileUploadUiConfig;
}

export interface FileUploadErrorMessages {
  minFiles?: LocalizedString;
  maxFiles?: LocalizedString;
  maxFileSizeMb?: LocalizedString;
  fileType?: LocalizedString;
  compressFailed?: LocalizedString;
}

export type FileUploadHelperText = LocalizedString | FileUploadHelperTextConfig;

export interface FileUploadHelperTextConfig {
  remainingOne?: LocalizedString;
  remainingMany?: LocalizedString;
}

export interface FileUploadUiConfig {
  /**
   * Visual variant for the upload control.
   * - `standard`: existing dropzone + Files button.
   * - `progressive`: show a row of camera slots (based on minFiles/required) with checkmarks as files are added.
   */
  variant?: 'standard' | 'progressive';
  /**
   * Icon used for the progressive slots.
   * - `camera`: use a camera icon (good for photo requirements).
   * - `clip`: use a paperclip icon (good for generic file attachments).
   */
  slotIcon?: 'camera' | 'clip';
}

export type FileUploadCompressionConfig =
  | {
      images?: boolean | { enabled?: boolean; maxDimension?: number; quality?: number; outputType?: 'image/jpeg' | 'image/webp' | 'keep' };
      videos?: boolean;
    }
  | undefined;

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
   *
   * You can also provide multiple columns to form a composite key. The system joins
   * the column values with `||` in the order provided (to match `OptionFilter.dependsOn` arrays).
   */
  keyColumn: SheetColumnRef | SheetColumnRef[];
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
  /**
   * When true, split a single key cell into multiple keys (useful when the key column stores
   * a comma-separated list like "Vegan, Vegetarian, No-salt").
   *
   * Keys are split using `keyDelimiter` when provided; otherwise the default splitting
   * (comma/semicolon/newline) is used.
   */
  splitKey?: boolean;
  /**
   * Optional delimiter to split keys when `splitKey` is true.
   * Use `"none"` to disable splitting even when `splitKey` is set (not recommended).
   */
  keyDelimiter?: string;
}

export type OptionFilterMatchMode = 'and' | 'or';

export type FieldChangeDialogTargetScope = 'top' | 'row' | 'parent' | 'effect';

export interface FieldChangeDialogTarget {
  scope: FieldChangeDialogTargetScope;
  fieldId: string;
  effectId?: string;
}

export interface FieldChangeDialogInput {
  id: string;
  label?: LocalizedString;
  placeholder?: LocalizedString;
  /**
   * Optional explicit input type override (defaults to the target field type).
   */
  type?: 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'CHOICE' | 'CHECKBOX' | 'DATE';
  required?: boolean;
  target: FieldChangeDialogTarget;
}

export interface FieldChangeDialogConfig {
  /**
   * When true, show the dialog and hold autosave until the user confirms.
   */
  when: WhenClause;
  title?: LocalizedString;
  message?: LocalizedString;
  confirmLabel?: LocalizedString;
  cancelLabel?: LocalizedString;
  /**
   * Control whether dedup precheck should run for the change.
   * - auto (default): run when the changed field participates in a reject dedup rule.
   * - always: always run the dedup precheck.
   * - never: skip dedup precheck.
   */
  dedupMode?: 'auto' | 'always' | 'never';
  /**
   * Optional dialog input fields that update other targets on confirm.
   */
  inputs?: FieldChangeDialogInput[];
}

export interface OptionFilter {
  dependsOn: string | string[]; // question/field ID(s) to watch (supports array for composite filters)
  optionMap?: Record<string, string[]>; // value -> allowed options (composite keys can be joined values)
  optionMapRef?: OptionMapRefConfig; // optional source reference (resolved into optionMap at load time)
  /**
   * Optional data source column used to filter dataSource-backed options.
   * When set, the filter compares dependency values against this column.
   */
  dataSourceField?: string;
  /**
   * Optional delimiter for values stored in a single data source cell (defaults to comma/semicolon/newline).
   * Use "none" to disable splitting.
   */
  dataSourceDelimiter?: string;
  /**
   * Optional dependency values that bypass filtering (returns the full option list).
   */
  bypassValues?: string[];
  /**
   * When a dependency resolves to multiple values (e.g., multi-select checkbox),
   * control whether allowed options are intersected (and) or unioned (or).
   */
  matchMode?: OptionFilterMatchMode;
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
  /**
   * Match based on emptiness rather than a specific value.
   * - true: matches when the field has any non-empty value (not null/undefined/blank)
   * - false: matches when the field is empty
   */
  notEmpty?: boolean;
}

/**
 * Compound condition support for `when` clauses.
 *
 * - Leaf conditions use `VisibilityCondition` (single-field comparison).
 * - Compound conditions allow combining multiple leaf/compound entries using:
 *   - all: AND (every entry must match)
 *   - any: OR (at least one entry must match)
 *   - not: NOT (negates a nested condition)
 * - Line-item conditions allow matching rows in a group/subgroup using `lineItems`.
 *
 * Notes:
 * - This shape is supported for visibility rules, validation rules, row disclaimers, and guided-step row filters.
 * - Backwards compatible: any existing single-field `VisibilityCondition` remains valid.
 */
export interface WhenAllClause {
  all: WhenClause[];
}
export interface WhenAnyClause {
  any: WhenClause[];
}
export interface WhenNotClause {
  not: WhenClause;
}

export interface LineItemWhenClause {
  /**
   * Evaluate conditions against line-item rows (and optional subgroups).
   */
  lineItems: {
    /**
     * Line item group question id.
     */
    groupId: string;
    /**
     * Optional subgroup id to evaluate (scans all parent rows).
     * Prefer `subGroupPath` for deep nesting and wildcard paths.
     */
    subGroupId?: string;
    /**
     * Optional subgroup path to evaluate (dot-delimited string or array of ids).
     * Supports wildcards:
     * - "*" matches a single subgroup level
     * - "**" matches any depth (including zero levels)
     */
    subGroupPath?: string | string[];
    /**
     * Row-level condition applied within each row.
     * When omitted, any row counts as a match.
     */
    when?: WhenClause;
    /**
     * Optional condition evaluated against the parent/ancestor rows when subgroup matching is used.
     * This lets you scope subgroup matching to parent rows that satisfy their own criteria.
     */
    parentWhen?: WhenClause;
    /**
     * Row matching mode (default: "any").
     */
    match?: 'any' | 'all';
    /**
     * Parent-row matching mode (default: "any") when `parentWhen` is set.
     */
    parentMatch?: 'any' | 'all';
    /**
     * Which ancestor scope to use for parentWhen.
     * - immediate: direct parent row only (default)
     * - ancestor: any ancestor row (root-to-parent chain)
     */
    parentScope?: 'immediate' | 'ancestor';
  };
}

export type WhenClause = VisibilityCondition | WhenAllClause | WhenAnyClause | WhenNotClause | LineItemWhenClause;

export interface VisibilityConfig {
  showWhen?: WhenClause;
  hideWhen?: WhenClause;
}

export type LocalizedString = string | {
  en?: string;
  fr?: string;
  nl?: string;
  [key: string]: string | undefined;
};

export interface ValidationRule {
  when: WhenClause;
  then?: {
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
   * Warning-only display preference for UI surfaces (edit + summary).
   * Defaults to "top".
   * - top: show in the warnings banner only
   * - field: show only under the target field
   * - both: show in both places
   */
  warningDisplay?: 'top' | 'field' | 'both';
  /**
   * Warning-only view preference for UI surfaces.
   * Defaults to "both".
   * - edit: show warnings only on the edit (form) view
   * - summary: show warnings only on the summary view
   * - both: show warnings on both views
   */
  warningView?: 'edit' | 'summary' | 'both';
  /**
   * Optional phase scoping. Defaults to "both".
   * - submit: apply only on form submission
   * - followup: apply only on follow-up actions
   * - both: apply everywhere
   */
  phase?: 'submit' | 'followup' | 'both';
  /**
   * Optional rule severity. Defaults to "error".
   * - error: blocks submission (normal validation behavior)
   * - warning: does not block submission, but is surfaced in submission/summary/PDF messages
   */
  level?: 'error' | 'warning';
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

export interface DerivedValueCalcFilterConfig {
  /**
   * Reference to the aggregate in the expression (e.g., "MP_TYPE_LI.PREP_QTY").
   */
  ref: string;
  /**
   * When-clause applied to each row included in the aggregate.
   */
  when: WhenClause;
}

export interface DerivedValueCalcConfig {
  op: 'calc';
  /**
   * Numeric expression using `{FIELD_ID}` tokens and `SUM(GROUP.FIELD)` aggregates.
   * Example: "{QTY} - SUM(MP_TYPE_LI.PREP_QTY)".
   */
  expression: string;
  /**
   * Optional per-aggregate filters for SUM(...) tokens.
   */
  lineItemFilters?: DerivedValueCalcFilterConfig[];
  /**
   * When to apply the derived value:
   * - always: recompute on every change (default for calc)
   * - empty: only set when the target field is empty (allows user overrides)
   */
  when?: DerivedValueWhen;
  /**
   * Control when the derived value is applied during editing.
   * - change: apply on every onChange (default for calc)
   * - blur: apply only after the user leaves the input
   */
  applyOn?: 'change' | 'blur';
  /**
   * Optional numeric precision (decimal places) applied to the computed result.
   */
  precision?: number;
  /**
   * Optional clamp bounds for the computed result.
   */
  min?: number;
  max?: number;
  hidden?: boolean;
}

export type DerivedValueConfig =
  | DerivedValueAddDaysConfig
  | DerivedValueTodayConfig
  | DerivedValueTimeOfDayMapConfig
  | DerivedValueCopyConfig
  | DerivedValueCalcConfig;

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
   * - table: compact table layout with one row per line item
   */
  mode?: 'progressive' | 'default' | 'table';
  /**
   * Optional ordered list of field ids to render as columns when `mode: "table"`.
   * Defaults to the line item field order.
   */
  tableColumns?: string[];
  /**
   * Optional per-column widths for table mode.
   * Keys should match field ids; use "__remove" to target the remove button column.
   * Values can be CSS widths (e.g., "50%", "120px") or numbers (treated as percent).
   */
  tableColumnWidths?: Record<string, string | number>;
  /**
   * Controls how non-match option warnings are shown in the table legend.
   *
   * - descriptive: show per-row optionFilter warnings that list which dependency keys were not satisfied
   * - validation: show warning messages from validationRules (e.g., __ckNonMatchOptions) instead
   * - both: show both (deduped)
   */
  nonMatchWarningMode?: 'descriptive' | 'validation' | 'both';
  /**
   * When true (default), hide non-anchor columns until the anchor field has a value.
   * Useful when rows are created by selecting the anchor value first (e.g., ingredients).
   */
  tableHideUntilAnchor?: boolean;
  /**
   * When true, the line item group editor is opened in a full-page overlay (similar to subgroup overlays),
   * and the main form shows a compact "Open" card instead of rendering the full table inline.
   *
   * Default: false (render inline).
   */
  openInOverlay?: boolean;
  /**
   * Optional overlay detail layout (header/body) for full-page group overlays.
   * Requires `openInOverlay: true` to take effect.
   */
  overlayDetail?: LineItemOverlayDetailConfig;
  /**
   * Default CHOICE search behavior for all CHOICE fields in this group (and its subgroups when configured there),
   * unless a specific field overrides it via `field.ui.choiceSearchEnabled`.
   *
   * - true: always use the searchable control for CHOICE selects
   * - false: always use the native select (no search)
   * - undefined: auto (enabled only when option count is "large")
   */
  choiceSearchEnabled?: boolean;
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

  /**
   * Optional localized helper shown when a line-item group or subgroup needs attention.
   */
  needsAttentionMessage?: LocalizedString;

  /**
   * Controls whether the "N items" pill is displayed in the group header.
   * Defaults to true.
   */
  showItemPill?: boolean;

  /**
   * Controls where the "Add" button is shown for this group (and for subgroups when configured there).
   * Defaults to 'both' (top header + bottom toolbar).
   */
  addButtonPlacement?: 'top' | 'bottom' | 'both' | 'hidden';

  /**
   * Controls whether rows marked as auto-generated (`__ckRowSource: "auto"`) can be removed in the UI.
   * When false, the Remove button is hidden for auto rows (manual rows remain removable).
   *
   * Default: true.
   */
  allowRemoveAutoRows?: boolean;

  /**
   * Controls whether "disabled" progressive rows are persisted on submit.
   *
   * A row is considered disabled when:
   * - `mode: "progressive"`
   * - `expandGate: "collapsedFieldsValid"`
   * - the row is still collapsed AND its collapsed fields are missing/invalid
   *
   * When false (default), these rows are filtered out of the submission payload.
   * When true, they are included in the saved record (useful when you want them to appear in downstream PDFs).
   */
  saveDisabledRows?: boolean;
}

export interface LineItemOverlayDetailConfig {
  enabled?: boolean;
  header?: LineItemOverlayDetailHeaderConfig;
  body?: LineItemOverlayDetailBodyConfig;
  rowActions?: LineItemOverlayDetailRowActionsConfig;
}

export interface LineItemOverlayDetailHeaderConfig {
  tableColumns?: string[];
  tableColumnWidths?: Record<string, string | number>;
  addButtonPlacement?: 'top' | 'bottom' | 'both' | 'hidden';
}

export interface LineItemOverlayDetailBodyConfig {
  /**
   * Target subgroup id to render in the body section.
   */
  subGroupId: string;
  edit?: {
    mode?: 'table';
    tableColumns?: string[];
    tableColumnWidths?: Record<string, string | number>;
  };
  view?: {
    mode?: 'html';
    templateId: TemplateIdMap;
    /**
     * Optional list of tab targets to hide in HTML templates that use data-tab-target/data-tab-panel.
     */
    hideTabTargets?: string[];
  };
}

export interface LineItemOverlayDetailRowActionsConfig {
  viewLabel?: LocalizedString | string;
  editLabel?: LocalizedString | string;
  viewPlacement?: 'header' | 'body' | 'hidden';
  editPlacement?: 'header' | 'body' | 'hidden';
}

export interface RowDisclaimerRule {
  /**
   * Optional condition evaluated against the current row values.
   * - fieldId is required; comparisons use the raw row value (arrays use first element).
   */
  when?: WhenClause;
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
   * Optional localized validation message used when this required field is empty.
   *
   * Supports `{field}` placeholder (resolved to the localized field label).
   */
  requiredMessage?: LocalizedString;
  /**
   * Optional default value used when creating new rows (manual/auto/selectionEffect) or when the field is missing.
   *
   * This is applied only when the row value is missing (not present), so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * When true, this field is read-only in the edit (form) view (within line item rows and subgroup overlays).
   *
   * Notes:
   * - The value is still included in submissions.
   * - Intended for fields set by `defaultValue`, `derivedValue`, or preset row generation.
   */
  readOnly?: boolean;
  /**
   * Optional option ordering override for this field (CHOICE/CHECKBOX).
   * - alphabetical: sort by the localized label (default)
   * - source: preserve source order (as defined in config sheets / optionFilter / data sources)
   */
  optionSort?: OptionSortMode;
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
  optionsRaw?: Record<string, any>[];
  optionFilter?: OptionFilter;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  changeDialog?: FieldChangeDialogConfig;
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
  placeholder?: LocalizedString | string;
  placeholderEn?: string;
  placeholderFr?: string;
  placeholderNl?: string;
  hideLabel?: boolean;
  options?: string[];
  optionsFr?: string[];
  optionsNl?: string[];
  optionsRaw?: Record<string, any>[];
  optionsRef?: string;
  required?: boolean;
  /**
   * For selectors rendered as a select, enable the type-to-search input.
   *
   * - true: always use the searchable control (even for smaller lists)
   * - false: always use the native select (no search)
   * - undefined: auto (enabled only when option count is "large")
   */
  choiceSearchEnabled?: boolean;
  /**
   * Optional option filter for the selector itself (supports optionMap or optionMapRef).
   * Useful for cascading selectors where available sections depend on other fields.
   */
  optionFilter?: OptionFilter;
}

export interface LineItemTotalConfig {
  type: 'sum' | 'count';
  fieldId?: string; // required for sum, ignored for count
  label?: LocalizedString;
  decimalPlaces?: number;
}

export interface LineItemDedupRule {
  /**
   * Field ids that must be unique together within a line-item group or subgroup.
   */
  fields: string[];
  /**
   * Optional localized error message shown when a duplicate is detected.
   */
  message?: LocalizedString;
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
  addMode?: 'overlay' | 'selectorOverlay' | 'inline' | 'auto';
  sectionSelector?: LineItemSelectorConfig;
  dedupRules?: LineItemDedupRule[];
  totals?: LineItemTotalConfig[];
  fields: LineItemFieldConfig[];
  subGroups?: LineItemGroupConfig[]; // nested line item groups driven by this header group
}

export interface LineItemGroupConfigOverride {
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
  anchorFieldId?: string;
  addMode?: 'overlay' | 'selectorOverlay' | 'inline' | 'auto';
  sectionSelector?: LineItemSelectorConfig;
  dedupRules?: LineItemDedupRule[];
  totals?: LineItemTotalConfig[];
  fields?: LineItemFieldConfig[];
  subGroups?: LineItemGroupConfig[];
}

export interface LineItemOverlayRowFilter {
  includeWhen?: WhenClause;
  excludeWhen?: WhenClause;
}

export interface LineItemOverlayOpenActionConfig {
  /**
   * Target line-item group id to open.
   */
  groupId: string;
  /**
   * Optional condition to enable/activate this action.
   */
  when?: WhenClause;
  /**
   * Optional button label override (defaults to the field label).
   */
  label?: LocalizedString;
  /**
   * Optional row filter applied to the overlay header rows.
   */
  rowFilter?: LineItemOverlayRowFilter | null;
  /**
   * Optional override for the overlay view of this group.
   */
  groupOverride?: LineItemGroupConfigOverride;
  /**
   * When true, hide inline subgroups in the overlay body (header-only + body detail).
   */
  hideInlineSubgroups?: boolean;
  /**
   * Render mode for the field-triggered opener.
   * - replace: replace the field control with a button (default)
   * - inline: keep the control and show a separate button below
   */
  renderMode?: 'replace' | 'inline';
  /**
   * Optional value to set on the source field when the reset (trash) action is confirmed.
   * Use this to revert the field back to its original control by breaking the `when` condition.
   */
  resetValue?: DefaultValue;
  /**
   * When true, hide the trash/reset icon on the overlay opener button.
   */
  hideTrashIcon?: boolean;
  /**
   * When true, hide the close button in the overlay header.
   */
  hideCloseButton?: boolean;
  /**
   * Optional label override for the overlay close button.
   */
  closeButtonLabel?: LocalizedString;
  /**
   * Optional confirm dialog shown when closing the overlay.
   */
  closeConfirm?: RowFlowActionConfirmConfig;
  /**
   * Optional list of line-item field ids to surface inline when the target group only allows one row.
   * This keeps the data structure unchanged while flattening the UI for quick edits.
   */
  flattenFields?: string[];
  /**
   * Placement for `flattenFields` relative to the opener field.
   * - left: render flattened fields to the left
   * - right: render flattened fields to the right
   * - below: render flattened fields beneath the opener (default)
   */
  flattenPlacement?: 'left' | 'right' | 'below';
  /**
   * Optional row-flow override to use when rendering the overlay editor for this group.
   */
  rowFlow?: RowFlowConfig;
}

export interface SelectionEffect {
  /**
   * Optional stable identifier for this selection effect rule.
   *
   * When present, rows created by this effect will be tagged with `__ckSelectionEffectId`
   * so you can reference the originating effect in visibility/validation/disclaimer rules.
   */
  id?: string;
  type: 'addLineItems' | 'addLineItemsFromDataSource' | 'deleteLineItems' | 'setValue';
  // target line item group (legacy or immediate subgroup id); required for add/delete effects
  groupId?: string;
  // target field id for setValue effects (uses current row context when triggered inside line items)
  fieldId?: string;
  // value to set for setValue effects (supports $row./$top. references; null clears)
  value?: PresetValue | null;
  /**
   * Optional subgroup path target for nested line item groups.
   * - String uses dot notation: "SUB1.SUB2"
   * - Array uses explicit ids: ["SUB1", "SUB2"]
   */
  targetPath?: string | string[];
  /**
   * Optional conditional gate for the effect (evaluated against the current row/top-level values).
   */
  when?: WhenClause;
  preset?: Record<string, PresetValue>; // preset field values for simple addLineItems (supports $row./$top. references)
  triggerValues?: string[]; // which choice/checkbox values trigger this effect (defaults to any)
  /**
   * When true, rows created by this effect should not show the UI "Remove" action.
   * (Useful for child rows that are managed automatically via selection effects.)
   */
  hideRemoveButton?: boolean;
  /**
   * For `type: "deleteLineItems"`, optionally specify which `SelectionEffect.id` to delete rows for.
   * If omitted, the effect's own `id` is used.
   */
  targetEffectId?: string;
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
  /**
   * Status value for draft/in-progress records (used by autosave/list view defaults).
   */
  inProgress?: LocalizedString | string;
  /**
   * Status value written when explicitly re-opening a closed record.
   */
  reOpened?: LocalizedString | string;
  onPdf?: LocalizedString | string;
  onEmail?: LocalizedString | string;
  onClose?: LocalizedString | string;
}

export type TemplateIdBase = string | Record<string, string>;

export interface TemplateIdCase {
  /**
   * Condition evaluated against the record values. First match wins.
   *
   * Notes:
   * - `fieldId` is required; comparisons use the stored record value (arrays use first element).
   * - Use raw stored values (not localized labels) for CHOICE/CHECKBOX fields.
   */
  when: VisibilityCondition;
  /**
   * Template id (or language map) to use when the case matches.
   */
  templateId: TemplateIdBase;
}

/**
 * Template id config:
 * - string: single template id
 * - object map: language -> template id (e.g. { EN: "...", FR: "..." })
 * - cases: choose a template based on a field value, with optional language maps per case
 */
export type TemplateIdMap =
  | TemplateIdBase
  | {
      cases: TemplateIdCase[];
      default?: TemplateIdBase;
    };

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
   * When omitted, the app falls back to `statusTransitions.inProgress` if configured.
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
  /**
   * Optional allow-list filter for record-like sources that include a `status` column.
   * When set, only rows whose status value matches one of these strings (case-insensitive) are returned.
   */
  statusAllowList?: string[];
  projection?: string[]; // limit columns returned
  limit?: number; // optional max rows
  mapping?: Record<string, string>; // optional map from source column -> target field id
  tooltipField?: string; // optional column used for option tooltips
  tooltipLabel?: LocalizedString | string; // optional localized label for tooltip trigger/header
}

export interface PageSectionConfig {
  /**
   * Optional stable identifier for the page section.
   * Recommended when multiple groups share the same page section.
   */
  id?: string;
  /**
   * Section title rendered above a set of group cards in the edit (form) view.
   * Can be localized (en/fr/nl) or a plain string.
   */
  title: LocalizedString | string;
  /**
   * Optional informational text shown on the right side of the section header (edit view only).
   * Can be localized (en/fr/nl) or a plain string.
   */
  infoText?: LocalizedString | string;
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
  /**
   * Optional higher-level page section wrapper for visual grouping in the edit (form) view.
   *
   * This does not affect grouping behavior (fields are still grouped by this group's `id`/`title`),
   * and it does not change validation or submission payloads.
   */
  pageSection?: PageSectionConfig;
}

export interface QuestionConfig {
  id: string;
  type: QuestionType;
  qEn: string;
  qFr: string;
  qNl: string;
  required: boolean;
  /**
   * Optional localized validation message used when this required field is empty.
   *
   * Supports `{field}` placeholder (resolved to the localized field label).
   */
  requiredMessage?: LocalizedString;
  /**
   * Optional default value used when creating a new record (or when the field is missing in a saved record).
   *
   * This is applied only when the field has no value in the payload (i.e., missing), so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * When true, this field is read-only in the edit (form) view.
   *
   * Notes:
   * - The value is still included in submissions.
   * - Intended for fields set by `defaultValue`, `derivedValue`, or `createRecordPreset` buttons.
   */
  readOnly?: boolean;
  /**
   * Optional option ordering override for this field (CHOICE/CHECKBOX).
   * - alphabetical: sort by the localized label (default)
   * - source: preserve source order (as defined in config sheets / optionFilter / data sources)
   */
  optionSort?: OptionSortMode;
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
  optionsRaw?: Record<string, any>[];
  status: 'Active' | 'Archived';
  uploadConfig?: FileUploadConfig;
  lineItemConfig?: LineItemGroupConfig;
  optionFilter?: OptionFilter;
  valueMap?: ValueMapConfig;
  derivedValue?: DerivedValueConfig;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  changeDialog?: FieldChangeDialogConfig;
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
  /**
   * CacheService TTL (seconds) for cached HTML/Markdown templates for this form.
   *
   * Notes:
   * - Apps Script CacheService has a hard max TTL of 6 hours (21600s).
   * - When omitted (recommended) or set to 0/negative, the app uses the maximum TTL and relies on the template cache epoch
   *   ("Create/Update All Forms") to flush templates immediately when you update Drive files.
   */
  templateCacheTtlSeconds?: number;
  /**
   * Optional override for the list view heading/title.
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column (recommended: `listView.title`).
   */
  listViewTitle?: LocalizedString;
  /**
   * Optional override for the list view default sort (recommended: `listView.defaultSort`).
   */
  listViewDefaultSort?: ListViewConfig['defaultSort'];
  /**
   * Optional override for list view page size (recommended: `listView.pageSize`).
   */
  listViewPageSize?: number;
  /**
   * Optional UI override to hide list view pagination controls (recommended: `listView.paginationControlsEnabled`).
   */
  listViewPaginationControlsEnabled?: boolean;
  /**
   * Optional UI override to enable/disable interactive header sorting in the list view (recommended: `listView.headerSortEnabled`).
   */
  listViewHeaderSortEnabled?: boolean;
  listViewMetaColumns?: string[];
  /**
   * Optional list view columns defined at the dashboard level (in the “Follow-up Config (JSON)” column).
   *
   * Notes:
   * - These columns are prepended before question + meta columns in the generated definition list view.
   * - Supports both normal field/meta columns and rule-based computed columns (`type: "rule"`).
   */
  listViewColumns?: ListViewColumnConfig[];
  /**
   * Optional legend shown below the list view table (dashboard-level config).
   *
   * Use this to explain the meaning of icons used in rule-based columns (e.g., warning/check/error).
   */
  listViewLegend?: ListViewLegendItem[];
  /**
   * Optional override for the list view search UI/behavior (recommended: `listView.search`).
   */
  listViewSearch?: ListViewConfig['search'];
  /**
   * Optional override for the list view UI mode (table vs cards) and toggle behavior (recommended: `listView.view`).
   */
  listViewView?: ListViewConfig['view'];
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
   * When false, list-row clicks always open the Form view
   * (records matching `statusTransitions.onClose` are read-only).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  summaryViewEnabled?: boolean;
  /**
   * Optional HTML template used to fully replace the Summary view UI.
   *
   * When set, the Summary view renders this Drive HTML template (with placeholders) instead of the built-in summary UI.
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  summaryHtmlTemplateId?: TemplateIdMap;
  /**
   * Enable/disable the "Copy current record" action in the React web app.
   * When false, the Create button always creates a new record (no copy option).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  copyCurrentRecordEnabled?: boolean;
  /**
   * Optional list of field ids to clear when copying the current record (forces re-entry on the new record).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  copyCurrentRecordDropFields?: string[];
  /**
   * Optional localized label override for the Create button in the React web app.
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  createButtonLabel?: LocalizedString;
  /**
   * Optional localized label override for the "Copy current record" action in the React web app.
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  copyCurrentRecordLabel?: LocalizedString;
  /**
   * Enable/disable the standard "New record" create action in the React web app.
   *
   * When false, users can only create records via `createRecordPreset` buttons (or Copy, if enabled).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  createNewRecordEnabled?: boolean;
  /**
   * Enable/disable `createRecordPreset` BUTTON actions in the React web app.
   * When false, these custom buttons are ignored (not shown in any action bars).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  createRecordPresetButtonsEnabled?: boolean;
  /**
   * Optional per-view action bar configuration (system + custom buttons).
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  actionBars?: ActionBarsConfig;
  /**
   * Optional app header configuration (dashboard-level).
   */
  appHeader?: AppHeaderConfig;
  /**
   * Optional behavior settings for collapsible group sections in the edit view (dashboard-level).
   */
  groupBehavior?: GroupBehaviorConfig;
  /**
   * Optional submission validation UI settings (dashboard-level).
   */
  submitValidation?: SubmitValidationConfig;

  /**
   * Optional guided steps configuration for the React edit (form) view.
   * When set with `mode: "guided"`, the app renders a multi-step guided UI instead of the standard edit mode.
   */
  steps?: StepsConfig;
  /**
   * Optional UI setting: when true, block landscape orientation in the web app (shows a "rotate to portrait" message).
   *
   * Note: browsers cannot reliably lock orientation; this is a UI guardrail for phones.
   */
  portraitOnly?: boolean;

  /**
   * Optional confirmation message shown to the user before submitting (Confirm/Cancel overlay).
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  submissionConfirmationMessage?: LocalizedString;

  /**
   * Optional confirmation title shown to the user before submitting (Confirm/Cancel overlay).
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  submissionConfirmationTitle?: LocalizedString;

  /**
   * Optional localized label override for the positive (confirm) button shown in the submission confirmation dialog.
   *
   * When omitted, the UI falls back to the resolved Submit button label.
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  submissionConfirmationConfirmLabel?: LocalizedString;

  /**
   * Optional localized label override for the negative (cancel) button shown in the submission confirmation dialog.
   *
   * When omitted, the UI falls back to localized system strings (e.g. "Cancel").
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  submissionConfirmationCancelLabel?: LocalizedString;

  /**
   * Optional localized label override for the Submit button in the React web app.
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  submitButtonLabel?: LocalizedString;

  /**
   * Optional localized label override for the Summary button in the React web app.
   *
   * Configured via the dashboard “Follow-up Config (JSON)” column.
   */
  summaryButtonLabel?: LocalizedString;
}

export interface FormConfigExport {
  formKey: string;
  generatedAt: string;
  form: FormConfig;
  questions: QuestionConfig[];
  dedupRules: DedupRule[];
  definition: WebFormDefinition;
  validationErrors: string[];
}

export interface AppHeaderConfig {
  /**
   * Optional logo image shown in the app header.
   *
   * Recommend using a Google Drive image (shared with users) via a direct URL.
   */
  logoUrl?: string;
}

export interface GroupBehaviorConfig {
  /**
   * When true, automatically collapse a group section when it becomes complete (based on required progress).
   */
  autoCollapseOnComplete?: boolean;
  /**
   * When true (and autoCollapseOnComplete is enabled), automatically open the next incomplete section.
   */
  autoOpenNextIncomplete?: boolean;
  /**
   * When true, scroll the expanded section to the top (below the sticky header).
   */
  autoScrollOnExpand?: boolean;
  /**
   * When true, keep collapsible group sections expanded in the Summary view (native React summary).
   *
   * Notes:
   * - This overrides per-group `defaultCollapsed` on the Summary view only.
   * - Intended for "report-like" summary pages where users should not have to expand each section.
   */
  summaryExpandAll?: boolean;
}

export interface SubmitValidationConfig {
  /**
   * When true, require users to complete required fields in order and keep Submit disabled until the form is valid.
   */
  enforceFieldOrder?: boolean;
  /**
   * Optional localized override for the top submit validation message.
   */
  submitTopErrorMessage?: LocalizedString;
  /**
   * Optional localized override for the "Needs attention" message shown under line-item group pills.
   */
  lineItemGroupNeedsAttentionMessage?: LocalizedString;
}

export type StepForwardGate = 'free' | 'whenComplete' | 'whenValid';
export type StepAutoAdvance = 'off' | 'onComplete' | 'onValid';
export type StepDisplayMode = 'inline' | 'overlay';
export type StepDisplayModeOverride = StepDisplayMode | 'inherit';

export interface StepsStateFieldsConfig {
  /**
   * Prefix for virtual/computed step fields exposed to visibility evaluation.
   *
   * Default: "__ckStep"
   */
  prefix?: string;
}

export interface StepsHeaderConfig {
  /**
   * Optional list of targets rendered consistently above the step content (e.g., customer/date/service).
   */
  include?: StepTargetConfig[];
}

export interface StepsRenderDefaultsConfig {
  /**
   * Default rendering mode for line item groups included in this step.
   */
  lineGroups?: { mode?: StepDisplayMode };
  /**
   * Default rendering mode for subgroups included in this step.
   */
  subGroups?: { mode?: StepDisplayMode };
}

export interface StepsConfig {
  /**
   * Enable guided steps UI mode in the React edit (form) view.
   */
  mode: 'guided';
  stateFields?: StepsStateFieldsConfig;
  defaultForwardGate?: StepForwardGate;
  defaultAutoAdvance?: StepAutoAdvance;
  /**
   * Optional label for the primary action while navigating between steps (non-final steps).
   * The final step always uses the form's submitButtonLabel (or system default).
   */
  stepSubmitLabel?: LocalizedString;
  /**
   * Optional Back button label for guided steps.
   */
  backButtonLabel?: LocalizedString;
  /**
   * Global toggle for showing the Back button in guided steps (default: true).
   */
  showBackButton?: boolean;
  header?: StepsHeaderConfig;
  items: StepConfig[];
}

export interface StepNavigationConfig {
  forwardGate?: StepForwardGate;
  autoAdvance?: StepAutoAdvance;
  allowBack?: boolean;
  /**
   * Optional label override for the primary action while this step is active (non-final steps).
   */
  submitLabel?: LocalizedString;
  /**
   * Optional label override for the Back button on this step.
   */
  backLabel?: LocalizedString;
  /**
   * Optional per-step toggle to hide/show the Back button (defaults to the global setting).
   */
  showBackButton?: boolean;
}

export interface StepRowFilterConfig {
  includeWhen?: WhenClause;
  excludeWhen?: WhenClause;
}

export interface RowFlowConfig {
  /**
   * Step-scoped row flow mode (currently only "progressive").
   */
  mode?: 'progressive';
  /**
   * Optional references to child line item groups for prompts/outputs/actions.
   */
  references?: Record<string, RowFlowReferenceConfig>;
  /**
   * Output row configuration.
   */
  output?: RowFlowOutputConfig;
  /**
   * Input prompt definitions (one active at a time).
   */
  prompts?: RowFlowPromptConfig[];
  /**
   * Action definitions referenced by prompts/segments.
   */
  actions?: RowFlowActionConfig[];
  /**
   * Optional context header for overlays opened from this row flow.
   */
  overlayContextHeader?: RowFlowOverlayContextHeaderConfig;
}

export interface RowFlowReferenceConfig {
  /**
   * Target line item group id.
   */
  groupId: string;
  /**
   * Optional parent reference (for nested subgroups).
   */
  parentRef?: string;
  /**
   * Row matching strategy when multiple rows are present.
   */
  match?: 'first' | 'any' | 'all';
  /**
   * Optional row filter applied when resolving this reference.
   */
  rowFilter?: StepRowFilterConfig;
}

export interface RowFlowOverlayContextHeaderConfig {
  fields: RowFlowOverlayContextFieldConfig[];
}

export interface RowFlowOverlayContextFieldConfig {
  fieldRef: string;
  /**
   * Optional label/template for this value (supports {{value}} placeholder).
   */
  label?: LocalizedString;
}

export interface RowFlowOutputConfig {
  separator?: string;
  hideEmpty?: boolean;
  segments?: RowFlowOutputSegmentConfig[];
  actions?: RowFlowActionRef[];
  /**
   * Layout for output actions relative to the segments.
   * - inline: render actions on the same row (default)
   * - below: render actions on a separate row
   */
  actionsLayout?: 'inline' | 'below';
  /**
   * Scope for output actions.
   * - row: render actions per row (default)
   * - group: render actions once after all rows
   */
  actionsScope?: 'row' | 'group';
}

export interface RowFlowOutputSegmentFormatConfig {
  type?: 'text' | 'list';
  listDelimiter?: string;
}

export interface RowFlowOutputSegmentConfig {
  fieldRef: string;
  label?: LocalizedString;
  showWhen?: WhenClause;
  format?: RowFlowOutputSegmentFormatConfig;
  renderAs?: 'value' | 'control';
  editAction?: string;
}

export interface RowFlowPromptInputConfig {
  kind?: 'field' | 'selectorOverlay';
  targetRef?: string;
  label?: LocalizedString;
  /**
   * Layout for the prompt label when rendering a field prompt.
   * - stacked: label above the control (default)
   * - inline: label rendered inline with the control
   * - hidden: hide the visual label (screen-reader label is preserved)
   */
  labelLayout?: 'stacked' | 'inline' | 'hidden';
  placeholder?: LocalizedString;
}

export interface RowFlowPromptConfig {
  id: string;
  fieldRef?: string;
  input?: RowFlowPromptInputConfig;
  showWhen?: WhenClause;
  completedWhen?: WhenClause;
  hideWhenFilled?: boolean;
  keepVisibleWhenFilled?: boolean;
  /**
   * Optional action ids to trigger once when this prompt transitions to complete.
   */
  onCompleteActions?: string[];
  /**
   * Layout for prompt actions relative to the input control.
   * - below: render actions on a separate row (default)
   * - inline: render actions alongside the prompt control
   */
  actionsLayout?: 'below' | 'inline';
  actions?: RowFlowActionRef[];
}

export interface RowFlowActionRef {
  id: string;
  position?: 'start' | 'end';
  scope?: 'row' | 'group';
  showWhen?: WhenClause;
}

export interface RowFlowActionConfirmConfig {
  title?: LocalizedString;
  body?: LocalizedString;
  confirmLabel?: LocalizedString;
  cancelLabel?: LocalizedString;
  showCancel?: boolean;
  kind?: string;
}

export type RowFlowActionEffect =
  | {
      type: 'setValue';
      fieldRef: string;
      value?: DefaultValue;
    }
  | {
      type: 'deleteLineItems';
      targetRef?: string;
      groupId?: string;
      rowFilter?: StepRowFilterConfig;
    }
  | {
      type: 'deleteRow';
    }
  | {
      type: 'addLineItems';
      targetRef?: string;
      groupId?: string;
      preset?: Record<string, DefaultValue>;
      count?: number;
    }
  | {
      type: 'closeOverlay';
    }
  | (Omit<LineItemOverlayOpenActionConfig, 'groupId'> & {
      type: 'openOverlay';
      targetRef?: string;
      groupId?: string;
      /**
       * Optional overlay context header override for this action.
       */
      overlayContextHeader?: RowFlowOverlayContextHeaderConfig;
    });

export interface RowFlowActionConfig {
  id: string;
  label?: LocalizedString;
  icon?: 'edit' | 'remove' | 'add' | 'back';
  variant?: 'button' | 'icon';
  tone?: 'primary' | 'secondary';
  showWhen?: WhenClause;
  confirm?: RowFlowActionConfirmConfig;
  effects?: RowFlowActionEffect[];
}

export interface StepSubGroupTargetConfig {
  /**
   * Subgroup id (stable identifier, not a label).
   */
  id: string;
  /**
   * Allowlist of visible subgroup row fields for this step.
   */
  fields?: StepFieldTargetRef[];
  rows?: StepRowFilterConfig;
  /**
   * Optional row filter used ONLY for guided-step validation/status.
   * This lets a step display rows differently than it validates them (e.g. show all rows, but only validate rows where QTY > 0).
   *
   * If omitted, `rows` is used for both rendering and validation.
   */
  validationRows?: StepRowFilterConfig;
  /**
   * Optional list of subgroup field ids to render as read-only labels in guided steps.
   * Use the subgroup's field ids (e.g., "FIELD_ID"); dotted/underscored prefixes are normalized.
   */
  readOnlyFields?: string[];
  /**
   * Optional override display mode for this subgroup relative to step defaults.
   */
  displayMode?: StepDisplayModeOverride;
}

export interface StepFieldTargetConfig {
  /**
   * Field id within the line item/subgroup row.
   */
  id: string;
  /**
   * When true, render the field value as a read-only label in this step (guided edit mode).
   * This is a step-scoped alternative to using `readOnlyFields`.
   */
  renderAsLabel?: boolean;
}

export type StepFieldTargetRef = string | StepFieldTargetConfig;

export interface StepSubGroupCollectionConfig {
  displayMode?: StepDisplayModeOverride;
  include?: StepSubGroupTargetConfig[];
}

export interface StepLineGroupTargetConfig {
  kind: 'lineGroup';
  /**
   * Line item group question id.
   */
  id: string;
  /**
   * How to render the group's row fields in the step.
   * - groupEditor: use the existing group editor UI (table/progressive), scoped to this step.
   * - liftedRowFields: render selected row fields as top-level step content (repeated per row).
   */
  presentation?: 'groupEditor' | 'liftedRowFields';
  /**
   * Optional step-scoped row flow configuration for progressive input/output per row.
   */
  rowFlow?: RowFlowConfig;
  /**
   * Allowlist of visible parent row fields for this step.
   */
  fields?: StepFieldTargetRef[];
  /**
   * Guided steps UX: when true and the underlying group is `ui.mode: "progressive"`,
   * render the configured `ui.collapsedFields` as controls in the row header and disable
   * the collapse/expand toggle + row progress pill.
   *
   * Notes:
   * - Intended for guided steps to reduce taps/scrolling.
   * - When the step only includes collapsed fields, the row body is hidden and only the header is shown.
   */
  collapsedFieldsInHeader?: boolean;
  rows?: StepRowFilterConfig;
  /**
   * Optional row filter used ONLY for guided-step validation/status.
   * This lets a step display rows differently than it validates them (e.g. show all rows, but only validate rows where QTY > 0).
   *
   * If omitted, `rows` is used for both rendering and validation.
   */
  validationRows?: StepRowFilterConfig;
  /**
   * Optional override display mode for this line group relative to step defaults.
   */
  displayMode?: StepDisplayModeOverride;
  /**
   * Optional list of parent-row field ids to render as read-only labels in this step.
   * Accepts either bare ids ("FIELD_ID") or prefixed ids ("GROUP__FIELD_ID" / "group.field_id"); prefixes are stripped.
   */
  readOnlyFields?: string[];
  /**
   * Optional subgroup scoping + display configuration for this step.
   */
  subGroups?: StepSubGroupCollectionConfig;
}

export interface StepQuestionTargetConfig {
  kind: 'question';
  id: string;
  /**
   * When true, render the question value as a read-only label in this step (guided edit mode).
   */
  renderAsLabel?: boolean;
}

export type StepTargetConfig = StepQuestionTargetConfig | StepLineGroupTargetConfig;

export interface StepConfig {
  id: string;
  label?: LocalizedString;
  helpText?: LocalizedString;
  render?: StepsRenderDefaultsConfig;
  include: StepTargetConfig[];
  navigation?: StepNavigationConfig;
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
   * Optional localized validation message used when this required field is empty.
   *
   * Supports `{field}` placeholder (resolved to the localized field label).
   */
  requiredMessage?: LocalizedString;
  /**
   * Optional default value used when creating a new record (or when the field is missing in a saved record).
   *
   * This is applied only when the field is missing from the payload, so it does not override user edits.
   * For dynamic prefills, prefer `derivedValue`.
   */
  defaultValue?: DefaultValue;
  ui?: QuestionUiConfig;
  /**
   * Optional option ordering override for this field (CHOICE/CHECKBOX).
   * - alphabetical: sort by the localized label (default)
   * - source: preserve source order (as defined in config sheets / optionFilter / data sources)
   */
  optionSort?: OptionSortMode;
  /**
   * When true, this field is read-only in the edit (form) view.
   *
   * Notes:
   * - The value is still included in submissions.
   * - Intended for fields set by `defaultValue`, `derivedValue`, or `createRecordPreset` buttons.
   */
  readOnly?: boolean;
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
    raw?: Record<string, any>[];
  };
  lineItemConfig?: LineItemGroupConfig;
  uploadConfig?: FileUploadConfig;
  optionFilter?: OptionFilter;
  valueMap?: ValueMapConfig;
  derivedValue?: DerivedValueConfig;
  validationRules?: ValidationRule[];
  visibility?: VisibilityConfig;
  changeDialog?: FieldChangeDialogConfig;
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
   * When false, list-row clicks always open the Form view
   * (records matching `statusTransitions.onClose` are read-only).
   */
  summaryViewEnabled?: boolean;
  /**
   * Optional HTML template used to fully replace the Summary view UI.
   */
  summaryHtmlTemplateId?: TemplateIdMap;
  /**
   * Enable/disable the "Copy current record" action in the React web app.
   * When false, the Create button always creates a new record (no copy option).
   */
  copyCurrentRecordEnabled?: boolean;
  /**
   * Optional list of field ids to clear when copying the current record (forces re-entry on the new record).
   */
  copyCurrentRecordDropFields?: string[];
  /**
   * Optional localized label override for the Create button in the React web app.
   */
  createButtonLabel?: LocalizedString;
  /**
   * Optional localized label override for the "Copy current record" action in the React web app.
   */
  copyCurrentRecordLabel?: LocalizedString;
  /**
   * Enable/disable the standard "New record" create action in the React web app.
   *
   * When false, users can only create records via `createRecordPreset` buttons (or Copy, if enabled).
   */
  createNewRecordEnabled?: boolean;
  /**
   * Enable/disable `createRecordPreset` BUTTON actions in the React web app.
   * When false, these custom buttons are ignored (not shown in any action bars).
   */
  createRecordPresetButtonsEnabled?: boolean;
  /**
   * Optional per-view action bar configuration (system + custom buttons).
   */
  actionBars?: ActionBarsConfig;
  /**
   * Optional app header configuration.
   */
  appHeader?: AppHeaderConfig;
  /**
   * Optional behavior settings for collapsible group sections in the edit view.
   */
  groupBehavior?: GroupBehaviorConfig;
  /**
   * Optional submission validation UI settings.
   */
  submitValidation?: SubmitValidationConfig;

  /**
   * Optional guided steps configuration for the React edit (form) view.
   * When set with `mode: "guided"`, the app renders a multi-step guided UI instead of the standard edit mode.
   */
  steps?: StepsConfig;
  /**
   * Optional UI setting: when true, block landscape orientation in the web app (shows a "rotate to portrait" message).
   *
   * Note: browsers cannot reliably lock orientation; this is a UI guardrail for phones.
   */
  portraitOnly?: boolean;

  /**
   * Optional confirmation message shown to the user before submitting (Confirm/Cancel overlay).
   */
  submissionConfirmationMessage?: LocalizedString;

  /**
   * Optional confirmation title shown to the user before submitting (Confirm/Cancel overlay).
   */
  submissionConfirmationTitle?: LocalizedString;

  /**
   * Optional localized label override for the positive (confirm) button shown in the submission confirmation dialog.
   *
   * When omitted, the UI falls back to the resolved Submit button label.
   */
  submissionConfirmationConfirmLabel?: LocalizedString;

  /**
   * Optional localized label override for the negative (cancel) button shown in the submission confirmation dialog.
   *
   * When omitted, the UI falls back to localized system strings (e.g. "Cancel").
   */
  submissionConfirmationCancelLabel?: LocalizedString;

  /**
   * Optional localized label override for the Submit button in the React web app.
   */
  submitButtonLabel?: LocalizedString;

  /**
   * Optional localized label override for the Summary button in the React web app.
   * Example: "Checklist".
   */
  summaryButtonLabel?: LocalizedString;
}

export interface WebFormSubmission {
  formKey: string;
  language: 'EN' | 'FR' | 'NL';
  // Raw form payload; values can be strings, arrays (checkbox), blobs (file upload), or JSON strings
  values: Record<string, any>;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * Monotonic server-owned record version used for cache validation and optimistic locking.
   * Stored in the destination sheet as "Data Version".
   */
  dataVersion?: number;
  status?: string;
  pdfUrl?: string;
}

export interface ListViewFieldColumnConfig {
  /**
   * Column type discriminator.
   * - Omitted defaults to `"field"` for backward compatibility.
   */
  type?: 'field';
  fieldId: string;
  label?: LocalizedString;
  kind?: 'question' | 'meta';
  /**
   * Optional UI visibility for list view modes.
   *
   * - Omitted: show in both table + cards views.
   * - ['table']: show only in table view.
   * - ['cards']: show only in cards view.
   * - ['table','cards']: explicitly show in both.
   */
  showIn?: Array<'table' | 'cards'>;
}

export type ListViewRuleCellStyle = 'link' | 'warning' | 'muted' | 'default';

export type ListViewRuleIcon =
  | 'warning'
  | 'check'
  | 'error'
  | 'info'
  | 'external'
  | 'lock'
  | 'edit'
  | 'copy'
  | 'view';

export interface ListViewRulePredicate {
  /**
   * Field id to evaluate.
   *
   * Notes:
   * - You can reference both question IDs and system meta fields: `id`, `createdAt`, `updatedAt`, `status`, `pdfUrl`.
   */
  fieldId: string;
  equals?: string | number | boolean | Array<string | number | boolean>;
  notEquals?: string | number | boolean | Array<string | number | boolean>;
  /**
   * Match based on emptiness rather than a specific value.
   * - true: matches when the field has any non-empty value (not null/undefined/blank)
   * - false: matches when the field is empty
   */
  notEmpty?: boolean;
  /**
   * Date-only match against the user's local "today".
   */
  isToday?: boolean;
  /**
   * Date-only mismatch against the user's local "today" (empty/invalid dates are treated as "not today").
   */
  isNotToday?: boolean;
}

export type ListViewRuleWhen =
  | ListViewRulePredicate
  | {
      all: ListViewRuleWhen[];
    }
  | {
      any: ListViewRuleWhen[];
    };

export type ListViewOpenViewTarget = 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';

export type ListViewOpenViewConfig =
  | ListViewOpenViewTarget
  | {
      /**
       * Which view opens when clicking the computed cell:
       * - auto: preserve default list click behavior
       * - form: force edit view (records matching `statusTransitions.onClose` are read-only)
       * - summary: force Summary view (falls back to form if Summary is disabled)
       * - button: run a configured custom BUTTON action for the record (opens a preview overlay)
       * - copy: trigger the app's "Copy record" action for the record (opens a new draft in the form view)
       * - submit: trigger the app's "Submit" action for the record (navigates to form on validation errors; to summary on success)
       */
      target: ListViewOpenViewTarget;
      /**
       * When true, clicking anywhere on the row (not just the computed cell) uses this same open target.
       * Useful to make list rows open Summary for `statusTransitions.onClose` records, or run a BUTTON preview overlay.
       */
      rowClick?: boolean;
    };

export interface ListViewRuleCase {
  when?: ListViewRuleWhen;
  text: LocalizedString;
  style?: ListViewRuleCellStyle;
  icon?: ListViewRuleIcon;
  /**
   * Optional field id containing a URL to open when the user clicks this cell.
   *
   * Example: "pdfUrl" or a question id whose value is a URL.
   * When set, the list view renders the cell as a link and opens the URL in a new tab.
   */
  hrefFieldId?: string;
  /**
   * Optional override for which view opens when clicking this case's computed cell.
   * When omitted, falls back to the column-level `openView`, then to `auto`.
   */
  openView?: ListViewOpenViewConfig;
  /**
   * When `openView` resolves to `button`, the BUTTON field id (or encoded id via `__ckQIdx=`) to trigger.
   * When omitted, falls back to the column-level `openButtonId`.
   */
  openButtonId?: string;
}

export interface ListViewRuleColumnConfig {
  type: 'rule';
  fieldId: string;
  label: LocalizedString;
  /**
   * Optional UI visibility for list view modes.
   *
   * - Omitted: show in both table + cards views.
   * - ['table']: show only in table view.
   * - ['cards']: show only in cards view.
   * - ['table','cards']: explicitly show in both.
   */
  showIn?: Array<'table' | 'cards'>;
  /**
   * First match wins.
   */
  cases: ListViewRuleCase[];
  /**
   * Fallback when no cases match.
   */
  default?: Omit<ListViewRuleCase, 'when'>;
  /**
   * Optional default URL field for the column. Cases can override via `hrefFieldId`.
   */
  hrefFieldId?: string;
  /**
   * Controls which view opens when clicking the cell.
   * - auto: preserve the app's default "list row click" behavior
   * - form: force the edit view (records matching `statusTransitions.onClose` are read-only)
   * - summary: force Summary view (if enabled; otherwise falls back to form)
   * - button: run a configured custom BUTTON action (e.g. renderDocTemplate/renderMarkdownTemplate/renderHtmlTemplate)
   */
  openView?: ListViewOpenViewConfig;
  /**
   * When `openView` resolves to `button`, the BUTTON field id (or encoded id via `__ckQIdx=`) to trigger.
   */
  openButtonId?: string;
  /**
   * When true, allow sorting by the computed text value.
   * Defaults to false (rule columns are usually "actions" rather than sortable data).
   */
  sortable?: boolean;
}

export type ListViewColumnConfig = ListViewFieldColumnConfig | ListViewRuleColumnConfig;

export interface ListViewLegendPill {
  /**
   * Pill label shown before the legend text.
   */
  text: LocalizedString;
  /**
   * Optional neutral tone for the pill styling.
   */
  tone?: 'default' | 'muted' | 'strong';
}

export interface ListViewLegendItem {
  /**
   * Optional icon displayed in the legend (must match a supported list view icon name).
   *
   * When omitted, the legend entry is rendered as plain text.
   */
  icon?: ListViewRuleIcon;
  /**
   * Optional pill displayed before the legend text (used to match status pills).
   */
  pill?: ListViewLegendPill;
  /**
   * Text explaining what the icon means for this form.
   */
  text: LocalizedString;
}

export interface ListViewSearchConfig {
  /**
   * Default: `text`.
   * - `text`: free-text search across the fields rendered in the list view (and system columns like status/pdfUrl).
   * - `date`: date picker filtering against a specific date field.
   * - `advanced`: Gmail-like multi-field filtering (keyword + per-field inputs).
   */
  mode?: 'text' | 'date' | 'advanced';
  /**
   * When `mode = "date"`, the field id to filter on (usually a `DATE` question id).
   * Can also be a meta column (`createdAt` / `updatedAt`) if those are included in the list view projection.
   */
  dateFieldId?: string;
  /**
   * When `mode = "advanced"`, the list of field ids that should appear as filter inputs in the search panel.
   *
   * Notes:
   * - Field ids can reference normal question ids OR meta columns like `createdAt`, `updatedAt`, `status`, `pdfUrl`.
   * - The list fetch projection is automatically expanded to include these fields so filtering works even if the field is not visible as a column.
   */
  fields?: string[];
  /**
   * Optional placeholder text for the list search input.
   * When omitted, the UI falls back to system strings (e.g., "Search records").
   * Set to an empty string to remove the placeholder text.
   */
  placeholder?: LocalizedString | string;
  /**
   * Optional title shown inline before list view preset buttons.
   * Example: "View recipes:".
   */
  presetsTitle?: LocalizedString | string;
}

export interface ListViewViewConfig {
  /**
   * Which list view UI to show when the toggle is disabled.
   *
   * Default: `table`.
   */
  mode?: 'table' | 'cards';
  /**
   * When true, show a toggle that lets the user switch between `table` and `cards` views.
   *
   * Default: false.
   */
  toggleEnabled?: boolean;
  /**
   * When `toggleEnabled = true`, which mode should be selected initially.
   *
   * Default: `mode` (or `table` when `mode` is not set).
   */
  defaultMode?: 'table' | 'cards';
}

export interface ListViewConfig {
  title?: LocalizedString;
  columns: ListViewColumnConfig[];
  metaColumns?: string[];
  /**
   * Optional UI configuration for the list view (table vs record list/cards).
   */
  view?: ListViewViewConfig;
  /**
   * Optional UI setting: enable/disable interactive sorting by clicking table column headers.
   *
   * - When true/omitted (default), sortable columns render as clickable buttons that update the sort field/direction.
   * - When false, headers are rendered as plain table headers (non-interactive). The list still uses `defaultSort`.
   */
  headerSortEnabled?: boolean;
  /**
   * Optional list search configuration (defaults to text search).
   */
  search?: ListViewSearchConfig;
  /**
   * Optional legend shown below the list view table to explain icons/visual indicators.
   */
  legend?: ListViewLegendItem[];
  defaultSort?: {
    fieldId: string;
    direction?: 'asc' | 'desc';
  };
  pageSize?: number;
  /**
   * Optional UI setting: hide pagination controls and render all matching rows (no client-side paging).
   *
   * Default: true.
   */
  paginationControlsEnabled?: boolean;
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
  dataVersion?: number;
  rowNumber?: number;
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
