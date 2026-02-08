import React, { useMemo, useRef, useState } from 'react';

import { matchesQueryTokens } from './searchUtils';

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

const normalizeList = (raw: string[] | undefined | null): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  raw.forEach(item => {
    const value = (item || '').toString().trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
};

export const SearchableMultiSelect: React.FC<{
  value: string[];
  options: SearchableMultiSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onChange: (nextValues: string[]) => void;
}> = ({ value, options, disabled, placeholder, emptyText, ariaLabel, onDiagnostic, onChange }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuInteractingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');

  const selectedValues = useMemo(() => normalizeList(value), [value]);
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const selectedLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach(opt => {
      const key = (opt?.value || '').toString().trim();
      if (!key) return;
      map.set(key, (opt?.label || key).toString());
    });
    return map;
  }, [options]);

  const summaryText = selectedValues
    .map(v => selectedLabelMap.get(v) || v)
    .filter(Boolean)
    .join(', ');

  const normalizedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter(opt => matchesQueryTokens(normalizedQuery, [opt.label, opt.value, opt.searchText]));
  }, [normalizedQuery, options]);

  const displayText = editing ? query : summaryText;
  const showClear = !disabled && (Boolean(normalizedQuery) || selectedValues.length > 0);

  const toggleValue = (nextValue: string) => {
    const key = (nextValue || '').toString().trim();
    if (!key) return;
    const next = selectedSet.has(key) ? selectedValues.filter(v => v !== key) : [...selectedValues, key];
    onChange(next);
  };

  const markMenuInteracting = () => {
    menuInteractingRef.current = true;
  };

  const clearMenuInteractingSoon = () => {
    window.setTimeout(() => {
      menuInteractingRef.current = false;
    }, 0);
  };

  return (
    <div className={`ck-searchable-select${disabled ? ' ck-searchable-select--disabled' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={displayText}
        disabled={!!disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open ? 'true' : 'false'}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onFocus={() => {
          if (disabled) return;
          setEditing(true);
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => {
          if (menuInteractingRef.current) {
            clearMenuInteractingSoon();
            return;
          }
          setOpen(false);
          setEditing(false);
          setQuery('');
        }}
        onChange={e => {
          if (disabled) return;
          const next = e.target.value;
          setEditing(true);
          setOpen(true);
          setQuery(next);
          onDiagnostic?.('ui.multiselect.search', { queryLength: next.trim().length });
        }}
        onKeyDown={e => {
          if (disabled) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setEditing(false);
            setQuery('');
          }
        }}
      />

      {showClear ? (
        <button
          type="button"
          className="ck-searchable-select__clear-icon"
          aria-label="Clear"
          onMouseDown={e => {
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled) return;
            if (normalizedQuery) {
              setQuery('');
              setOpen(true);
              setEditing(true);
              inputRef.current?.focus();
              return;
            }
            onChange([]);
            setOpen(true);
            setEditing(true);
            onDiagnostic?.('ui.multiselect.clearAll', { hadSelections: selectedValues.length > 0 });
            inputRef.current?.focus();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}

      {open ? (
        <div
          className="ck-searchable-select__menu"
          role="listbox"
          aria-label={ariaLabel || 'Options'}
          onMouseDownCapture={markMenuInteracting}
          onTouchStartCapture={markMenuInteracting}
          onMouseUpCapture={clearMenuInteractingSoon}
          onTouchEndCapture={clearMenuInteractingSoon}
          onTouchCancelCapture={clearMenuInteractingSoon}
        >
          {filtered.length ? (
            filtered.map(opt => {
              const key = (opt.value || '').toString().trim();
              const checked = selectedSet.has(key);
              return (
                <div
                  key={key}
                  className={`ck-searchable-multiselect__option${checked ? ' is-selected' : ''}`}
                  role="checkbox"
                  aria-checked={checked ? 'true' : 'false'}
                  tabIndex={disabled ? -1 : 0}
                  onMouseDown={e => {
                    // Keep focus on input; avoid blur-before-click race on mobile.
                    e.preventDefault();
                  }}
                  onClick={() => {
                    if (disabled) return;
                    toggleValue(key);
                    onDiagnostic?.('ui.multiselect.toggle', { value: key, checked: !checked });
                    inputRef.current?.focus();
                  }}
                  onKeyDown={e => {
                    if (disabled) return;
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    toggleValue(key);
                    onDiagnostic?.('ui.multiselect.toggle', { value: key, checked: !checked, keyboard: true });
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!!disabled}
                    readOnly
                    tabIndex={-1}
                    style={{ pointerEvents: 'none' }}
                  />
                  <span>{opt.label}</span>
                </div>
              );
            })
          ) : (
            <div className="ck-searchable-select__empty">{emptyText || 'No matches.'}</div>
          )}
        </div>
      ) : null}
    </div>
  );
};
