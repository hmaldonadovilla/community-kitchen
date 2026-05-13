import { FORM_VIEW_STYLES } from '../../../src/web/react/components/form/styles';

describe('FORM_VIEW_STYLES', () => {
  test('renders guided step helper text with preserved line breaks', () => {
    expect(FORM_VIEW_STYLES).toContain('.ck-step-help-text');
    expect(FORM_VIEW_STYLES).toContain('white-space: pre-line;');
    expect(FORM_VIEW_STYLES).toContain('font-size: var(--ck-font-helper);');
    expect(FORM_VIEW_STYLES).toContain('color: var(--text);');
  });

  test('renders neutral section instructions as readable content groups', () => {
    expect(FORM_VIEW_STYLES).toContain('.ck-section-instruction');
    expect(FORM_VIEW_STYLES).toContain('border: 1px solid var(--border);');
    expect(FORM_VIEW_STYLES).toContain('border-radius: 8px;');
    expect(FORM_VIEW_STYLES).toContain('background: #EAF4FF;');
    expect(FORM_VIEW_STYLES).not.toContain('.ck-section-instruction__label');
    expect(FORM_VIEW_STYLES).toContain('.ck-section-instruction__text');
    expect(FORM_VIEW_STYLES).toContain('font-size: var(--ck-font-label);');
  });
});
