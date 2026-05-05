const {
  resolveValidationNavigationMode
} = require('../../../src/web/react/features/validation/useValidationNavigationRequest.ts') as {
  resolveValidationNavigationMode: typeof import('../../../src/web/react/features/validation/useValidationNavigationRequest').resolveValidationNavigationMode;
};

describe('validation navigation request', () => {
  test('resolves focus or scroll navigation mode', () => {
    expect(resolveValidationNavigationMode()).toBe('focus');
    expect(resolveValidationNavigationMode({ scrollOnly: true })).toBe('scroll');
    expect(resolveValidationNavigationMode({ scrollOnly: true, mode: 'focus' })).toBe('focus');
  });
});
