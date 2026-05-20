import { useEffect, useMemo, useRef } from 'react';

import type { LangCode, WebFormDefinition } from '../../../types';
import { prefetchTemplatesApi, renderMarkdownTemplateApi } from '../../api';
import type { View } from '../../types';
import { collectMarkdownTemplatePrefetchTargets } from './templatePrefetchTargets';

const HOME_TEMPLATE_PREFETCH_DELAY_MS = 0;

export const useAppTemplatePrefetch = (args: {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  view: View;
  homeFirstDataReadyAtMs: number;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const { definition, formKey, language, view, homeFirstDataReadyAtMs, logEvent } = args;
  const templatePrefetchDoneFormKeyRef = useRef<string | null>(null);
  const templatePrefetchInFlightFormKeyRef = useRef<string | null>(null);
  const templatePrefetchRetryCountRef = useRef<Record<string, number>>({});

  const definitionFollowupConfig = definition.followup || null;
  const hasTemplateRenderTargets = useMemo(() => {
    if (definition.summaryViewEnabled !== false && !!definition.summaryHtmlTemplateId) return true;
    if (definitionFollowupConfig?.pdfTemplateId || definitionFollowupConfig?.emailTemplateId) return true;
    return (definition.questions || []).some(q => {
      if (!q || q.type !== 'BUTTON') return false;
      const action = ((((q as any)?.button || {}) as any).action || '').toString().trim();
      return action === 'renderDocTemplate' || action === 'renderMarkdownTemplate' || action === 'renderHtmlTemplate';
    });
  }, [definition.questions, definition.summaryHtmlTemplateId, definition.summaryViewEnabled, definitionFollowupConfig]);

  useEffect(() => {
    const key = (formKey || '').toString().trim();
    if (!key) return;
    if (!hasTemplateRenderTargets) return;
    const shouldWaitForHomeData = view === 'list';
    if (shouldWaitForHomeData && homeFirstDataReadyAtMs <= 0) return;
    if (templatePrefetchDoneFormKeyRef.current === key) return;
    if (templatePrefetchInFlightFormKeyRef.current === key) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleHandle: number | null = null;

    const run = () => {
      if (cancelled) return;
      if (templatePrefetchDoneFormKeyRef.current === key) return;
      if (templatePrefetchInFlightFormKeyRef.current === key) return;
      templatePrefetchInFlightFormKeyRef.current = key;
      const startedAt = Date.now();
      logEvent('templates.prefetch.start', {
        formKey: key,
        view,
        homeFirstDataReadyAtMs: homeFirstDataReadyAtMs || null,
        startedAfterHomeDataMs: homeFirstDataReadyAtMs > 0 ? Math.max(0, Date.now() - homeFirstDataReadyAtMs) : null,
        phase: shouldWaitForHomeData ? 'postHomeData' : 'postBootstrap'
      });
      prefetchTemplatesApi(key)
        .then(async res => {
          if (cancelled) return;
          const markdownTargets = collectMarkdownTemplatePrefetchTargets(definition, language);
          if (markdownTargets.length) {
            const markdownStartedAt = Date.now();
            logEvent('templates.prefetch.markdownRender.start', {
              formKey: key,
              count: markdownTargets.length,
              buttonIds: markdownTargets.map(target => target.buttonId)
            });
            const payload = {
              formKey: key,
              language,
              values: {},
              lineItems: {}
            } as any;
            const results = await Promise.allSettled(
              markdownTargets.map(target =>
                renderMarkdownTemplateApi(payload, target.buttonId, target.cacheOptions)
              )
            );
            if (cancelled) return;
            const fulfilled = results.filter(result => result.status === 'fulfilled');
            const succeeded = fulfilled.filter(result => Boolean((result as PromiseFulfilledResult<any>).value?.success)).length;
            const failed = results.length - succeeded;
            logEvent('templates.prefetch.markdownRender.ok', {
              formKey: key,
              requested: markdownTargets.length,
              succeeded,
              failed,
              durationMs: Date.now() - markdownStartedAt
            });
          }
          if (templatePrefetchInFlightFormKeyRef.current === key) {
            templatePrefetchInFlightFormKeyRef.current = null;
          }
          templatePrefetchDoneFormKeyRef.current = key;
          delete templatePrefetchRetryCountRef.current[key];
          logEvent('templates.prefetch.ok', {
            formKey: key,
            success: Boolean(res?.success),
            message: (res as any)?.message || null,
            counts: (res as any)?.counts || null,
            durationMs: Date.now() - startedAt
          });
        })
        .catch(err => {
          if (templatePrefetchInFlightFormKeyRef.current === key) {
            templatePrefetchInFlightFormKeyRef.current = null;
          }
          const retries = (templatePrefetchRetryCountRef.current[key] || 0) + 1;
          templatePrefetchRetryCountRef.current[key] = retries;
          const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to prefetch templates.';
          logEvent('templates.prefetch.failed', {
            formKey: key,
            message: msg,
            retries,
            durationMs: Date.now() - startedAt
          });
          if (cancelled || retries >= 5) return;
          const delayMs = Math.min(5000, 800 + retries * 600);
          retryTimer = globalThis.setTimeout(() => {
            retryTimer = null;
            run();
          }, delayMs);
        });
    };

    const scheduleRun = () => {
      try {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          idleHandle = (window as any).requestIdleCallback(run, { timeout: shouldWaitForHomeData ? 700 : 1500 }) as number;
          return;
        }
      } catch {
        // fall back below
      }
      run();
    };

    retryTimer = globalThis.setTimeout(() => {
      retryTimer = null;
      scheduleRun();
    }, shouldWaitForHomeData ? HOME_TEMPLATE_PREFETCH_DELAY_MS : 0);
    return () => {
      cancelled = true;
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [definition, formKey, hasTemplateRenderTargets, homeFirstDataReadyAtMs, language, view, logEvent]);

  return { hasTemplateRenderTargets };
};
