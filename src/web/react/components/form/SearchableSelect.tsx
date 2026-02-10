import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { matchesQueryTokens } from './searchUtils';

export type SearchableSelectOption = {
  value: string;
  label: string;
  tooltip?: string;
  searchText?: string;
};

export const SearchableSelect: React.FC<{
  value: string;
  options: SearchableSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  onChange: (nextValue: string) => void;
}> = ({ value, options, disabled, placeholder, emptyText, onDiagnostic, onChange }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPlacement, setMenuPlacement] = useState<'down' | 'up'>('down');
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(320);

  const selected = useMemo(() => options.find(o => o.value === (value || '')), [options, value]);
  const selectedLabel = (selected?.label || '').toString();
  const showClear = !disabled && (!!(value || '').toString().trim() || !!(text || '').toString().trim());

  useEffect(() => {
    if (editing) return;
    setText(selectedLabel);
  }, [editing, selectedLabel]);

  const normalizedQuery = (text || '').toString().trim();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter(o => {
      return matchesQueryTokens(normalizedQuery, [o.label, o.value, o.searchText]);
    });
  }, [normalizedQuery, options]);

  const visible = filtered;

  const commitValue = (next: SearchableSelectOption | null) => {
    if (!next) return;
    onChange(next.value);
    setText(next.label);
    setOpen(false);
    setEditing(false);
    setActiveIndex(0);
    try {
      inputRef.current?.blur();
    } catch (_) {
      // ignore
    }
  };

  const commitFromText = () => {
    const raw = (text || '').toString().trim();
    if (!raw) {
      if ((value || '') !== '') onChange('');
      setText('');
      return;
    }
    const rawLower = raw.toLowerCase();
    const exact =
      options.find(o => (o.label || '').toString().trim().toLowerCase() === rawLower) ||
      options.find(o => (o.value || '').toString().trim().toLowerCase() === rawLower);
    if (exact) {
      onChange(exact.value);
      setText(exact.label);
      return;
    }
    // Revert to the selected label when the user leaves without choosing a valid option.
    setText(selectedLabel);
  };

  const recomputeMenuLayout = useCallback(() => {
    if (!open) return;
    const anchor = inputRef.current || rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportTop = vv ? vv.offsetTop : 0;
    const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const gap = 6;
    const margin = 12;
    const spaceBelow = Math.floor(viewportBottom - rect.bottom - gap - margin);
    const spaceAbove = Math.floor(rect.top - viewportTop - gap - margin);
    const placeUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(placeUp ? spaceAbove : spaceBelow, 120);
    const nextMaxHeight = Math.min(320, availableSpace);
    setMenuPlacement(placeUp ? 'up' : 'down');
    setMenuMaxHeight(nextMaxHeight);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      recomputeMenuLayout();
    });
    const onViewportChange = () => {
      recomputeMenuLayout();
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
    };
  }, [open, recomputeMenuLayout]);

  return (
    <div ref={rootRef} className={`ck-searchable-select${disabled ? ' ck-searchable-select--disabled' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        disabled={!!disabled}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open ? 'true' : 'false'}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onFocus={() => {
          if (disabled) return;
          setEditing(true);
          setOpen(true);
          setActiveIndex(0);
          // Select-all makes it easy to replace the current selection by typing.
          requestAnimationFrame(() => {
            try {
              inputRef.current?.select();
            } catch (_) {
              // ignore
            }
          });
        }}
        onBlur={() => {
          setOpen(false);
          setEditing(false);
          commitFromText();
        }}
        onChange={e => {
          if (disabled) return;
          setText(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={e => {
          if (disabled) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setEditing(false);
            setText(selectedLabel);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex(idx => Math.min(idx + 1, Math.max(0, visible.length - 1)));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex(idx => Math.max(0, idx - 1));
            return;
          }
          if (e.key === 'Enter') {
            if (!open) return;
            e.preventDefault();
            const opt = visible[activeIndex] || visible[0];
            if (opt) commitValue(opt);
            return;
          }
        }}
      />

      {showClear ? (
        <button
          type="button"
          className="ck-searchable-select__clear-icon"
          aria-label="Clear"
          onMouseDown={e => {
            // Prevent input blur (which would commit/revert text) before we clear.
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled) return;
            setText('');
            if ((value || '').toString().trim()) {
              onChange('');
            }
            setOpen(true);
            setEditing(true);
            setActiveIndex(0);
            try {
              inputRef.current?.focus();
            } catch (_) {
              // ignore
            }
            onDiagnostic?.('choice.search.clear', { hadValue: Boolean((value || '').toString().trim()) });
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}

      {open ? (
        <div
          className={`ck-searchable-select__menu${menuPlacement === 'up' ? ' ck-searchable-select__menu--up' : ''}`}
          role="listbox"
          aria-label="Options"
          style={{ maxHeight: `${menuMaxHeight}px` }}
        >
          {visible.length ? (
            visible.map((opt, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`ck-searchable-select__option${active ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={opt.value === value ? 'true' : 'false'}
                  onMouseDown={e => {
                    // Prevent input blur before selection.
                    e.preventDefault();
                    if (disabled) return;
                    commitValue(opt);
                  }}
                >
                  {opt.label}
                </button>
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
