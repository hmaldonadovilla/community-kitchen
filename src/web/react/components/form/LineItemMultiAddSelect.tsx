import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode } from '../../../types';
import { matchesQueryTokens } from './searchUtils';
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
  helperText?: string;
  emptyText?: string;
  onAddSelected: (values: string[]) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  diagnosticMeta?: Record<string, unknown>;
}> = ({ label, language, options, disabled, placeholder, helperText, emptyText, onAddSelected, onDiagnostic, diagnosticMeta }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputWrapRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [menuLayout, setMenuLayout] = useState<{ top: number; left: number; right: number } | null>(null);

  const selectedCount = selected.length;
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;
  const showClear = !disabled && Boolean(normalizedQuery);
  const resolvedHelperText = (helperText || '').toString().trim();
  const mergeDiagnostic = (payload?: Record<string, unknown>) => {
    if (!diagnosticMeta) return payload;
    if (!payload) return { ...diagnosticMeta };
    return { ...payload, ...diagnosticMeta };
  };

  const filtered = useMemo(() => {
    if (!hasQuery) return [];
    return options.filter(opt => {
      return matchesQueryTokens(normalizedQuery, [opt.label, opt.value, opt.searchText]);
    });
  }, [hasQuery, normalizedQuery, options]);

  const visibleOptions = filtered;

  const updateMenuLayout = useCallback(() => {
    const el = inputWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.max(0, Math.round(rect.bottom + 6));
    const left = Math.max(0, Math.round(rect.left));
    const right = Math.max(0, Math.round(window.innerWidth - rect.right));
    setMenuLayout(prev => {
      if (prev && prev.top === top && prev.left === left && prev.right === right) return prev;
      return { top, left, right };
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
    updateMenuLayout();
  }, [open, updateMenuLayout]);

  useEffect(() => {
    if (!open) return;
    const handle = () => updateMenuLayout();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle);
    };
  }, [open, updateMenuLayout]);

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

  const dismissKeyboardIfNeeded = () => {
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement !== el) return;
    try {
      el.blur();
    } catch (_) {
      // ignore
    }
  };

  const menuStyle = menuLayout
    ? ({
        '--ck-line-item-multiadd-menu-top': `${menuLayout.top}px`,
        '--ck-line-item-multiadd-menu-left': `${menuLayout.left}px`,
        '--ck-line-item-multiadd-menu-right': `${menuLayout.right}px`
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="ck-line-item-multiadd" ref={rootRef}>
      <div className="ck-line-item-multiadd__input" ref={inputWrapRef}>
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
            const nextNormalized = next.trim();
            const matchCount = nextNormalized
              ? options.filter(opt => {
                  return matchesQueryTokens(nextNormalized, [opt.label, opt.value, opt.searchText]);
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
        <div
          className={`ck-line-item-multiadd__menu${menuLayout ? ' ck-line-item-multiadd__menu--modal' : ''}`}
          aria-label={label}
          style={menuStyle}
        >
          <div
            className="ck-line-item-multiadd__options"
            onScroll={dismissKeyboardIfNeeded}
            onTouchMove={dismissKeyboardIfNeeded}
          >
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
                  : resolvedHelperText || null}
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
              {tSystem('lineItems.addSelected', language, 'Add selected')} ({selectedCount})
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
