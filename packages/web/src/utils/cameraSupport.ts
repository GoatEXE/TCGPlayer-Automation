export type CameraAvailability =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'insecure-context' };

interface CameraEnvironment {
  isSecureContext?: boolean;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
}

export function getCameraAvailability(
  environment: CameraEnvironment,
): CameraAvailability {
  if (environment.isSecureContext === false) {
    return { ok: false, reason: 'insecure-context' };
  }

  if (typeof environment.mediaDevices?.getUserMedia !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }

  return { ok: true };
}

export function getCameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return 'Unable to start the camera. Check your browser and device camera settings.';
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use or unavailable right now.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'This device does not have a compatible camera for the requested preview.';
    default:
      return 'Unable to start the camera. Check your browser and device camera settings.';
  }
}
