import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiScannerRecognizerClient } from './scannerClient';

describe('ApiScannerRecognizerClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts ROI data URLs using the backend scanner contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ candidates: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiScannerRecognizerClient();
    await client.recognize([
      { region: 'bottom-left', image: 'data:image/jpeg;base64,abc' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/api/scanner/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: [
          { region: 'bottom-left', dataUrl: 'data:image/jpeg;base64,abc' },
        ],
      }),
    });
  });
});
