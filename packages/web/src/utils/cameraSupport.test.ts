import { describe, expect, it } from 'vitest';
import {
  getCameraAvailability,
  getCameraErrorMessage,
} from './cameraSupport';

describe('cameraSupport', () => {
  it('reports insecure contexts before checking browser support', () => {
    expect(
      getCameraAvailability({
        isSecureContext: false,
        mediaDevices: { getUserMedia: async () => ({}) as MediaStream },
      }),
    ).toEqual({ ok: false, reason: 'insecure-context' });
  });

  it('reports unsupported browsers when getUserMedia is missing', () => {
    expect(getCameraAvailability({ isSecureContext: true })).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('reports support when getUserMedia is available in a secure context', () => {
    expect(
      getCameraAvailability({
        isSecureContext: true,
        mediaDevices: { getUserMedia: async () => ({}) as MediaStream },
      }),
    ).toEqual({ ok: true });
  });

  it('maps common permission and device errors to user-facing messages', () => {
    expect(
      getCameraErrorMessage(new DOMException('Denied', 'NotAllowedError')),
    ).toMatch(/permission was denied/i);
    expect(
      getCameraErrorMessage(new DOMException('Missing', 'NotFoundError')),
    ).toMatch(/no camera/i);
    expect(
      getCameraErrorMessage(new DOMException('Busy', 'NotReadableError')),
    ).toMatch(/already in use/i);
  });
});
