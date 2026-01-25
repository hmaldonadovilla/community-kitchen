import React, { useEffect, useMemo, useRef, useState } from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode } from '../../../types';
import { buttonStyles, withDisabled } from './ui';

export type LineItemMultiAddOption = {
  value: string;
  label: string;
  searchText?: string;
};

export const LineItemMultiAddSelect: React.FC<{
  label: string;
  language: LangCode;
  options: LineItemMultiAddOption[];
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  onAddSelected: (values: string[]) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  diagnosticMeta?: Record<string, unknown>;
}> = ({ label, language, options, disabled, placeholder, emptyText, onAddSelected, onDiagnostic, diagnosticMeta }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const selectedCount = selected.length;
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const showClear = !disabled && Boolean(normalizedQuery);
  const maxItems = 60;
  const mergeDiagnostic = (payload?: Record<string, unknown>) => {
    if (!diagnosticMeta) return payload;
    if (!payload) return { ...diagnosticMeta };
    return { ...payload, ...diagnosticMeta };
  };

  const filtered = useMemo(() => {
    if (!hasQuery) return [];
    return options.filter(opt => {
      const labelValue = (opt.label || '').toString().toLowerCase();
      const valueValue = (opt.value || '').toString().toLowerCase();
      const extra = (opt.searchText || '').toString().toLowerCase();
      return labelValue.includes(normalizedQuery) || valueValue.includes(normalizedQuery) || extra.includes(normalizedQuery);
    });
  }, [hasQuery, normalizedQuery, options]);

  const visibleOptions = filtered.slice(0, maxItems);

  useEffect(() => {
    if (!selectedCount) return;
    const allowed = new Set(options.map(opt => opt.value));
    const next = selected.filter(val => allowed.has(val));
    if (next.length === selectedCount) return;
    setSelected(next);
  }, [options, selected, selectedCount]);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (target: Node | null) => {
      if (!target || !rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      setOpen(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      closeIfOutside(event.target as Node | null);
    };
    const handlePointerDown = (event: MouseEvent) => {
      closeIfOutside(event.target as Node | null);
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const toggleSelected = (value: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return Array.from(next);
    });
  };

  const handleAddSelected = () => {
    if (disabled || selectedCount === 0) return;
    const allowed = new Set(options.map(opt => opt.value));
    const nextValues = selected.filter(val => allowed.has(val));
    if (!nextValues.length) return;
    onAddSelected(nextValues);
    onDiagnostic?.('ui.lineItems.selectorOverlay.addSelected', mergeDiagnostic({ count: nextValues.length }));
    setSelected([]);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="ck-line-item-multiadd" ref={rootRef}>
      <div className="ck-line-item-multiadd__input">
        <input
          ref={inputRef}
          type="search"
          value={query}
          disabled={!!disabled}
          placeholder={placeholder}
          aria-label={label}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onChange={e => {
            if (disabled) return;
            const next = e.target.value;
            const nextNormalized = next.trim().toLowerCase();
            const matchCount = nextNormalized
              ? options.filter(opt => {
                  const haystack = `${opt.label || ''} ${opt.value || ''} ${opt.searchText || ''}`.toLowerCase();
                  return haystack.includes(nextNormalized);
                }).length
              : 0;
            setQuery(next);
            setOpen(true);
            onDiagnostic?.('ui.lineItems.selectorOverlay.search', mergeDiagnostic({
              queryLength: next.trim().length,
              matchCount,
              selectedCount
            }));
          }}
          onKeyDown={e => {
            if (disabled) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              setQuery('');
            }
            if (e.key === 'Enter' && selectedCount > 0) {
              e.preventDefault();
              handleAddSelected();
            }
          }}
        />
        {showClear ? (
          <button
            type="button"
            className="ck-line-item-multiadd__clear"
            aria-label={tSystem('list.clearSearchInput', language, 'Clear search text')}
            onMouseDown={e => {
              e.preventDefault();
            }}
            onClick={() => {
              if (disabled) return;
              setQuery('');
              setOpen(true);
              onDiagnostic?.('ui.lineItems.selectorOverlay.clear', mergeDiagnostic());
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="ck-line-item-multiadd__menu" aria-label={label}>
          <div className="ck-line-item-multiadd__options">
            {visibleOptions.length ? (
              visibleOptions.map(opt => {
                const checked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`ck-line-item-multiadd__option${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      value={opt.value}
                      checked={checked}
                      disabled={!!disabled}
                      onChange={e => toggleSelected(opt.value, e.target.checked)}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })
            ) : (
              <div className="ck-line-item-multiadd__empty">
                {hasQuery
                  ? emptyText || tSystem('lineItems.noOptionsAvailable', language, 'No options available.')
                  : tSystem('lineItems.searchPrompt', language, 'Enter at least 1 character to search.')}
              </div>
            )}
          </div>
          <div className="ck-line-item-multiadd__footer">
            <button
              type="button"
              disabled={!!disabled || selectedCount === 0}
              style={withDisabled(buttonStyles.primary, !!disabled || selectedCount === 0)}
              onClick={handleAddSelected}
            >
              {tSystem('lineItems.addSelected', language, 'Add selected')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
