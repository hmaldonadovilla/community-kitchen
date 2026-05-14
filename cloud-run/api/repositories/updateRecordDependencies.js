const ROW_ID_KEY = '__ckRowId';
const ROW_PARENT_ROW_ID_KEY = '__ckParentRowId';
const ROW_PARENT_GROUP_ID_KEY = '__ckParentGroupId';

const EXACT_TEMPLATE_TOKEN_RE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const TEMPLATE_TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const cloneJson = value => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const normalizeMetaString = raw => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

const valuesEqual = (left, right) => {
  if (left === right) return true;
  if (left === undefined || left === null || right === undefined || right === null) return left === right;
  if (typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right) || isPlainObject(left) || isPlainObject(right)) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
};

const parseRawRows = raw => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildSubgroupKey = (parentGroupId, parentRowId, subGroupId) => `${parentGroupId}::${parentRowId}::${subGroupId}`;

const resolveSubgroupKey = sub => {
  if (!sub) return '';
  if (sub.id) return sub.id.toString().trim();
  if (typeof sub.label === 'string') return sub.label.trim();
  return '';
};

const normalizeLanguage = raw => {
  const value = Array.isArray(raw) ? raw[raw.length - 1] || raw[0] : raw;
  const language = (value || 'EN').toString().trim().toUpperCase();
  return ['EN', 'FR', 'NL'].includes(language) ? language : 'EN';
};

const resolveLocalizedString = (value, language, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return resolveLocalizedString(JSON.parse(trimmed), language, fallback);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return value.toString();
  const langKey = (language || 'EN').toString().trim().toLowerCase();
  return (
    value[langKey] ||
    value[langKey.toUpperCase()] ||
    value.en ||
    value.EN ||
    value.fr ||
    value.FR ||
    value.nl ||
    value.NL ||
    fallback
  );
};

const normalizeSystemFieldId = rawFieldId => {
  const raw = normalizeMetaString(rawFieldId);
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === 'status') return 'status';
  if (key === 'pdfurl' || key === 'pdf_url' || key === 'pdf') return 'pdfUrl';
  if (key === 'id' || key === 'recordid' || key === 'record_id' || key === 'record id') return 'id';
  if (key === 'createdat' || key === 'created_at' || key === 'created') return 'createdAt';
  if (key === 'updatedat' || key === 'updated_at' || key === 'updated') return 'updatedAt';
  return null;
};

const getSystemFieldValue = (fieldId, meta) => {
  const key = normalizeSystemFieldId(fieldId);
  if (!key) return undefined;
  return meta ? meta[key] : undefined;
};

const getRecordFieldValue = (record, fieldId) => {
  const meta = getSystemFieldValue(fieldId, {
    id: record && record.id,
    createdAt: record && record.createdAt,
    updatedAt: record && record.updatedAt,
    status: record && record.status !== undefined ? record.status : null,
    pdfUrl: record && record.pdfUrl
  });
  if (meta !== undefined) return meta;
  return record && record.values ? record.values[fieldId] : undefined;
};

const timezone = () => (process.env.CK_TIMEZONE || process.env.TZ || 'Europe/Brussels').toString().trim() || 'Europe/Brussels';

const formatLocalYmd = date => {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    // Fall back to UTC below when the configured timezone is invalid.
  }
  return date.toISOString().slice(0, 10);
};

const toLocalYmd = value => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalYmd(value);
  const raw = value.toString().trim();
  if (!raw) return '';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? formatLocalYmd(new Date(timestamp)) : '';
};

const normalizeComparableString = value => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || isPlainObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return value.toString();
    }
  }
  return value.toString().trim();
};

const normalizeComparableValue = value => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return normalizeComparableString(value);
};

const isNonEmpty = value => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
};

const candidateValues = value => {
  if (Array.isArray(value)) return value;
  return [value];
};

const matchesLeaf = (when, ctx, options = {}) => {
  const fieldId = normalizeMetaString(when.fieldId || when.field || when.id);
  if (!fieldId) return true;
  const value = ctx.getValue(fieldId);
  const candidates = candidateValues(value);

  if (typeof when.notEmpty === 'boolean' || typeof when.isEmpty === 'boolean') {
    const hasAny = candidates.some(isNonEmpty);
    if (typeof when.notEmpty === 'boolean' && when.notEmpty !== hasAny) return false;
    if (typeof when.isEmpty === 'boolean' && when.isEmpty === hasAny) return false;
  }

  if (when.isToday === true || when.isNotToday === true || when.isInPast === true || when.isInFuture === true) {
    const now = options.now instanceof Date && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
    const today = formatLocalYmd(now);
    const dates = candidates.map(toLocalYmd).filter(Boolean);
    const same = dates.some(date => date === today);
    const inPast = dates.some(date => date < today);
    const inFuture = dates.some(date => date > today);
    if (when.isToday === true && !same) return false;
    if (when.isNotToday === true && same) return false;
    if (when.isInPast === true && !inPast) return false;
    if (when.isInFuture === true && !inFuture) return false;
  }

  if (when.equals !== undefined) {
    const expectedRaw = Array.isArray(when.equals) ? when.equals : [when.equals];
    const expected = expectedRaw.map(normalizeComparableValue);
    const expectedStrings = expectedRaw.map(normalizeComparableString);
    const hasMatch = candidates.some(candidate => {
      const normalized = normalizeComparableValue(candidate);
      const stringValue = normalizeComparableString(candidate);
      return expected.includes(normalized) || expectedStrings.includes(stringValue);
    });
    if (!hasMatch) return false;
  }

  if (when.notEquals !== undefined) {
    const disallowedRaw = Array.isArray(when.notEquals) ? when.notEquals : [when.notEquals];
    const disallowed = disallowedRaw.map(normalizeComparableValue);
    const disallowedStrings = disallowedRaw.map(normalizeComparableString);
    const hasDisallowed = candidates.some(candidate => {
      const normalized = normalizeComparableValue(candidate);
      const stringValue = normalizeComparableString(candidate);
      return disallowed.includes(normalized) || disallowedStrings.includes(stringValue);
    });
    if (hasDisallowed) return false;
  }

  const numericCandidates = candidates.map(candidate => Number(normalizeComparableValue(candidate))).filter(Number.isFinite);
  const compareNumber = (rawExpected, predicate) => {
    if (rawExpected === undefined) return true;
    const expected = Number(rawExpected);
    if (!Number.isFinite(expected)) return false;
    return numericCandidates.some(value => predicate(value, expected));
  };
  if (!compareNumber(when.greaterThan, (value, expected) => value > expected)) return false;
  if (!compareNumber(when.greaterThanOrEqual, (value, expected) => value >= expected)) return false;
  if (!compareNumber(when.lessThan, (value, expected) => value < expected)) return false;
  if (!compareNumber(when.lessThanOrEqual, (value, expected) => value <= expected)) return false;

  return true;
};

const normalizeSubGroupPath = raw => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.toString().split('.');
  return list.map(item => normalizeMetaString(item)).filter(Boolean);
};

const normalizeLineItemMatchMode = raw => {
  const value = normalizeMetaString(raw).toLowerCase();
  return value === 'all' ? 'all' : 'any';
};

const parseGroupKeyPath = key => {
  const raw = normalizeMetaString(key);
  if (!raw) return { rootId: '', path: [], parentChain: [] };
  if (!raw.includes('::')) return { rootId: raw, path: [], parentChain: [] };
  const parts = raw.split('::').filter(Boolean);
  const rootId = parts[0] || '';
  const tail = parts.slice(1);
  if (!rootId || tail.length % 2 !== 0) return { rootId, path: [], parentChain: [] };
  const path = [];
  const parentChain = [];
  let currentKey = rootId;
  for (let index = 0; index < tail.length; index += 2) {
    const rowId = tail[index] || '';
    const subId = tail[index + 1] || '';
    if (!rowId || !subId) break;
    path.push(subId);
    parentChain.push({ groupKey: currentKey, rowId });
    currentKey = buildSubgroupKey(currentKey, rowId, subId);
  }
  return { rootId, path, parentChain };
};

const pathMatches = (wanted, actual) => {
  if (!wanted.length) return !actual.length;
  if (wanted.length !== actual.length) return false;
  return wanted.every((segment, index) => segment === '*' || segment === actual[index]);
};

const resolveMatchingGroupKeys = (groupId, path, ctx) => {
  const root = normalizeMetaString(groupId);
  if (!root) return [];
  if (!path.length) return [root];
  const keys = typeof ctx.getLineItemKeys === 'function' ? ctx.getLineItemKeys() : [];
  return keys.filter(key => {
    const parsed = parseGroupKeyPath(key);
    return parsed.rootId === root && pathMatches(path, parsed.path);
  });
};

const buildRowVisibilityContext = ({ row, groupKey, parentValues, topCtx }) => {
  const rowValues = row && row.values ? row.values : row || {};
  const scopedPrefix = groupKey ? `${groupKey}__` : '';
  const resolveRowValue = fieldIdRaw => {
    const fieldId = (fieldIdRaw || '').toString();
    const localId = scopedPrefix && fieldId.startsWith(scopedPrefix) ? fieldId.slice(scopedPrefix.length) : fieldId;
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, localId)) return rowValues[localId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, localId)) return parentValues[localId];
    if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return rowValues[fieldId];
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues, fieldId)) return parentValues[fieldId];
    return topCtx.getValue(fieldId);
  };
  return {
    ctx: {
      getValue: resolveRowValue,
      getLineValue: (_rowId, fieldId) => resolveRowValue(fieldId),
      getLineItems: topCtx.getLineItems,
      getLineItemKeys: topCtx.getLineItemKeys
    },
    rowId: normalizeMetaString(row && (row.id || (row.values && row.values[ROW_ID_KEY]) || row[ROW_ID_KEY]))
  };
};

const matchesLineItemsClause = (raw, ctx, options = {}) => {
  if (!raw || typeof raw !== 'object' || typeof ctx.getLineItems !== 'function') return false;
  const groupId = normalizeMetaString(raw.groupId || raw.group || raw.lineGroupId || raw.lineGroup);
  if (!groupId) return false;
  const subGroupId = normalizeMetaString(raw.subGroupId || raw.subGroup || raw.subGroupID);
  const subGroupPath = normalizeSubGroupPath(raw.subGroupPath || raw.subGroupPaths || raw.subGroupPathIds || (subGroupId ? [subGroupId] : []));
  const matchMode = normalizeLineItemMatchMode(raw.match);
  const parentMatchMode = raw.parentMatch !== undefined ? normalizeLineItemMatchMode(raw.parentMatch) : undefined;
  const when = raw.when;
  const parentWhen = raw.parentWhen || raw.parentMatchWhen;
  const getRows = key => {
    const rows = ctx.getLineItems(key);
    return Array.isArray(rows) ? rows : [];
  };
  const rowMatches = (row, groupKey, parentValues, clause) => {
    if (!clause) return true;
    const rowCtx = buildRowVisibilityContext({ row, groupKey, parentValues, topCtx: ctx });
    return matchesWhenClause(clause, rowCtx.ctx, { rowId: rowCtx.rowId, linePrefix: groupKey, now: options.now });
  };

  if (!subGroupPath.length) {
    const rows = getRows(groupId);
    if (!rows.length) return false;
    const clause = when || parentWhen;
    if (matchMode === 'all') return rows.every(row => rowMatches(row, groupId, undefined, clause));
    return rows.some(row => rowMatches(row, groupId, undefined, clause));
  }

  if (subGroupId && !raw.subGroupPath && !raw.subGroupPaths && !raw.subGroupPathIds && subGroupPath.length === 1) {
    const parentRows = getRows(groupId);
    if (!parentRows.length) return false;
    const effectiveParentMatchMode = parentMatchMode || (parentWhen ? 'any' : matchMode === 'all' ? 'all' : 'any');
    let hadParentCandidate = false;
    for (const parentRow of parentRows) {
      const parentId = normalizeMetaString(parentRow && parentRow.id);
      if (!parentId) continue;
      if (parentWhen && !rowMatches(parentRow, groupId, undefined, parentWhen)) continue;
      hadParentCandidate = true;
      const childKey = buildSubgroupKey(groupId, parentId, subGroupId);
      const childRows = getRows(childKey);
      if (!childRows.length) {
        if (effectiveParentMatchMode === 'all') return false;
        continue;
      }
      const parentValues = parentRow && parentRow.values ? parentRow.values : undefined;
      const childMatches = childRows.map(childRow => rowMatches(childRow, childKey, parentValues, when));
      const parentHasMatch = matchMode === 'all' ? childMatches.every(Boolean) : childMatches.some(Boolean);
      if (effectiveParentMatchMode === 'any' && parentHasMatch) return true;
      if (effectiveParentMatchMode === 'all' && !parentHasMatch) return false;
    }
    return effectiveParentMatchMode === 'all' ? hadParentCandidate : false;
  }

  const candidateKeys = resolveMatchingGroupKeys(groupId, subGroupPath, ctx);
  if (!candidateKeys.length) return false;
  const keyMatches = candidateKeys.map(key => {
    const rows = getRows(key);
    if (!rows.length) return false;
    const parsed = parseGroupKeyPath(key);
    const parentEntry = parsed.parentChain[parsed.parentChain.length - 1];
    const parentRows = parentEntry ? getRows(parentEntry.groupKey) : [];
    const parentRow = parentRows.find(row => normalizeMetaString(row && row.id) === normalizeMetaString(parentEntry && parentEntry.rowId));
    if (parentWhen && !rowMatches(parentRow, parentEntry.groupKey, undefined, parentWhen)) return false;
    const parentValues = parentRow && parentRow.values ? parentRow.values : undefined;
    const matches = rows.map(row => rowMatches(row, key, parentValues, when));
    return matchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
  });
  const effectiveParentMatchMode = parentMatchMode || (parentWhen ? 'any' : matchMode === 'all' ? 'all' : 'any');
  return effectiveParentMatchMode === 'all' ? keyMatches.every(Boolean) : keyMatches.some(Boolean);
};

const matchesWhenClause = (when, ctx, options = {}) => {
  if (!when) return true;
  if (Array.isArray(when)) return when.every(entry => matchesWhenClause(entry, ctx, options));
  if (typeof when !== 'object') return true;
  const allList = Array.isArray(when.all) ? when.all : Array.isArray(when.and) ? when.and : null;
  if (allList) return allList.every(entry => matchesWhenClause(entry, ctx, options));
  const anyList = Array.isArray(when.any) ? when.any : Array.isArray(when.or) ? when.or : null;
  if (anyList) return anyList.some(entry => matchesWhenClause(entry, ctx, options));
  if (Object.prototype.hasOwnProperty.call(when, 'not')) return !matchesWhenClause(when.not, ctx, options);
  const lineItemsClause = when.lineItems || when.lineItem;
  if (lineItemsClause) return matchesLineItemsClause(lineItemsClause, ctx, options);
  return matchesLeaf(when, ctx, options);
};

const buildRecordLineItems = (questions, recordValues) => {
  const state = {};

  const parseGroupRows = args => {
    const { rootGroupId, groupKey, groupCfg, path, rawRows, parentRowId, parentGroupKey } = args;
    const cfg = groupCfg && groupCfg.lineItemConfig ? groupCfg.lineItemConfig : groupCfg || {};
    const subGroups = Array.isArray(cfg.subGroups) ? cfg.subGroups : [];
    return (rawRows || []).map((rawRow, index) => {
      const values = { ...(rawRow || {}) };
      const rowId = normalizeMetaString(values[ROW_ID_KEY]) || `${path.length ? path[path.length - 1] : rootGroupId}_${index}`;
      values[ROW_ID_KEY] = rowId;
      if (parentRowId && !Object.prototype.hasOwnProperty.call(values, ROW_PARENT_ROW_ID_KEY)) {
        values[ROW_PARENT_ROW_ID_KEY] = parentRowId;
      }
      if (parentGroupKey && !Object.prototype.hasOwnProperty.call(values, ROW_PARENT_GROUP_ID_KEY)) {
        values[ROW_PARENT_GROUP_ID_KEY] = parentGroupKey;
      }

      subGroups.forEach(sub => {
        const subId = resolveSubgroupKey(sub);
        if (!subId) return;
        const childKey = buildSubgroupKey(groupKey, rowId, subId);
        const childRows = parseGroupRows({
          rootGroupId,
          groupKey: childKey,
          groupCfg: sub,
          path: [...path, subId],
          rawRows: parseRawRows(rawRow && rawRow[subId]),
          parentRowId: rowId,
          parentGroupKey: groupKey
        });
        if (childRows.length) state[childKey] = childRows;
        delete values[subId];
      });

      return {
        id: rowId,
        values,
        parentId: parentRowId,
        parentGroupId: parentGroupKey
      };
    });
  };

  (questions || [])
    .filter(question => question && question.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      state[group.id] = parseGroupRows({
        rootGroupId: group.id,
        groupKey: group.id,
        groupCfg: group,
        path: [],
        rawRows: parseRawRows(recordValues && (recordValues[group.id] || recordValues[`${group.id}_json`]))
      });
    });

  return state;
};

const buildRecordVisibilityContext = (record, questions) => {
  const lineItems = buildRecordLineItems(questions, record && record.values ? record.values : {});
  return {
    ctx: {
      getValue: fieldId => getRecordFieldValue(record, fieldId),
      getLineItems: groupId => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    },
    lineItems
  };
};

const getTemplateVar = (vars, pathRaw) => {
  const parts = normalizeMetaString(pathRaw).split('.').map(part => part.trim()).filter(Boolean);
  let current = vars;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    current = current[part];
  }
  return current === undefined ? '' : current;
};

const stringifyTemplateValue = value => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  if (Array.isArray(value)) return value.map(stringifyTemplateValue).filter(Boolean).join(', ');
  if (isPlainObject(value)) {
    for (const key of ['label', 'displayLabel', 'display', 'name', 'value', 'id']) {
      const displayValue = value[key];
      if (typeof displayValue === 'string' && displayValue.trim()) return displayValue;
      if (typeof displayValue === 'number' || typeof displayValue === 'boolean') return displayValue.toString();
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const resolveTemplateValue = (value, vars) => {
  if (typeof value === 'string') {
    const exact = value.match(EXACT_TEMPLATE_TOKEN_RE);
    if (exact) return getTemplateVar(vars, exact[1] || '');
    if (!value.includes('{{')) return value;
    return value.replace(TEMPLATE_TOKEN_RE, (_match, key) => stringifyTemplateValue(getTemplateVar(vars, key || '')));
  }
  if (Array.isArray(value)) return value.map(entry => resolveTemplateValue(entry, vars));
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).forEach(key => {
      out[key] = resolveTemplateValue(value[key], vars);
    });
    return out;
  }
  return value;
};

const buildTemplateVars = args => ({
  count: args.impactedCount || 0,
  targetFormKey: args.targetFormKey,
  targetFormTitle: args.targetFormTitle || args.targetFormKey,
  source: {
    id: (args.sourceRecord && args.sourceRecord.id) || '',
    createdAt: (args.sourceRecord && args.sourceRecord.createdAt) || '',
    updatedAt: (args.sourceRecord && args.sourceRecord.updatedAt) || '',
    status: (args.sourceRecord && args.sourceRecord.status) || '',
    ...((args.sourceRecord && args.sourceRecord.values) || {})
  },
  target: args.targetRecord
    ? {
        id: args.targetRecord.id || '',
        createdAt: args.targetRecord.createdAt || '',
        updatedAt: args.targetRecord.updatedAt || '',
        status: args.targetRecord.status || '',
        pdfUrl: args.targetRecord.pdfUrl || '',
        ...((args.targetRecord && args.targetRecord.values) || {})
      }
    : {},
  row: cloneJson(args.row || {}),
  parent: cloneJson(args.parent || {}),
  lineItem: {
    groupId: args.lineItem && args.lineItem.groupId ? args.lineItem.groupId : '',
    subGroupPath: args.lineItem && Array.isArray(args.lineItem.subGroupPath) ? args.lineItem.subGroupPath.slice() : [],
    index: Number.isFinite(Number(args.lineItem && args.lineItem.index)) ? Number(args.lineItem.index) : 0,
    rowId: args.lineItem && args.lineItem.rowId ? args.lineItem.rowId : ''
  }
});

const resolveUpdateRecordDependencyGuardMode = guard => {
  const mode = normalizeMetaString(guard && guard.mode).toLowerCase();
  return mode === 'block' || mode === 'blocking' ? 'block' : 'confirm';
};

const resolveDialogRecordList = args => {
  const recordList = args.dialog && args.dialog.recordList;
  if (!recordList || typeof recordList !== 'object') return '';
  const templateRaw = recordList.template || recordList.lineTemplate || recordList.itemTemplate;
  const template = resolveLocalizedString(templateRaw, args.language, '').toString();
  if (!template.trim()) return '';
  if (!args.impactedRecords.length) {
    return resolveLocalizedString(recordList.emptyText, args.language, '').toString().trim();
  }
  const limitRaw = Number(recordList.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : args.impactedRecords.length;
  return args.impactedRecords
    .slice(0, limit)
    .map(record => {
      const vars = buildTemplateVars({
        sourceRecord: args.sourceRecord,
        targetRecord: record,
        targetFormKey: args.targetFormKey,
        targetFormTitle: args.targetFormTitle,
        impactedCount: args.impactedRecords.length
      });
      return resolveTemplateValue(template, { ...args.baseVars, ...vars }).toString().trim();
    })
    .filter(Boolean)
    .join('\n');
};

const resolveDialog = args => {
  const recordsList = resolveDialogRecordList(args);
  const resolved = resolveTemplateValue(args.dialog || {}, { ...args.vars, recordsList });
  return {
    title: resolveLocalizedString(resolved.title, args.language, 'Confirm').toString().trim(),
    message: resolveLocalizedString(resolved.message !== undefined ? resolved.message : resolved.body, args.language, '').toString().trim(),
    confirmLabel: resolveLocalizedString(resolved.confirmLabel, args.language, 'Confirm').toString().trim(),
    cancelLabel: resolveLocalizedString(resolved.cancelLabel, args.language, 'Cancel').toString().trim(),
    showCancel: resolved.showCancel,
    showConfirm: resolved.showConfirm,
    primaryAction: resolved.primaryAction === 'cancel' ? 'cancel' : undefined,
    dismissOnBackdrop: resolved.dismissOnBackdrop,
    showCloseButton: resolved.showCloseButton
  };
};

const resolveRootGroupConfig = (questions, groupId) => {
  const target = (questions || []).find(question => question && question.type === 'LINE_ITEM_GROUP' && question.id === groupId);
  return target && target.lineItemConfig ? target.lineItemConfig : null;
};

const collectMutationTargetRows = ({ rows, groupKey, groupCfg, subGroupPath, parentValues }) => {
  if (!subGroupPath.length) return (rows || []).map(row => ({ row, groupKey, groupCfg, parentValues }));
  const [nextSubId, ...restPath] = subGroupPath;
  const subGroups = Array.isArray(groupCfg && groupCfg.subGroups) ? groupCfg.subGroups : [];
  const targetSub = subGroups.find(sub => resolveSubgroupKey(sub) === nextSubId);
  if (!targetSub) return [];
  const matches = [];
  (rows || []).forEach(row => {
    const rowId = normalizeMetaString(row && row[ROW_ID_KEY]);
    if (!rowId) return;
    matches.push(
      ...collectMutationTargetRows({
        rows: parseRawRows(row && row[nextSubId]),
        groupKey: buildSubgroupKey(groupKey, rowId, nextSubId),
        groupCfg: targetSub,
        subGroupPath: restPath,
        parentValues: row || {}
      })
    );
  });
  return matches;
};

const mutateRecordTopLevel = (values, mutation) => {
  const nextValues = { ...(values || {}) };
  let statusChanged = false;
  if (mutation.values && typeof mutation.values === 'object') {
    Object.keys(mutation.values).forEach(fieldId => {
      nextValues[fieldId] = mutation.values[fieldId];
    });
  }
  if (Object.prototype.hasOwnProperty.call(mutation, 'status')) statusChanged = true;
  return { values: nextValues, statusChanged };
};

const applyLineItemMutation = ({ mutation, recordValues, questions, topCtx, now }) => {
  const rootRows = Array.isArray(recordValues && recordValues[mutation.groupId]) ? recordValues[mutation.groupId] : [];
  if (!rootRows.length) return false;
  const rootCfg = resolveRootGroupConfig(questions, mutation.groupId);
  if (!rootCfg) return false;
  const candidates = collectMutationTargetRows({
    rows: rootRows,
    groupKey: mutation.groupId,
    groupCfg: rootCfg,
    subGroupPath: normalizeSubGroupPath(mutation.subGroupPath)
  });
  if (!candidates.length) return false;

  let changed = false;
  candidates.forEach(candidate => {
    const rowId = normalizeMetaString(candidate.row && candidate.row[ROW_ID_KEY]);
    if (!rowId) return;
    if (mutation.when) {
      const rowCtx = buildRowVisibilityContext({
        row: candidate.row,
        groupKey: candidate.groupKey,
        parentValues: candidate.parentValues,
        topCtx
      });
      if (!matchesWhenClause(mutation.when, rowCtx.ctx, { rowId: rowCtx.rowId, linePrefix: candidate.groupKey, now })) return;
    }

    Object.keys(mutation.values || {}).forEach(fieldId => {
      const nextValue = mutation.values[fieldId];
      if (valuesEqual(candidate.row[fieldId], nextValue)) return;
      candidate.row[fieldId] = nextValue;
      changed = true;
    });

    (mutation.clearSubGroups || []).forEach(subIdRaw => {
      const subId = normalizeMetaString(subIdRaw);
      if (!subId) return;
      if (Array.isArray(candidate.row[subId]) && candidate.row[subId].length === 0) return;
      candidate.row[subId] = [];
      changed = true;
    });
  });

  return changed;
};

const evaluateUpdateRecordDependencyPreview = args => {
  const now = args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();
  const language = normalizeLanguage(args.language || (args.sourceRecord && args.sourceRecord.language));
  const mode = resolveUpdateRecordDependencyGuardMode(args.guard);
  const initialVars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle
  });
  const resolvedWhen = resolveTemplateValue(args.guard && args.guard.when, initialVars);
  const impactedRecords = (args.targetRecords || []).filter(record => {
    const { ctx } = buildRecordVisibilityContext(record, args.targetQuestions || []);
    return matchesWhenClause(resolvedWhen, ctx, { now });
  });
  const vars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle,
    impactedCount: impactedRecords.length
  });
  return {
    targetFormKey: args.targetFormKey,
    mode,
    blocked: mode === 'block' && impactedRecords.length > 0,
    impactedCount: impactedRecords.length,
    impactedRecords,
    dialog: resolveDialog({
      dialog: args.guard && args.guard.dialog,
      language,
      vars,
      baseVars: vars,
      sourceRecord: args.sourceRecord,
      targetFormKey: args.targetFormKey,
      targetFormTitle: args.targetFormTitle,
      impactedRecords
    })
  };
};

const applyUpdateRecordDependencyMutationsToRecord = args => {
  const now = args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();
  const templateVars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.guard && args.guard.targetFormKey
  });
  const nextRecord = {
    ...args.targetRecord,
    values: cloneJson((args.targetRecord && args.targetRecord.values) || {})
  };
  let changed = false;
  let status = args.targetRecord && args.targetRecord.status;

  ((args.guard && args.guard.mutations) || []).forEach(rawMutation => {
    const mutation = resolveTemplateValue(rawMutation, templateVars);
    if (!mutation || typeof mutation !== 'object') return;
    if (mutation.type === 'setRecord') {
      const topLevel = mutateRecordTopLevel(nextRecord.values || {}, mutation);
      if (!valuesEqual(nextRecord.values, topLevel.values)) {
        nextRecord.values = topLevel.values;
        changed = true;
      }
      if (topLevel.statusChanged) {
        const nextStatus = mutation.status === null || mutation.status === undefined ? undefined : mutation.status.toString();
        if ((status || undefined) !== nextStatus) {
          status = nextStatus;
          changed = true;
        }
      }
      return;
    }
    if (mutation.type === 'setLineItemValues') {
      const { ctx } = buildRecordVisibilityContext(nextRecord, args.targetQuestions || []);
      const lineChanged = applyLineItemMutation({
        mutation,
        recordValues: nextRecord.values || {},
        questions: args.targetQuestions || [],
        topCtx: ctx,
        now
      });
      if (lineChanged) changed = true;
    }
  });

  nextRecord.status = status;
  return { changed, record: nextRecord };
};

module.exports = {
  applyUpdateRecordDependencyMutationsToRecord,
  buildRecordVisibilityContext,
  evaluateUpdateRecordDependencyPreview,
  matchesWhenClause,
  resolveTemplateValue
};
