import { useCallback, useRef } from 'react';

export type ValidationNavigationMode = 'focus' | 'scroll';

type DiagnosticHandler = (event: string, payload?: Record<string, unknown>) => void;

export const resolveValidationNavigationMode = (args?: {
  scrollOnly?: boolean;
  mode?: ValidationNavigationMode;
}): ValidationNavigationMode => {
  if (args?.mode) return args.mode;
  return args?.scrollOnly ? 'scroll' : 'focus';
};

export const useValidationNavigationRequest = (args: { onDiagnostic?: DiagnosticHandler }) => {
  const { onDiagnostic } = args;
  const firstErrorRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const consumedRef = useRef(0);
  const modeRef = useRef<ValidationNavigationMode>('focus');
  const allowOverlayOpenRef = useRef(true);

  const requestValidationNavigation = useCallback(
    (requestArgs?: {
      scope?: string;
      mode?: ValidationNavigationMode;
      scrollOnly?: boolean;
      allowOverlayOpen?: boolean;
    }): number => {
      const mode = resolveValidationNavigationMode(requestArgs);
      allowOverlayOpenRef.current = requestArgs?.allowOverlayOpen !== false;
      requestRef.current += 1;
      modeRef.current = mode;
      onDiagnostic?.('validation.navigate.request', {
        attempt: requestRef.current,
        ...(requestArgs?.scope ? { scope: requestArgs.scope } : {}),
        mode
      });
      return requestRef.current;
    },
    [onDiagnostic]
  );

  const consumeValidationNavigation = useCallback(() => {
    allowOverlayOpenRef.current = true;
    consumedRef.current = requestRef.current;
  }, []);

  return {
    firstErrorRef,
    requestRef,
    consumedRef,
    modeRef,
    allowOverlayOpenRef,
    requestValidationNavigation,
    consumeValidationNavigation
  };
};
