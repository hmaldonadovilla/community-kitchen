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

const compactFieldErrorStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  lineHeight: 1.25,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'normal'
};

/**
 * Renders source-first compact sentence controls. Utilisation and row mutation policy
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
  fieldErrors?: Record<string, string>;
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
  onNumberChange,
  onNumberBlur,
  onChoiceChange,
  fieldErrors,
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
        const fieldError = fieldErrors?.[fieldId] || '';

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
          return (
            <span
              key={`field:${idBase}:${fieldId}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: fieldError ? 4 : 0,
                flex: fieldError ? (clustered ? '1 1 100%' : '1 1 240px') : '0 0 auto',
                whiteSpace: 'nowrap',
                maxWidth: fieldError ? '100%' : undefined,
                minWidth: clustered ? 0 : undefined,
                flexWrap: clustered ? 'nowrap' : undefined
              }}
              data-compact-cluster={clustered ? 'true' : undefined}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                      integerOnly: allowsIntegerOnly
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
              {fieldError ? (
                <span className="error" style={compactFieldErrorStyle}>
                  {fieldError}
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
          const requestedWidth = Math.min(minWidth, maxWidth);
          if (controlDecision.variant === 'segmented') {
            return (
              <span
                key={`field:${idBase}:${fieldId}`}
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: fieldError ? 4 : 0,
                  flex: clustered ? '1 1 196px' : '0 0 auto',
                  width: clustered ? undefined : `min(100%, ${requestedWidth}px)`,
                  minWidth: 0,
                  maxWidth: '100%'
                }}
                data-compact-cluster={clustered ? 'true' : undefined}
              >
                <div
                  className="ck-choice-control ck-segmented"
                  role="radiogroup"
                  aria-label={resolveFieldLabel(field, language, field.id)}
                  style={{
                    width: '100%',
                    minWidth: clustered ? `min(100%, ${Math.min(minWidth, maxWidth)}px)` : undefined,
                    maxWidth: `${maxWidth}px`,
                    flex: '1 1 auto'
                  }}
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
                          flex: '1 1 0',
                          minWidth: 0,
                          boxSizing: 'border-box',
                          paddingInline: 6,
                          whiteSpace: 'nowrap',
                          overflowWrap: 'normal',
                          wordBreak: 'normal'
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {fieldError ? (
                  <span className="error" style={compactFieldErrorStyle}>
                    {fieldError}
                  </span>
                ) : null}
              </span>
            );
          }
          return (
            <span
              key={`field:${idBase}:${fieldId}`}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: fieldError ? 4 : 0,
                flex: fieldError ? '1 1 220px' : '0 0 auto',
                maxWidth: fieldError ? '100%' : undefined,
                minWidth: clustered ? 0 : undefined
              }}
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
              {fieldError ? (
                <span className="error" style={compactFieldErrorStyle}>
                  {fieldError}
                </span>
              ) : null}
            </span>
          );
        }

        return null;
      })}
    </>
  );
};
