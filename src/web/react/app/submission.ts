import { shouldHideField, validateRules } from '../../core';
import { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebFormSubmission } from '../../types';
import { SubmissionPayload } from '../api';
import { FormErrors, LineItemState } from '../types';
import { resolveFieldLabel } from '../utils/labels';
import { isEmptyValue } from '../utils/values';
import { buildMaybeFilePayload } from './filePayload';
import { buildSubgroupKey, resolveSubgroupKey } from './lineItems';
import { applyValueMapsToForm } from './valueMaps';
import { buildValidationContext } from './validation';

export const validateForm = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
}): FormErrors => {
  const { definition, language, values, lineItems } = args;
  const ctx = buildValidationContext(values, lineItems);
  const allErrors: FormErrors = {};

  definition.questions.forEach(q => {
    const questionHidden = shouldHideField(q.visibility, ctx);

    if (q.validationRules && q.validationRules.length) {
      const errs = validateRules(q.validationRules, { ...ctx, language, phase: 'submit', isHidden: () => questionHidden });
      errs.forEach(err => {
        allErrors[err.fieldId] = err.message;
      });
    }

    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      rows.forEach(row => {
        const groupCtx: VisibilityContext = {
          getValue: fid => values[fid],
          getLineValue: (_rowId, fid) => row.values[fid]
        };

        q.lineItemConfig?.fields.forEach(field => {
          if (field.validationRules && field.validationRules.length) {
            const errs = validateRules(field.validationRules, {
              ...groupCtx,
              language,
              phase: 'submit',
              isHidden: () => shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id })
            } as any);
            errs.forEach(err => {
              allErrors[`${q.id}__${field.id}__${row.id}`] = err.message;
            });
          }

          if (field.required) {
            const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
            if (hideField) return;
            const val = row.values[field.id];
            const hasValue = Array.isArray(val) ? val.length > 0 : !!(val && val.toString().trim());
            if (!hasValue) {
              allErrors[`${q.id}__${field.id}__${row.id}`] = resolveFieldLabel(field, language, 'Required') + ' is required';
            }
          }
        });

        // validate subgroups, if any
        if (q.lineItemConfig?.subGroups?.length) {
          q.lineItemConfig.subGroups.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const subKey = buildSubgroupKey(q.id, row.id, subId);
            const subRows = lineItems[subKey] || [];
            subRows.forEach(subRow => {
              const subCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => subRow.values[fid]
              };
              (sub as any).fields?.forEach((field: any) => {
                if (field.validationRules && field.validationRules.length) {
                  const errs = validateRules(field.validationRules, {
                    ...subCtx,
                    language,
                    phase: 'submit',
                    isHidden: () => shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey })
                  } as any);
                  errs.forEach(err => {
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] = err.message;
                  });
                }

                if (field.required) {
                  const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                  if (hide) return;
                  const val = subRow.values[field.id];
                  const hasValue = Array.isArray(val) ? val.length > 0 : !!(val && val.toString().trim());
                  if (!hasValue) {
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] =
                      resolveFieldLabel(field, language, 'Required') + ' is required';
                  }
                }
              });
            });
          });
        }
      });
    } else if ((q as any).required && !questionHidden && isEmptyValue(values[q.id])) {
      allErrors[q.id] = 'This field is required.';
    }
  });

  return allErrors;
};

export const buildSubmissionPayload = async (args: {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  existingRecordId?: string;
}): Promise<SubmissionPayload> => {
  const { definition, formKey, language, values, lineItems, existingRecordId } = args;
  const recomputed = applyValueMapsToForm(definition, values, lineItems);
  const payloadValues: Record<string, any> = { ...recomputed.values };

  for (const q of definition.questions) {
    if (q.type === 'FILE_UPLOAD') {
      const rawAny = recomputed.values[q.id] as any;
      payloadValues[q.id] = await buildMaybeFilePayload(rawAny, (q as any).uploadConfig?.maxFiles);
    }
  }

  for (const q of definition.questions.filter(q => q.type === 'LINE_ITEM_GROUP')) {
    const rows = recomputed.lineItems[q.id] || [];
    const lineFields = q.lineItemConfig?.fields || [];
    const lineFileFields = lineFields.filter(f => (f as any).type === 'FILE_UPLOAD');
    const subGroups = q.lineItemConfig?.subGroups || [];

    const serialized = await Promise.all(
      rows.map(async row => {
        const base: Record<string, any> = { ...(row.values || {}) };

        for (const f of lineFileFields) {
          base[f.id] = await buildMaybeFilePayload(base[f.id], (f as any).uploadConfig?.maxFiles);
        }

        for (const sub of subGroups) {
          const key = resolveSubgroupKey(sub as any);
          if (!key) continue;
          const childKey = buildSubgroupKey(q.id, row.id, key);
          const childRows = recomputed.lineItems[childKey] || [];
          const subFields = (sub as any).fields || [];
          const subFileFields = subFields.filter((f: any) => f?.type === 'FILE_UPLOAD');
          base[key] = await Promise.all(
            childRows.map(async cr => {
              const child: Record<string, any> = { ...(cr.values || {}) };
              for (const f of subFileFields) {
                child[f.id] = await buildMaybeFilePayload(child[f.id], (f as any).uploadConfig?.maxFiles);
              }
              return child;
            })
          );
        }

        return base;
      })
    );

    payloadValues[q.id] = serialized;
    payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
  }

  const submission: SubmissionPayload = {
    formKey,
    language,
    values: payloadValues,
    ...payloadValues
  };

  if (existingRecordId) {
    submission.id = existingRecordId;
  }

  return submission;
};

export const computeUrlOnlyUploadUpdates = (
  definition: WebFormDefinition,
  payloadValues: Record<string, any>
): Record<string, any> => {
  const isUrlOnlyUploadValue = (v: any): boolean => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return true;
    if (Array.isArray(v)) {
      return v.every(
        item =>
          typeof item === 'string' ||
          (item && typeof item === 'object' && typeof (item as any).url === 'string')
      );
    }
    if (v && typeof v === 'object' && typeof (v as any).url === 'string') return true;
    return false;
  };

  const fileUpdates: Record<string, any> = {};
  definition.questions
    .filter(q => q.type === 'FILE_UPLOAD')
    .forEach(q => {
      const next = payloadValues[q.id];
      // Avoid replacing selected Files with base64 payload objects during submit (keeps retry UX sane).
      if (isUrlOnlyUploadValue(next)) {
        fileUpdates[q.id] = next;
      }
    });

  return fileUpdates;
};

export const resolveExistingRecordId = (args: {
  selectedRecordId?: string;
  selectedRecordSnapshot?: WebFormSubmission | null;
  lastSubmissionMetaId?: string | null;
}): string | undefined => {
  const { selectedRecordId, selectedRecordSnapshot, lastSubmissionMetaId } = args;
  return selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMetaId || undefined;
};


