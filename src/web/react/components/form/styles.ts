export const FORM_VIEW_STYLES = `
        .webform-overlay [data-overlay-scroll-container="true"] {
          margin: 0 30px 50px 30px;
        }
        .form-card,
        .webform-overlay,
        .ck-form-sections {
          --ck-list-row-action-width: 220px;
        }
        .form-card .ck-form-grid,
        .webform-overlay .ck-form-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .form-card .ck-form-grid > .field,
        .webform-overlay .ck-form-grid > .field {
          margin-bottom: 0;
        }
        .form-card .ck-full-width,
        .webform-overlay .ck-full-width {
          width: 100%;
        }
        .ck-guided-context-header {
          font-size: var(--ck-font-label);
          color: var(--text);
          font-weight: 700;
          white-space: nowrap;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .ck-guided-context-header::-webkit-scrollbar {
          display: none;
        }

        /* Top action bar (below header): match the BottomActionBar styling exactly (capsule + pill items). */
        .ck-top-action-bar {
          width: 100%;
          box-sizing: border-box;
          position: relative;
          /* Full-bleed like the sticky header */
          padding: 12px 18px 12px;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          /* Keep under the header (z=30) but above scrolling content. */
          z-index: 29;
        }
        /* Ensure the top action bar uses the full available width (no shrink-to-content). */
        .ck-top-action-bar .ck-bottom-bar-inner {
          width: 100%;
          max-width: none;
        }
        .ck-top-action-bar .ck-bottom-capsule {
          width: 100%;
        }
        .ck-top-action-bar[data-sticky="1"] {
          position: sticky;
          top: var(--ck-header-height, 0px);
        }
        .ck-top-action-bar .ck-actionbar-notice-inner {
          /* Stack a full-width notice region under the capsule row. */
          display: block;
          margin-top: 10px;
        }
        .ck-top-action-bar[data-notice-only="1"] .ck-actionbar-notice-inner {
          margin-top: 0;
        }

	        /* Action bars: make non-primary action labels look like clickable links. */
	        .ck-top-action-bar .ck-bottom-item:not(.ck-bottom-item--primary) .ck-bottom-label,
	        .ck-bottom-bar .ck-bottom-item:not(.ck-bottom-item--primary) .ck-bottom-label {
	          color: var(--accent);
	          text-decoration: underline;
	          text-underline-offset: 2px;
	        }

        /* Portrait-only mode: block landscape with a friendly rotate prompt. */
        .ck-orientation-blocker {
          position: fixed;
          inset: 0;
          z-index: 13000;
          background: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
        }
        .ck-orientation-blocker__card {
          width: min(720px, 100%);
          background: var(--card);
          border-radius: 18px;
          border: 1px solid var(--border);
          box-shadow: none;
          padding: 18px;
          text-align: center;
          color: var(--text);
        }
        .ck-orientation-blocker__title {
          font-weight: 600;
          font-size: var(--ck-font-group-title);
          letter-spacing: 0;
        }
        .ck-orientation-blocker__body {
          margin-top: 10px;
          font-weight: 600;
          font-size: var(--ck-font-label);
          line-height: 1.35;
          color: var(--muted);
        }
        .ck-validation-notice {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ck-validation-banner {
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 600;
          color: var(--text);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          box-sizing: border-box;
        }
        .ck-validation-banner--error {
          border: 1px solid var(--danger);
          background: transparent;
        }
        .ck-validation-banner--warning {
          border: 1px solid var(--border);
          background: transparent;
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
        }
        .ck-validation-banner__titleRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .ck-validation-banner__title {
          font-weight: 600;
        }
        .ck-validation-banner__list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-weight: 600;
        }
        .ck-validation-banner__more {
          font-weight: 600;
          opacity: 0.85;
        }
        .ck-validation-banner__link,
        .ck-validation-banner__warning {
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          text-align: left;
          font: inherit;
          color: inherit;
          cursor: pointer;
        }
        .ck-validation-banner__hide {
          flex: 0 0 auto;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: transparent;
          padding: 6px 10px;
          font-weight: 600;
          font-size: calc(var(--ck-font-pill) * 0.95);
          line-height: 1;
          color: var(--text);
          cursor: pointer;
          box-shadow: none;
          white-space: nowrap;
        }

        .form-card input,
        .form-card select,
        .form-card textarea {
          font-size: var(--ck-font-control);
          line-height: 1.4;
        }
        /* Numeric fields: align values to the right for better scanability (especially in 2-up grids). */
        .form-card input[type="number"],
        .webform-overlay input[type="number"],
        .ck-form-sections input[type="number"] {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .form-card .line-item-table td,
        .form-card .line-item-table th {
          font-size: var(--ck-font-control);
        }
        .form-card .line-item-table input,
        .form-card .line-item-table select,
        .form-card .line-item-table textarea {
          font-size: var(--ck-font-control);
        }
        .form-card .ck-line-item-table,
        .webform-overlay .ck-line-item-table,
        .ck-form-sections .ck-line-item-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
        }
        .form-card .ck-line-item-table th,
        .form-card .ck-line-item-table td,
        .webform-overlay .ck-line-item-table th,
        .webform-overlay .ck-line-item-table td,
        .ck-form-sections .ck-line-item-table th,
        .ck-form-sections .ck-line-item-table td {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
          text-align: left;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        /* Line items (table mode): enforce row alignment (label left, controls right). */
        .form-card .ck-line-item-table th:first-child,
        .form-card .ck-line-item-table td:first-child,
        .webform-overlay .ck-line-item-table th:first-child,
        .webform-overlay .ck-line-item-table td:first-child,
        .ck-form-sections .ck-line-item-table th:first-child,
        .ck-form-sections .ck-line-item-table td:first-child {
          text-align: left;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions),
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions),
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) {
          text-align: right;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__value,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__value,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__value,
        .form-card
          .ck-line-item-table
          td:not(:first-child):not(.ck-line-item-table__actions)
          .ck-line-item-table__control:not(.ck-line-item-table__control--consent),
        .webform-overlay
          .ck-line-item-table
          td:not(:first-child):not(.ck-line-item-table__actions)
          .ck-line-item-table__control:not(.ck-line-item-table__control--consent),
        .ck-form-sections
          .ck-line-item-table
          td:not(:first-child):not(.ck-line-item-table__actions)
          .ck-line-item-table__control:not(.ck-line-item-table__control--consent) {
          align-items: flex-end;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__control--consent,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__control--consent,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-line-item-table__control--consent {
          align-items: center;
          justify-content: center;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row,
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-progress,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-progress,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-progress {
          justify-content: flex-end;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row.ck-upload-row--table,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row.ck-upload-row--table,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-row.ck-upload-row--table {
          width: auto;
          flex-wrap: nowrap;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn {
          justify-content: flex-end;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn.ck-upload-pill-btn--table,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn.ck-upload-pill-btn--table,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-pill-btn.ck-upload-pill-btn--table {
          flex: 0 0 auto;
          min-height: 44px;
          padding: 8px 12px;
          gap: 8px;
          justify-content: center;
        }
        .form-card .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-helper,
        .webform-overlay .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-helper,
        .ck-form-sections .ck-line-item-table td:not(:first-child):not(.ck-line-item-table__actions) .ck-upload-helper {
          text-align: right;
        }
        .form-card .ck-line-item-table th,
        .webform-overlay .ck-line-item-table th,
        .ck-form-sections .ck-line-item-table th {
          font-size: var(--ck-font-label);
          font-weight: 600;
          color: var(--text);
        }
        .form-card .ck-line-item-table thead th,
        .webform-overlay .ck-line-item-table thead th,
        .ck-form-sections .ck-line-item-table thead th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: var(--card);
          box-shadow: none;
        }
        .form-card .ck-line-item-table__actions,
        .webform-overlay .ck-line-item-table__actions,
        .ck-form-sections .ck-line-item-table__actions {
          width: 1%;
          min-width: 40px;
          white-space: nowrap;
          text-align: right;
        }
	        .ck-line-item-table__remove-button,
	        .form-card .ck-line-item-table__remove-button,
	        .webform-overlay .ck-line-item-table__remove-button {
	          border: 1px solid var(--accent) !important;
	          background: var(--accent) !important;
	          color: var(--accentText) !important;
	          border-radius: 10px;
	          width: 40px !important;
	          height: 40px !important;
	          min-width: 40px !important;
          min-height: 40px !important;
          padding: 0 !important;
          box-sizing: border-box;
          line-height: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .form-card .ck-line-item-table__remove-button:disabled,
        .webform-overlay .ck-line-item-table__remove-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .form-card .ck-line-item-table__control input,
        .form-card .ck-line-item-table__control select,
        .form-card .ck-line-item-table__control textarea,
        .webform-overlay .ck-line-item-table__control input,
        .webform-overlay .ck-line-item-table__control select,
        .webform-overlay .ck-line-item-table__control textarea,
        .ck-form-sections .ck-line-item-table__control input,
        .ck-form-sections .ck-line-item-table__control select,
        .ck-form-sections .ck-line-item-table__control textarea {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          font-size: var(--ck-font-control);
          box-sizing: border-box;
        }
        .form-card .ck-line-item-table__control--consent,
        .ck-form-sections .ck-line-item-table__control--consent,
        .webform-overlay .ck-line-item-table__control--consent {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .form-card .ck-line-item-table__control--consent > label.inline,
        .ck-form-sections .ck-line-item-table__control--consent > label.inline,
        .webform-overlay .ck-line-item-table__control--consent > label.inline {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          width: auto;
        }
        .form-card .ck-line-item-table__control .ck-line-item-table__consent-checkbox,
        .ck-form-sections .ck-line-item-table__control .ck-line-item-table__consent-checkbox,
        .webform-overlay .ck-line-item-table__control .ck-line-item-table__consent-checkbox {
          width: 32px;
          height: 32px;
          margin: 0;
          flex: 0 0 auto;
          accent-color: var(--accent);
          transform: scale(1.35);
          transform-origin: center;
        }
        .form-card .ck-line-item-table__control,
        .webform-overlay .ck-line-item-table__control,
        .ck-form-sections .ck-line-item-table__control,
        .form-card .ck-line-item-table__value,
        .webform-overlay .ck-line-item-table__value,
        .ck-form-sections .ck-line-item-table__value {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .form-card .ck-line-item-table__control[data-has-warning="true"],
        .form-card .ck-line-item-table__value[data-has-warning="true"],
        .webform-overlay .ck-line-item-table__control[data-has-warning="true"],
        .webform-overlay .ck-line-item-table__value[data-has-warning="true"],
        .ck-form-sections .ck-line-item-table__control[data-has-warning="true"],
        .ck-form-sections .ck-line-item-table__value[data-has-warning="true"] {
          box-shadow: none;
          border-radius: 0;
          background: transparent;
        }
        .form-card .ck-line-item-table__control[data-has-error="true"],
        .form-card .ck-line-item-table__value[data-has-error="true"],
        .webform-overlay .ck-line-item-table__control[data-has-error="true"],
        .webform-overlay .ck-line-item-table__value[data-has-error="true"],
        .ck-form-sections .ck-line-item-table__control[data-has-error="true"],
        .ck-form-sections .ck-line-item-table__value[data-has-error="true"] {
          box-shadow: none;
          border-radius: 6px;
          background: transparent;
        }
        .form-card .ck-line-item-table__value {
          font-size: var(--ck-font-control);
        }
        .form-card .ck-line-item-table__value-text,
        .webform-overlay .ck-line-item-table__value-text {
          display: inline;
        }
        .form-card .ck-line-item-table__cell-error,
        .webform-overlay .ck-line-item-table__cell-error {
          margin-top: 2px;
          font-size: calc(var(--ck-font-label) * 0.85);
          font-weight: 600;
          line-height: 1.2;
        }
        .form-card .ck-line-item-table__empty {
          text-align: center;
          padding: 16px;
          color: var(--muted);
        }
        .form-card .ck-line-item-table__message-row td {
          border-bottom: 1px solid var(--border);
          padding: 4px 10px 12px;
        }
        .form-card .ck-line-item-table__row-errors {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-card .ck-line-item-table .error,
        .webform-overlay .ck-line-item-table .error {
          font-weight: 600;
        }
        .form-card .ck-line-item-table .warning,
        .webform-overlay .ck-line-item-table .warning {
          color: var(--text);
          font-weight: 400;
        }
        .form-card .ck-line-item-table__legend,
        .webform-overlay .ck-line-item-table__legend {
          margin-top: 10px;
          padding: 8px 0;
          border-radius: 0;
          border: 0;
          border-top: 1px solid var(--border);
          background: transparent;
          color: var(--text);
          position: sticky;
          bottom: 0;
          z-index: 3;
          box-shadow: none;
          padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        }
        .form-card .ck-line-item-table__legend-title,
        .webform-overlay .ck-line-item-table__legend-title {
          font-weight: 600;
          margin-bottom: 6px;
        }
        .form-card .ck-line-item-table__legend-items,
        .webform-overlay .ck-line-item-table__legend-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-card .ck-line-item-table__legend-item,
        .webform-overlay .ck-line-item-table__legend-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-weight: 400;
          color: var(--text);
        }
        .form-card .ck-line-item-table__legend-footnote,
        .webform-overlay .ck-line-item-table__legend-footnote {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: calc(var(--ck-font-label) * 0.85);
          font-weight: 600;
          line-height: 1;
          flex: 0 0 auto;
          margin-top: 1px;
        }
        .form-card .ck-line-item-table__legend-icon,
        .webform-overlay .ck-line-item-table__legend-icon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--card);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: calc(var(--ck-font-label) * 0.85);
          flex: 0 0 auto;
        }
        .form-card .ck-line-item-table__warning-footnote,
        .webform-overlay .ck-line-item-table__warning-footnote {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 6px;
          font-size: calc(var(--ck-font-label) * 0.85);
          font-weight: 600;
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0 4px;
          line-height: 1.2;
          background: transparent;
          pointer-events: none;
          vertical-align: middle;
        }
        .form-card .ck-line-item-table__legend-label,
        .webform-overlay .ck-line-item-table__legend-label {
          font-weight: 600;
        }
        .form-card .ck-line-item-table__legend-text,
        .webform-overlay .ck-line-item-table__legend-text {
          font-weight: 400;
        }
        .form-card .ck-line-item-table__scroll,
        .webform-overlay .ck-line-item-table__scroll {
          overflow: visible;
        }
        .form-card .ck-line-item-table__totals-row td,
        .webform-overlay .ck-line-item-table__totals-row td {
          border-top: 1px solid var(--border);
          border-bottom: 0;
          padding-top: 10px;
          padding-bottom: 10px;
          vertical-align: top;
          font-weight: bold;
        }
        .form-card .ck-line-item-group--table .line-item-totals,
        .webform-overlay .ck-line-item-group--table .line-item-totals {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
          font-size: var(--ck-font-label);
          font-weight: 500;
        }
        .form-card .ck-line-item-table__total,
        .webform-overlay .ck-line-item-table__total {
          font-weight: 500;
          font-size: var(--ck-font-label);
          white-space: nowrap;
        }
        .form-card .ck-line-item-group--table[data-field-path="MP_MEALS_REQUEST"] .ck-line-item-table__totals-row .ck-line-item-table__total,
        .webform-overlay .ck-line-item-group--table[data-field-path="MP_MEALS_REQUEST"] .ck-line-item-table__totals-row .ck-line-item-table__total,
        .ck-form-sections .ck-line-item-group--table[data-field-path="MP_MEALS_REQUEST"] .ck-line-item-table__totals-row .ck-line-item-table__total {
          font-weight: 600;
        }
        .form-card .ck-line-item-table__row--even {
          background: transparent;
        }
        .form-card .ck-line-item-table__row--odd {
          background: transparent;
        }
        .form-card .field.inline-field,
        .webform-overlay .field.inline-field {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 8px 12px;
          align-items: center;
        }
        /* DATE controls can have a large intrinsic min width on iOS (due to localized display),
           which causes them to wrap onto their own line even with 50/50 flex-basis.
           Use a small 2-column grid to keep label + date control on the same row. */
        .form-card .field.inline-field.ck-date-inline:not(.ck-label-stacked),
        .webform-overlay .field.inline-field.ck-date-inline:not(.ck-label-stacked) {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px 12px;
          align-items: center;
        }
        .form-card .field.inline-field.ck-date-inline:not(.ck-label-stacked) > .error,
        .webform-overlay .field.inline-field.ck-date-inline:not(.ck-label-stacked) > .error {
          grid-column: 1 / -1;
        }
        .form-card .field.inline-field > label,
        .webform-overlay .field.inline-field > label {
          /* Single-row fields: give labels ~half the width by default (better balance vs controls). */
          /* Account for the horizontal gap (12px) so 50/50 doesn't wrap on narrow screens. */
          flex: 1 1 calc(50% - 6px);
          /* Allow the label to shrink on narrow screens (important for iOS DATE inputs). */
          min-width: 0;
          max-width: calc(50% - 6px);
          margin: 0;
          font-weight: 600;
          font-size: var(--ck-font-label);
          color: var(--text);
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .form-card .required-star,
        .webform-overlay .required-star {
          color: var(--danger);
          font-weight: 600;
        }
        .form-card .field.inline-field > input,
        .form-card .field.inline-field > select,
        .form-card .field.inline-field > textarea,
        .form-card .field.inline-field > .ck-paragraph-shell,
        .form-card .field.inline-field > .inline-options,
        .form-card .field.inline-field > .ck-choice-control,
        .form-card .field.inline-field > .ck-number-stepper,
        .form-card .field.inline-field > .ck-date-input-wrap,
        .webform-overlay .field.inline-field > input,
        .webform-overlay .field.inline-field > select,
        .webform-overlay .field.inline-field > textarea,
        .webform-overlay .field.inline-field > .ck-paragraph-shell,
        .webform-overlay .field.inline-field > .inline-options,
        .webform-overlay .field.inline-field > .ck-choice-control,
        .webform-overlay .field.inline-field > .ck-number-stepper,
        .webform-overlay .field.inline-field > .ck-date-input-wrap {
          /* Account for the horizontal gap (12px) so 50/50 doesn't wrap on narrow screens. */
          flex: 1 1 calc(50% - 6px);
          min-width: 0;
          width: 100%;
        }

        .form-card .ck-paragraph-shell,
        .webform-overlay .ck-paragraph-shell {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 16px;
          min-height: var(--control-height);
          border: 1px solid var(--border);
          border-radius: var(--radius-control);
          background: var(--card);
          box-sizing: border-box;
        }
        .form-card .ck-paragraph-shell > textarea,
        .webform-overlay .ck-paragraph-shell > textarea {
          border: none;
          padding: 0;
          margin: 0;
          background: transparent;
          font: inherit;
          min-height: 110px;
          resize: vertical;
          width: 100%;
          box-sizing: border-box;
        }
        @supports (-webkit-touch-callout: none) {
          /* Prevent iOS Safari from zooming on paragraph focus (font < 16px). */
          .ck-paragraph-input {
            font-size: var(--ck-font-control);
          }
        }
        .form-card .ck-paragraph-shell > textarea:focus,
        .webform-overlay .ck-paragraph-shell > textarea:focus {
          outline: none;
        }
        .form-card .ck-paragraph-shell .ck-paragraph-disclaimer,
        .webform-overlay .ck-paragraph-shell .ck-paragraph-disclaimer {
          white-space: pre-wrap;
          font-size: calc(var(--ck-font-label) * 0.85);
          color: var(--muted);
          border-top: 1px dashed var(--border);
          padding-top: 8px;
        }

        /* Number input wrapper (legacy name: ck-number-stepper). */
        .ck-number-stepper {
          width: 100%;
          min-width: 0;
        }
        .ck-number-stepper input[type="number"] {
          width: 100%;
          min-width: 0;
        }

        /* Control row: keep the main control + its action buttons (subgroup/info) on the same line when possible. */
        .ck-control-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
          flex-wrap: nowrap;
          width: 100%;
          min-width: 0;
        }
        .ck-control-row > :first-child {
          flex: 1 1 260px;
          min-width: 0;
        }
        /* Progressive row title (auto addMode anchor): render as plain label text, not a disabled input. */
        .ck-row-title {
          display: block;
          font-size: var(--ck-font-group-title);
          font-weight: 600;
          color: var(--text);
          line-height: 1.1;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .ck-row-disclaimer {
          margin-top: 4px;
          font-size: calc(var(--ck-font-label) * 0.85);
          font-weight: 600;
          font-style: normal;
          color: var(--muted);
          line-height: 1.2;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .ck-row-disclaimer--full {
          flex: 0 0 100%;
          width: 100%;
          margin-top: 0;
        }

        /* Field-level action buttons (subgroup + info) */
        .ck-field-actions {
          display: inline-flex;
          align-items: stretch;
          gap: 10px;
          flex-wrap: nowrap;
          flex: 0 0 auto;
          min-width: 0;
        }
        .ck-field-actions > button,
        .ck-field-actions > .info-button {
          min-height: var(--control-height);
        }

        /* Subgroup "Tap to open" pills: full-width stack under a field */
        .ck-subgroup-open-stack {
          flex-basis: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ck-progress-pill.ck-subgroup-open-pill {
          width: 100%;
          justify-content: flex-start;
        }
        .ck-progress-pill.ck-subgroup-open-pill .ck-progress-label {
          margin-left: auto;
        }

        /* "Open overlay" pills (line item group openInOverlay): behave like a full-width control in the right column */
        .form-card .field.inline-field > .ck-open-overlay-pill,
        .webform-overlay .field.inline-field > .ck-open-overlay-pill {
          flex: 1 1 calc(50% - 6px);
          min-width: 0;
          width: 100%;
          justify-content: flex-start;
        }
        .ck-open-overlay-pill .ck-progress-label {
          margin-left: auto;
        }

        /* Stacked-label fields: allow placing action pills to the right of the label */
        .ck-label-row {
          flex: 1 1 100%;
          min-width: 0;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ck-label-row > label {
          flex: 1 1 auto;
          min-width: 0;
          max-width: none;
          margin: 0;
        }
        .ck-label-actions {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: stretch;
          gap: 10px;
          min-width: 0;
        }
        .ck-progress-pill.ck-subgroup-open-pill-inline {
          /* Keep sizing consistent with standard pills; only adjust alignment for inline placement. */
          justify-content: flex-start;
        }
        .ck-progress-pill.ck-subgroup-open-pill-inline .ck-progress-label {
          margin-left: auto;
        }
        .form-card .field.inline-field > .error,
        .webform-overlay .field.inline-field > .error {
          flex-basis: 100%;
          margin: 0;
        }
        .form-card .line-actions,
        .webform-overlay .line-actions {
          margin-top: 12px;
        }

        /* File upload: keep the dropzone + "Files (n)" button on the same row when space allows. */
        .form-card .field.inline-field > .ck-upload-row,
        .webform-overlay .field.inline-field > .ck-upload-row {
          flex: 2 1 260px;
          min-width: 0;
          width: 100%;
        }
        .ck-upload-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          width: 100%;
          min-width: 0;
        }
        .ck-upload-row > .ck-upload-dropzone {
          flex: 1 1 260px;
          min-width: 0;
        }
        .ck-upload-row > .ck-upload-files-btn,
        .ck-upload-row > .ck-upload-add-btn {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .ck-upload-row > .ck-upload-camera-btn {
          flex: 0 0 auto;
        }
        .ck-upload-camera-btn {
          padding: 0 !important;
          width: var(--control-height);
          min-width: var(--control-height);
          justify-content: center;
        }
        /* Upload "status + menu" pill (tap to manage) */
        .ck-upload-pill-btn {
          appearance: none;
          background: none;
          border: none;
          /* reuse ck-progress-pill visuals, but allow it to flex */
          flex: 1 1 180px;
          min-width: 0;
          justify-content: center;
        }
        .form-card .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left,
        .webform-overlay .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left,
        .ck-form-sections .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left {
          width: fit-content;
          min-width: min(var(--ck-list-row-action-width), 100%);
          max-width: 100%;
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accentText);
        }
        .form-card .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-label,
        .form-card .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-caret,
        .webform-overlay .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-label,
        .webform-overlay .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-caret,
        .ck-form-sections .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-label,
        .ck-form-sections .ck-progress-pill.ck-upload-pill-btn.ck-button-wrap-left .ck-progress-caret {
          color: inherit;
          opacity: 1;
        }
        .ck-progress-pill.ck-progress-info {
          background: transparent;
          border-color: var(--border);
          color: var(--text);
        }
        /* Progressive upload UI: camera slots + checkmarks (opt-in via uploadConfig.ui.variant = "progressive") */
        .ck-upload-progress {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: nowrap;
          width: 100%;
          min-width: 0;
        }
        .ck-upload-progress-item {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 1 1 0;
          min-width: 0;
          /* Fill available width, but don't exceed the control height (keeps the row compact). */
          max-width: calc(var(--control-height) - 12px);
          aspect-ratio: 1 / 1;
          border-radius: 32%;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        .ck-upload-progress-item--done {
          background: transparent;
          border-color: var(--border);
          color: var(--text);
        }
        .ck-upload-progress-check {
          position: absolute;
          bottom: -18%;
          right: -18%;
          width: 60%;
          height: 60%;
          border-radius: 999px;
          background: transparent;
          border: 2px solid var(--border);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text);
          box-shadow: none;
        }
        /* File upload helper text (e.g., remaining files): always render on its own line below the controls. */
        .form-card .field.inline-field > .ck-upload-helper,
        .webform-overlay .field.inline-field > .ck-upload-helper,
        .ck-upload-row > .ck-upload-helper {
          flex: 0 0 100%;
          width: 100%;
          margin: 0;
        }
        /* Generic field helper text (configurable per field). */
        .ck-field-helper {
          margin: 0;
          font-size: var(--ck-font-helper);
          font-weight: 400;
          line-height: 1.35;
          color: var(--text);
          opacity: var(--ck-helper-opacity);
        }
        .form-card .field.inline-field > .ck-field-helper,
        .webform-overlay .field.inline-field > .ck-field-helper {
          flex: 0 0 100%;
          width: 100%;
          margin: 0;
        }
        /* Upload helper text (e.g., remaining files): match generic helper typography. */
        .ck-upload-helper {
          margin: 0;
          font-size: var(--ck-font-helper);
          font-weight: 400;
          line-height: 1.35;
          color: var(--text);
          opacity: var(--ck-helper-opacity);
        }
        .ck-line-item-table__header-wrap {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ck-line-item-table__header-helper {
          font-size: var(--ck-font-helper);
          font-weight: 400;
          line-height: 1.35;
          color: var(--text);
          opacity: var(--ck-helper-opacity);
          white-space: normal;
        }
        /* Per-field override: force *label* above the rest even for 1-up/full-width rows.
           Important: we only stack the label; the control and any action buttons (subgroup/info) should stay inline. */
        .form-card .field.inline-field.ck-label-stacked,
        .webform-overlay .field.inline-field.ck-label-stacked {
          gap: 6px 12px;
          align-items: center;
        }
        .form-card .field.inline-field.ck-label-stacked > label,
        .webform-overlay .field.inline-field.ck-label-stacked > label {
          min-width: 0;
          max-width: none;
          margin: 0;
          min-height: 0;
          flex: 1 1 100%;
        }
        .ck-readonly-field .ck-readonly-value {
          width: 100%;
          min-height: var(--control-height);
          padding: 10px 12px;
          border: 1px dashed var(--border);
          border-radius: 12px;
          background: transparent;
          font-weight: 500;
          color: var(--text);
        }
        .ck-readonly-file-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ck-readonly-file {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--text);
        }
        /* In 2-up grids, keep the "aligned label rows" behavior even if a field forces stacked layout. */
        .ck-line-grid > .field.inline-field.ck-label-stacked > label,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field.ck-label-stacked > label {
          min-height: 0;
        }
        .ck-pair-grid > .field.inline-field.ck-label-stacked > label {
          /* Paired rows: keep control rows aligned by matching the tallest label in the pair (computed per row). */
          min-height: var(--ck-pair-label-min-height, 0px);
        }
        .ck-pair-grid > .field.inline-field > .ck-label-row {
          min-height: var(--ck-pair-label-min-height, 0px);
        }
        .form-card .field[data-has-warning="true"]:not([data-has-error="true"]),
        .webform-overlay .field[data-has-warning="true"]:not([data-has-error="true"]),
        .ck-form-sections .field[data-has-warning="true"]:not([data-has-error="true"]) {
          outline: 2px solid var(--text);
          outline-offset: 2px;
          border-radius: 12px;
          padding: 8px;
          background: transparent;
        }
        .form-card .field[data-has-error="true"],
        .webform-overlay .field[data-has-error="true"],
        .ck-form-sections .field[data-has-error="true"] {
          outline: 2px solid var(--danger);
          outline-offset: 2px;
          border-radius: 12px;
          padding: 8px;
          background: transparent;
        }
        .form-card .info-button,
        .webform-overlay .info-button {
          border: 1px solid var(--ck-secondary-border);
          background: var(--ck-secondary-bg);
          color: var(--ck-secondary-text);
          border-radius: 12px;
          padding: 0 18px;
          min-height: var(--control-height);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 500;
          font-size: var(--ck-font-control);
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
        }

        .ck-segmented {
          display: inline-flex;
          width: 100%;
          max-width: none;
          align-items: stretch;
          gap: 2px;
          padding: 2px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: transparent;
          min-height: var(--control-height);
          box-sizing: border-box;
        }
        .ck-segmented button {
          flex: 1 1 0;
          min-height: calc(var(--control-height) - 4px);
          border: none;
          background: transparent;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: var(--ck-font-control);
          font-weight: 600;
          color: var(--text);
          line-height: 1.1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          /* Allow long labels (e.g., Customer) to wrap instead of truncating */
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .ck-segmented button.active {
          /* Make the selected segment visually obvious. */
          background: var(--accent);
          color: var(--accentText);
          box-shadow: none;
        }
        .ck-segmented button:not(.active) {
          color: var(--muted);
        }
        .ck-segmented button:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 2px;
        }

        .ck-radio-list {
          width: 100%;
          max-width: 520px;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--card);
        }
        .ck-radio-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          font-weight: 500;
          color: var(--text);
        }
        .ck-radio-row:last-child { border-bottom: none; }
        .ck-radio-row input[type="radio"] {
          width: 20px;
          height: 20px;
          accent-color: var(--accent);
          flex: 0 0 auto;
        }

        .ck-line-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 16px;
        }
        .ck-pair-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 16px;
        }
        /* 3-up variant used when 3+ fields share the same pair key. */
        .ck-pair-grid.ck-pair-grid--3 {
          /* Force 3 columns so "MEAL_TYPE + QTY + FINAL_QTY" can sit on one row even on phones.
             Labels can wrap; controls will shrink via minmax(0, 1fr). */
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        /* Make 2-up grids look "professional": align label rows + control rows across columns.
           We do this by forcing each cell to be a small 2-row grid (label row + control row). */
        .ck-line-grid > .field.inline-field,
        .ck-pair-grid > .field.inline-field,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
          align-content: start;
          align-items: start;
          min-width: 0;
        }
        .ck-line-grid > .field.inline-field > label,
        .ck-pair-grid > .field.inline-field > label,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > label {
          /* Labels should shrink to their actual height (avoid reserving extra lines) */
          line-height: 1.2;
          /* Keep at least one label line of height so control rows stay aligned even when a label is hidden/empty. */
          min-height: 1.2em;
          max-width: none;
          margin: 0;
        }
        .ck-pair-grid > .field.inline-field > label {
          /* Paired rows: keep control rows aligned by matching the tallest label in the pair (computed per row). */
          min-height: var(--ck-pair-label-min-height, 0px);
        }
        .ck-line-grid > .field.inline-field > input,
        .ck-line-grid > .field.inline-field > select,
        .ck-line-grid > .field.inline-field > textarea,
        .ck-line-grid > .field.inline-field > .ck-paragraph-shell,
        .ck-line-grid > .field.inline-field > .inline-options,
        .ck-line-grid > .field.inline-field > .ck-choice-control,
        .ck-line-grid > .field.inline-field > .ck-number-stepper,
        .ck-pair-grid > .field.inline-field > input,
        .ck-pair-grid > .field.inline-field > select,
        .ck-pair-grid > .field.inline-field > textarea,
        .ck-pair-grid > .field.inline-field > .ck-paragraph-shell,
        .ck-pair-grid > .field.inline-field > .inline-options,
        .ck-pair-grid > .field.inline-field > .ck-choice-control,
        .ck-pair-grid > .field.inline-field > .ck-number-stepper,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > input,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > select,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > textarea,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .ck-paragraph-shell,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .inline-options,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .ck-choice-control,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .ck-number-stepper {
          width: 100%;
          min-width: 0;
        }
        /* Numbers shouldn't look like giant empty boxes; keep them content-sized in grids. */
        .ck-line-grid > .field.inline-field > input[type="number"],
        .ck-pair-grid > .field.inline-field > input[type="number"],
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > input[type="number"],
        .ck-line-grid > .field.inline-field > .ck-number-stepper,
        .ck-pair-grid > .field.inline-field > .ck-number-stepper,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .ck-number-stepper {
          width: min(100%, 12ch);
          justify-self: start;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 360px) {
          .ck-line-grid {
            grid-template-columns: 1fr;
          }
          .ck-pair-grid {
            grid-template-columns: 1fr;
          }
          .ck-pair-grid.ck-pair-grid--3 {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .ck-switch-control {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .ck-switch {
          position: relative;
          width: 78px;
          height: 48px;
          display: inline-block;
        }
        .ck-switch input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 78px;
          height: 48px;
          border-radius: 999px;
          background: transparent;
          border: 1px solid var(--border);
          outline: none;
          cursor: pointer;
          margin: 0;
        }
        .ck-switch input[type="checkbox"]:checked {
          background: var(--success);
          border-color: var(--success);
        }
        .ck-switch-track {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 44px;
          height: 44px;
          border-radius: 999px;
          background: var(--card);
          box-shadow: none;
          transform: translateX(0);
          transition: transform 160ms ease;
          pointer-events: none;
        }
        .ck-switch input[type="checkbox"]:checked + .ck-switch-track {
          transform: translateX(30px);
        }

        .ck-consent-control {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-height: var(--control-height);
        }
        .ck-consent input[type="checkbox"] {
          width: 40px;
          height: 40px;
          accent-color: var(--accent);
          margin: 0;
        }
        /* Consent checkbox: render checkbox on the left of the label (full-width row). */
        .form-card .field.inline-field.ck-consent-field > label,
        .ck-group-stack .field.inline-field.ck-consent-field > label,
        .webform-overlay .field.inline-field.ck-consent-field > label {
          flex: 1 1 100%;
          max-width: none;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .form-card .field.inline-field.ck-consent-field > label > input[type="checkbox"],
        .ck-group-stack .field.inline-field.ck-consent-field > label > input[type="checkbox"],
        .webform-overlay .field.inline-field.ck-consent-field > label > input[type="checkbox"] {
          width: 40px;
          height: 40px;
          accent-color: var(--accent);
          margin: 0;
          flex: 0 0 auto;
          /* visually align the checkbox with the first line of text */
          margin-top: 2px;
        }
        .form-card .field.inline-field.ck-consent-field > label > .ck-consent-text,
        .ck-group-stack .field.inline-field.ck-consent-field > label > .ck-consent-text,
        .webform-overlay .field.inline-field.ck-consent-field > label > .ck-consent-text {
          flex: 1 1 auto;
          min-width: 0;
        }

        /* Native selects can render shorter on iOS; force them to match the global control height. */
        .form-card select,
        .webform-overlay select {
          min-height: var(--control-height);
          height: var(--control-height);
        }

        /* Searchable select (type-to-filter) for large option lists. */
        .ck-searchable-select {
          position: relative;
          width: 100%;
          min-width: 0;
        }
        /* Line-item selector overlay: inline multi-select search. */
        .ck-line-item-multiadd,
        .form-card .ck-line-item-multiadd,
        .webform-overlay .ck-line-item-multiadd {
          position: relative;
          width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .ck-line-item-multiadd__input,
        .form-card .ck-line-item-multiadd__input,
        .webform-overlay .ck-line-item-multiadd__input {
          position: relative;
          width: 100%;
          min-width: 0;
        }
        .ck-line-item-multiadd__input > input,
        .form-card .ck-line-item-multiadd__input > input,
        .webform-overlay .ck-line-item-multiadd__input > input {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding-right: 52px;
        }
        .ck-line-item-multiadd__input > input::-webkit-search-cancel-button,
        .form-card .ck-line-item-multiadd__input > input::-webkit-search-cancel-button,
        .webform-overlay .ck-line-item-multiadd__input > input::-webkit-search-cancel-button {
          -webkit-appearance: none;
          appearance: none;
          display: none;
        }
        .ck-line-item-multiadd__clear,
        .form-card .ck-line-item-multiadd__clear,
        .webform-overlay .ck-line-item-multiadd__clear {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: var(--text);
          font-weight: 600;
          font-size: var(--ck-font-control);
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: none;
          padding: 0;
        }
        .ck-line-item-multiadd__clear:focus-visible,
        .form-card .ck-line-item-multiadd__clear:focus-visible,
        .webform-overlay .ck-line-item-multiadd__clear:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 3px;
        }
        .ck-line-item-multiadd__menu,
        .form-card .ck-line-item-multiadd__menu,
        .webform-overlay .ck-line-item-multiadd__menu {
          position: static;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: none;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: min(70vh, 520px);
          min-height: 0;
          overflow: hidden;
          touch-action: pan-y;
        }
        .ck-line-item-multiadd__menu--modal,
        .form-card .ck-line-item-multiadd__menu--modal,
        .webform-overlay .ck-line-item-multiadd__menu--modal {
          position: fixed;
          top: var(--ck-line-item-multiadd-menu-top, 0px);
          left: var(--ck-line-item-multiadd-menu-left, 0px);
          right: var(--ck-line-item-multiadd-menu-right, 0px);
          bottom: 0;
          z-index: 11000;
          max-height: none;
          margin-top: 0;
        }
        .webform-overlay .ck-line-item-multiadd {
          height: 100%;
        }
        .webform-overlay .ck-line-item-multiadd__menu:not(.ck-line-item-multiadd__menu--modal) {
          margin-top: 6px;
          flex: 1;
          min-height: 0;
          max-height: min(70vh, 520px);
          overflow: hidden;
          touch-action: pan-y;
        }
        .form-card .ck-line-item-multiadd__menu:not(.ck-line-item-multiadd__menu--modal) {
          margin-top: 6px;
          max-height: min(60vh, 520px);
        }
        .ck-line-item-multiadd__options,
        .form-card .ck-line-item-multiadd__options,
        .webform-overlay .ck-line-item-multiadd__options {
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          min-height: 0;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .webform-overlay .ck-line-item-multiadd__options {
          max-height: none;
        }
        .ck-line-item-multiadd__option,
        .form-card .ck-line-item-multiadd__option,
        .webform-overlay .ck-line-item-multiadd__option {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--card);
          font-size: var(--ck-font-control);
          font-weight: 600;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ck-line-item-multiadd__option input,
        .form-card .ck-line-item-multiadd__option input,
        .webform-overlay .ck-line-item-multiadd__option input {
          width: 24px;
          height: 24px;
          accent-color: var(--accent);
          flex: 0 0 auto;
        }
        .ck-line-item-multiadd__option.is-selected,
        .form-card .ck-line-item-multiadd__option.is-selected,
        .webform-overlay .ck-line-item-multiadd__option.is-selected {
          background: transparent;
          border-color: var(--border);
        }
        .ck-line-item-multiadd__empty,
        .form-card .ck-line-item-multiadd__empty,
        .webform-overlay .ck-line-item-multiadd__empty {
          padding: 8px 10px;
          color: var(--muted);
          font-weight: 600;
        }
        .ck-line-item-multiadd__footer,
        .form-card .ck-line-item-multiadd__footer,
        .webform-overlay .ck-line-item-multiadd__footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 6px;
          padding-bottom: calc(6px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--border);
          background: var(--card);
          position: sticky;
          bottom: 0;
        }
        .ck-searchable-select > input {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          /* Leave room for the clear "×" button. */
          padding-right: 52px;
        }
        /* Hide native iOS/WebKit search clear so we can show our own clear button. */
        .ck-searchable-select > input::-webkit-search-cancel-button {
          -webkit-appearance: none;
          appearance: none;
          display: none;
        }
        .ck-searchable-select__clear-icon {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: var(--text);
          font-weight: 600;
          font-size: var(--ck-font-control);
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: none;
          padding: 0;
        }
        .ck-searchable-select__clear-icon:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 3px;
        }
        .ck-searchable-select__menu {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          z-index: 200;
          max-height: 320px;
          overflow: auto;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: none;
          padding: 6px;
        }
        .ck-searchable-select__option {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: 0;
          background: transparent;
          border-radius: 12px;
          font-size: var(--ck-font-control);
          font-weight: 600;
          color: var(--text);
          -webkit-text-fill-color: var(--text);
          cursor: pointer;
        }
        .ck-searchable-select__option:hover,
        .ck-searchable-select__option.is-active {
          background: transparent;
          color: var(--text);
          -webkit-text-fill-color: var(--text);
        }
        .ck-searchable-select__option:active {
          background: transparent;
          color: var(--text);
          -webkit-text-fill-color: var(--text);
        }
        .ck-searchable-multiselect__option {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: 0;
          background: transparent;
          border-radius: 12px;
          font-size: var(--ck-font-control);
          font-weight: 500;
          color: var(--text);
          -webkit-text-fill-color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
        }
        .ck-searchable-multiselect__option:hover,
        .ck-searchable-multiselect__option.is-selected {
          background: transparent;
          color: var(--text);
          -webkit-text-fill-color: var(--text);
        }
        .ck-searchable-multiselect__option input {
          width: 18px;
          height: 18px;
          margin: 0;
          flex: 0 0 auto;
        }
        .ck-searchable-multiselect__option span {
          flex: 1 1 auto;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .ck-searchable-multiselect__option:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 2px;
        }
        .ck-searchable-select__empty {
          padding: 10px 12px;
          color: var(--muted);
          font-weight: 500;
        }

        /* Date inputs can be surprisingly wide on iOS; ensure they always shrink within 2-up grids. */
        .form-card input[type="date"],
        .webform-overlay input[type="date"] {
          min-width: 0;
          min-inline-size: 0;
          max-width: 100%;
          max-inline-size: 100%;
          width: 100%;
          inline-size: 100%;
          box-sizing: border-box;
          text-align: left;
        }
        .form-card input[type="date"]::-webkit-date-and-time-value,
        .webform-overlay input[type="date"]::-webkit-date-and-time-value {
          min-width: 0;
          max-width: 100%;
          text-align: left;
        }
        .form-card input[type="date"]::-webkit-calendar-picker-indicator,
        .webform-overlay input[type="date"]::-webkit-calendar-picker-indicator {
          margin: 0;
        }

        /* DATE overlay: keep native picker, but show formatted text on top when not focused. */
        .ck-date-input-wrap {
          position: relative;
          width: 100%;
          min-width: 0;
        }
        .ck-date-input-wrap > input.ck-date-input {
          width: 100%;
          min-width: 0;
        }
        .ck-date-input.ck-date-input--overlay {
          color: transparent;
          -webkit-text-fill-color: transparent;
        }
        .ck-date-input.ck-date-input--overlay::-webkit-date-and-time-value,
        .ck-date-input.ck-date-input--overlay::-webkit-datetime-edit {
          color: transparent;
          -webkit-text-fill-color: transparent;
        }
        .ck-date-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          /* Match base control padding (see WebFormTemplate). Leave room for the calendar icon. */
          padding: 18px 56px 18px 22px;
          font-weight: 400;
          display: flex;
          align-items: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
          color: var(--text);
          font-size: var(--ck-font-control);
        }
        .ck-line-grid > .field,
        .ck-pair-grid > .field {
          min-width: 0;
        }

        .ck-form-sections {
          display: flex;
          flex-direction: column;
          gap: 24px; /* clearer separation between sections */
        }
        .ck-group-card {
          padding: 0;
          outline: none;
          overflow: hidden;
          /* stronger separation between grouped cards */
          box-shadow: none;
        }
        /* Summary view: softer, more report-like group headers (avoid "primary button" look). */
        .ck-summary-view .ck-group-card {
          box-shadow: none;
        }
        .ck-summary-view .ck-group-header {
          background: transparent;
        }
        .ck-summary-view .ck-progress-pill {
          background: transparent;
        }
        /* Summary view: use more horizontal space for the card grid (less side padding). */
        .ck-summary-view .ck-group-body {
          padding: 16px 14px 18px;
        }
        .ck-group-stack {
          display: flex;
          flex-direction: column;
          gap: 28px; /* separation between group cards */
        }
        .ck-group-stack--compact {
          gap: 24px;
        }

        /* Visual-only page sections (wrapper around multiple group cards). */
        .ck-page-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ck-page-section__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 0 4px; /* subtle alignment with card edges */
        }
        .ck-page-section__title-wrap {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ck-page-section__title {
          margin: 0;
          font-weight: 600;
          font-size: calc(var(--ck-font-group-title) * 1.15);
          line-height: 1.1;
          letter-spacing: 0;
          text-transform: none;
          color: var(--text);
        }
        .ck-page-section[data-info-display="hidden"] .ck-page-section__title {
          color: var(--accent);
        }
        .ck-page-section__notice {
          margin: 0;
          color: var(--muted);
          font-weight: 600;
          font-size: calc(var(--ck-font-label) * 0.9);
          line-height: 1.25;
        }
        .ck-page-section[data-info-display="belowTitle"] .ck-page-section__header {
          justify-content: flex-start;
        }
        .ck-page-section__info {
          flex: 0 0 auto;
          max-width: 52%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-weight: 400;
          font-size: calc(var(--ck-font-label) * 1);
          line-height: 1.25;
        }
        .ck-page-section__body {
          min-width: 0;
        }
        .ck-group-card[data-has-error="true"] {
          box-shadow: none;
        }
        .ck-group-header {
          width: 100%;
          appearance: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 22px 22px;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          border-bottom: 1px solid var(--border);
          cursor: default;
          border-radius: 0;
        }
        .ck-group-header--clickable {
          cursor: pointer;
          background: transparent;
          transition: background 160ms ease;
        }
        .ck-group-header--clickable:hover {
          background: transparent;
        }
        .ck-group-header--clickable:active {
          background: transparent;
        }
        .ck-group-header--clickable:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 2px;
          border-radius: var(--radius-card);
        }
        .ck-group-title {
          font-size: var(--ck-font-group-title);
          font-weight: 600;
          /* Distinguish group titles from field labels */
          color: var(--text);
          letter-spacing: 0;
        }
        .ck-progress-pill {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          font-weight: 600;
          font-size: var(--ck-font-pill);
          line-height: 1;
          white-space: nowrap;
          min-height: 56px;
          cursor: pointer;
          box-shadow: none;
        }
        .ck-progress-pill .ck-progress-label {
          font-size: var(--ck-font-pill);
          font-weight: 600;
          opacity: 0.92;
        }
        .ck-progress-pill:active {
          transform: translateY(1px);
        }
        .ck-progress-pill[aria-disabled="true"] {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ck-progress-pill[data-has-error="true"] {
          box-shadow: none;
        }
        .ck-progress-pill .ck-progress-caret {
          font-size: var(--ck-font-caret);
          font-weight: 600;
          opacity: 0.8;
        }
        .ck-progress-pill.ck-progress-good {
          background: transparent;
          border-color: var(--border);
          color: var(--text);
        }
        .ck-progress-pill.ck-progress-bad {
          background: transparent;
          border-color: var(--danger);
          color: var(--danger);
        }
	        .ck-progress-pill.ck-progress-neutral {
	          background: transparent;
	          border-color: var(--border);
	          color: var(--muted);
	        }
	        .ck-progress-pill.ck-progress-pill--primary {
	          background: var(--accent);
	          border-color: var(--accent);
	          color: var(--accentText);
	        }
	        .ck-progress-pill.ck-progress-pill--primary .ck-progress-label,
	        .ck-progress-pill.ck-progress-pill--primary .ck-progress-caret {
	          opacity: 1;
	        }
        /* Row toggle wrapper (line-item progressive rows): make the whole "Row X + pill" area tappable */
        .ck-row-toggle {
          appearance: none;
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          text-align: left;
        }
        /* Progressive line-item rows: make the top area look/feel like a group header. */
        .line-item-row .ck-row-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          column-gap: 10px;
          row-gap: 6px;
          /* Stretch to the row edges (row has padding: 12px inline). */
          margin: -12px -12px 12px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid var(--border);
          background: transparent;
          border-top-left-radius: 10px;
          border-top-right-radius: 10px;
        }
        .line-item-row .ck-row-header-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }
        .line-item-row.ck-line-item-row--leftover .ck-row-header-actions,
        .line-item-row .ck-row-header-actions--leftover {
          align-self: flex-end;
          margin-top: auto;
          align-items: flex-end;
        }
        .line-item-row.ck-row-flow--leftover .ck-row-flow-actions {
          align-self: flex-end;
          margin-top: auto;
          align-items: flex-end;
        }
        .line-item-row.ck-line-item-row--leftover .ck-line-item-row-separator,
        .line-item-row .ck-line-item-row-separator {
          margin-top: 12px;
          border-bottom: 1px solid var(--border);
        }
        .line-item-row .ck-subgroup-open-stack {
          align-items: flex-start;
        }
        .form-card .ck-list-row-action-btn,
        .webform-overlay .ck-list-row-action-btn,
        .ck-form-sections .ck-list-row-action-btn {
          white-space: nowrap;
        }
        .line-item-row .ck-list-row-action-btn {
          width: fit-content;
          min-width: min(var(--ck-list-row-action-width), 100%);
          max-width: 100%;
        }
        .line-item-row .ck-progress-pill.ck-list-row-action-btn {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accentText);
        }
        .line-item-row .ck-progress-pill.ck-list-row-action-btn .ck-progress-label,
        .line-item-row .ck-progress-pill.ck-list-row-action-btn .ck-progress-caret {
          opacity: 1;
          color: inherit;
        }
        .ck-row-toggle:active .ck-progress-pill {
          transform: translateY(1px);
        }
        .ck-row-toggle[aria-disabled="true"] {
          opacity: 0.8;
          cursor: not-allowed;
        }

        /* Locked/disabled progressive rows: make it obvious they are not active until completed */
        .line-item-row.ck-row-disabled {
          filter: saturate(0.9);
        }
        .ck-group-chevron {
          flex: 0 0 auto;
          font-size: var(--ck-font-caret);
          font-weight: 600;
          color: var(--muted);
          width: 64px;
          height: 64px;
          padding: 0;
          box-sizing: border-box;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .ck-group-body {
          padding: 18px 20px 22px;
        }

        @media (max-width: 520px) {
          .form-card,
          .webform-overlay,
          .ck-form-sections {
            --ck-list-row-action-width: 220px;
          }
          /* On very narrow viewports, allow control rows to wrap (select + buttons). */
          .ck-control-row {
            flex-wrap: wrap;
          }
          .ck-field-actions {
            flex-wrap: wrap;
          }

          /* Page sections: stack title + info text on mobile. */
          .ck-page-section__header {
            flex-direction: column;
            align-items: stretch;
          }
          .ck-page-section__info {
            max-width: none;
            width: 100%;
            font-weight: bold;
          }

          /* iOS date inputs are very wide; if a paired row contains a DATE field, stack it on mobile to prevent overflow. */
          .ck-pair-grid.ck-pair-has-date {
            grid-template-columns: 1fr;
          }
          .form-card .collapsed-fields-grid {
            grid-template-columns: 1fr !important;
          }
          /* In 1-up collapsedFields mode, keep the label+control inline (same row) like other single-width fields. */
          .form-card .collapsed-fields-grid > .field.inline-field > label {
            flex-basis: auto;
            max-width: 220px;
          }
          /* When the collapsedFields grid collapses to 1 column on mobile, revert the "2-up stacked" layout. */
          .form-card .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px 12px;
            align-items: center;
          }
          .form-card .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > label {
            min-height: 0;
          }
        }

      `;
