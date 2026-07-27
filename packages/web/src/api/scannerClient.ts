import type {
  ScannerRecognitionResult,
  ScannerRecognizerClient,
  ScannerRoiImage,
} from '../utils/scannerRecognition';

const API_BASE = '/api';

export class ApiScannerRecognizerClient implements ScannerRecognizerClient {
  async recognize(
    images: ScannerRoiImage[],
  ): Promise<ScannerRecognitionResult> {
    const response = await fetch(`${API_BASE}/scanner/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: images.map(({ region, image }) => ({ region, dataUrl: image })),
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Scanner recognition failed' }));
      throw new Error(
        error.error || error.message || `HTTP ${response.status}`,
      );
    }

    return response.json();
  }
}

export const scannerRecognizerClient = new ApiScannerRecognizerClient();
