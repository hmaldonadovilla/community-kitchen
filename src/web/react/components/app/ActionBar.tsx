import React, { useEffect, useMemo, useState } from 'react';
import type { LangCode } from '../../../types';
import type {
  ActionBarCustomItemConfig,
  ActionBarItemConfig,
  ActionBarPosition,
  ActionBarSystemButton,
  ActionBarSystemItemConfig,
  ActionBarView,
  ActionBarViewConfig,
  ActionBarsConfig,
  ButtonAction,
  ButtonPlacement,
  LocalizedString
} from '../../../../types';
import type { View } from '../../types';
import { resolveLocalizedString } from '../../../i18n';
import { tSystem } from '../../../systemStrings';

type CustomButton = { id: string; label: string; action: ButtonAction; placements: ButtonPlacement[] };

const normalizeActionToken = (value: string): string =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\+\s+/, '+');

const PRIMARY_ACTION_LABELS = new Set([
  'view/edit',
  'ingredients needed',
  'view/edit ingredients',
  'back to production',
  'back',
  '+add ingredient',
  '+another leftover',
  '+add leftover',
  'close',
  'refresh',
  'tap to collapse',
  'tap to collaps',
  'tap to expand'
].map(normalizeActionToken));

const isPrimaryActionLabel = (label: string): boolean => PRIMARY_ACTION_LABELS.has(normalizeActionToken(label));

const IconWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ck-bottom-icon" aria-hidden="true">
    {children}
  </span>
);

const HomeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M3 10.5L12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19.5v-9Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 21v-7a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const SummaryIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M7 3h7l3 3v15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 21V4.5A1.5 1.5 0 0 1 7.5 3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M8.5 11h7M8.5 15h7M8.5 19h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 3v3a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const BackIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// System "Summary" button should use a checklist/summary icon (distinct from renderDocTemplate buttons).
const SummarySystemIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    style={{ width: '1.25em', height: '1.25em' }}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3V2.75A1.75 1.75 0 0 1 10.75 1h2.5A1.75 1.75 0 0 1 15 2.75V3" />
    <path d="M8.5 8h7" />
    <path d="M8.5 12h7" />
    <path d="M14.5 15.5l.5-1 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5z" fill="currentColor"/>
  </svg>
);

const EditIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12.5 5.5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const iconForCustomAction = (action: ButtonAction): JSX.Element => {
  if (action === 'createRecordPreset') return <PlusIcon />;
  if (action === 'updateRecord') return <EditIcon />;
  return <SummaryIcon />;
};

type MenuDef = { id: string; label: string; buttons: CustomButton[] };

const DEFAULT_TOP: Record<ActionBarView, ActionBarViewConfig> = {
  list: { items: [{ type: 'custom', placements: ['topBar', 'topBarList'], display: 'inline' }] },
  form: { items: [{ type: 'custom', placements: ['topBar', 'topBarForm'], display: 'inline' }] },
  summary: { items: [{ type: 'custom', placements: ['topBar', 'topBarSummary'], display: 'inline' }] }
};

const DEFAULT_BOTTOM: Record<ActionBarView, ActionBarViewConfig> = {
  list: { items: ['home', 'create', { type: 'system', id: 'actions', placements: ['listBar'], menuBehavior: 'auto' }] },
  form: { items: ['home', 'create', { type: 'system', id: 'summary', summaryBehavior: 'auto' }], primary: ['submit'] },
  summary: {
    items: ['home', 'create', 'edit', { type: 'system', id: 'actions', placements: ['summaryBar'], menuBehavior: 'auto' }]
  }
};

const normalizeSystemId = (raw: any): ActionBarSystemButton | null => {
  const id = (raw || '').toString().trim().toLowerCase();
  if (id === 'home' || id === 'create' || id === 'edit' || id === 'summary' || id === 'actions' || id === 'submit') {
    return id as ActionBarSystemButton;
  }
  return null;
};

const normalizeItem = (raw: ActionBarItemConfig): ActionBarSystemItemConfig | ActionBarCustomItemConfig | null => {
  if (typeof raw === 'string') {
    const id = normalizeSystemId(raw);
    return id ? ({ type: 'system', id } as ActionBarSystemItemConfig) : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as any).type;
  if (type === 'system') {
    const id = normalizeSystemId((raw as any).id);
    if (!id) return null;
    return { ...(raw as any), type: 'system', id } as ActionBarSystemItemConfig;
  }
  if (type === 'custom') {
    const placements = (raw as any).placements;
    if (!Array.isArray(placements) || !placements.length) return null;
    return { ...(raw as any), type: 'custom', placements } as ActionBarCustomItemConfig;
  }
  return null;
};

const normalizeViewConfig = (raw?: ActionBarViewConfig): ActionBarViewConfig => {
  if (!raw || typeof raw !== 'object') return {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  const primary = Array.isArray(raw.primary) ? raw.primary : [];
  return { items, primary };
};

const matchesAnyPlacement = (btn: CustomButton, placements: ButtonPlacement[]): boolean =>
  placements.some(p => (btn.placements || []).includes(p));

const resolveCustomButtons = (args: {
  buttons: CustomButton[];
  placements: ButtonPlacement[];
  actions?: ButtonAction[];
}): CustomButton[] => {
  const { buttons, placements, actions } = args;
  const filtered = (buttons || []).filter(b => matchesAnyPlacement(b, placements));
  if (!actions || !actions.length) return filtered;
  return filtered.filter(b => actions.includes(b.action));
};

export const ActionBar: React.FC<{
  position: ActionBarPosition;
  language: LangCode;
  view: View;
  disabled: boolean;
  /**
   * Optional override: disable only the primary Submit button while keeping navigation usable.
   * Useful for flows like dedup checks where the form must not be submittable, but the user should still be able to navigate.
   */
  submitDisabled?: boolean;
  /**
   * Optional tooltip shown when Submit is disabled (localized upstream).
   */
  submitDisabledTooltip?: string;
  submitting?: boolean;
  readOnly?: boolean;
  /**
   * Optional UI override: hide the Submit/Next primary action even if configured.
   * Useful for hiding submit on Summary for closed records.
   */
  hideSubmit?: boolean;
  /**
   * Optional UI override: hide the Edit button even if it is configured for this view.
   * Used to suppress Edit on Summary for records matching statusTransitions.onClose.
   */
  hideEdit?: boolean;
  /**
   * Enable/disable the standard "New record" action (blank record create).
   * When false, the Create menu only shows preset buttons (and/or Copy current record if enabled).
   */
  createNewEnabled?: boolean;
  /**
   * Optional localized label override for the Create button / New record action.
   */
  createButtonLabel?: LocalizedString;
  /**
   * Optional localized label override for the Copy current record action.
   */
  copyCurrentRecordLabel?: LocalizedString;
  submitLabel?: LocalizedString;
  /**
   * Optional localized label override for the system Summary button.
   * Example: { en: "Checklist" }.
   */
  summaryLabel?: LocalizedString;
  summaryEnabled: boolean;
  copyEnabled: boolean;
  canCopy: boolean;
  customButtons: CustomButton[];
  actionBars?: ActionBarsConfig;
  /**
   * Optional notice rendered under the top action bar capsule.
   * Intended for validation summaries that must remain visible while scrolling.
   */
  notice?: React.ReactNode;
  /**
   * Optional Back button (guided steps).
   */
  showBackButton?: boolean;
  backLabel?: LocalizedString | string;
  backDisabled?: boolean;
  onBack?: () => void;
  onHome: () => void;
  onCreateNew: () => void;
  onCreateCopy: () => void;
  onEdit: () => void;
  onSummary: () => void;
  onSubmit: () => void;
  onCustomButton?: (buttonId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  position,
  language,
  view,
  disabled,
  submitDisabled,
  submitDisabledTooltip,
  submitting,
  readOnly,
  hideSubmit,
  hideEdit,
  createNewEnabled,
  createButtonLabel,
  copyCurrentRecordLabel,
  submitLabel,
  summaryLabel,
  summaryEnabled,
  copyEnabled,
  canCopy,
  customButtons,
  actionBars,
  notice,
  onHome,
  onCreateNew,
  onCreateCopy,
  onEdit,
  onSummary,
  onSubmit,
  onCustomButton,
  onDiagnostic,
  showBackButton,
  backLabel,
  backDisabled,
  onBack
}) => {
  const [menu, setMenu] = useState<string | null>(null);
  const viewKey = view as ActionBarView;

  useEffect(() => {
    // Close transient UI when navigating between views.
    setMenu(null);
  }, [view]);

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [menu]);

  const viewConfig: ActionBarViewConfig = useMemo(() => {
    const configured =
      position === 'top' ? (actionBars?.top ? (actionBars.top as any)[viewKey] : undefined) : actionBars?.bottom?.[viewKey];
    if (configured !== undefined) return normalizeViewConfig(configured);
    return normalizeViewConfig(position === 'top' ? DEFAULT_TOP[viewKey] : DEFAULT_BOTTOM[viewKey]);
  }, [actionBars?.bottom, actionBars?.top, position, viewKey]);

  const submitTooltip = submitDisabled ? (submitDisabledTooltip || '') : '';

  const globalHideHomeWhenActive = Boolean(actionBars?.system?.home?.hideWhenActive);

  const resolved = useMemo(() => {
    const allowNewRecord = createNewEnabled !== false;
    const capsule: Array<
      | { kind: 'home'; hideWhenActive: boolean }
      | { kind: 'back'; label: string; disabled: boolean }
      | { kind: 'create'; showMenu: boolean; showCopy: boolean; presetButtons: CustomButton[] }
      | { kind: 'copy' }
      | { kind: 'edit' }
      | { kind: 'summary'; showMenu: boolean; showViewSummary: boolean; menuButtons: CustomButton[]; label: string }
      | { kind: 'actionsMenu'; menuId: string; label: string; buttons: CustomButton[] }
      | { kind: 'custom'; button: CustomButton }
    > = [];
    const menus: MenuDef[] = [];
    let wantsSubmit = false;

    if (position === 'bottom' && viewKey === 'form' && typeof onBack === 'function' && showBackButton !== false) {
      const label = resolveLocalizedString(backLabel as any, language, tSystem('actions.back', language, 'Back')).toString();
      capsule.push({ kind: 'back', label, disabled: !!backDisabled });
    }

    const addMenu = (def: Omit<MenuDef, 'id'>): string => {
      const id = `menu:${menus.length}`;
      menus.push({ id, ...def });
      return id;
    };

    const addCustomButtonsInline = (buttons: CustomButton[]) => {
      (buttons || []).forEach(btn => capsule.push({ kind: 'custom', button: btn }));
    };

    const resolveSystem = (cfg: ActionBarSystemItemConfig) => {
      if (cfg.id === 'submit') {
        // Submit is rendered as a primary action (right side) to match existing UX.
        wantsSubmit = true;
        return;
      }

      if (cfg.id === 'home') {
        const hideWhenActive = cfg.hideWhenActive !== undefined ? Boolean(cfg.hideWhenActive) : globalHideHomeWhenActive;
        if (hideWhenActive && viewKey === 'list') return;
        capsule.push({ kind: 'home', hideWhenActive });
        return;
      }

      if (cfg.id === 'create') {
        const showCopy = cfg.showCopyCurrentRecord !== undefined ? Boolean(cfg.showCopyCurrentRecord) : copyEnabled;
        const presetActions = cfg.actions;
        const wantsPresets = !!(presetActions && presetActions.includes('createRecordPreset'));
        const presetPlacements = cfg.placements && cfg.placements.length ? cfg.placements : undefined;
        const presetButtons = wantsPresets
          ? presetPlacements && presetPlacements.length
            ? resolveCustomButtons({ buttons: customButtons, placements: presetPlacements, actions: presetActions })
            : (customButtons || []).filter(b => b.action === 'createRecordPreset')
          : [];

        const hasCopy = viewKey !== 'list' && copyEnabled && showCopy;
        const hasAnyCreateAction = allowNewRecord || presetButtons.length > 0 || hasCopy;
        if (!hasAnyCreateAction) return;

        const behavior = cfg.menuBehavior || 'auto';
        if (behavior === 'inline') {
          // Inline mode: show each create-related action as its own button (no menu).
          if (allowNewRecord) {
            capsule.push({ kind: 'create', showMenu: false, showCopy, presetButtons: [] });
          }
          if (presetButtons.length) addCustomButtonsInline(presetButtons);
          if (hasCopy) capsule.push({ kind: 'copy' });
          return;
        }

        const forceMenu = behavior === 'menu';
        const showMenu = forceMenu || presetButtons.length > 0 || hasCopy;
        capsule.push({ kind: 'create', showMenu, showCopy, presetButtons });
        return;
      }

      if (cfg.id === 'edit') {
        if (hideEdit) return;
        capsule.push({ kind: 'edit' });
        return;
      }

      if (cfg.id === 'summary') {
        if (!summaryEnabled && !copyEnabled && viewKey !== 'form') {
          // If Summary view is disabled, only show Summary when it has a menu (form view), otherwise it is not meaningful.
        }
        const menuPlacements = (cfg.placements && cfg.placements.length ? cfg.placements : (['formSummaryMenu'] as ButtonPlacement[]));
        const menuButtons = resolveCustomButtons({ buttons: customButtons, placements: menuPlacements, actions: cfg.actions });
        const behavior = cfg.summaryBehavior || 'auto';
        const shouldMenu =
          viewKey === 'form' &&
          (behavior === 'menu' || (behavior === 'auto' && menuButtons.length > 0) || (!summaryEnabled && menuButtons.length > 0));
        const overrideLabel = resolveLocalizedString(summaryLabel as any, language, '').toString().trim();
        const label =
          !summaryEnabled && shouldMenu
            ? tSystem('actions.actions', language, 'Actions')
            : (overrideLabel && summaryEnabled ? overrideLabel : tSystem('actions.summary', language, 'Summary'));
        capsule.push({
          kind: 'summary',
          showMenu: shouldMenu,
          showViewSummary: summaryEnabled,
          menuButtons,
          label
        });
        return;
      }

      if (cfg.id === 'actions') {
        const placements =
          cfg.placements && cfg.placements.length
            ? cfg.placements
            : viewKey === 'list'
            ? (['listBar'] as ButtonPlacement[])
            : viewKey === 'summary'
            ? (['summaryBar'] as ButtonPlacement[])
            : (['formSummaryMenu'] as ButtonPlacement[]);
        const buttons = resolveCustomButtons({ buttons: customButtons, placements, actions: cfg.actions });
        const behavior = cfg.menuBehavior || 'auto';
        const label = tSystem('actions.actions', language, 'Actions');

        if (!buttons.length) return;
        if (behavior === 'inline') {
          addCustomButtonsInline(buttons);
          return;
        }
        if (behavior === 'auto' && buttons.length === 1) {
          capsule.push({ kind: 'custom', button: buttons[0] });
          return;
        }
        const menuId = addMenu({ label: tSystem('actions.actionsMenu', language, 'Actions menu'), buttons });
        capsule.push({ kind: 'actionsMenu', menuId, label, buttons });
        return;
      }
    };

    const resolveCustom = (cfg: ActionBarCustomItemConfig) => {
      const display = cfg.display || 'inline';
      const buttons = resolveCustomButtons({ buttons: customButtons, placements: cfg.placements, actions: cfg.actions });
      if (!buttons.length) return;
      if (display === 'inline') {
        addCustomButtonsInline(buttons);
        return;
      }
      const label = resolveLocalizedString((cfg.label || { en: 'Actions' }) as LocalizedString, language, 'Actions');
      const menuId = addMenu({ label, buttons });
      capsule.push({ kind: 'actionsMenu', menuId, label, buttons });
    };

    const consume = (raw: ActionBarItemConfig) => {
      const normalized = normalizeItem(raw);
      if (!normalized) return;
      if (normalized.type === 'system') resolveSystem(normalized);
      else resolveCustom(normalized as ActionBarCustomItemConfig);
    };

    (viewConfig.items || []).forEach(consume);
    // If submit appears in either items or primary, render it as primary.
    (viewConfig.primary || []).forEach(consume);

    return { capsule, menus, wantsSubmit };
  }, [
    copyEnabled,
    createNewEnabled,
    customButtons,
    hideEdit,
    globalHideHomeWhenActive,
    language,
    backDisabled,
    backLabel,
    onBack,
    position,
    summaryLabel,
    summaryEnabled,
    viewConfig.items,
    viewConfig.primary,
    viewKey,
    showBackButton
  ]);

  const homeActive = viewKey === 'list';

  const createOpen = menu === 'create';
  const summaryOpen = menu === 'summary';

  const openMenuDef = resolved.menus.find(m => m.id === menu) || null;

  useEffect(() => {
    if (!onDiagnostic) return;
    onDiagnostic('ui.actionBars.resolved', {
      position,
      view: viewKey,
      capsuleCount: resolved.capsule.length,
      menuCount: resolved.menus.length,
      submit: resolved.wantsSubmit
    });
  }, [onDiagnostic, position, resolved.capsule.length, resolved.menus.length, resolved.wantsSubmit, viewKey]);

  const showSubmit =
    resolved.wantsSubmit && (viewKey === 'form' || viewKey === 'summary') && !readOnly && hideSubmit !== true;

  const hasCapsuleRow = resolved.capsule.length > 0 || showSubmit;
  const hasNoticeRow = !!notice;
  const noticeOnly = hasNoticeRow && !hasCapsuleRow;

  if (!hasCapsuleRow && !hasNoticeRow) return null;

  const navClass = position === 'bottom' ? 'ck-bottom-bar' : 'ck-top-action-bar';
  const navLabel =
    position === 'bottom'
      ? tSystem('app.bottomActions', language, 'Bottom actions')
      : tSystem('app.topActions', language, 'Actions');
  const topSticky = position === 'top' ? (actionBars as any)?.top?.sticky !== false : false;

  const handleCreatePress = (args: { showMenu: boolean }) => {
    if (disabled) return;
    if (args.showMenu) {
      setMenu(current => (current === 'create' ? null : 'create'));
      return;
    }
    if (createNewEnabled === false) {
      onDiagnostic?.('ui.createNew.disabled', { view: viewKey });
      return;
    }
    onCreateNew();
  };

  const handleSummaryPress = (args: { showMenu: boolean }) => {
    if (disabled) return;
    if (args.showMenu) {
      setMenu(current => (current === 'summary' ? null : 'summary'));
      return;
    }
    onSummary();
  };

  const renderCustomMenuOverlay = (def: MenuDef | null) => {
    if (!def) return null;
    return (
      <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
        <button
          type="button"
          className="ck-bottom-menu-backdrop"
          aria-label={tSystem('actions.closeActionsMenu', language, 'Close actions menu')}
          onClick={() => setMenu(null)}
        />
        <div className="ck-bottom-menu" aria-label={def.label}>
          {def.buttons.map(btn => (
            <button
              key={btn.id}
              type="button"
              className="ck-bottom-menu-item ck-bottom-menu-item--primary"
              disabled={disabled || !onCustomButton}
              onClick={() => {
                setMenu(null);
                onCustomButton?.(btn.id);
              }}
            >
              <IconWrap>{iconForCustomAction(btn.action)}</IconWrap>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {createOpen && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label={tSystem('actions.closeCreateMenu', language, 'Close create menu')}
            onClick={() => setMenu(null)}
          />
          <div className="ck-bottom-menu" aria-label={tSystem('actions.createMenu', language, 'Create menu')}>
            {createNewEnabled !== false ? (
              <button
                type="button"
                className="ck-bottom-menu-item ck-bottom-menu-item--primary"
                disabled={disabled}
                onClick={() => {
                  setMenu(null);
                  onCreateNew();
                }}
              >
                <IconWrap>
                  <PlusIcon />
                </IconWrap>
                {resolveLocalizedString(createButtonLabel, language, tSystem('actions.newRecord', language, 'New record'))}
              </button>
            ) : null}
	            {resolved.capsule
	              .filter(it => it.kind === 'create')
	              .flatMap(it => (it.kind === 'create' ? it.presetButtons : []))
	              .map(btn => (
	                <button
	                  key={btn.id}
	                  type="button"
	                  className={`ck-bottom-menu-item${isPrimaryActionLabel(btn.label) ? ' ck-bottom-menu-item--primary' : ''}`}
	                  disabled={disabled || !onCustomButton}
	                  onClick={() => {
	                    setMenu(null);
	                    onCustomButton?.(btn.id);
	                  }}
                >
                  <IconWrap>
                    <PlusIcon />
                  </IconWrap>
                  {btn.label}
                </button>
              ))}
            {copyEnabled &&
              resolved.capsule.some(it => it.kind === 'create' && (it as any).showCopy) && (
              <button
                type="button"
                className="ck-bottom-menu-item"
                disabled={disabled || !canCopy}
                onClick={() => {
                  setMenu(null);
                  onCreateCopy();
                }}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {resolveLocalizedString(
                  copyCurrentRecordLabel,
                  language,
                  tSystem('actions.copyCurrentRecord', language, 'Copy current record')
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {summaryOpen && viewKey === 'form' && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label={tSystem('actions.closeSummaryMenu', language, 'Close summary menu')}
            onClick={() => setMenu(null)}
          />
          <div className="ck-bottom-menu" aria-label={tSystem('actions.summaryMenu', language, 'Summary menu')}>
            {summaryEnabled && (
              <button
                type="button"
                className="ck-bottom-menu-item ck-bottom-menu-item--primary"
                disabled={disabled}
                onClick={() => {
                  setMenu(null);
                  onSummary();
                }}
              >
                <IconWrap>
                  <SummarySystemIcon />
                </IconWrap>
                {(() => {
                  const overrideLabel = resolveLocalizedString(summaryLabel as any, language, '').toString().trim();
                  return overrideLabel && summaryEnabled ? overrideLabel : tSystem('actions.viewSummary', language, 'View summary');
                })()}
              </button>
            )}

	            {resolved.capsule
	              .filter(it => it.kind === 'summary')
	              .flatMap(it => (it.kind === 'summary' ? it.menuButtons : []))
	              .map(btn => (
	                <button
	                  key={btn.id}
	                  type="button"
	                  className={`ck-bottom-menu-item${isPrimaryActionLabel(btn.label) ? ' ck-bottom-menu-item--primary' : ''}`}
	                  disabled={disabled || !onCustomButton}
	                  onClick={() => {
	                    setMenu(null);
	                    onCustomButton?.(btn.id);
	                  }}
                >
                  <IconWrap>{iconForCustomAction(btn.action)}</IconWrap>
                  {btn.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {menu && menu.startsWith('menu:') ? renderCustomMenuOverlay(openMenuDef) : null}

      <nav
        className={navClass}
        aria-label={navLabel}
        data-sticky={topSticky ? '1' : '0'}
        data-notice-only={noticeOnly ? '1' : '0'}
      >
        {position === 'bottom' && notice ? (
          <div className="ck-bottom-bar-inner ck-actionbar-notice-inner ck-actionbar-notice-inner--bottom">{notice}</div>
        ) : null}
        {hasCapsuleRow ? (
          <div className="ck-bottom-bar-inner">
            {(() => {
              const capsule = resolved.capsule || [];
              if (!capsule.length) return <div aria-hidden="true" style={{ flex: '1 1 auto' }} />;

              const backItems = capsule.filter(it => it.kind === 'back') as any[];
              const mainItems = capsule.filter(it => it.kind !== 'back') as any[];

              return (
                <>
	                  {backItems.map((it, idx) => (
	                    <button
	                      // eslint-disable-next-line react/no-array-index-key
	                      key={`back-${idx}`}
	                      type="button"
	                      className="ck-bottom-item ck-bottom-item--back ck-bottom-item--primary"
	                      onClick={onBack}
	                      disabled={disabled || it.disabled}
	                      aria-label={it.label}
	                    >
                      <IconWrap>
                        <BackIcon />
                      </IconWrap>
                      <span className="ck-bottom-label">{it.label}</span>
                    </button>
                  ))}

                  {mainItems.length ? (
                    <div className="ck-bottom-capsule" aria-label={tSystem('app.navigation', language, 'Navigation')}>
                      {mainItems.map((it, idx) => {
                        if (it.kind === 'home') {
                    return (
                      <button
                        // eslint-disable-next-line react/no-array-index-key
                        key={`home-${idx}`}
                        type="button"
                        className={`ck-bottom-item ck-bottom-item--icon${homeActive ? ' active' : ''}`}
                        onClick={onHome}
                        disabled={disabled}
                        aria-label={tSystem('actions.home', language, 'Home')}
                        title={tSystem('actions.home', language, 'Home')}
                      >
                        <IconWrap>
                          <HomeIcon />
                        </IconWrap>
                      </button>
                    );
                  }
                  if (it.kind === 'create') {
                    const createLabel = resolveLocalizedString(createButtonLabel, language, tSystem('actions.create', language, 'Create'));
                    return (
                      <button
                        // eslint-disable-next-line react/no-array-index-key
                        key={`create-${idx}`}
                        type="button"
                        className={`ck-bottom-item${createOpen ? ' active' : ''}`}
                        onClick={() => handleCreatePress({ showMenu: it.showMenu })}
                        disabled={disabled}
                        aria-haspopup={it.showMenu ? 'dialog' : undefined}
                        aria-expanded={it.showMenu ? createOpen : undefined}
                      >
                        <IconWrap>
                          <PlusIcon />
                        </IconWrap>
                        <span className="ck-bottom-label">{createLabel}</span>
                      </button>
                    );
                  }
                  if (it.kind === 'copy') {
                    const copyLabel = resolveLocalizedString(
                      copyCurrentRecordLabel,
                      language,
                      tSystem('actions.copyCurrentRecord', language, 'Copy current record')
                    );
                    return (
                      <button
                        // eslint-disable-next-line react/no-array-index-key
                        key={`copy-${idx}`}
                        type="button"
                        className="ck-bottom-item"
                        onClick={onCreateCopy}
                        disabled={disabled || !canCopy}
                      >
                        <IconWrap>
                          <SummaryIcon />
                        </IconWrap>
                        <span className="ck-bottom-label">{copyLabel}</span>
                      </button>
                    );
                  }
                  if (it.kind === 'edit') {
                    return (
                      <button
                        // eslint-disable-next-line react/no-array-index-key
                        key={`edit-${idx}`}
                        type="button"
                        className="ck-bottom-item"
                        onClick={onEdit}
                        disabled={disabled}
                      >
                        <IconWrap>
                          <EditIcon />
                        </IconWrap>
                        <span className="ck-bottom-label">{tSystem('actions.edit', language, 'Edit')}</span>
                      </button>
                    );
                  }
	                  if (it.kind === 'summary') {
	                    const primary = isPrimaryActionLabel(it.label);
	                    return (
	                      <button
	                        // eslint-disable-next-line react/no-array-index-key
	                        key={`summary-${idx}`}
	                        type="button"
	                        className={`ck-bottom-item${summaryOpen ? ' active' : ''}${primary ? ' ck-bottom-item--primary' : ''}`}
	                        onClick={() => handleSummaryPress({ showMenu: it.showMenu })}
	                        disabled={disabled}
	                        aria-haspopup={it.showMenu ? 'dialog' : undefined}
	                        aria-expanded={it.showMenu ? summaryOpen : undefined}
                      >
                        <IconWrap>
                          <SummarySystemIcon />
                        </IconWrap>
                        <span className="ck-bottom-label">{it.label}</span>
                      </button>
                    );
                  }
	                  if (it.kind === 'actionsMenu') {
	                    const open = menu === it.menuId;
	                    const primary = isPrimaryActionLabel(it.label);
	                    return (
	                      <button
	                        // eslint-disable-next-line react/no-array-index-key
	                        key={`actions-${idx}`}
	                        type="button"
	                        className={`ck-bottom-item${open ? ' active' : ''}${primary ? ' ck-bottom-item--primary' : ''}`}
	                        onClick={() => setMenu(current => (current === it.menuId ? null : it.menuId))}
	                        disabled={disabled || !onCustomButton}
	                        aria-haspopup="dialog"
	                        aria-expanded={open}
                      >
                        <IconWrap>
                          <SummaryIcon />
                        </IconWrap>
                        <span className="ck-bottom-label">{it.label}</span>
                      </button>
                    );
                  }
	                  if (it.kind === 'custom') {
	                    const btn = it.button;
	                    const primary = isPrimaryActionLabel(btn.label);
	                    return (
	                      <button
	                        // eslint-disable-next-line react/no-array-index-key
	                        key={`custom-${btn.id}-${idx}`}
	                        type="button"
	                        className={`ck-bottom-item${primary ? ' ck-bottom-item--primary' : ''}`}
	                        onClick={() => onCustomButton?.(btn.id)}
	                        disabled={disabled || !onCustomButton}
	                      >
                        <IconWrap>{iconForCustomAction(btn.action)}</IconWrap>
                        <span className="ck-bottom-label">{btn.label}</span>
                      </button>
                    );
                  }
                  return null;
                      })}
                    </div>
                  ) : (
                    <div aria-hidden="true" style={{ flex: '1 1 auto' }} />
                  )}
                </>
              );
            })()}

            {showSubmit && (
              <span
                style={{ display: 'inline-flex' }}
                title={submitTooltip || undefined}
              >
                <button type="button" className="ck-bottom-submit" onClick={onSubmit} disabled={disabled || submitDisabled}>
                  <IconWrap>
                    <CheckIcon />
                  </IconWrap>
                  <span className="ck-bottom-label">
                    {submitting
                      ? tSystem('actions.submitting', language, 'Submitting…')
                      : resolveLocalizedString(submitLabel, language, tSystem('actions.submit', language, 'Submit'))}
                  </span>
                </button>
              </span>
            )}
          </div>
        ) : null}

        {position === 'top' && notice ? (
          <div className="ck-bottom-bar-inner ck-actionbar-notice-inner">{notice}</div>
        ) : null}
      </nav>
    </>
  );
};
