import { openPdfObjectUrl } from '../../../src/web/react/app/pdfObjectUrlOpen';

describe('openPdfObjectUrl', () => {
  it('opens the object URL in a pre-opened popup when available', () => {
    const popup = { closed: false, location: { href: '' } };
    const assignLocation = jest.fn();

    const result = openPdfObjectUrl({
      objectUrl: 'blob:https://example.com/report',
      popup,
      assignLocation
    });

    expect(result).toEqual({ opened: true, method: 'popup' });
    expect(popup.location.href).toBe('blob:https://example.com/report');
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it('falls back to current-window navigation when no popup is available', () => {
    const assignLocation = jest.fn();

    const result = openPdfObjectUrl({
      objectUrl: 'blob:https://example.com/report',
      popup: null,
      assignLocation
    });

    expect(result).toEqual({ opened: true, method: 'currentWindow' });
    expect(assignLocation).toHaveBeenCalledWith('blob:https://example.com/report');
  });

  it('reports blocked when no navigation path works', () => {
    const result = openPdfObjectUrl({
      objectUrl: 'blob:https://example.com/report',
      popup: null,
      assignLocation: () => {
        throw new Error('blocked');
      }
    });

    expect(result).toEqual({ opened: false, method: 'blocked' });
  });
});
