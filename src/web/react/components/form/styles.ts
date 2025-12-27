export const FORM_VIEW_STYLES = `
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

        /* Top action bar (below header): match the BottomActionBar styling exactly (capsule + pill items). */
        .ck-top-action-bar {
          width: 100%;
          box-sizing: border-box;
          position: relative;
          /* Full-bleed like the sticky header */
          margin: -6px -22px 6px;
          padding: 12px 18px 12px;
          background: rgba(242, 242, 247, 0.92);
          border-bottom: 1px solid rgba(60, 60, 67, 0.22);
          backdrop-filter: saturate(180%) blur(18px);
          -webkit-backdrop-filter: saturate(180%) blur(18px);
          /* Keep under the header (z=30) but above scrolling content. */
          z-index: 29;
        }
        .ck-top-action-bar[data-sticky="1"] {
          position: sticky;
          top: var(--ck-header-height, 0px);
        }

        .form-card input,
        .form-card select,
        .form-card textarea {
          font-size: var(--ck-font-control);
          line-height: 1.4;
        }
        /* Numeric fields: align values to the right for better scanability (especially in 2-up grids). */
        .form-card input[type="number"],
        .webform-overlay input[type="number"] {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .form-card .line-item-table td,
        .form-card .line-item-table th {
          font-size: 26px;
        }
        .form-card .line-item-table input,
        .form-card .line-item-table select,
        .form-card .line-item-table textarea {
          font-size: 26px;
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
          font-weight: 800;
          font-size: var(--ck-font-label);
          color: var(--text);
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .form-card .field.inline-field > input,
        .form-card .field.inline-field > select,
        .form-card .field.inline-field > textarea,
        .form-card .field.inline-field > .inline-options,
        .form-card .field.inline-field > .ck-choice-control,
        .form-card .field.inline-field > .ck-number-stepper,
        .webform-overlay .field.inline-field > input,
        .webform-overlay .field.inline-field > select,
        .webform-overlay .field.inline-field > textarea,
        .webform-overlay .field.inline-field > .inline-options,
        .webform-overlay .field.inline-field > .ck-choice-control,
        .webform-overlay .field.inline-field > .ck-number-stepper {
          /* Account for the horizontal gap (12px) so 50/50 doesn't wrap on narrow screens. */
          flex: 1 1 calc(50% - 6px);
          min-width: 0;
          width: 100%;
        }

        /* Number stepper: + / − buttons inside the same control width (no layout expansion). */
        .ck-number-stepper {
          position: relative;
          width: 100%;
          min-width: 0;
        }
        .ck-number-stepper input[type="number"] {
          width: 100%;
          padding-left: 68px;
          padding-right: 68px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .ck-number-stepper-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 54px;
          height: calc(var(--control-height) - 18px);
          min-height: 0;
          border-radius: 12px;
          border: 1px solid rgba(60, 60, 67, 0.18);
          background: rgba(120, 120, 128, 0.10);
          color: var(--text);
          font-size: 34px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
        }
        .ck-number-stepper-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ck-number-stepper-btn.minus {
          left: 8px;
        }
        .ck-number-stepper-btn.plus {
          right: 8px;
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
          font-size: var(--ck-font-group-title);
          font-weight: 900;
          color: var(--text);
          line-height: 1.1;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .ck-row-disclaimer {
          margin-top: 6px;
          font-size: var(--ck-font-label);
          font-weight: 700;
          color: rgba(15, 23, 42, 0.62);
          line-height: 1.2;
          overflow-wrap: anywhere;
          word-break: break-word;
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
        .ck-upload-row > .ck-upload-files-btn {
          flex: 0 0 auto;
          white-space: nowrap;
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
        /* In 2-up grids, keep the "aligned label rows" behavior even if a field forces stacked layout. */
        .ck-line-grid > .field.inline-field.ck-label-stacked > label,
        .ck-pair-grid > .field.inline-field.ck-label-stacked > label,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field.ck-label-stacked > label {
          min-height: 2.4em;
        }
        .form-card .field[data-has-warning="true"]:not([data-has-error="true"]),
        .webform-overlay .field[data-has-warning="true"]:not([data-has-error="true"]) {
          outline: 2px solid rgba(245, 158, 11, 0.6);
          outline-offset: 2px;
          border-radius: 12px;
          padding: 8px;
          background: rgba(245, 158, 11, 0.08);
        }
        .form-card .field[data-has-error="true"],
        .webform-overlay .field[data-has-error="true"] {
          outline: 2px solid rgba(255, 59, 48, 0.65);
          outline-offset: 2px;
          border-radius: 12px;
          padding: 8px;
          background: rgba(255, 59, 48, 0.08);
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
          font-weight: 700;
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
          background: rgba(118, 118, 128, 0.12);
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
          font-weight: 800;
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
          color: #ffffff;
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.14);
        }
        .ck-segmented button:not(.active) {
          color: rgba(15, 23, 42, 0.78);
        }
        .ck-segmented button:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.5);
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
          font-weight: 700;
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
          /* Reserve some space for 2-line labels, but avoid large gaps for short labels */
          line-height: 1.2;
          min-height: 2.4em;
          max-width: none;
          margin: 0;
        }
        .ck-line-grid > .field.inline-field > input,
        .ck-line-grid > .field.inline-field > select,
        .ck-line-grid > .field.inline-field > textarea,
        .ck-line-grid > .field.inline-field > .inline-options,
        .ck-line-grid > .field.inline-field > .ck-choice-control,
        .ck-line-grid > .field.inline-field > .ck-number-stepper,
        .ck-pair-grid > .field.inline-field > input,
        .ck-pair-grid > .field.inline-field > select,
        .ck-pair-grid > .field.inline-field > textarea,
        .ck-pair-grid > .field.inline-field > .inline-options,
        .ck-pair-grid > .field.inline-field > .ck-choice-control,
        .ck-pair-grid > .field.inline-field > .ck-number-stepper,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > input,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > select,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > textarea,
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
          background: rgba(120, 120, 128, 0.28);
          border: 1px solid rgba(60, 60, 67, 0.22);
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
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
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
        .webform-overlay .field.inline-field.ck-consent-field > label {
          flex: 1 1 100%;
          max-width: none;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .form-card .field.inline-field.ck-consent-field > label > input[type="checkbox"],
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
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }
        /* Summary view: softer, more report-like group headers (avoid "primary button" look). */
        .ck-summary-view .ck-group-card {
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
        }
        .ck-summary-view .ck-group-header {
          background: rgba(118, 118, 128, 0.06);
        }
        .ck-summary-view .ck-progress-pill {
          background: rgba(118, 118, 128, 0.10);
        }
        .ck-group-stack {
          display: flex;
          flex-direction: column;
          gap: 28px; /* separation between group cards */
        }
        .ck-group-card[data-has-error="true"] {
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08), 0 0 0 4px rgba(239, 68, 68, 0.22);
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
        }
        .ck-group-header--clickable:active {
          background: rgba(118, 118, 128, 0.10);
        }
        .ck-group-header--clickable:focus-visible {
          outline: 4px solid rgba(0, 122, 255, 0.28);
          outline-offset: 2px;
          border-radius: var(--radius-card);
        }
        .ck-group-title {
          font-size: var(--ck-font-group-title);
          font-weight: 900;
          /* Distinguish group titles from field labels */
          color: rgba(15, 23, 42, 0.72);
          letter-spacing: -0.2px;
        }
        .ck-progress-pill {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(118, 118, 128, 0.12);
          color: rgba(15, 23, 42, 0.72);
          font-weight: 900;
          font-size: var(--ck-font-pill);
          line-height: 1;
          white-space: nowrap;
          min-height: 56px;
          cursor: pointer;
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
        }
        .ck-progress-pill .ck-progress-label {
          font-size: 0.92em;
          font-weight: 900;
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
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18);
        }
        .ck-progress-pill .ck-progress-caret {
          font-size: var(--ck-font-caret);
          font-weight: 900;
          opacity: 0.8;
        }
        .ck-progress-pill.ck-progress-good {
          background: #dcfce7;
          border-color: rgba(22, 163, 74, 0.28);
          color: #166534;
        }
        .ck-progress-pill.ck-progress-bad {
          background: #fee2e2;
          border-color: rgba(220, 38, 38, 0.28);
          color: #b91c1c;
        }
        .ck-progress-pill.ck-progress-neutral {
          background: rgba(118, 118, 128, 0.12);
          border-color: var(--border);
          color: rgba(15, 23, 42, 0.72);
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
          font-size: 44px;
          font-weight: 900;
          color: rgba(15, 23, 42, 0.6);
          width: 64px;
          height: 64px;
          padding: 0;
          box-sizing: border-box;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(118, 118, 128, 0.12);
          border: 1px solid var(--border);
          cursor: pointer;
        }
        .ck-group-body {
          padding: 18px 20px 22px;
        }

        @media (max-width: 520px) {
          /* On very narrow viewports, allow control rows to wrap (select + buttons). */
          .ck-control-row {
            flex-wrap: wrap;
          }
          .ck-field-actions {
            flex-wrap: wrap;
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


