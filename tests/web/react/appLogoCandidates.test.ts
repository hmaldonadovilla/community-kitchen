import { buildAppLogoCandidates, extractDriveImageId } from '../../../src/web/react/components/app/appLogoCandidates';

describe('appLogoCandidates', () => {
  it('uses Drive thumbnails before uc view URLs', () => {
    const driveId = '11umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4K';
    const candidates = buildAppLogoCandidates(`https://drive.google.com/uc?export=view&id=${driveId}`);

    expect(candidates[0]).toBe(`https://drive.google.com/thumbnail?id=${driveId}&sz=w256`);
    expect(candidates[1]).toBe(`https://drive.google.com/thumbnail?id=${driveId}&sz=w512`);
    expect(candidates).not.toContain(`https://drive.google.com/uc?export=view&id=${driveId}`);
  });

  it('keeps non-Drive logo URLs unchanged', () => {
    const logoUrl = 'https://example.org/logo.png';

    expect(buildAppLogoCandidates(logoUrl)).toEqual([logoUrl]);
  });

  it('extracts Drive ids from supported image URL formats', () => {
    const driveId = '11umQRK-0vNrAGtf4bnVlfyLt8-Zpcc4K';

    expect(extractDriveImageId(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`)).toBe(driveId);
    expect(extractDriveImageId(`https://drive.google.com/open?id=${driveId}`)).toBe(driveId);
    expect(extractDriveImageId(`https://lh3.googleusercontent.com/d/${driveId}=w256`)).toBe(driveId);
    expect(extractDriveImageId(driveId)).toBe(driveId);
  });
});
