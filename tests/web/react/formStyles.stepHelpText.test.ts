import { FORM_VIEW_STYLES } from '../../../src/web/react/components/form/styles';

describe('FORM_VIEW_STYLES', () => {
  test('renders guided step helper text with preserved line breaks', () => {
    expect(FORM_VIEW_STYLES).toContain('.ck-step-help-text');
    expect(FORM_VIEW_STYLES).toContain('white-space: pre-line;');
  });
});
