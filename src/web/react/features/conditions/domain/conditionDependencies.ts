/**
 * Owns field dependency extraction for conditional UI/domain clauses.
 */
export const collectListViewWhenFieldIds = (when: unknown, out: Set<string>): void => {
  if (!when) return;
  if (Array.isArray(when)) {
    when.forEach(entry => collectListViewWhenFieldIds(entry, out));
    return;
  }
  if (typeof when !== 'object') return;
  const clause = when as Record<string, unknown>;
  const allRaw = clause.all ?? clause.and;
  if (Array.isArray(allRaw)) {
    allRaw.forEach(entry => collectListViewWhenFieldIds(entry, out));
    return;
  }
  const anyRaw = clause.any ?? clause.or;
  if (Array.isArray(anyRaw)) {
    anyRaw.forEach(entry => collectListViewWhenFieldIds(entry, out));
    return;
  }
  if (clause.not) {
    collectListViewWhenFieldIds(clause.not, out);
    return;
  }
  const lineItemsClause = clause.lineItems ?? clause.lineItem;
  if (lineItemsClause && typeof lineItemsClause === 'object') {
    const lineItemRecord = lineItemsClause as Record<string, unknown>;
    const groupId = (lineItemRecord.groupId ?? lineItemRecord.group ?? '').toString().trim();
    if (groupId) out.add(groupId);
    collectListViewWhenFieldIds(lineItemRecord.when, out);
    collectListViewWhenFieldIds(lineItemRecord.parentWhen, out);
    return;
  }
  const fieldId = (clause.fieldId ?? clause.field ?? clause.id ?? '').toString().trim();
  if (fieldId) out.add(fieldId);
};

export const collectFormWhenFieldIds = (when: unknown, out: Set<string>): void => {
  if (!when) return;
  if (Array.isArray(when)) {
    when.forEach(entry => collectFormWhenFieldIds(entry, out));
    return;
  }
  if (typeof when !== 'object') return;
  const clause = when as Record<string, unknown>;
  const allRaw = clause.all ?? clause.and;
  if (Array.isArray(allRaw)) {
    allRaw.forEach(entry => collectFormWhenFieldIds(entry, out));
  }
  const anyRaw = clause.any ?? clause.or;
  if (Array.isArray(anyRaw)) {
    anyRaw.forEach(entry => collectFormWhenFieldIds(entry, out));
  }
  if (Object.prototype.hasOwnProperty.call(clause, 'not')) {
    collectFormWhenFieldIds(clause.not, out);
  }
  const lineItemsClause = clause.lineItems ?? clause.lineItem;
  if (lineItemsClause && typeof lineItemsClause === 'object') {
    const lineItemRecord = lineItemsClause as Record<string, unknown>;
    collectFormWhenFieldIds(lineItemRecord.when, out);
    collectFormWhenFieldIds(lineItemRecord.parentWhen, out);
  }
  const fieldId = clause.fieldId;
  if (fieldId !== undefined && fieldId !== null) {
    const fid = fieldId.toString().trim();
    if (fid) out.add(fid);
  }
};
