import React, { useCallback, useRef } from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { SearchableSelect } from './SearchableSelect';
import {
  computeChoiceControlVariant,
  resolveNoneLabel,
  shouldUseSearchableChoiceControl,
  type OptionLike
} from './choiceControls';

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

export type RenderChoiceControlArgs = {
  fieldPath: string;
  value: string;
  options: OptionLike[];
  required: boolean;
  placeholder?: string;
  searchEnabled?: boolean;
  override?: string | null;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  onChange: (next: string) => void;
};

/**
 * Owner: Form field rendering.
 * Centralizes choice-control variant rendering and its one-time diagnostics for
 * top-level fields; row and subgroup controls own their separate renderers.
 */
export const useChoiceControlRenderer = (args: {
  language: LangCode;
  onDiagnostic?: DiagnosticLogger;
}) => {
  const { language, onDiagnostic } = args;
  const choiceVariantLogRef = useRef<Record<string, string>>({});
  const choiceSearchLoggedRef = useRef<Set<string>>(new Set());
  const choiceSearchIndexLoggedRef = useRef<Set<string>>(new Set());

  return useCallback(
    (renderArgs: RenderChoiceControlArgs) => {
      const {
        fieldPath,
        value,
        options,
        required,
        placeholder: placeholderOverride,
        searchEnabled,
        override,
        disabled,
        className,
        style,
        inputStyle,
        onChange
      } = renderArgs;
      const decision = computeChoiceControlVariant(options, required, override);

      const prev = choiceVariantLogRef.current[fieldPath];
      if (prev !== decision.variant) {
        choiceVariantLogRef.current[fieldPath] = decision.variant;
        onDiagnostic?.('ui.choiceControl.variant', {
          fieldPath,
          variant: decision.variant,
          optionCount: options.length,
          required,
          override: (override || 'auto').toString(),
          booleanDetected: decision.booleanDetected
        });
      }

      const placeholder =
        (placeholderOverride || '').toString().trim() || tSystem('common.selectPlaceholder', language, 'Select…');
      const shouldUseSearchableSelect = shouldUseSearchableChoiceControl({
        variant: decision.variant,
        optionCount: options.length,
        searchEnabled,
        override
      });

      const renderSelectControl = () => {
        if (shouldUseSearchableSelect) {
          if (!choiceSearchLoggedRef.current.has(fieldPath)) {
            choiceSearchLoggedRef.current.add(fieldPath);
            onDiagnostic?.('ui.choiceControl.search.enabled', {
              fieldPath,
              optionCount: options.length,
              enabled: searchEnabled === true ? 'forced' : 'auto'
            });
          }
          const searchableCount = options.filter(opt => !!opt.searchText).length;
          if (searchableCount && !choiceSearchIndexLoggedRef.current.has(fieldPath)) {
            choiceSearchIndexLoggedRef.current.add(fieldPath);
            onDiagnostic?.('ui.choiceControl.search.multiField', {
              fieldPath,
              optionCount: options.length,
              indexedCount: searchableCount
            });
          }
          return (
            <SearchableSelect
              value={value || ''}
              options={options.map(option => ({
                value: option.value,
                label: option.label,
                tooltip: (option as any).tooltip,
                searchText: option.searchText
              }))}
              disabled={!!disabled}
              placeholder={placeholder}
              emptyText={tSystem('common.noMatches', language, 'No matches.')}
              className={className}
              style={style}
              inputStyle={inputStyle}
              onDiagnostic={(event, payload) => onDiagnostic?.(event, { fieldPath, ...(payload || {}) })}
              onChange={next => {
                if (disabled) return;
                onDiagnostic?.('ui.choiceControl.search.select', { fieldPath, value: next });
                onChange(next);
              }}
            />
          );
        }
        return (
          <div className={className} style={style}>
            <select
              value={value || ''}
              disabled={!!disabled}
              style={{
                width: '100%',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                ...(inputStyle || {})
              }}
              onChange={event => {
                if (disabled) return;
                onChange(event.target.value);
              }}
            >
              <option value="">{placeholder}</option>
              {options.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      };

      switch (decision.variant) {
        case 'segmented': {
          return (
            <div className="ck-choice-control ck-segmented" role="radiogroup" aria-label="Options">
              {options.map(option => {
                const active = value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? 'active' : undefined}
                    role="radio"
                    aria-checked={active}
                    title={option.label}
                    disabled={!!disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (!required && active) {
                        onChange('');
                        return;
                      }
                      onChange(option.value);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          );
        }
        case 'radio': {
          const name = `ck-radio-${fieldPath}`;
          const noneLabel = resolveNoneLabel(language);
          const radioOptions = required ? options : [{ value: '', label: noneLabel }, ...options];
          return (
            <div className="ck-choice-control ck-radio-list" role="radiogroup" aria-label="Options">
              {radioOptions.map(option => (
                <label key={option.value || '__none__'} className="ck-radio-row">
                  <input
                    type="radio"
                    name={name}
                    value={option.value}
                    checked={(value || '') === (option.value || '')}
                    disabled={!!disabled}
                    onChange={event => {
                      if (disabled) return;
                      onChange(event.target.value);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          );
        }
        case 'switch': {
          const map = decision.booleanMap;
          if (!map) return renderSelectControl();
          const checked = value === map.trueValue;
          return (
            <div className="ck-choice-control ck-switch-control">
              <label className="ck-switch" aria-label="Toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!!disabled}
                  onChange={event => {
                    if (disabled) return;
                    onChange(event.target.checked ? map.trueValue : map.falseValue);
                  }}
                />
                <span className="ck-switch-track" aria-hidden="true" />
              </label>
            </div>
          );
        }
        case 'select':
        default:
          return renderSelectControl();
      }
    },
    [language, onDiagnostic]
  );
};
