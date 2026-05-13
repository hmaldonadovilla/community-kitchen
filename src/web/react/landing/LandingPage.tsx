import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ANALYTICS_PAGE_CONFIG } from '../../../config/analyticsPage';
import { LANDING_PAGE_CONFIG } from '../../../config/landingPage';
import type { LandingIllustrationKey } from '../../../config/landingPageTypes';
import { fetchFormCatalogApi, FormCatalogItem } from '../api';
import { buildAnalyticsUrl, resolveServiceUrl } from '../app/headerNavigation';
import { BlockingOverlay } from '../features/overlays/BlockingOverlay';
import {
  appendLandingSpecialItems,
  buildLandingCatalogLayout,
  filterNavigableLandingItems,
  isTruthyParam,
  LandingAppItem,
  resolveLandingCatalogItems,
  resolveLandingLogoUrl
} from './model';

const LANDING_PAGE_STYLES = `
  .ck-landing-page.page {
    max-width: 1180px;
    gap: 30px;
  }
  .ck-landing-shell {
    display: flex;
    flex-direction: column;
    gap: 34px;
  }
  .ck-landing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding-top: 6px;
  }
  .ck-landing-brand {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .ck-landing-brand-mark {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: rgba(11, 87, 208, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: 0 0 auto;
    color: var(--accent);
  }
  .ck-landing-brand-mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    box-sizing: border-box;
    padding: 10px;
    display: block;
  }
  .ck-landing-brand-icon {
    width: 48px;
    height: 48px;
    display: block;
  }
  .ck-landing-brand-copy {
    min-width: 0;
  }
  .ck-landing-header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .ck-landing-pill {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: transparent;
    color: var(--text);
    font-size: calc(var(--ck-font-label) * 0.5);
    font-weight: 500;
    line-height: 1;
  }
  .ck-landing-hero,
  .ck-landing-section {
    animation: ck-landing-enter 480ms ease both;
  }
  .ck-landing-hero {
    display: grid;
    gap: 16px;
    padding-top: 10px;
  }
  .ck-landing-hero-title {
    margin: 0;
    max-width: 14ch;
    font-size: clamp(42px, calc(var(--ck-font-group-title) * 1.45), 62px);
    line-height: 0.98;
    font-weight: 600;
    letter-spacing: -0.04em;
  }
  .ck-landing-hero-copy {
    margin: 0;
    max-width: 35rem;
    color: var(--muted);
    font-size: clamp(18px, calc(var(--ck-font-label) * 0.6), 22px);
    line-height: 1.45;
  }
  .ck-landing-status {
    margin: 2px 0 0;
    font-size: calc(var(--ck-font-label) * 0.48);
  }
  .ck-landing-error {
    margin: 2px 0 0;
    color: var(--danger);
    font-size: calc(var(--ck-font-label) * 0.48);
    line-height: 1.45;
  }
  .ck-landing-section {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .ck-landing-section-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 14px;
  }
  .ck-landing-section-title {
    margin: 0;
    font-size: clamp(24px, calc(var(--ck-font-group-title) * 0.88), 32px);
    line-height: 1.1;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .ck-landing-section-note {
    margin: 0;
    font-size: calc(var(--ck-font-label) * 0.46);
  }
  .ck-landing-divider {
    border: 0;
    border-top: 1px solid rgba(107, 117, 128, 0.24);
    margin: 0;
  }
  .ck-landing-grid {
    display: grid;
    gap: 22px;
  }
  .ck-landing-grid--primary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ck-landing-grid--admin {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ck-landing-card {
    position: relative;
    border-radius: 28px;
    border: 1px solid rgba(107, 117, 128, 0.24);
    background: rgba(255, 255, 255, 0.94);
    color: var(--text);
    text-decoration: none;
    text-align: left;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  }
  .ck-landing-card:visited,
  .ck-landing-overflow-link:visited {
    color: var(--text);
  }
  .ck-landing-card:hover,
  .ck-landing-card:focus-visible {
    transform: translateY(-3px);
    border-color: rgba(11, 87, 208, 0.36);
    box-shadow: 0 20px 36px rgba(15, 23, 42, 0.1);
  }
  .ck-landing-card:focus-visible {
    outline: 2px solid rgba(11, 87, 208, 0.34);
    outline-offset: 3px;
  }
  .ck-landing-card--primary {
    min-height: 332px;
    padding: 28px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'copy copy'
      'action visual';
    gap: 28px 24px;
    align-items: start;
  }
  .ck-landing-card--admin {
    min-height: 232px;
    padding: 24px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'copy visual'
      'action action';
    gap: 18px 20px;
    align-items: start;
  }
  .ck-landing-card-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ck-landing-card-copy--admin {
    grid-area: copy;
    align-self: start;
    max-width: 17rem;
  }
  .ck-landing-card-copy--primary {
    grid-area: copy;
    align-self: start;
    max-width: 22rem;
  }
  .ck-landing-card-title {
    margin: 0;
    font-size: clamp(24px, calc(var(--ck-font-group-title) * 0.82), 34px);
    line-height: 1.12;
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .ck-landing-card--admin .ck-landing-card-title {
    font-size: clamp(22px, calc(var(--ck-font-group-title) * 0.72), 30px);
  }
  .ck-landing-card-description {
    margin: 0;
    color: var(--muted);
    font-size: clamp(17px, calc(var(--ck-font-label) * 0.54), 21px);
    line-height: 1.45;
  }
  .ck-landing-card-visual {
    display: flex;
    align-items: end;
    justify-content: end;
    color: var(--accent);
  }
  .ck-landing-card--primary .ck-landing-card-visual {
    grid-area: visual;
    align-self: end;
    justify-self: end;
  }
  .ck-landing-card--admin .ck-landing-card-visual {
    grid-area: visual;
    align-self: start;
    justify-self: end;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: rgba(11, 87, 208, 0.05);
  }
  .ck-landing-visual {
    width: 180px;
    max-width: 100%;
    height: auto;
    display: block;
  }
  .ck-landing-visual-image {
    width: 180px;
    max-width: 100%;
    max-height: 156px;
    height: auto;
    display: block;
    object-fit: contain;
  }
  .ck-landing-card--admin .ck-landing-visual {
    width: 56px;
  }
  .ck-landing-card--admin .ck-landing-visual-image {
    width: 56px;
    max-height: 56px;
  }
  .ck-landing-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 54px;
    padding: 0 22px;
    border-radius: 16px;
    font-size: clamp(17px, calc(var(--ck-font-label) * 0.54), 20px);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .ck-landing-action--primary {
    background: var(--accent);
    color: var(--accentText);
  }
  .ck-landing-action--secondary {
    border: 1px solid rgba(107, 117, 128, 0.3);
    background: transparent;
    color: var(--text);
  }
  .ck-landing-card--admin .ck-landing-action {
    grid-area: action;
    justify-self: start;
    min-height: 46px;
    padding: 0 18px;
    font-size: calc(var(--ck-font-label) * 0.48);
  }
  .ck-landing-card--primary .ck-landing-action {
    grid-area: action;
    justify-self: start;
    align-self: end;
  }
  .ck-landing-overflow-panel {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    border-radius: 26px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.9);
    transition: max-height 220ms ease, opacity 220ms ease, border-color 220ms ease, padding 220ms ease;
    padding: 0 24px;
  }
  .ck-landing-overflow-panel[data-open="true"] {
    max-height: 420px;
    opacity: 1;
    border-color: rgba(107, 117, 128, 0.24);
    padding: 14px 24px 24px;
  }
  .ck-landing-overflow-list {
    display: grid;
    gap: 14px;
  }
  .ck-landing-overflow-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 0;
    border-bottom: 1px solid rgba(107, 117, 128, 0.18);
    color: var(--text);
    text-decoration: none;
  }
  .ck-landing-overflow-link:last-child {
    border-bottom: none;
    padding-bottom: 6px;
  }
  .ck-landing-overflow-copy {
    min-width: 0;
  }
  .ck-landing-overflow-title {
    margin: 0;
    font-size: clamp(18px, calc(var(--ck-font-label) * 0.56), 22px);
    line-height: 1.25;
    font-weight: 600;
  }
  .ck-landing-overflow-description {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.48);
    line-height: 1.45;
  }
  .ck-landing-overflow-action {
    flex: 0 0 auto;
    font-size: calc(var(--ck-font-label) * 0.48);
    font-weight: 500;
    color: var(--muted);
  }
  .ck-landing-empty {
    margin: 0;
    border-radius: 24px;
    border: 1px solid rgba(107, 117, 128, 0.24);
    padding: 26px;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.5);
  }
  @keyframes ck-landing-enter {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ck-landing-hero,
    .ck-landing-section,
    .ck-landing-card,
    .ck-landing-overflow-panel {
      animation: none;
      transition: none;
    }
  }
  @media (max-width: 920px) {
    .ck-landing-grid--primary,
    .ck-landing-grid--admin {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 760px) {
    .ck-landing-header {
      flex-direction: column;
      align-items: stretch;
    }
    .ck-landing-header-actions {
      justify-content: flex-start;
    }
    .ck-landing-card--primary {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'copy copy'
        'action visual';
      min-height: 0;
      gap: 22px 16px;
    }
    .ck-landing-card--primary .ck-landing-visual {
      width: 128px;
    }
    .ck-landing-card--primary .ck-landing-visual-image {
      width: 128px;
      max-height: 112px;
    }
    .ck-landing-card--admin {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto;
      grid-template-areas:
        'visual'
        'copy'
        'action';
    }
    .ck-landing-card--admin .ck-landing-card-visual {
      justify-self: start;
    }
    .ck-landing-overflow-link {
      flex-direction: column;
      align-items: flex-start;
    }
  }
`;

const resolveAdminEnabled = (): boolean => {
  try {
    const globalAny = globalThis as any;
    const params = (globalAny?.__WEB_FORM_REQUEST_PARAMS__ || {}) as Record<string, any>;
    if (Object.prototype.hasOwnProperty.call(params, 'admin-true')) return true;
    if (isTruthyParam(params.admin)) return true;
  } catch (_) {
    // ignore
  }
  try {
    const search = typeof location !== 'undefined' ? location.search : '';
    const qs = new URLSearchParams(search || '');
    if (qs.has('admin-true')) return true;
    if (isTruthyParam(qs.get('admin'))) return true;
  } catch (_) {
    // ignore
  }
  return false;
};

const resolveEnvTag = (): string | null => {
  try {
    const globalAny = globalThis as any;
    const raw = globalAny?.__WEB_FORM_BOOTSTRAP__?.envTag ?? globalAny?.__CK_ENV_TAG__ ?? '';
    const trimmed = raw.toString().trim();
    return trimmed || null;
  } catch (_) {
    return null;
  }
};

const navigateToTopLevel = (targetUrl: string): void => {
  const resolved = (targetUrl || '').toString().trim();
  if (!resolved) return;
  try {
    if (typeof globalThis.open === 'function') {
      globalThis.open(resolved, '_top');
      return;
    }
  } catch (_) {
    // ignore
  }
  try {
    globalThis.location.assign(resolved);
    return;
  } catch (_) {
    // ignore
  }
  try {
    globalThis.location.href = resolved;
  } catch (_) {
    // ignore
  }
};

const logEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Landing]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const readBootstrappedFormCatalog = (): FormCatalogItem[] => {
  try {
    const globalAny = globalThis as any;
    const list = globalAny?.__WEB_FORM_BOOTSTRAP__?.formCatalog;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const scheduleTopLevelNavigation = (targetUrl: string): void => {
  globalThis.requestAnimationFrame?.(() => {
    globalThis.requestAnimationFrame?.(() => {
      navigateToTopLevel(targetUrl);
    });
  });
};

const LandingBrandMark: React.FC<{ logoUrl?: string }> = ({ logoUrl }) => {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <span className="ck-landing-brand-mark" aria-hidden="true">
        <img src={logoUrl} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }

  return (
    <span className="ck-landing-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 72 72" className="ck-landing-brand-icon">
        <circle cx="36" cy="36" r="26" fill="rgba(11, 87, 208, 0.14)" />
        <rect x="18" y="20" width="12" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M24 20v-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M42 18v34" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M48 18v34" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M54 18v34" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M42 18c0 6 3 10 6 10s6-4 6-10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
};

const LandingIllustration: React.FC<{ kind: LandingIllustrationKey; imageUrl?: string }> = ({ kind, imageUrl }) => {
  if (imageUrl) {
    return <img src={imageUrl} alt="" aria-hidden="true" className="ck-landing-visual-image" />;
  }

  if (kind === 'meal') {
    return (
      <svg viewBox="0 0 188 132" className="ck-landing-visual" aria-hidden="true">
        <ellipse cx="96" cy="110" rx="68" ry="11" fill="rgba(11, 87, 208, 0.08)" />
        <path d="M92 34c3-15 18-22 33-18 10 2 19 11 21 22 11 1 20 10 20 21 0 12-10 22-22 22H74c-14 0-26-12-26-26 0-13 10-23 23-24 3-10 12-17 21-17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M102 51v25M116 51v25M130 51v25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 95c11 1 21-3 31-11l18 5c-8 9-18 16-33 18" fill="rgba(11, 87, 208, 0.16)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M46 86l13 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M158 69l13 21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M162 69c7 0 13 5 13 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 48l8 8M28 56l8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <rect x="39" y="72" width="20" height="18" rx="6" fill="rgba(11, 87, 208, 0.16)" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  }

  if (kind === 'customers') {
    return (
      <svg viewBox="0 0 96 96" className="ck-landing-visual" aria-hidden="true">
        <rect x="8" y="44" width="34" height="30" rx="8" fill="rgba(11, 87, 208, 0.12)" stroke="currentColor" strokeWidth="2.6" />
        <rect x="42" y="38" width="46" height="38" rx="9" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="56" cy="28" r="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="74" cy="30" r="8" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <path d="M48 62c2-9 11-15 21-15s19 6 21 15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M16 58h10M16 65h18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'ingredients') {
    return (
      <svg viewBox="0 0 96 96" className="ck-landing-visual" aria-hidden="true">
        <path d="M22 20h10l4 18c2 8 0 17-5 22l-5 5c-5-5-7-14-5-22l4-23Z" fill="rgba(11, 87, 208, 0.1)" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <circle cx="55" cy="56" r="15" fill="rgba(11, 87, 208, 0.14)" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="72" cy="36" r="11" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="2.6" />
        <path d="M56 30c4-7 11-11 19-11M45 25c3 7 9 11 17 11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M59 68c5 1 9 5 10 10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'recipes') {
    return (
      <svg viewBox="0 0 96 96" className="ck-landing-visual" aria-hidden="true">
        <path d="M14 22c0-5 4-9 9-9h23c5 0 9 4 9 9v50H23c-5 0-9-4-9-9V22Z" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M82 22c0-5-4-9-9-9H50c-5 0-9 4-9 9v50h32c5 0 9-4 9-9V22Z" fill="rgba(11, 87, 208, 0.12)" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M24 30h16M24 40h18M56 30h14M56 40h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="66" cy="69" r="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <path d="m73 76 9 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'analytics') {
    return (
      <svg viewBox="0 0 188 132" className="ck-landing-visual" aria-hidden="true">
        <ellipse cx="94" cy="112" rx="66" ry="10" fill="rgba(11, 87, 208, 0.08)" />
        <rect x="26" y="28" width="132" height="68" rx="18" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="3" />
        <path d="M54 86V57M86 86V43M118 86V64M150 86V49" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path d="M47 50h90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.22" />
        <circle cx="46" cy="50" r="8" fill="rgba(11, 87, 208, 0.16)" stroke="currentColor" strokeWidth="3" />
        <path d="M38 22h22M138 22h22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      </svg>
    );
  }

  if (kind === 'more') {
    return (
      <svg viewBox="0 0 96 96" className="ck-landing-visual" aria-hidden="true">
        <rect x="12" y="16" width="26" height="26" rx="7" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="2.6" />
        <rect x="58" y="16" width="26" height="26" rx="7" fill="rgba(11, 87, 208, 0.12)" stroke="currentColor" strokeWidth="2.6" />
        <rect x="12" y="54" width="26" height="26" rx="7" fill="rgba(11, 87, 208, 0.12)" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="71" cy="67" r="16" fill="rgba(11, 87, 208, 0.16)" stroke="currentColor" strokeWidth="2.6" />
        <path d="M71 58v18M62 67h18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'admin') {
    return (
      <svg viewBox="0 0 96 96" className="ck-landing-visual" aria-hidden="true">
        <rect x="18" y="18" width="42" height="54" rx="8" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="2.6" />
        <rect x="34" y="26" width="44" height="54" rx="8" fill="rgba(11, 87, 208, 0.14)" stroke="currentColor" strokeWidth="2.6" />
        <path d="M44 41h16M44 52h24M44 63h18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 188 132" className="ck-landing-visual" aria-hidden="true">
      <ellipse cx="92" cy="112" rx="64" ry="10" fill="rgba(11, 87, 208, 0.08)" />
      <rect x="48" y="26" width="56" height="70" rx="10" fill="rgba(11, 87, 208, 0.08)" stroke="currentColor" strokeWidth="3" />
      <path d="M60 42h18M60 58h20M60 74h17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="m120 44 14 18v26h-20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 36h10c6 0 10 5 10 10v16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 94c10 0 19-8 19-18 0-10-9-18-19-18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="146" cy="26" r="8" fill="rgba(11, 87, 208, 0.16)" />
      <circle cx="162" cy="12" r="6" fill="rgba(11, 87, 208, 0.12)" />
    </svg>
  );
};

const openLandingItem = (
  item: LandingAppItem,
  setPendingNavigation: React.Dispatch<React.SetStateAction<{ targetUrl: string; title: string; message: string } | null>>,
  pendingTitle: string,
  pendingMessage: string
): void => {
  const targetUrl = (item.targetUrl || '').toString().trim();
  if (!targetUrl) return;
  logEvent('catalog.navigate', { formKey: item.formKey, targetUrl });
  setPendingNavigation({
    targetUrl,
    title: pendingTitle,
    message: pendingMessage
  });
  scheduleTopLevelNavigation(targetUrl);
};

const LandingActionCard: React.FC<{
  item: LandingAppItem;
  variant: 'primary' | 'admin';
  actionLabel: string;
  onOpen: (item: LandingAppItem) => void;
}> = ({ item, variant, actionLabel, onOpen }) => {
  const targetUrl = (item.targetUrl || '').toString().trim();
  const actionTone = variant === 'primary' ? 'primary' : 'secondary';
  const isAdmin = variant === 'admin';

  return (
    <a
      href={targetUrl}
      target="_top"
      className={`ck-landing-card ck-landing-card--${variant}`}
      onClick={event => {
        event.preventDefault();
        onOpen(item);
      }}
    >
      <div className={`ck-landing-card-copy ${isAdmin ? 'ck-landing-card-copy--admin' : 'ck-landing-card-copy--primary'}`}>
        <div>
          <h3 className="ck-landing-card-title">{item.displayTitle}</h3>
        </div>
      </div>
      {!isAdmin ? <span className={`ck-landing-action ck-landing-action--${actionTone}`}>{actionLabel}</span> : null}
      <div className="ck-landing-card-visual">
        <LandingIllustration kind={item.illustration} imageUrl={item.imageUrl} />
      </div>
      {isAdmin ? <span className={`ck-landing-action ck-landing-action--${actionTone}`}>{actionLabel}</span> : null}
    </a>
  );
};

const LandingPage: React.FC = () => {
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const envTag = useMemo(() => resolveEnvTag(), []);
  const serviceUrl = useMemo(() => resolveServiceUrl(), []);
  const bootstrappedCatalog = useMemo(() => readBootstrappedFormCatalog(), []);
  const hasBootstrappedCatalog = bootstrappedCatalog.length > 0;
  const [loading, setLoading] = useState(() => !hasBootstrappedCatalog);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FormCatalogItem[]>(() =>
    hasBootstrappedCatalog ? filterNavigableLandingItems(bootstrappedCatalog, adminEnabled) : []
  );
  const [pendingNavigation, setPendingNavigation] = useState<{ targetUrl: string; title: string; message: string } | null>(null);
  const landingCopy = LANDING_PAGE_CONFIG.copy;
  const catalogItems = useMemo(() => resolveLandingCatalogItems(items, adminEnabled), [adminEnabled, items]);
  const headerLogoUrl = useMemo(
    () => resolveLandingLogoUrl(LANDING_PAGE_CONFIG.appHeader?.logoUrl, LANDING_PAGE_CONFIG.appHeader?.logoFormKey, catalogItems),
    [catalogItems]
  );
  const analyticsLandingItem = useMemo(() => {
    const targetUrl = buildAnalyticsUrl(serviceUrl, adminEnabled);
    return {
      id: '__analytics__',
      section: ANALYTICS_PAGE_CONFIG.landingTile.section,
      order: ANALYTICS_PAGE_CONFIG.landingTile.order,
      illustration: 'analytics' as const,
      targetUrl,
      title: ANALYTICS_PAGE_CONFIG.landingTile.title,
      description: ANALYTICS_PAGE_CONFIG.landingTile.description,
      imageUrl: ANALYTICS_PAGE_CONFIG.landingTile.imageUrl
    };
  }, [adminEnabled, serviceUrl]);
  const landingLayout = useMemo(
    () =>
      appendLandingSpecialItems(buildLandingCatalogLayout(catalogItems, adminEnabled, LANDING_PAGE_CONFIG), adminEnabled, [analyticsLandingItem]),
    [adminEnabled, analyticsLandingItem, catalogItems]
  );

  React.useEffect(() => {
    if (hasBootstrappedCatalog) {
      const resolvedItems = filterNavigableLandingItems(bootstrappedCatalog, adminEnabled);
      setItems(resolvedItems);
      setError(null);
      setLoading(false);
      logEvent('catalog.bootstrap.used', {
        count: bootstrappedCatalog.length,
        resolvedCount: resolvedItems.length,
        adminEnabled
      });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    logEvent('catalog.fetch.start', { adminEnabled });
    fetchFormCatalogApi()
      .then(response => {
        if (cancelled) return;
        const list = Array.isArray(response) ? response : [];
        const resolvedItems = filterNavigableLandingItems(list, adminEnabled);
        setItems(resolvedItems);
        logEvent('catalog.fetch.success', {
          count: list.length,
          resolvedCount: resolvedItems.length
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load forms.').toString();
        setItems([]);
        setError(message);
        logEvent('catalog.fetch.error', {
          message,
          usedBundledFallback: false,
          fallbackCount: 0
        });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminEnabled, bootstrappedCatalog, hasBootstrappedCatalog]);

  const showPrimaryApps = !loading && !error && landingLayout.primaryApps.length > 0;
  const showAdminSection = !loading && !error && adminEnabled && landingLayout.adminApps.length > 0;

  return (
    <div className="ck-landing-page page">
      <style>{LANDING_PAGE_STYLES}</style>
      <BlockingOverlay
        open={!!pendingNavigation}
        title={pendingNavigation?.title || landingCopy.pendingNavigationTitle}
        message={pendingNavigation?.message || landingCopy.pendingNavigationMessage}
      />

      <div className="ck-landing-shell">
        <header className="ck-landing-header">
          <div className="ck-landing-brand">
            <LandingBrandMark logoUrl={headerLogoUrl} />
          </div>

          {envTag ? (
            <div className="ck-landing-header-actions">
              <span className="ck-landing-pill" role="status" aria-label={`Environment: ${envTag}`}>
                {envTag}
              </span>
            </div>
          ) : null}
        </header>

        <section className="ck-landing-hero" style={{ animationDelay: '40ms' }}>
          <h1 className="ck-landing-hero-title">{LANDING_PAGE_CONFIG.heroTitle}</h1>
          <p className="ck-landing-hero-copy">{LANDING_PAGE_CONFIG.heroDescription}</p>
          {loading ? <p className="muted ck-landing-status">{landingCopy.loadingAppsLabel}</p> : null}
          {error ? (
            <p role="alert" className="ck-landing-error">
              {error}
            </p>
          ) : null}
        </section>

        <section className="ck-landing-section" style={{ animationDelay: '120ms' }}>
          <div className="ck-landing-section-head">
            <h2 className="ck-landing-section-title">{landingCopy.primarySectionTitle}</h2>
          </div>

          {showPrimaryApps ? (
            <div className="ck-landing-grid ck-landing-grid--primary">
              {landingLayout.primaryApps.map(item => (
                <LandingActionCard
                  key={item.formKey}
                  item={item}
                  variant="primary"
                  actionLabel={landingCopy.openAppLabel}
                  onOpen={nextItem =>
                    openLandingItem(nextItem, setPendingNavigation, landingCopy.pendingNavigationTitle, landingCopy.pendingNavigationMessage)
                  }
                />
              ))}
            </div>
          ) : null}

          {!loading && !error && !landingLayout.primaryApps.length ? (
            <p className="ck-landing-empty">{landingCopy.emptyPrimaryAppsLabel}</p>
          ) : null}
        </section>

        {showAdminSection ? <hr className="ck-landing-divider" /> : null}

        {showAdminSection ? (
          <section className="ck-landing-section" style={{ animationDelay: '200ms' }}>
            <div className="ck-landing-section-head">
              <h2 className="ck-landing-section-title">{landingCopy.adminSectionTitle}</h2>
              {landingCopy.adminSectionNote ? <p className="muted ck-landing-section-note">{landingCopy.adminSectionNote}</p> : null}
            </div>

            <div className="ck-landing-grid ck-landing-grid--admin">
              {landingLayout.adminApps.map(item => (
                <LandingActionCard
                  key={item.formKey}
                  item={item}
                  variant="admin"
                  actionLabel={landingCopy.openAppLabel}
                  onOpen={nextItem =>
                    openLandingItem(nextItem, setPendingNavigation, landingCopy.pendingNavigationTitle, landingCopy.pendingNavigationMessage)
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

const mount = () => {
  const rootEl = document.getElementById('react-prototype-root');
  if (!rootEl) return;
  const root = createRoot(rootEl);
  root.render(<LandingPage />);
};

if (typeof document !== 'undefined') {
  mount();
}

export default LandingPage;
