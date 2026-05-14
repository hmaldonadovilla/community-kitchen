import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const CONFIG_DIR = path.join(ROOT, 'docs/config/exports/staging');
const TEMPLATE_DIR = path.join(ROOT, 'docs/templates');
const OUTPUT_PATH = path.join(ROOT, 'docs/user-facing-messages.csv');
const DIALOG_TOP_ACTION_OUTPUT_PATH = path.join(ROOT, 'docs/user-facing-dialog-top-action-messages.csv');
const WRITE_DIALOG_TOP_ACTION_VARIANT = true;

const LANGS = ['en', 'fr', 'nl'];

const AREA_BY_FORM_KEY = new Map([
  ['Config: Meal Production', 'meal production'],
  ['Config: Checklist', 'storage & cleaning'],
  ['Config: Recipes', 'recipe mgmt'],
  ['Config: Ingredients Management', 'ingredient mgmt'],
  ['Config: Distributor', 'customer mgmt'],
  ['Config: Leftover Bank', 'ingredient mgmt'],
  ['Config: Leftover Utilisation', 'ingredient mgmt']
]);

const AREA_BY_FILE = [
  [/meal[_-]?production|mealProduction|mp\./i, 'meal production'],
  [/checklist|storage|cleaning|hygiene|checks/i, 'storage & cleaning'],
  [/recipe|recipes/i, 'recipe mgmt'],
  [/ingredient|leftover|bank|utilisation/i, 'ingredient mgmt'],
  [/distributor|customer/i, 'customer mgmt'],
  [/analytics|report/i, 'reports'],
  [/landing/i, 'landing page']
];

const LOCALIZED_SUFFIX_GROUPS = [
  ['q', 'qEn', 'qFr', 'qNl', 'question label'],
  ['label', 'labelEn', 'labelFr', 'labelNl', 'label'],
  ['text', 'textEn', 'textFr', 'textNl', 'text'],
  ['helperText', 'helperTextEn', 'helperTextFr', 'helperTextNl', 'helper text'],
  ['placeholder', 'placeholderEn', 'placeholderFr', 'placeholderNl', 'placeholder'],
  ['message', 'messageEn', 'messageFr', 'messageNl', 'message'],
  ['title', 'titleEn', 'titleFr', 'titleNl', 'title']
];

const USER_TEXT_KEYS = new Set([
  'title',
  'description',
  'pageTitle',
  'pageDescription',
  'brandName',
  'heroTitle',
  'heroDescription',
  'refreshLabel',
  'loadingAppsLabel',
  'emptyPrimaryAppsLabel',
  'pendingNavigationTitle',
  'pendingNavigationMessage',
  'openAppLabel',
  'primarySectionTitle',
  'adminSectionTitle',
  'adminSectionNote',
  'overflowTitle',
  'overflowShowLabel',
  'overflowHideLabel',
  'overflowDescriptionSingular',
  'overflowDescriptionPlural',
  'loadingLabel',
  'emptyLabel',
  'backToLandingLabel',
  'label',
  'text',
  'helperText',
  'helperTextBelowLabel',
  'helperTextPlaceholder',
  'placeholder',
  'emptyStateMessage',
  'noSourceRowsMessage',
  'message',
  'intro',
  'outro',
  'itemTemplate',
  'confirmLabel',
  'cancelLabel',
  'openLabel',
  'changeLabel',
  'submitButtonLabel',
  'summaryButtonLabel',
  'createButtonLabel',
  'copyCurrentRecordLabel',
  'submissionConfirmationMessage',
  'submissionConfirmationTitle',
  'submissionConfirmationConfirmLabel',
  'submissionConfirmationCancelLabel',
  'submitTopErrorMessage',
  'suffix',
  'emailSubject',
  'emailFromName',
  'emptyPrimaryAppsLabel',
  'presetsTitle',
  'stepSubmitLabel',
  'backButtonLabel'
]);

const CODE_PROP_KEYS = new Set([
  ...USER_TEXT_KEYS,
  'ariaLabel',
  'aria-label',
  'alt',
  'caption',
  'error',
  'fallback',
  'fallbackLabel',
  'heading',
  'notice',
  'summary',
  'tooltip',
  'validationMessage'
]);

const COMMON_ONE_WORD_LABELS = new Set([
  'add',
  'advanced',
  'any',
  'apps',
  'back',
  'build',
  'cancel',
  'clear',
  'close',
  'confirm',
  'copy',
  'created',
  'create',
  'edit',
  'error',
  'form',
  'hide',
  'home',
  'info',
  'item',
  'items',
  'language',
  'legend',
  'list',
  'locked',
  'manual',
  'menu',
  'next',
  'notice',
  'open',
  'options',
  'pdf',
  'photos',
  'previous',
  'records',
  'refresh',
  'remove',
  'required',
  'retry',
  'saved',
  'search',
  'status',
  'steps',
  'submit',
  'submitting',
  'summary',
  'table',
  'toggle',
  'total',
  'updated',
  'valid',
  'view',
  'warning',
  'warnings',
  'yes',
  'no',
  'ok'
]);

const SKIP_JSON_KEYS = new Set([
  'appUrl',
  'formId',
  'logoUrl',
  'logoFormKey',
  'imageUrl',
  'imagePath',
  'folderId',
  'pdfFolderId',
  'templateId',
  'pdfTemplateId',
  'emailTemplateId',
  'summaryHtmlTemplateId',
  'formKey',
  'configSheet',
  'destinationTab',
  'id',
  'fieldId',
  'sourceFieldId',
  'targetFieldId',
  'statusFieldId',
  'dataSourceId',
  'sourceFormKey',
  'sourceWidgetId',
  'optionsRaw',
  'projection',
  'mapping',
  'when',
  'showWhen',
  'hideWhen',
  'derivedValue',
  'autoIncrement',
  'uploadConfig',
  'generatedAt',
  'validationErrors'
]);

const SKIP_CODE_FILES = [
  /\/dist\//,
  /\/node_modules\//,
  /\/src\/config\/bundled.*\.ts$/,
  /\/src\/services\/webform\/followup\/bundledHtmlTemplates\.ts$/,
  /\/src\/web\/react\/reactBundle\.ts$/,
  /\/src\/web\/react\/prototype\.tsx$/,
  /\.d\.ts$/,
  /\.test\./,
  /\.spec\./
];

const CODE_SCAN_FILES = [
  path.join(ROOT, 'src/web/react'),
  path.join(ROOT, 'src/web/data/submit.ts')
];

const CSV_HEADERS = [
  'id',
  'application_area',
  'web_surface',
  'meal_production_step',
  'form_key',
  'source_type',
  'source_file',
  'source_path',
  'context',
  'message_key',
  'message_en',
  'message_fr',
  'message_nl',
  'notes',
  'duplicate_group',
  'duplicate_count'
];

const rows = [];
const seen = new Set();
const systemStringData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/web/systemStrings.json'), 'utf8'));
const mealProductionConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'config_meal_production.json'), 'utf8'));
let mealProductionStepLookup;

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function normalizeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\\n').trim();
}

function normalizeForDuplicate(value) {
  return normalizeCell(value).toLowerCase().replace(/\s+/g, ' ').replace(/\\n/g, ' ').trim();
}

function looksLikeUrlOrId(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (/^(https?:|mailto:|tel:|bundle:|data:)/i.test(raw)) return true;
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return true;
  if (/^[A-Z0-9_:.:-]{2,}$/.test(raw) && !/\s/.test(raw) && raw.length > 4) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(raw)) return true;
  return false;
}

function looksUserFacingText(value, { allowShort = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  if (looksLikeUrlOrId(raw)) return false;
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(raw)) return false;
  if (/^[a-z]+(?:_[a-z0-9]+)+$/.test(raw)) return false;
  if (/^[./@#][\w./-]+$/.test(raw)) return false;
  if (/^[a-z0-9_-]+\.[a-z0-9_.-]+$/i.test(raw)) return false;
  if (/^[{}()[\],:;|&!?<>=+\-*/.%'"]+$/.test(raw)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(raw)) return false;
  if (!raw.includes(' ') && !/[.…!?():{}]/.test(raw) && raw.length < 3 && !COMMON_ONE_WORD_LABELS.has(raw.toLowerCase())) return false;
  if (!allowShort && raw.length < 3) return false;
  return true;
}

function areaForFormKey(formKey) {
  return AREA_BY_FORM_KEY.get(formKey || '') || 'all';
}

function areaForFile(filePath, fallback = 'all') {
  const relative = rel(filePath);
  for (const [regex, area] of AREA_BY_FILE) {
    if (regex.test(relative)) return area;
  }
  return fallback;
}

function surfaceForFile(filePath, fallback = 'shared app shell') {
  const relative = rel(filePath);
  if (/landing/i.test(relative)) return 'landing page';
  if (/analytics|report/i.test(relative)) return 'report page';
  if (/ListView/i.test(relative) || /listView/i.test(relative)) return 'list view';
  if (/FormView|LineItem|Searchable|DateInput|NumberStepper|GroupCard|SectionInstruction|FieldChangeDialog|steps|uploads|validation|submission/i.test(relative)) {
    return 'form view';
  }
  if (/ActionBar|AppHeader|AppOverlays|LoadingScreen|Orientation|SummaryView/i.test(relative)) return 'shared app shell';
  return fallback;
}

function surfaceForSource(sourceType, sourceFile, sourcePath = '', messageKey = '') {
  const combined = `${sourcePath} ${messageKey}`;
  if (sourceType === 'landing page config') return 'landing page';
  if (sourceType === 'reports config') return 'report page';
  if (sourceType === 'template text') return 'report page';
  if (sourceType === 'web app code') return surfaceForFile(path.join(ROOT, sourceFile), 'shared app shell');
  if (sourceType === 'system string') {
    if (/^analytics\b/.test(messageKey)) return 'report page';
    if (/^list\b/.test(messageKey)) return 'list view';
    if (/^(lineItems|fields|submit|draft|autosaveNotice|fieldChangeDialog|dateInput|files|overlay|steps|validation)\b/.test(messageKey)) {
      return 'form view';
    }
    return 'shared app shell';
  }
  if (/landing/i.test(sourceFile)) return 'landing page';
  if (/analytics|pipelines|emailSubject|email\.message/i.test(combined)) return 'report page';
  if (/listView|list\.|pagination|rowClick|dateHeading/i.test(combined)) return 'list view';
  if (/summaryHtmlTemplate|pdfTemplate|emailTemplate|followup|report/i.test(combined)) return 'report page';
  return 'form view';
}

function hasSystemStringKey(key) {
  const parts = String(key || '').split('.').filter(Boolean);
  let cursor = systemStringData;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return false;
    cursor = cursor[part];
  }
  return Boolean(cursor && typeof cursor === 'object' && ['en', 'fr', 'nl'].some(lang => typeof cursor[lang] === 'string'));
}

function stepText(value) {
  const localized = readLocalized(value);
  return localized?.en || '';
}

function itemId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.id || value.fieldId || value.key || '';
  return '';
}

function addStepRef(map, key, stepLabel) {
  if (!key || !stepLabel) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(stepLabel);
}

function buildMealProductionStepLookup(config) {
  const map = new Map();
  const stepByIndex = new Map();
  const steps = config.definition?.steps?.items || [];
  steps.forEach((step, index) => {
    const label = `${index + 1}. ${stepText(step.label) || step.id || `Step ${index + 1}`}`;
    stepByIndex.set(index, label);
    for (const include of step.include || []) {
      const includeId = itemId(include);
      if (!includeId) continue;
      addStepRef(map, includeId, label);
      if (Array.isArray(include.fields) && include.fields.length) {
        addStepRef(map, `${includeId}.*`, label);
        for (const field of include.fields) {
          const fieldId = itemId(field);
          addStepRef(map, fieldId, label);
          addStepRef(map, `${includeId}.${fieldId}`, label);
        }
      } else if (include.kind === 'lineGroup' && !include.dataSourceRows && !include.groupOverride) {
        addStepRef(map, `${includeId}.__all_fields`, label);
      }
      for (const subgroup of include.subGroups?.include || []) {
        const subgroupId = itemId(subgroup);
        addStepRef(map, subgroupId, label);
        addStepRef(map, `${includeId}.${subgroupId}`, label);
        for (const field of subgroup.fields || []) {
          const fieldId = itemId(field);
          addStepRef(map, fieldId, label);
          addStepRef(map, `${subgroupId}.${fieldId}`, label);
          addStepRef(map, `${includeId}.${subgroupId}.${fieldId}`, label);
        }
      }
    }
  });
  return {
    map,
    stepByIndex,
    totalSteps: steps.length,
    questions: config.definition?.questions || []
  };
}

function formatStepRefs(stepRefs) {
  if (!stepRefs || !stepRefs.size) return '';
  if (mealProductionStepLookup?.totalSteps && stepRefs.size === mealProductionStepLookup.totalSteps) {
    return 'all Meal Production steps';
  }
  return Array.from(stepRefs).join('; ');
}

function stepRefsForKeys(keys) {
  const found = new Set();
  for (const key of keys) {
    const refs = mealProductionStepLookup?.map.get(key);
    if (!refs) continue;
    for (const ref of refs) found.add(ref);
  }
  return found;
}

function mealProductionIdsForSourcePath(sourcePath) {
  const questions = mealProductionStepLookup?.questions || [];
  const pathText = String(sourcePath || '');
  const questionMatch = pathText.match(/(?:definition\.)?questions\[(\d+)\]/);
  if (!questionMatch) return [];
  const question = questions[Number(questionMatch[1])];
  if (!question || typeof question !== 'object') return [];
  const isNestedFieldPath = /lineItemConfig\.(?:fields|subGroups)\[\d+\]/.test(pathText);
  const ids = isNestedFieldPath ? [] : [question.id].filter(Boolean);

  const fieldMatch = pathText.match(/lineItemConfig\.fields\[(\d+)\]/);
  if (fieldMatch) {
    const field = question.lineItemConfig?.fields?.[Number(fieldMatch[1])];
    const fieldId = itemId(field);
    if (fieldId) ids.push(fieldId, `${question.id}.${fieldId}`, `${question.id}.__all_fields`);
  }

  const subgroupMatch = pathText.match(/lineItemConfig\.subGroups\[(\d+)\](?:\.fields\[(\d+)\])?/);
  if (subgroupMatch) {
    const subgroup = question.lineItemConfig?.subGroups?.[Number(subgroupMatch[1])];
    const subgroupId = itemId(subgroup);
    if (subgroupId) ids.push(subgroupId, `${question.id}.${subgroupId}`);
    if (subgroup && subgroupMatch[2] !== undefined) {
      const field = subgroup.fields?.[Number(subgroupMatch[2])];
      const fieldId = itemId(field);
      if (fieldId) ids.push(fieldId, `${subgroupId}.${fieldId}`, `${question.id}.${subgroupId}.${fieldId}`);
    }
  }

  return ids;
}

function mealProductionIdsForContext(context) {
  const matches = String(context || '').match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  return matches.flatMap(id => [id, `MP_MEALS_REQUEST.${id}`, `MP_TYPE_LI.${id}`, `MP_LEFTOVER_CAPTURE_LI.${id}`]);
}

function inferMealProductionStep({ applicationArea = '', formKey, sourcePath = '', context = '', webSurface = '' }) {
  const isMealProduction = formKey === 'Config: Meal Production' || applicationArea === 'meal production';
  if (!isMealProduction) return '';
  const directStepMatch = String(sourcePath).match(/definition\.steps\.items\[(\d+)\]/);
  if (directStepMatch) {
    return mealProductionStepLookup?.stepByIndex.get(Number(directStepMatch[1])) || '';
  }
  if (/definition\.steps\./.test(String(sourcePath))) return 'all Meal Production steps';
  if (webSurface === 'list view') return 'not in Steps UI (list view)';
  if (webSurface === 'report page') return 'not in Steps UI (report page)';
  if (webSurface === 'landing page') return 'not in Steps UI (landing page)';

  const pathIds = mealProductionIdsForSourcePath(sourcePath);
  const ids = pathIds.length ? pathIds : mealProductionIdsForContext(context);
  const steps = stepRefsForKeys(ids);
  const formatted = formatStepRefs(steps);
  if (formatted) return formatted;

  if (webSurface === 'form view' || webSurface === 'shared app shell') {
    return 'all Meal Production steps';
  }
  return '';
}

function addRow({
  applicationArea = 'all',
  webSurface,
  mealProductionStep,
  formKey = '',
  sourceType,
  sourceFile,
  sourcePath = '',
  context,
  messageKey = '',
  messageEn = '',
  messageFr = '',
  messageNl = '',
  notes = ''
}) {
  const resolvedSurface = webSurface || surfaceForSource(sourceType, sourceFile, sourcePath, messageKey);
  const row = {
    id: '',
    application_area: applicationArea,
    web_surface: resolvedSurface,
    meal_production_step: mealProductionStep || inferMealProductionStep({
      applicationArea,
      formKey,
      sourcePath,
      context,
      webSurface: resolvedSurface
    }),
    form_key: formKey,
    source_type: sourceType,
    source_file: sourceFile,
    source_path: sourcePath,
    context,
    message_key: messageKey,
    message_en: normalizeCell(messageEn),
    message_fr: normalizeCell(messageFr),
    message_nl: normalizeCell(messageNl),
    notes,
    duplicate_group: '',
    duplicate_count: ''
  };
  if (!row.message_en && !row.message_fr && !row.message_nl) return;
  const key = [
    row.source_type,
    row.source_file,
    row.source_path,
    row.context,
    row.message_key,
    row.message_en,
    row.message_fr,
    row.message_nl
  ].join('\u0001');
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

function toPath(parts) {
  if (!parts.length) return '$';
  return '$.' + parts.join('.').replaceAll('.[', '[');
}

function isLocalizedObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return LANGS.some(lang => typeof value[lang] === 'string') && keys.every(key => LANGS.includes(key) || ['EN', 'FR', 'NL'].includes(key));
}

function readLocalized(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    en: typeof value.en === 'string' ? value.en : typeof value.EN === 'string' ? value.EN : '',
    fr: typeof value.fr === 'string' ? value.fr : typeof value.FR === 'string' ? value.FR : '',
    nl: typeof value.nl === 'string' ? value.nl : typeof value.NL === 'string' ? value.NL : ''
  };
}

function getAtPath(root, parts) {
  let cursor = root;
  for (const part of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    if (typeof part === 'number') cursor = cursor[part];
    else cursor = cursor[part];
  }
  return cursor;
}

function isNeverShowObject(value) {
  const showWhen = value?.visibility?.showWhen;
  if (!showWhen || typeof showWhen !== 'object') return false;
  if (showWhen.fieldId !== 'NEVER_SHOW') return false;
  if (Array.isArray(showWhen.equals)) return showWhen.equals.includes('1') || showWhen.equals.includes(1);
  return showWhen.equals === '1' || showWhen.equals === 1;
}

function isVisibleOutsideForm(value) {
  return value?.listView === true ||
    value?.summaryVisibility === 'always' ||
    value?.ui?.summaryVisibility === 'always';
}

function findQuestionContext(root, parts) {
  const idx = parts.findIndex(part => part === 'questions');
  if (idx >= 0 && typeof parts[idx + 1] === 'number') {
    const q = getAtPath(root, parts.slice(0, idx + 2));
    if (q && typeof q === 'object') {
      return `Question ${q.id || `#${parts[idx + 1] + 1}`} (${q.type || 'field'})`;
    }
  }
  return '';
}

function describeJsonContext(root, parts, currentValue, suffix = '') {
  const last = parts[parts.length - 1];
  const questionContext = findQuestionContext(root, parts);
  const current = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) ? currentValue : null;
  let base = '';
  if (current?.id && current?.type) base = `${current.type} ${current.id}`;
  else if (current?.id) base = `Item ${current.id}`;
  else if (questionContext) base = questionContext;
  else if (typeof last === 'string') base = last;
  else base = 'Configured text';
  return suffix ? `${base} ${suffix}` : base;
}

function pathPartsToJsonPath(parts) {
  let out = '$';
  for (const part of parts) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += `.${part}`;
  }
  return out;
}

function extractOptionRows(obj, ctx) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const options = Array.isArray(obj.options) ? obj.options : null;
  const optionsFr = Array.isArray(obj.optionsFr) ? obj.optionsFr : [];
  const optionsNl = Array.isArray(obj.optionsNl) ? obj.optionsNl : [];
  if (!options || !options.length) return;
  options.forEach((option, index) => {
    if (!looksUserFacingText(option, { allowShort: true })) return;
    addRow({
      ...ctx,
      sourcePath: `${ctx.sourcePath}.options[${index}]`,
      context: `${ctx.context} option`,
      messageKey: `${ctx.messageKey}.option.${index + 1}`,
      messageEn: option,
      messageFr: optionsFr[index] || '',
      messageNl: optionsNl[index] || ''
    });
  });
}

function extractJsonObject(value, parts, ctx, root) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => extractJsonObject(entry, [...parts, index], ctx, root));
    return;
  }
  if (typeof value !== 'object') return;
  if (isNeverShowObject(value) && !isVisibleOutsideForm(value)) return;

  if (isLocalizedObject(value)) {
    const loc = readLocalized(value);
    if (loc && (looksUserFacingText(loc.en, { allowShort: true }) || looksUserFacingText(loc.fr, { allowShort: true }) || looksUserFacingText(loc.nl, { allowShort: true }))) {
      const key = parts[parts.length - 1]?.toString() || '';
      addRow({
        ...ctx,
        sourcePath: pathPartsToJsonPath(parts),
        context: describeJsonContext(root, parts.slice(0, -1), getAtPath(root, parts.slice(0, -1)), key),
        messageKey: parts.join('.'),
        messageEn: loc.en,
        messageFr: loc.fr,
        messageNl: loc.nl
      });
    }
    return;
  }

  for (const [baseKey, enKey, frKey, nlKey, label] of LOCALIZED_SUFFIX_GROUPS) {
    const en = typeof value[enKey] === 'string' ? value[enKey] : '';
    const fr = typeof value[frKey] === 'string' ? value[frKey] : '';
    const nl = typeof value[nlKey] === 'string' ? value[nlKey] : '';
    if (looksUserFacingText(en, { allowShort: true }) || looksUserFacingText(fr, { allowShort: true }) || looksUserFacingText(nl, { allowShort: true })) {
      addRow({
        ...ctx,
        sourcePath: pathPartsToJsonPath([...parts, baseKey]),
        context: describeJsonContext(root, parts, value, label),
        messageKey: [...parts, baseKey].join('.'),
        messageEn: en,
        messageFr: fr,
        messageNl: nl
      });
    }
  }

  extractOptionRows(value, {
    ...ctx,
    sourcePath: pathPartsToJsonPath(parts),
    context: describeJsonContext(root, parts, value),
    messageKey: parts.join('.')
  });

  for (const [key, child] of Object.entries(value)) {
    if (parts.length === 0 && key === 'questions' && value.definition?.questions) continue;
    if (parts.length === 0 && key === 'form' && value.definition?.questions) continue;
    if (SKIP_JSON_KEYS.has(key)) continue;
    if (['qEn', 'qFr', 'qNl', 'labelEn', 'labelFr', 'labelNl', 'textEn', 'textFr', 'textNl'].includes(key)) continue;
    if (key === 'options' || key === 'optionsFr' || key === 'optionsNl') continue;
    if (typeof child === 'string' && USER_TEXT_KEYS.has(key) && looksUserFacingText(child, { allowShort: true })) {
      addRow({
        ...ctx,
        sourcePath: pathPartsToJsonPath([...parts, key]),
        context: describeJsonContext(root, parts, value, key),
        messageKey: [...parts, key].join('.'),
        messageEn: child
      });
      continue;
    }
    extractJsonObject(child, [...parts, key], ctx, root);
  }
}

function extractSystemStrings() {
  const sourceFile = 'src/web/systemStrings.json';
  const fullPath = path.join(ROOT, sourceFile);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const walk = (value, parts) => {
    if (!value || typeof value !== 'object') return;
    if (isLocalizedObject(value)) {
      const loc = readLocalized(value);
      addRow({
        applicationArea: 'all',
        sourceType: 'system string',
        sourceFile,
        sourcePath: pathPartsToJsonPath(parts),
        context: `System UI string ${parts.join('.')}`,
        messageKey: parts.join('.'),
        messageEn: loc?.en || '',
        messageFr: loc?.fr || '',
        messageNl: loc?.nl || ''
      });
      return;
    }
    Object.entries(value).forEach(([key, child]) => walk(child, [...parts, key]));
  };
  walk(data, []);
}

function extractConfigExports() {
  for (const name of fs.readdirSync(CONFIG_DIR).filter(file => file.endsWith('.json')).sort()) {
    const fullPath = path.join(CONFIG_DIR, name);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const sourceFile = rel(fullPath);
    const formKey = data.formKey || '';
    const applicationArea = name === 'landing_page.json'
      ? 'landing page'
      : name === 'analytics_page.json'
        ? 'reports'
        : areaForFormKey(formKey);
    const sourceType = name === 'landing_page.json'
      ? 'landing page config'
      : name === 'analytics_page.json'
        ? 'reports config'
        : 'form config';

    extractJsonObject(data, [], {
      applicationArea,
      formKey,
      sourceType,
      sourceFile,
      sourcePath: '$',
      context: formKey || name,
      messageKey: ''
    }, data);
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTemplateText() {
  if (!fs.existsSync(TEMPLATE_DIR)) return;
  const files = fs.readdirSync(TEMPLATE_DIR)
    .filter(name => /\.(html|md)$/i.test(name))
    .sort();
  for (const name of files) {
    const fullPath = path.join(TEMPLATE_DIR, name);
    const sourceFile = rel(fullPath);
    const applicationArea = areaForFile(fullPath, 'reports');
    const raw = fs.readFileSync(fullPath, 'utf8');
    let cleaned = raw
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<!--[\s\S]*?-->/g, '\n');
    if (/\.html$/i.test(name)) {
      cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|td|th|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' ');
    }
    const lines = cleaned.split(/\n/);
    lines.forEach((line, index) => {
      if (/\{\{\s*(EXCLUDE|GROUP_|CONSOLIDATED|COUNT|SUM|DEFAULT|FILES_|#|\/)/i.test(line)) return;
      const text = decodeHtmlEntities(line)
        .replace(/\{\{[^}]+\}\}/g, '')
        .replace(/^\s*[-#|>*`]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!looksUserFacingText(text)) return;
      if (/^-{3,}$/.test(text) || /^\|?\s*:?-{3,}:?/.test(text)) return;
      addRow({
        applicationArea,
        sourceType: 'template text',
        sourceFile,
        sourcePath: `line ${index + 1}`,
        context: `Bundled report/template text in ${name}`,
        messageKey: `${name}:${index + 1}`,
        messageEn: text,
        notes: 'Template text extracted as source language only; placeholders/directives were removed.'
      });
    });
  }
}

function listSourceFiles(dir) {
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const normalized = full.replaceAll(path.sep, '/');
        if (!SKIP_CODE_FILES.some(regex => regex.test(normalized))) out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

function propName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return '';
}

function nearestPropertyName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current)) return propName(current.name);
    if (ts.isJsxAttribute(current)) return propName(current.name);
    if (ts.isVariableStatement(current) || ts.isFunctionDeclaration(current) || ts.isSourceFile(current)) return '';
    current = current.parent;
  }
  return '';
}

function callName(node) {
  if (!node || !ts.isCallExpression(node)) return '';
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return '';
}

function isInImportOrType(node) {
  let current = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true;
    if (ts.isTypeNode(current) || ts.isLiteralTypeNode(current) || ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) return true;
    if (ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function templateExpressionText(node) {
  let text = node.head.text;
  node.templateSpans.forEach((span, index) => {
    text += `{expr${index + 1}}${span.literal.text}`;
  });
  return text;
}

function codeCandidateReason(node, text) {
  if (!looksUserFacingText(text, { allowShort: true })) return '';
  if (isInImportOrType(node)) return '';
  const parent = node.parent;
  if (ts.isJsxText(node)) return 'JSX text';
  if (ts.isJsxAttribute(parent)) {
    const attr = propName(parent.name);
    if (['aria-label', 'title', 'placeholder', 'alt'].includes(attr)) return `JSX ${attr}`;
  }
  if (ts.isPropertyAssignment(parent)) {
    const key = propName(parent.name);
    if (CODE_PROP_KEYS.has(key)) {
      if (['message', 'description', 'notice', 'summary', 'error'].includes(key) && !/[\s.,!?;:]/.test(text) && text.length < 12) return '';
      return `object property ${key}`;
    }
  }
  if (ts.isCallExpression(parent)) {
    const name = callName(parent);
    if (/^(alert|confirm|prompt)$/.test(name)) return `${name} call`;
    if (/^(setError|setNotice|setStatusMessage|showToast|toast|showModalDialog|openConfirmDialog)$/i.test(name)) return `${name || 'call'} argument`;
    if (name === 'tSystem' && parent.arguments[2] === node) {
      const keyArg = parent.arguments[0];
      const key = keyArg && ts.isStringLiteralLike(keyArg) ? keyArg.text : '';
      return key && !hasSystemStringKey(key) ? 'missing system-string fallback' : '';
    }
  }
  const propertyName = nearestPropertyName(node);
  if (CODE_PROP_KEYS.has(propertyName)) {
    if (['message', 'description', 'notice', 'summary', 'error'].includes(propertyName) && !/[\s.,!?;:]/.test(text) && text.length < 12) return '';
    return `nested property ${propertyName}`;
  }
  return '';
}

function extractCodeStrings() {
  const files = CODE_SCAN_FILES.flatMap(entry => {
    if (!fs.existsSync(entry)) return [];
    const stat = fs.statSync(entry);
    return stat.isDirectory() ? listSourceFiles(entry) : [entry];
  }).sort();
  for (const fullPath of files) {
    const sourceText = fs.readFileSync(fullPath, 'utf8');
    const source = ts.createSourceFile(fullPath, sourceText, ts.ScriptTarget.Latest, true, fullPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const sourceFile = rel(fullPath);
    const applicationArea = areaForFile(fullPath, 'all');
    const walk = node => {
      let text = '';
      if (ts.isStringLiteralLike(node) || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        text = node.text;
      } else if (ts.isTemplateExpression(node)) {
        text = templateExpressionText(node);
      } else if (ts.isJsxText(node)) {
        text = node.getText(source).replace(/\s+/g, ' ').trim();
      }
      if (text) {
        const reason = codeCandidateReason(node, text);
        if (reason) {
          const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
          addRow({
            applicationArea,
            sourceType: 'web app code',
            sourceFile,
            sourcePath: `line ${pos.line + 1}`,
            context: reason,
            messageKey: `${sourceFile}:${pos.line + 1}:${pos.character + 1}`,
            messageEn: text,
            notes: 'Extracted from web app UI code; review if this surface is still active.'
          });
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
}

function assignDuplicateGroups() {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = [row.message_en, row.message_fr, row.message_nl].map(normalizeForDuplicate).join('\u0001');
    if (!key.replace(/\u0001/g, '')) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  let groupNo = 1;
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const groupId = `D${String(groupNo).padStart(3, '0')}`;
    groupNo += 1;
    indexes.forEach(index => {
      rows[index].duplicate_group = groupId;
      rows[index].duplicate_count = String(indexes.length);
    });
  }
}

function sortRows(rowsToSort) {
  rowsToSort.sort((a, b) => [
    a.application_area.localeCompare(b.application_area),
    a.web_surface.localeCompare(b.web_surface),
    a.meal_production_step.localeCompare(b.meal_production_step),
    a.form_key.localeCompare(b.form_key),
    a.source_type.localeCompare(b.source_type),
    a.source_file.localeCompare(b.source_file),
    a.source_path.localeCompare(b.source_path)
  ].find(result => result !== 0) || 0);
}

function assignRowIds(rowsToAssign) {
  rowsToAssign.forEach((row, index) => {
    row.id = `UFM-${String(index + 1).padStart(4, '0')}`;
  });
}

function rowText(row) {
  return [
    row.source_file,
    row.source_path,
    row.context,
    row.message_key
  ].join(' ').toLowerCase();
}

function isDialogOrTopActionRow(row) {
  const text = rowText(row);
  const messageKey = String(row.message_key || '').toLowerCase();
  const sourceFile = String(row.source_file || '').toLowerCase();
  const context = String(row.context || '').toLowerCase();

  if (/(?:^|[.\s])dialog(?:[.\s]|$)|dialogtrigger|confirm(?:ation)?|dedup|incomplete|autosavenotice|waitforuploadsdialog/.test(text)) {
    return true;
  }

  if (/changedialog|closedialog|closeconfirm|button\.confirm|confirmationdialog|feedbackdialog|generatedrecordsdialog|progressdialog|copycurrentrecorddialog|incompletefieldsdialog|submissionconfirmation/.test(text)) {
    return true;
  }

  if (/(?:submitvalidation\.)?submittoperrormessage|actionbars\.system\.gates\.[^.]+\.dialog|recordfreshness/.test(text)) {
    return true;
  }

  if (/^(dedup|record|bank\.utilisation|navigation\.wait|autosavenotice|fieldchangedialog)\b/.test(messageKey)) {
    return true;
  }

  if (/^validation\.(fixerrors|warningstitle)\b/.test(messageKey) || /^common\.(hide|more)\b/.test(messageKey)) {
    return true;
  }

  if (/appnotices|validationheadernotice|formstatusnotices|appoverlays|confirmdialogoverlay|fieldchangedialogoverlay/.test(sourceFile)) {
    return true;
  }

  if (/copycurrentrecorddialog|dedupdialog|dedupincompletehomedialog|incompleteoverlayrowguard/.test(sourceFile)) {
    return true;
  }

  if (/^(alert|confirm|prompt) call$/.test(context) || /openconfirmdialog argument|showmodaldialog argument|setnotice argument|setstatusmessage argument|showtoast argument/.test(context)) {
    return true;
  }

  return false;
}

function writeCsv(outputPath, rowsToWrite) {
  const escapeCsv = value => {
    const str = String(value ?? '');
    if (/[",\n\r]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };
  const csv = [
    CSV_HEADERS.join(','),
    ...rowsToWrite.map(row => CSV_HEADERS.map(header => escapeCsv(row[header])).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(outputPath, csv, 'utf8');
}

mealProductionStepLookup = buildMealProductionStepLookup(mealProductionConfig);
extractSystemStrings();
extractConfigExports();
extractTemplateText();
extractCodeStrings();
assignDuplicateGroups();
sortRows(rows);
assignRowIds(rows);
writeCsv(OUTPUT_PATH, rows);
const dialogTopActionRows = WRITE_DIALOG_TOP_ACTION_VARIANT
  ? rows.filter(isDialogOrTopActionRow)
  : [];
if (WRITE_DIALOG_TOP_ACTION_VARIANT) {
  writeCsv(DIALOG_TOP_ACTION_OUTPUT_PATH, dialogTopActionRows);
}

const bySource = rows.reduce((acc, row) => {
  acc[row.source_type] = (acc[row.source_type] || 0) + 1;
  return acc;
}, {});
const byArea = rows.reduce((acc, row) => {
  acc[row.application_area] = (acc[row.application_area] || 0) + 1;
  return acc;
}, {});

console.log(`Wrote ${rel(OUTPUT_PATH)} with ${rows.length} rows.`);
if (WRITE_DIALOG_TOP_ACTION_VARIANT) {
  console.log(`Wrote ${rel(DIALOG_TOP_ACTION_OUTPUT_PATH)} with ${dialogTopActionRows.length} rows.`);
}
console.log('Rows by source:', bySource);
console.log('Rows by area:', byArea);
