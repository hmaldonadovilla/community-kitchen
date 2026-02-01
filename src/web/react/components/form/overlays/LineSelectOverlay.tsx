import React, { useEffect, useMemo, useState } from 'react';

import { buttonStyles, withDisabled } from '../ui';
import type { LangCode } from '../../../../types';
import type { LineItemAddResult } from '../../../types';
import { tSystem } from '../../../../systemStrings';

export interface LineOverlayState {
  open: boolean;
  options: { value: string; label: string; searchText?: string }[];
  groupId?: string;
  anchorFieldId?: string;
  selected?: string[];
  title?: string;
  helperText?: string;
  placeholder?: string;
}

export const LineSelectOverlay: React.FC<{
  overlay: LineOverlayState;
  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;
  language: LangCode;
  submitting: boolean;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  addLineItemRowManual: (
    groupId: string,
    preset?: Record<string, any>,
    options?: { configOverride?: any; rowFilter?: { includeWhen?: any; excludeWhen?: any } | null }
  ) => LineItemAddResult | undefined;
}> = ({ overlay, setOverlay, language, submitting, onDiagnostic, addLineItemRowManual }) => {
  const [query, setQuery] = useState('');
  const [dedupMessage, setDedupMessage] = useState('');
  const selectedCount = (overlay.selected || []).length;
  const resolvedTitle = (overlay.title || '').toString().trim();
  const resolvedHelper = (overlay.helperText || '').toString().trim();
  const resolvedPlaceholder = (overlay.placeholder || '').toString().trim();

  useEffect(() => {
    if (!overlay.open) return;
    setQuery('');
    setDedupMessage('');
  }, [overlay.open]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const filteredOptions = useMemo(() => {
    if (!overlay.open || !hasQuery) return [];
    return overlay.options.filter(opt => {
      const haystack = `${opt.label || ''} ${opt.value || ''} ${opt.searchText || ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [hasQuery, normalizedQuery, overlay.open, overlay.options]);
  const optionLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    overlay.options.forEach(opt => {
      if (!opt.value) return;
      map.set(opt.value, opt.label || opt.value);
    });
    return map;
  }, [overlay.options]);

  if (!overlay.open) return null;
  const helpId = 'line-select-help';
  const titleText = resolvedTitle || tSystem('lineItems.selectLinesTitle', language, 'Select lines');
  const helperText = resolvedHelper || tSystem(
    'lineItems.selectLinesHelp',
    language,
    'Search and select one or more items. You can update quantities after you return.'
  );
  const placeholderText = resolvedPlaceholder || tSystem('lineItems.selectLinesSearch', language, 'Search items');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        zIndex: 11000
      }}
    >
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 20,
          padding: 24,
          width: '100%',
          maxWidth: '560px',
          height: 'min(80vh, 100%)',
          maxHeight: '92vh',
          border: '1px solid var(--border)',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 'var(--ck-font-group-title)', letterSpacing: 0 }}>
          {titleText}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div id={helpId} className="muted">
            {helperText}
          </div>
          <input
            type="text"
            value={query}
            placeholder={placeholderText}
            aria-describedby={helpId}
            onChange={e => {
              const next = e.target.value;
              const nextNormalized = next.trim().toLowerCase();
              const nextMatches = nextNormalized
                ? overlay.options.filter(opt => {
                    const haystack = `${opt.label || ''} ${opt.value || ''} ${opt.searchText || ''}`.toLowerCase();
                    return haystack.includes(nextNormalized);
                  }).length
                : 0;
              setQuery(next);
              setDedupMessage('');
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
        {dedupMessage ? (
          <div className="error" style={{ marginTop: 10 }}>
            {dedupMessage}
          </div>
        ) : null}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 10,
            paddingBottom: 10,
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y'
          }}
        >
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
                background: 'transparent',
                fontWeight: 600
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
                    setDedupMessage('');
                    return { ...prev, selected: Array.from(nextSelected) };
                  });
                }}
              />
              <span style={{ fontSize: 'var(--ck-font-control)' }}>{opt.label}</span>
            </label>
          ))}
          {!filteredOptions.length && (
            <div className="muted">
              {hasQuery
                ? tSystem('lineItems.noOptionsAvailable', language, 'No options available.')
                : tSystem('lineItems.searchPrompt', language, 'Enter at least 1 character to search.')}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 0,
            paddingTop: 10,
            paddingBottom: 'calc(6px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--border)',
            background: 'var(--card)',
            position: 'sticky',
            bottom: 0
          }}
        >
          <button
            type="button"
            onClick={() => setOverlay({ open: false, options: [], selected: [] })}
            style={buttonStyles.secondary}
          >
            {tSystem('common.back', language, 'Back')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              if (overlay.groupId && overlay.anchorFieldId) {
                const duplicates: string[] = [];
                let duplicateMessage = '';
                (overlay.selected || []).forEach(val => {
                  const result = addLineItemRowManual(overlay.groupId!, { [overlay.anchorFieldId!]: val });
                  if (result?.status === 'duplicate') {
                    duplicates.push(val);
                    if (!duplicateMessage && result.message) {
                      duplicateMessage = result.message;
                    }
                  }
                });
                if (duplicates.length) {
                  const fallbackValue = optionLabelByValue.get(duplicates[0]) || duplicates[0];
                  setDedupMessage(
                    duplicateMessage ||
                      tSystem(
                        'lineItems.duplicateAdd',
                        language,
                        '{value} is already in the list, change the quantity',
                        { value: fallbackValue }
                      )
                  );
                  setOverlay(prev => ({ ...prev, selected: Array.from(new Set(duplicates)) }));
                  return;
                }
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
            {tSystem('lineItems.addSelected', language, 'Add selected')}
          </button>
        </div>
      </div>
    </div>
  );
};
