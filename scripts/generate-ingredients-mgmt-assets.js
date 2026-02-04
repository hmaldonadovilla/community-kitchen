#!/usr/bin/env node
/**
 * Generate Ingredients Management assets from:
 * - master_data/IngredientsOptions.csv
 * - master_data/SyncIngredientsToBundle.csv
 *
 * Outputs:
 * - Updates docs/config/staging/config_ingredients_mgmt.json options for:
 *   CATEGORY, SUPPLIER, ALLERGEN, ALLOWED_UNIT, DIETARY_APPLICABILITY
 * - Writes docs/config/staging/ingredients_data_seed.csv (ready to paste/import into the destination tab)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const ingredientsCsvPath = path.join(root, 'master_data', 'IngredientsOptions.csv');
const syncCsvPath = path.join(root, 'master_data', 'SyncIngredientsToBundle.csv');
const configPaths = [
  // Authoring location (as requested earlier)
  path.join(root, 'docs', 'config', 'staging', 'config_ingredients_mgmt.json'),
  // Bundled export location (used by scripts/embed-form-configs.js)
  path.join(root, 'docs', 'config', 'exports', 'staging', 'config_ingredients_mgmt.json')
];
const seedOutPath = path.join(root, 'docs', 'config', 'staging', 'ingredients_data_seed.csv');

const META_HEADERS = ['Record ID', 'Data Version', 'Created At', 'Updated At', 'Status', 'PDF URL'];

const stringifyError = err => {
  if (!err) return 'unknown';
  if (err instanceof Error) return err.message || err.toString();
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
};

const readText = filePath => fs.readFileSync(filePath, 'utf8');

const writeText = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const normalizeHeader = value => (value || '').toString().trim().replace(/^\uFEFF/, '');

const parseCsv = content => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = i + 1 < content.length ? content[i + 1] : '';

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushCell();
      continue;
    }
    if (ch === '\n') {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    cell += ch;
  }

  pushCell();
  pushRow();

  if (!rows.length) return [];
  const header = rows[0].map(normalizeHeader);
  const dataRows = rows.slice(1).filter(r => r.some(v => (v || '').toString().trim() !== ''));

  return dataRows.map(r => {
    const obj = {};
    header.forEach((h, idx) => {
      if (!h) return;
      obj[h] = r[idx] === undefined || r[idx] === null ? '' : r[idx].toString();
    });
    return obj;
  });
};

const splitList = raw => {
  const s = (raw || '').toString().trim();
  if (!s) return [];
  return s
    .split(/[,;\n]/g)
    .map(v => v.trim())
    .filter(Boolean);
};

const uniqSorted = values => {
  const seen = new Set();
  const out = [];
  values.forEach(v => {
    const s = (v || '').toString().trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  out.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return out;
};

const buildOptionSets = rows => {
  const categories = [];
  const suppliers = [];
  const allergens = [];
  const allowedUnits = [];
  const dietaryApplicability = [];

  rows.forEach(r => {
    categories.push((r.Category || '').toString().trim());
    splitList(r.Suppliers).forEach(v => suppliers.push(v));
    splitList(r.Allergens).forEach(v => allergens.push(v));
    splitList(r.allowedUnits).forEach(v => allowedUnits.push(v));
    splitList(r.dietaryApplicability).forEach(v => dietaryApplicability.push(v));
  });

  const uniqueAllergens = (() => {
    const base = uniqSorted(allergens);
    if (!base.includes('None')) return ['None', ...base];
    return base;
  })();

  return {
    CATEGORY: uniqSorted(categories.filter(Boolean)),
    SUPPLIER: uniqSorted(suppliers),
    ALLERGEN: uniqueAllergens,
    ALLOWED_UNIT: uniqSorted(allowedUnits),
    DIETARY_APPLICABILITY: uniqSorted(dietaryApplicability)
  };
};

const loadConfigJson = filePath => JSON.parse(readText(filePath));

const saveConfigJson = (filePath, config) => writeText(filePath, JSON.stringify(config, null, 2) + '\n');

const updateQuestionOptions = (config, questionId, options) => {
  const q = (config.questions || []).find(entry => entry && entry.id === questionId);
  if (!q) {
    throw new Error(`Missing question id "${questionId}" in ${path.relative(root, configPath)}`);
  }
  q.options = options;
  q.optionsFr = options;
  q.optionsNl = options;
};

const csvEscape = value => {
  const s = value === undefined || value === null ? '' : value.toString();
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toCsv = rows => rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n';

const formatHeaderLabelWithId = (label, id) => {
  const rawLabel = (label || '').toString().trim();
  const rawId = (id || '').toString().trim();
  const prefix = rawLabel || rawId;
  return `${prefix} [${rawId}]`;
};

const asNowIso = () => new Date().toISOString();

const mergeByOptionEn = (baseRows, overrideRows) => {
  const byKey = new Map();
  baseRows.forEach(r => {
    const key = (r.optionEn || '').toString().trim();
    if (!key) return;
    byKey.set(key, r);
  });
  overrideRows.forEach(r => {
    const key = (r.optionEn || '').toString().trim();
    if (!key) return;
    byKey.set(key, r);
  });
  return Array.from(byKey.values());
};

const normalizeIngredientRow = r => {
  const optionEn = (r.optionEn || '').toString().trim();
  return {
    optionEn,
    Category: (r.Category || '').toString().trim(),
    Suppliers: splitList(r.Suppliers).join(', '),
    Allergens: splitList(r.Allergens).join(', ') || 'None',
    allowedUnits: splitList(r.allowedUnits).join(', '),
    dietaryApplicability: splitList(r.dietaryApplicability).join(', ')
  };
};

const buildSeed = (config, ingredientRows) => {
  const questions = Array.isArray(config.questions) ? config.questions : [];
  const questionHeaders = questions.map(q => formatHeaderLabelWithId(q.qEn || q.id, q.id));
  const headers = ['Language', ...questionHeaders, ...META_HEADERS];

  const now = asNowIso();
  const rows = ingredientRows
    .map(normalizeIngredientRow)
    .filter(r => r.optionEn)
    .sort((a, b) => a.optionEn.localeCompare(b.optionEn, 'en', { sensitivity: 'base' }))
    .map(r => {
      const recordId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const valuesById = {
        CREATED_BY: 'System Administrator',
        INGREDIENT_NAME: r.optionEn,
        CATEGORY: r.Category,
        SUPPLIER: r.Suppliers,
        ALLERGEN: r.Allergens,
        ALLOWED_UNIT: r.allowedUnits,
        DIETARY_APPLICABILITY: r.dietaryApplicability,
        EFFECTIVE_START_DATE: '',
        EFFECTIVE_END_DATE: '9999-12-31',
        STATUS: 'Active',
        LAST_CHANGED_BY: ''
      };

      const questionCells = questions.map(q => valuesById[q.id] !== undefined ? valuesById[q.id] : '');
      return [
        'EN',
        ...questionCells,
        recordId,
        '1',
        now,
        now,
        'Active',
        ''
      ];
    });

  return toCsv([headers, ...rows]);
};

const main = () => {
  try {
    const base = parseCsv(readText(ingredientsCsvPath));
    const overrides = parseCsv(readText(syncCsvPath));
    const merged = mergeByOptionEn(base, overrides);
    const optionSets = buildOptionSets(merged);

    const updatedPaths = [];
    const nowIso = asNowIso();
    configPaths.forEach(p => {
      if (!fs.existsSync(p)) return;
      const config = loadConfigJson(p);
      config.generatedAt = nowIso;

      updateQuestionOptions(config, 'CATEGORY', optionSets.CATEGORY);
      updateQuestionOptions(config, 'SUPPLIER', optionSets.SUPPLIER);
      updateQuestionOptions(config, 'ALLERGEN', optionSets.ALLERGEN);
      updateQuestionOptions(config, 'ALLOWED_UNIT', optionSets.ALLOWED_UNIT);
      updateQuestionOptions(config, 'DIETARY_APPLICABILITY', optionSets.DIETARY_APPLICABILITY);

      saveConfigJson(p, config);
      updatedPaths.push(p);
    });

    if (!updatedPaths.length) {
      throw new Error('No config files found to update. Expected one of: ' + configPaths.map(p => path.relative(root, p)).join(', '));
    }

    // Use the first existing config as the seed schema source (question IDs + header formatting).
    const seedSourcePath = updatedPaths[0];
    const seedSourceConfig = loadConfigJson(seedSourcePath);
    const seedCsv = buildSeed(seedSourceConfig, merged);
    writeText(seedOutPath, seedCsv);

    updatedPaths.forEach(p => {
      console.info('[generate-ingredients-mgmt-assets] Updated:', path.relative(root, p));
    });
    console.info('[generate-ingredients-mgmt-assets] Wrote:', path.relative(root, seedOutPath));
    console.info('[generate-ingredients-mgmt-assets] Options:', {
      CATEGORY: optionSets.CATEGORY.length,
      SUPPLIER: optionSets.SUPPLIER.length,
      ALLERGEN: optionSets.ALLERGEN.length,
      ALLOWED_UNIT: optionSets.ALLOWED_UNIT.length,
      DIETARY_APPLICABILITY: optionSets.DIETARY_APPLICABILITY.length
    });
  } catch (err) {
    console.error('[generate-ingredients-mgmt-assets] Failed:', stringifyError(err));
    process.exit(1);
  }
};

main();
