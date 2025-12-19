import React from 'react';

import { buttonStyles, withDisabled } from '../ui';

export interface LineOverlayState {
  open: boolean;
  options: { value: string; label: string }[];
  groupId?: string;
  anchorFieldId?: string;
  selected?: string[];
}

export const LineSelectOverlay: React.FC<{
  overlay: LineOverlayState;
  setOverlay: React.Dispatch<React.SetStateAction<LineOverlayState>>;
  submitting: boolean;
  addLineItemRowManual: (groupId: string, preset?: Record<string, any>) => void;
}> = ({ overlay, setOverlay, submitting, addLineItemRowManual }) => {
  if (!overlay.open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 11000
      }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, width: '420px', maxWidth: '90%' }}>
        <h3 style={{ marginTop: 0 }}>Select lines</h3>
        <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {overlay.options.map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                value={opt.value}
                checked={overlay.selected?.includes(opt.value) || false}
                disabled={submitting}
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
              <span>{opt.label}</span>
            </label>
          ))}
          {!overlay.options.length && <div className="muted">No options available.</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setOverlay({ open: false, options: [], selected: [] })}
            style={buttonStyles.secondary}
          >
            Cancel
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
              setOverlay({ open: false, options: [], selected: [] });
            }}
            disabled={submitting}
            style={withDisabled(buttonStyles.primary, submitting)}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};



