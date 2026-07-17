import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveLocalizedString } from '../../../i18n';
import type { LangCode, LocalizedString } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { formatDateEeeDdMmmYyyy } from '../../utils/valueDisplay';
import { resolveDateInputBound, resolveDateInputValueWithinBounds } from './dateInputBounds';
import {
  resolveDateInputRenderedValue,
  shouldDeferNativeDateInputCommit,
  type DateInputNativeCommitMode
} from './dateInputInteraction';

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
  iosNativeCommitMode?: DateInputNativeCommitMode;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}> = ({
  id,
  value,
  onChange,
  language,
  readOnly,
  disabled,
  min,
  max,
  correctionMessages,
  iosNativeCommitMode = 'immediate',
  ariaLabel,
  ariaDescribedBy
}) => {
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [feedback, setFeedback] = useState('');
  const deferNativeCommit = useMemo(
    () => shouldDeferNativeDateInputCommit(iosNativeCommitMode, typeof navigator === 'undefined' ? undefined : navigator),
    [iosNativeCommitMode]
  );
  const feedbackTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingCorrectionRef = useRef<'min' | 'max' | null>(null);
  const pendingFocusedValueRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generatedFeedbackId = useId();
  const isDisabled = Boolean(disabled || readOnly);
  const resolvedMin = useMemo(() => resolveDateInputBound(min), [min]);
  const resolvedMax = useMemo(() => resolveDateInputBound(max), [max]);
  const feedbackId = `${id || generatedFeedbackId}-feedback`;
  const feedbackStoreKey = (id || ariaLabel || '').toString().trim();
  const describedBy = [ariaDescribedBy, feedback ? feedbackId : ''].filter(Boolean).join(' ') || undefined;
  const renderedValue = resolveDateInputRenderedValue({
    value,
    draftValue: pendingFocusedValueRef.current,
    deferNativeCommit,
    focused
  });

  const isValidYmd = /^\d{4}-\d{2}-\d{2}$/.test((renderedValue || '').trim());
  // Show overlay when:
  // - there's a valid value AND
  // - the user is not actively typing (date pickers don't trigger keydown)
  const showOverlay = Boolean(isValidYmd && (!focused || !typing));

  const formattedDisplay = useMemo(() => {
    if (!isValidYmd) return '';
    return formatDateEeeDdMmmYyyy(renderedValue, language);
  }, [isValidYmd, language, renderedValue]);
  const display = showOverlay ? formattedDisplay : '';

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

  const applyCommittedValue = (next: string) => {
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
  };

  return (
    <div className="ck-date-input-wrap">
      <div
        className={`ck-date-input-control${formattedDisplay ? ' ck-date-input-control--content-sized' : ''}`}
      >
        <input
          ref={inputRef}
          id={id}
          type="date"
          className={`ck-date-input${showOverlay ? ' ck-date-input--overlay' : ''}`}
          value={renderedValue}
          onChange={e => {
            if (isDisabled) return;
            if (deferNativeCommit) {
              pendingFocusedValueRef.current = e.target.value;
              return;
            }
            applyCommittedValue(e.target.value);
          }}
          onInput={e => {
            if (isDisabled || !deferNativeCommit) return;
            pendingFocusedValueRef.current = (e.target as HTMLInputElement).value;
          }}
          readOnly={readOnly}
          disabled={isDisabled}
          min={resolvedMin}
          max={resolvedMax}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          onFocus={() => {
            if (isDisabled) return;
            pendingFocusedValueRef.current = null;
            setFocused(true);
            setTyping(false);
          }}
          onBlur={() => {
            if (deferNativeCommit && !isDisabled) {
              const nextValue = inputRef.current?.value ?? pendingFocusedValueRef.current ?? value;
              pendingFocusedValueRef.current = null;
              if (nextValue !== value) applyCommittedValue(nextValue);
              else pendingCorrectionRef.current = null;
            } else {
              pendingCorrectionRef.current = null;
            }
            setFocused(false);
            setTyping(false);
          }}
          onKeyDown={() => {
            if (isDisabled) return;
            setTyping(true);
          }}
        />
        {formattedDisplay ? (
          <span className="ck-date-overlay-sizer" aria-hidden="true">
            {formattedDisplay}
          </span>
        ) : null}
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
