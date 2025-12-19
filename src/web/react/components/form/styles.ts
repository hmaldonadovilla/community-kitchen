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

        .form-card input,
        .form-card select,
        .form-card textarea {
          font-size: 36px;
          line-height: 1.5;
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
        .form-card .field.inline-field > label,
        .webform-overlay .field.inline-field > label {
          flex: 1 1 160px;
          min-width: 120px;
          max-width: 220px;
          margin: 0;
          font-weight: 800;
          color: var(--text);
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .form-card .field.inline-field > input,
        .form-card .field.inline-field > select,
        .form-card .field.inline-field > textarea,
        .form-card .field.inline-field > .inline-options,
        .form-card .field.inline-field > .ck-choice-control,
        .webform-overlay .field.inline-field > input,
        .webform-overlay .field.inline-field > select,
        .webform-overlay .field.inline-field > textarea,
        .webform-overlay .field.inline-field > .inline-options,
        .webform-overlay .field.inline-field > .ck-choice-control {
          flex: 2 1 260px;
          min-width: 0;
          width: 100%;
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
          min-height: 2.6em;
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
          border: 1px solid var(--border);
          background: rgba(118, 118, 128, 0.12);
          color: var(--text);
          border-radius: 12px;
          padding: 13px 18px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          line-height: 1;
        }
        /* When an info button is rendered inline next to a control, match control height. */
        .form-card .field.inline-field > .info-button,
        .webform-overlay .field.inline-field > .info-button {
          min-height: var(--control-height);
          padding: 0 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .ck-segmented {
          display: inline-flex;
          width: 100%;
          max-width: 520px;
          align-items: stretch;
          gap: 2px;
          padding: 2px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(118, 118, 128, 0.12);
          min-height: var(--control-height);
        }
        .ck-segmented button {
          flex: 1 1 0;
          min-height: calc(var(--control-height) - 4px);
          border: none;
          background: transparent;
          border-radius: 10px;
          padding: 16px 12px;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ck-segmented button.active {
          background: var(--card);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
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
          /* Reserve up to ~2 lines so controls in the same row start together */
          min-height: 2.6em;
          max-width: none;
          margin: 0;
        }
        .ck-line-grid > .field.inline-field > input,
        .ck-line-grid > .field.inline-field > select,
        .ck-line-grid > .field.inline-field > textarea,
        .ck-line-grid > .field.inline-field > .inline-options,
        .ck-line-grid > .field.inline-field > .ck-choice-control,
        .ck-pair-grid > .field.inline-field > input,
        .ck-pair-grid > .field.inline-field > select,
        .ck-pair-grid > .field.inline-field > textarea,
        .ck-pair-grid > .field.inline-field > .inline-options,
        .ck-pair-grid > .field.inline-field > .ck-choice-control,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > input,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > select,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > textarea,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .inline-options,
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > .ck-choice-control {
          width: 100%;
          min-width: 0;
        }
        /* Numbers shouldn't look like giant empty boxes; keep them content-sized in grids. */
        .ck-line-grid > .field.inline-field > input[type="number"],
        .ck-pair-grid > .field.inline-field > input[type="number"],
        .collapsed-fields-grid.ck-collapsed-stack > .field.inline-field > input[type="number"] {
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
          width: 28px;
          height: 28px;
          accent-color: var(--accent);
          transform: scale(1.35);
          transform-origin: left center;
          margin: 0;
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
        }
        .form-card input[type="date"]::-webkit-date-and-time-value,
        .webform-overlay input[type="date"]::-webkit-date-and-time-value {
          min-width: 0;
          max-width: 100%;
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
          gap: 16px;
        }
        .ck-group-card {
          padding: 0;
          outline: none;
        }
        .ck-group-card[data-has-error="true"] {
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.22);
        }
        .ck-group-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 22px 22px;
          border: 0;
          background: transparent;
          text-align: left;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
        }
        .ck-group-title {
          font-size: 32px;
          font-weight: 900;
          /* Distinguish group titles from field labels */
          color: rgba(15, 23, 42, 0.72);
          letter-spacing: -0.2px;
        }
        .ck-group-chevron {
          flex: 0 0 auto;
          font-size: 36px;
          font-weight: 900;
          color: rgba(15, 23, 42, 0.6);
          width: 56px;
          height: 56px;
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
          /* iOS date inputs are very wide; if a paired row contains a DATE field, stack it on mobile to prevent overflow. */
          .ck-pair-grid.ck-pair-has-date {
            grid-template-columns: 1fr;
          }

          .form-card .field.inline-field > label,
          .webform-overlay .field.inline-field > label {
            flex-basis: 100%;
            max-width: none;
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


