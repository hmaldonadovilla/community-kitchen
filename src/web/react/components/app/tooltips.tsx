import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FieldValue } from '../../../types';
import { OptionState } from '../../types';

export const TooltipIcon: React.FC<{
  text?: string;
  label?: string;
  triggerText?: string;
  linkStyle?: boolean;
}> = ({ text, label, triggerText, linkStyle }) => {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const open = hoverOpen || pinned;
  const hasText = !!text;

  useLayoutEffect(() => {
    if (!hasText || !open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const maxWidth = 460;
    const margin = 8;
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - maxWidth - margin);
    const top = Math.min(rect.bottom + margin, window.innerHeight - margin);
    setPosition({ top, left });
  }, [open, hasText]);

  useEffect(() => {
    if (!hasText || !open) return;
    const onDocClick = (e: MouseEvent) => {
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return;
      setPinned(false);
      setHoverOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, hasText]);

  if (!hasText) return null;

  const overlay =
    open && position
      ? createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              zIndex: 3000,
              top: position.top,
              left: position.left,
              background: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'none',
              padding: 14,
              maxWidth: 460,
              minWidth: 260,
              maxHeight: 360,
              overflowY: 'auto',
              fontSize: 'var(--ck-font-label)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}
            onMouseEnter={() => setHoverOpen(true)}
            onMouseLeave={() => {
              if (!pinned) setHoverOpen(false);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{label || 'Details'}</span>
              <button
                type="button"
                onClick={() => {
                  setPinned(false);
                  setHoverOpen(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: 0
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ marginTop: 8 }}>{text}</div>
          </div>,
          document.body
        )
      : null;

  return (
    <span className="tooltip-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ? `Show ${label}` : 'Show details'}
        aria-expanded={open}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => {
          if (!pinned) setHoverOpen(false);
        }}
        onFocus={() => setHoverOpen(true)}
        onBlur={() => {
          if (!pinned) setHoverOpen(false);
        }}
        onClick={() => setPinned(prev => !prev)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          fontWeight: 600,
          padding: 0,
          lineHeight: 1,
          textDecoration: 'underline',
          textAlign: 'left'
        }}
      >
        {triggerText || label || 'ℹ'}
      </button>
      {overlay}
    </span>
  );
};

export const formatFieldValue = (value: FieldValue): string => {
  if (Array.isArray(value)) {
    return value.length ? (value as string[]).join(', ') : '—';
  }
  if (value === undefined || value === null || value === '') return '—';
  // Display DATE-only values in dd/mm/yyyy (Belgium request).
  // We store DATE values canonically as "YYYY-MM-DD" to avoid timezone shifts.
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      return `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
    }
  }
  return value.toString();
};

export const renderValueWithTooltip = (
  value: FieldValue,
  tooltipText?: string,
  label?: string,
  linkStyle?: boolean
) => {
  const display = formatFieldValue(value);
  if (!tooltipText) return display;
  if (linkStyle) {
    return <TooltipIcon text={tooltipText} label={label} triggerText={display} linkStyle />;
  }
  return <TooltipIcon text={tooltipText} label={label} />;
};

export const resolveTooltipText = (
  tooltipState: Record<string, Record<string, string>>,
  optionState: OptionState,
  key: string,
  value: FieldValue
): string | undefined => {
  const map = tooltipState[key] || optionState[key]?.tooltips;
  if (!map) return undefined;
  const pick = (v: any) => (v !== undefined && v !== null ? map[v as string] : undefined);
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = pick(v);
      if (hit) return hit;
    }
    return undefined;
  }
  return pick(value);
};


