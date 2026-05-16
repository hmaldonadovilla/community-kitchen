import { shouldRenderCustomButtonAsLink } from '../../../src/web/react/components/app/CustomActionLink';

describe('shouldRenderCustomButtonAsLink', () => {
  it('uses link rendering for enabled custom buttons with hrefs', () => {
    expect(
      shouldRenderCustomButtonAsLink({
        label: 'View final report',
        href: 'https://drive.google.com/file/d/file-id/view',
        disabled: false
      })
    ).toBe(true);
  });

  it('keeps disabled or in-app preview custom buttons in button rendering', () => {
    expect(
      shouldRenderCustomButtonAsLink({
        label: 'View final report',
        href: 'https://drive.google.com/file/d/file-id/view',
        disabled: true
      })
    ).toBe(false);

    expect(
      shouldRenderCustomButtonAsLink({
        label: 'View final report',
        disabled: false
      })
    ).toBe(false);
  });
});
