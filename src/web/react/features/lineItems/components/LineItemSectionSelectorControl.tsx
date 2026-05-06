import React from 'react';

import { tSystem } from '../../../../systemStrings';
import type { LangCode } from '../../../../types';
import { LineItemMultiAddSelect } from '../../../components/form/LineItemMultiAddSelect';
import { SearchableSelect } from '../../../components/form/SearchableSelect';
import { RequiredStar } from '../../../components/form/ui';
import {
  resolveSelectorHelperText,
  resolveSelectorLabel,
  resolveSelectorPlaceholder
} from '../../../components/form/lineItemSelectors';

type SelectorOption = {
  value: string;
  label: string;
  searchText?: string;
};

type LineItemSectionSelectorControlProps = {
  selectorCfg: any;
  value: string;
  language: LangCode;
  options: SelectorOption[];
  disabled?: boolean;
  searchEnabled?: boolean;
  labelStyle?: React.CSSProperties;
  diagnosticPayload: Record<string, unknown>;
  onChange: (nextValue: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  multiAdd?: {
    enabled: boolean;
    options: SelectorOption[];
    diagnosticPayload: Record<string, unknown>;
    onAddSelected: (valuesToAdd: string[]) => void;
  };
};

/**
 * Owner: line-items feature renderer.
 * Centralizes section-selector chrome used by line groups and subgroups while
 * callers keep ownership of state updates and row-add behavior.
 */
export const LineItemSectionSelectorControl: React.FC<LineItemSectionSelectorControlProps> = ({
  selectorCfg,
  value,
  language,
  options,
  disabled = false,
  searchEnabled = false,
  labelStyle,
  diagnosticPayload,
  onChange,
  onDiagnostic,
  multiAdd
}) => {
  const label = resolveSelectorLabel(selectorCfg, language);
  const baseOptions = options.map(opt => ({
    value: opt.value,
    label: opt.label,
    searchText: opt.searchText
  }));

  return (
    <div
      className="section-selector"
      data-field-path={selectorCfg.id}
      style={{ minWidth: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <label style={labelStyle}>
        {label}
        {selectorCfg.required && <RequiredStar />}
      </label>
      {multiAdd?.enabled ? (
        <LineItemMultiAddSelect
          label={label}
          language={language}
          options={multiAdd.options}
          disabled={disabled}
          placeholder={
            resolveSelectorPlaceholder(selectorCfg, language) ||
            tSystem('lineItems.selectLinesSearch', language, 'Search items')
          }
          helperText={resolveSelectorHelperText(selectorCfg, language) || undefined}
          emptyText={tSystem('common.noMatches', language, 'No matches.')}
          onDiagnostic={(event, payload) =>
            onDiagnostic?.(event, {
              ...multiAdd.diagnosticPayload,
              ...(payload || {})
            })
          }
          onAddSelected={multiAdd.onAddSelected}
        />
      ) : searchEnabled ? (
        <SearchableSelect
          value={value || ''}
          disabled={disabled}
          placeholder={tSystem('common.selectPlaceholder', language, 'Select...')}
          emptyText={tSystem('common.noMatches', language, 'No matches.')}
          options={baseOptions}
          onDiagnostic={(event, payload) =>
            onDiagnostic?.(event, {
              ...diagnosticPayload,
              ...(payload || {})
            })
          }
          onChange={onChange}
        />
      ) : (
        <select
          value={value}
          onChange={event => onChange(event.target.value)}
        >
          <option value="">{tSystem('common.selectPlaceholder', language, 'Select...')}</option>
          {baseOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};
