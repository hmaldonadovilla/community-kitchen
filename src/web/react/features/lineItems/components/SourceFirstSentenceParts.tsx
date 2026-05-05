import React from 'react';

import { buildLocalizedOptions, toOptionSet } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemRowState } from '../../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { computeChoiceControlVariant } from '../../../components/form/choiceControls';
import { AutoWidthInput } from '../../../components/form/AutoWidthInput';
import { AutoWidthSelect } from '../../../components/form/AutoWidthSelect';
import { sanitizeNumericDraft } from '../../../components/form/quantityConstraints';
import { resolveCompactPartType, optionSortFor } from '../domain/lineItemPresentation';

type SentenceFieldEvent = {
  field: any;
  fieldId: string;
  value: FieldValue;
  virtualValues: Record<string, FieldValue>;
  parentValues: Record<string, FieldValue>;
  sourceRow: Record<string, any>;
};

/**
 * Renders source-first compact sentence controls. Reservation and row mutation policy
 * remains injected by the parent so this component stays in the presentation layer.
 */
export const SourceFirstSentenceParts: React.FC<{
  idBase: string;
  language: LangCode;
  parentRow: LineItemRowState;
  sourceRow: Record<string, any>;
  virtualValues: Record<string, FieldValue>;
  fieldById: Map<string, any>;
  sentenceParts: any[];
  disabledForField: (field: any) => boolean;
  resolveDisplayValue: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => string;
  resolveIntegerOnly: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => boolean;
  resolveMaxFieldId: (
    field: any,
    virtualValues: Record<string, FieldValue>,
    parentValues: Record<string, FieldValue>
  ) => string;
  toFiniteNumber: (value: any) => number;
  onNumberChange: (event: SentenceFieldEvent) => void;
  onNumberBlur?: (event: SentenceFieldEvent) => void;
  onChoiceChange: (event: SentenceFieldEvent) => void;
  clustered?: boolean;
  compactChoicePlaceholder?: boolean;
}> = ({
  idBase,
  language,
  parentRow,
  sourceRow,
  virtualValues,
  fieldById,
  sentenceParts,
  disabledForField,
  resolveDisplayValue,
  resolveIntegerOnly,
  resolveMaxFieldId,
  toFiniteNumber,
  onNumberChange,
  onNumberBlur,
  onChoiceChange,
  clustered = false,
  compactChoicePlaceholder = false
}) => {
  const parentValues = (parentRow.values || {}) as Record<string, FieldValue>;
  return (
    <>
      {sentenceParts.map((part: any, partIndex: number) => {
        if (!part || typeof part !== 'object') return null;
        const partType = resolveCompactPartType(part);
        if (partType === 'text') {
          const text = resolveLocalizedString(part.text, language, '');
          return text ? (
            <span
              key={`text:${idBase}:${partIndex}`}
              style={{
                color: 'var(--muted)',
                fontWeight: 600,
                fontSize: 'var(--ck-font-control)',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 40
              }}
            >
              {text}
            </span>
          ) : null;
        }

        const fieldId = `${part.fieldId || ''}`.trim();
        if (!fieldId) return null;
        const field = fieldById.get(fieldId);
        if (!field) return null;

        if (field.type === 'NUMBER') {
          const rawValue = virtualValues[fieldId];
          const valueText = rawValue === undefined || rawValue === null ? '' : rawValue.toString();
          const minWidth = Number.isFinite(Number(part.minWidth)) ? Number(part.minWidth) : 48;
          const maxWidth = Number.isFinite(Number(part.maxWidth)) ? Number(part.maxWidth) : 132;
          const paddingChars = Number.isFinite(Number(part.paddingChars)) ? Number(part.paddingChars) : 2.2;
          const suffixText = part.suffix
            ? resolveLocalizedString(part.suffix, language, '')
            : part.suffixFieldId
              ? resolveDisplayValue(fieldById.get(`${part.suffixFieldId || ''}`.trim()), virtualValues, parentValues)
              : '';
          const allowsIntegerOnly = resolveIntegerOnly(field, virtualValues, parentValues);
          const maxFieldId = resolveMaxFieldId(field, virtualValues, parentValues);
          const maxValue =
            maxFieldId && maxFieldId in virtualValues ? toFiniteNumber(virtualValues[maxFieldId]) : null;
          return (
            <span
              key={`field:${idBase}:${fieldId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                flex: '0 0 auto',
                whiteSpace: 'nowrap',
                minWidth: clustered ? 0 : undefined,
                flexWrap: clustered ? 'nowrap' : undefined
              }}
              data-compact-cluster={clustered ? 'true' : undefined}
            >
              <AutoWidthInput
                className="ck-compact-control ck-compact-control--number"
                value={valueText}
                disabled={disabledForField(field)}
                readOnly={false}
                inputMode={allowsIntegerOnly ? 'numeric' : 'decimal'}
                pattern={allowsIntegerOnly ? '[0-9]*' : '[0-9]*[.,]?[0-9]*'}
                ariaLabel={resolveFieldLabel(field, language, field.id)}
                selectAllOnFocus
                sanitize={raw =>
                  sanitizeNumericDraft(raw, {
                    integerOnly: allowsIntegerOnly,
                    maxValue
                  })
                }
                minWidth={minWidth}
                maxWidth={maxWidth}
                extraWidth={Math.max(24, Math.ceil(paddingChars * 8))}
                onChange={next => {
                  const nextValue = next === '' ? null : next;
                  const currentValue =
                    virtualValues[fieldId] === undefined || virtualValues[fieldId] === null
                      ? null
                      : `${virtualValues[fieldId]}`;
                  const normalizedNext = nextValue === null || nextValue === undefined ? null : `${nextValue}`;
                  if (normalizedNext === currentValue) return;
                  onNumberChange({
                    field,
                    fieldId,
                    value: nextValue,
                    virtualValues,
                    parentValues,
                    sourceRow
                  });
                }}
                onBlur={next => {
                  if (!onNumberBlur) return;
                  onNumberBlur({
                    field,
                    fieldId,
                    value: next === '' ? null : next,
                    virtualValues,
                    parentValues,
                    sourceRow
                  });
                }}
                style={clustered ? { flex: '0 0 auto' } : undefined}
                inputStyle={{
                  boxSizing: 'border-box',
                  minHeight: 34,
                  paddingInlineStart: 8,
                  paddingInlineEnd: 8,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'var(--ck-font-control)',
                  fontWeight: 500,
                  lineHeight: 1
                }}
              />
              {suffixText ? (
                <span
                  style={
                    clustered
                      ? {
                          fontSize: 'var(--ck-font-control)',
                          whiteSpace: 'nowrap',
                          flex: '0 0 auto',
                          marginInlineStart: 0
                        }
                      : { whiteSpace: 'nowrap' }
                  }
                >
                  {suffixText}
                </span>
              ) : null}
            </span>
          );
        }

        if (field.type === 'CHOICE') {
          const rawValue = virtualValues[fieldId];
          const valueText = Array.isArray(rawValue) && rawValue.length ? `${rawValue[0] ?? ''}` : `${rawValue ?? ''}`;
          const options = buildLocalizedOptions(toOptionSet(field), toOptionSet(field).en || [], language, {
            sort: optionSortFor(field)
          }).map(option => ({
            value: option.value,
            label: option.label,
            tooltip: option.tooltip,
            searchText: option.searchText
          }));
          const controlDecision = computeChoiceControlVariant(
            options.map(option => ({ value: option.value, label: option.label })),
            !!field.required,
            ((field as any)?.ui?.control || '').toString()
          );
          const selectedLabel =
            options.find(option => option.value === valueText)?.label ||
            resolveLocalizedString((part as any)?.placeholder, language, '') ||
            tSystem('common.selectPlaceholder', language, 'Select...');
          const paddingChars = Number.isFinite(Number(part.paddingChars)) ? Number(part.paddingChars) : 2.8;
          const minWidth = Number.isFinite(Number(part.minWidth)) ? Number(part.minWidth) : (clustered ? 76 : 72);
          const maxWidth = Number.isFinite(Number(part.maxWidth)) ? Number(part.maxWidth) : (clustered ? 156 : 220);
          if (controlDecision.variant === 'segmented') {
            return (
              <span
                key={`field:${idBase}:${fieldId}`}
                style={{ display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', minWidth: 0 }}
                data-compact-cluster={clustered ? 'true' : undefined}
              >
                <div
                  className="ck-choice-control ck-segmented"
                  role="radiogroup"
                  aria-label={resolveFieldLabel(field, language, field.id)}
                  style={{ width: 'auto', maxWidth: 'none', flex: '0 0 auto' }}
                >
                  {options.map(option => {
                    const active = valueText === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={active ? 'active' : undefined}
                        {...(clustered ? { role: 'radio', 'aria-checked': active } : { 'aria-pressed': active })}
                        title={clustered ? option.label : undefined}
                        disabled={disabledForField(field)}
                        onClick={() => {
                          if (!clustered && active) return;
                          onChoiceChange({
                            field,
                            fieldId,
                            value: option.value,
                            virtualValues,
                            parentValues,
                            sourceRow
                          });
                        }}
                        style={{
                          flex: '0 0 auto',
                          minWidth: '8.25ch',
                          paddingInline: 16,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </span>
            );
          }
          return (
            <span
              key={`field:${idBase}:${fieldId}`}
              style={{ display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', minWidth: clustered ? 0 : undefined }}
              data-compact-cluster={clustered ? 'true' : undefined}
            >
              <AutoWidthSelect
                className="ck-compact-control ck-compact-control--choice"
                value={valueText}
                options={compactChoicePlaceholder ? options.map(option => ({ value: option.value, label: option.label })) : options}
                ariaLabel={resolveFieldLabel(field, language, field.id)}
                minWidth={minWidth}
                maxWidth={maxWidth}
                extraWidth={compactChoicePlaceholder ? Math.max(30, Math.ceil(paddingChars * 7)) : 34}
                placeholder={compactChoicePlaceholder ? selectedLabel : undefined}
                disabled={disabledForField(field)}
                onChange={next =>
                  onChoiceChange({
                    field,
                    fieldId,
                    value: next,
                    virtualValues,
                    parentValues,
                    sourceRow
                  })
                }
                style={clustered ? { flex: '0 0 auto' } : undefined}
                selectStyle={
                  compactChoicePlaceholder
                    ? {
                        boxSizing: 'border-box',
                        minHeight: 34,
                        paddingInlineStart: 12,
                        paddingInlineEnd: 28,
                        fontSize: 'var(--ck-font-control)',
                        fontWeight: 500,
                        lineHeight: 1
                      }
                    : {
                        minHeight: 34,
                        fontSize: 'var(--ck-font-control)',
                        lineHeight: 1.2,
                        fontWeight: 500
                      }
                }
              />
            </span>
          );
        }

        return null;
      })}
    </>
  );
};
