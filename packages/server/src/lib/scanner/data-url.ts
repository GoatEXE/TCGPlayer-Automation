export interface DecodedImageDataUrl {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  buffer: Buffer;
}

const MAX_IMAGE_BYTES = 1_000_000;
const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function decodeScannerImageDataUrl(dataUrl: string): DecodedImageDataUrl {
  if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 1.4) + 64) {
    throw new Error(`image dataUrl exceeds ${MAX_IMAGE_BYTES} byte limit`);
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('dataUrl must be a base64 PNG, JPEG, or WEBP data URL');
  }

  const [, mimeType, encoded] = match;
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType as DecodedImageDataUrl['mimeType'])) {
    throw new Error('unsupported image MIME type');
  }

  const buffer = Buffer.from(encoded, 'base64');

  if (buffer.length === 0) {
    throw new Error('image dataUrl is empty');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`image exceeds ${MAX_IMAGE_BYTES} byte limit`);
  }

  return {
    mimeType: mimeType as DecodedImageDataUrl['mimeType'],
    buffer,
  };
}
