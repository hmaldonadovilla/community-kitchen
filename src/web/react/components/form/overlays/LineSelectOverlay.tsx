import React, { useEffect, useMemo, useState } from 'react';

import { buttonStyles, withDisabled } from '../ui';
import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';

export interface LineOverlayState {
  open: boolean;
  options: { value: string; label: string; searchText?: string }[];
  groupId?: string;
  anchorFieldId?: string;
  selected?: string[];
}

export const LineSelectOverlay: React.FC<{
  overlay: LineOverlayState;
  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;
  language: LangCode;
  submitting: boolean;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  addLineItemRowManual: (groupId: string, preset?: Record<string, any>) => void;
}> = ({ overlay, setOverlay, language, submitting, onDiagnostic, addLineItemRowManual }) => {
  if (!overlay.open) return null;
  const [query, setQuery] = useState('');
  const selectedCount = (overlay.selected || []).length;

  useEffect(() => {
    setQuery('');
  }, [overlay.open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return overlay.options;
    return overlay.options.filter(opt => {
      const haystack = `${opt.label || ''} ${opt.value || ''} ${opt.searchText || ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, overlay.options]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 11000
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: 24,
          width: '560px',
          maxWidth: '92%',
          border: '1px solid var(--border)',
          boxShadow: '0 18px 50px rgba(15,23,42,0.18)'
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 'var(--ck-font-group-title)', letterSpacing: -0.3 }}>
          {tSystem('lineItems.selectLinesTitle', language, 'Select lines')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={query}
            placeholder={tSystem('lineItems.selectLinesSearch', language, 'Search items')}
            onChange={e => {
              const next = e.target.value;
              const nextNormalized = next.trim().toLowerCase();
              const nextMatches = nextNormalized
                ? overlay.options.filter(opt => {
                    const haystack = `${opt.label || ''} ${opt.value || ''} ${opt.searchText || ''}`.toLowerCase();
                    return haystack.includes(nextNormalized);
                  }).length
                : overlay.options.length;
              setQuery(next);
              onDiagnostic?.('ui.lineItems.overlay.search', {
                groupId: overlay.groupId,
                queryLength: next.trim().length,
                matchCount: nextMatches,
                selectedCount
              });
            }}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}
          />
        </div>
        <div style={{ maxHeight: '50vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredOptions.map(opt => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: '#ffffff',
                fontWeight: 800
              }}
            >
              <input
                type="checkbox"
                value={opt.value}
                checked={overlay.selected?.includes(opt.value) || false}
                disabled={submitting}
                style={{ width: 32, height: 32, accentColor: 'var(--accent)', flex: '0 0 auto' }}
                onChange={e => {
                  setOverlay(prev => {
                    const nextSelected = new Set(prev.selected || []);
                    if (e.target.checked) {
                      nextSelected.add(opt.value);
                    } else {
                      nextSelected.delete(opt.value);
                    }
                    return { ...prev, selected: Array.from(nextSelected) };
                  });
                }}
              />
              <span style={{ fontSize: 'var(--ck-font-control)' }}>{opt.label}</span>
            </label>
          ))}
          {!filteredOptions.length && (
            <div className="muted">{tSystem('lineItems.noOptionsAvailable', language, 'No options available.')}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setOverlay({ open: false, options: [], selected: [] })}
            style={buttonStyles.secondary}
          >
            {tSystem('common.cancel', language, 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              if (overlay.groupId && overlay.anchorFieldId) {
                (overlay.selected || []).forEach(val =>
                  addLineItemRowManual(overlay.groupId!, { [overlay.anchorFieldId!]: val })
                );
              }
              onDiagnostic?.('ui.lineItems.overlay.addSelected', {
                groupId: overlay.groupId,
                count: selectedCount
              });
              setOverlay({ open: false, options: [], selected: [] });
            }}
            disabled={submitting || selectedCount === 0}
            style={withDisabled(buttonStyles.primary, submitting || selectedCount === 0)}
          >
            {tSystem('lineItems.addSelected', language, 'Add selected ({count})', { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
};

