import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../../i18n';
import type { LangCode, LocalizedString } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { formatDateEeeDdMmmYyyy } from '../../utils/valueDisplay';
import { resolveDateInputBound, resolveDateInputValueWithinBounds } from './dateInputBounds';

const DATE_INPUT_FEEDBACK_TTL_MS = 4200;
const transientDateFeedbackStore = new Map<string, { text: string; expiresAt: number }>();

/**
 * DATE input wrapper that keeps the native calendar, but overlays a formatted display value
 * (EEE, dd-MMM-yyyy) when the control is not focused.
 */
export const DateInput: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  language: LangCode;
  readOnly?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  correctionMessages?: {
    min?: LocalizedString;
    max?: LocalizedString;
  };
  ariaLabel?: string;
  ariaDescribedBy?: string;
}> = ({ id, value, onChange, language, readOnly, disabled, min, max, correctionMessages, ariaLabel, ariaDescribedBy }) => {
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [feedback, setFeedback] = useState('');
  const feedbackTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingCorrectionRef = useRef<'min' | 'max' | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generatedFeedbackId = useId();
  const isDisabled = Boolean(disabled || readOnly);
  const resolvedMin = useMemo(() => resolveDateInputBound(min), [min]);
  const resolvedMax = useMemo(() => resolveDateInputBound(max), [max]);
  const feedbackId = `${id || generatedFeedbackId}-feedback`;
  const feedbackStoreKey = (id || ariaLabel || '').toString().trim();
  const describedBy = [ariaDescribedBy, feedback ? feedbackId : ''].filter(Boolean).join(' ') || undefined;

  const isValidYmd = /^\d{4}-\d{2}-\d{2}$/.test((value || '').trim());
  // Show overlay when:
  // - there's a valid value AND
  // - the user is not actively typing (date pickers don't trigger keydown)
  const showOverlay = Boolean(isValidYmd && (!focused || !typing));

  const display = useMemo(() => {
    if (!showOverlay) return '';
    return formatDateEeeDdMmmYyyy(value, language);
  }, [language, showOverlay, value]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        globalThis.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!feedbackStoreKey) return;
    const persisted = transientDateFeedbackStore.get(feedbackStoreKey);
    if (!persisted) return;
    const remaining = persisted.expiresAt - Date.now();
    if (remaining <= 0) {
      transientDateFeedbackStore.delete(feedbackStoreKey);
      return;
    }
    setFeedback(persisted.text);
    if (feedbackTimerRef.current !== null) {
      globalThis.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = globalThis.setTimeout(() => {
      setFeedback('');
      feedbackTimerRef.current = null;
      transientDateFeedbackStore.delete(feedbackStoreKey);
    }, remaining);
  }, [feedbackStoreKey]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || isDisabled) return;
    const handleInput = () => {
      if (input.validity.rangeUnderflow) {
        pendingCorrectionRef.current = 'min';
        return;
      }
      if (input.validity.rangeOverflow) {
        pendingCorrectionRef.current = 'max';
        return;
      }
      pendingCorrectionRef.current = null;
    };
    input.addEventListener('input', handleInput);
    return () => {
      input.removeEventListener('input', handleInput);
    };
  }, [isDisabled, resolvedMax, resolvedMin]);

  const showTemporaryFeedback = (message: string) => {
    if (feedbackTimerRef.current !== null) {
      globalThis.clearTimeout(feedbackTimerRef.current);
    }
    if (feedbackStoreKey) {
      transientDateFeedbackStore.set(feedbackStoreKey, {
        text: message,
        expiresAt: Date.now() + DATE_INPUT_FEEDBACK_TTL_MS
      });
    }
    setFeedback(message);
    feedbackTimerRef.current = globalThis.setTimeout(() => {
      setFeedback('');
      feedbackTimerRef.current = null;
      if (feedbackStoreKey) transientDateFeedbackStore.delete(feedbackStoreKey);
    }, DATE_INPUT_FEEDBACK_TTL_MS);
  };

  return (
    <div className="ck-date-input-wrap">
      <div className="ck-date-input-control">
        <input
          ref={inputRef}
          id={id}
          type="date"
          className={`ck-date-input${showOverlay ? ' ck-date-input--overlay' : ''}`}
          value={value}
          onChange={e => {
            if (isDisabled) return;
            const next = e.target.value;
            const bounded = resolveDateInputValueWithinBounds(next, { min: resolvedMin, max: resolvedMax });
            onChange(bounded.value);
            const correction = bounded.corrected ? bounded.correction : pendingCorrectionRef.current;
            pendingCorrectionRef.current = null;
            if (!correction) return;
            const configuredCorrectionMessage = resolveLocalizedString(
              correction === 'max' ? correctionMessages?.max : correctionMessages?.min,
              language,
              ''
            ).trim();
            const feedbackKey = correction === 'max' ? 'dateInput.correctedToMax' : 'dateInput.correctedToMin';
            const fallback = correction === 'max'
              ? 'This date is no longer allowed. We set the latest allowed date for you.'
              : 'This date is no longer allowed. We set today\'s date for you.';
            showTemporaryFeedback(
              configuredCorrectionMessage ||
                tSystem(feedbackKey, language, fallback, {
                  min: resolvedMin || '',
                  max: resolvedMax || '',
                  value: bounded.value
                })
            );
          }}
          readOnly={readOnly}
          disabled={isDisabled}
          min={resolvedMin}
          max={resolvedMax}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          onFocus={() => {
            if (isDisabled) return;
            setFocused(true);
            setTyping(false);
          }}
          onBlur={() => {
            setFocused(false);
            setTyping(false);
            pendingCorrectionRef.current = null;
          }}
          onKeyDown={() => {
            if (isDisabled) return;
            setTyping(true);
          }}
        />
        {showOverlay && display ? (
          <div className="ck-date-overlay" aria-hidden="true">
            {display}
          </div>
        ) : null}
      </div>
      {feedback ? (
        <div id={feedbackId} className="ck-date-input-feedback" role="status" aria-live="polite">
          {feedback}
        </div>
      ) : null}
    </div>
  );
};
