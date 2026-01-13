import React, { useEffect, useRef } from 'react';
import { resolveLocalizedString } from '../../../../i18n';
import { LangCode, LocalizedString } from '../../../../types';
import { CheckIcon, XIcon } from '../../../components/form/ui';
import { GuidedStepStatus } from '../domain/computeStepStatus';

export type StepsBarProps = {
  language: LangCode;
  steps: Array<{ id: string; label?: LocalizedString }>;
  status: GuidedStepStatus[];
  activeStepId: string;
  maxReachableIndex: number;
  onSelectStep: (stepId: string) => void;
};

export const StepsBar: React.FC<StepsBarProps> = ({ language, steps, status, activeStepId, maxReachableIndex, onSelectStep }) => {
  if (!steps.length) return null;
  const statusById = new Map(status.map(s => [s.id, s]));
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  // Keep the active chip visible when we programmatically jump steps (e.g. Submit -> validation -> jump).
  useEffect(() => {
    const el = activeChipRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' } as any);
    } catch (_) {
      // ignore
    }
  }, [activeStepId]);
  return (
    <div
      className="ck-steps-bar"
      role="navigation"
      aria-label="Steps"
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        padding: '14px 16px',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.10)',
        background: 'rgba(248,250,252,0.9)'
      }}
    >
      {steps.map((step, idx) => {
        const s = statusById.get(step.id);
        const active = step.id === activeStepId;
        const reachable = idx <= maxReachableIndex;
        const complete = !!s?.complete;
        const valid = !!s?.valid;
        const label = resolveLocalizedString(step.label as any, language, step.id);

        // Tone semantics:
        // - locked: not reachable from the current contiguous gating
        // - available: reachable but incomplete (should look tappable)
        // - bad: complete but invalid (has validation errors)
        // - good: valid
        const tone = !reachable ? 'locked' : active ? 'active' : valid ? 'good' : complete ? 'bad' : 'available';
        const bg =
          tone === 'active'
            ? 'rgba(59,130,246,0.18)'
            : tone === 'good'
              ? 'rgba(34,197,94,0.14)'
              : tone === 'bad'
                ? 'rgba(239,68,68,0.10)'
                : tone === 'locked'
                  ? 'rgba(148,163,184,0.22)'
                  : 'rgba(59,130,246,0.10)';
        const border =
          tone === 'active'
            ? 'rgba(59,130,246,0.55)'
            : tone === 'good'
              ? 'rgba(34,197,94,0.42)'
              : tone === 'bad'
                ? 'rgba(239,68,68,0.48)'
                : tone === 'locked'
                  ? 'rgba(100,116,139,0.50)'
                  : 'rgba(59,130,246,0.35)';
        const textColor = tone === 'locked' ? 'rgba(15,23,42,0.60)' : '#0f172a';

        return (
          <button
            key={step.id}
            type="button"
            disabled={!reachable}
            onClick={() => onSelectStep(step.id)}
            ref={active ? activeChipRef : null}
            className={`ck-steps-bar__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'step' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderRadius: 14,
              border: `1px solid ${border}`,
              background: bg,
              color: textColor,
              fontWeight: active ? 900 : 800,
              whiteSpace: 'nowrap',
              boxShadow: tone === 'available' ? '0 1px 0 rgba(59,130,246,0.10)' : undefined,
              opacity: 1,
              cursor: reachable ? 'pointer' : 'not-allowed'
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  tone === 'good'
                    ? 'rgba(34,197,94,0.20)'
                    : tone === 'bad'
                      ? 'rgba(239,68,68,0.18)'
                      : tone === 'active'
                        ? 'rgba(59,130,246,0.18)'
                        : tone === 'locked'
                          ? 'rgba(100,116,139,0.22)'
                          : 'rgba(59,130,246,0.16)',
                color: tone === 'good' ? '#166534' : tone === 'bad' ? '#991b1b' : tone === 'active' ? '#1d4ed8' : '#334155',
                flex: '0 0 auto'
              }}
              title={!reachable ? 'Locked' : valid ? 'Valid' : complete ? 'Needs attention' : 'Available'}
            >
              {tone === 'good' ? (
                <CheckIcon size={22} />
              ) : tone === 'bad' ? (
                <XIcon size={22} />
              ) : tone === 'locked' ? (
                <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>–</span>
              ) : (
                <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>›</span>
              )}
            </span>
            <span>
              {idx + 1}. {label || step.id}
            </span>
          </button>
        );
      })}
    </div>
  );
};

