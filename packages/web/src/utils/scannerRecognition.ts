export type ScannerRoiRegion =
  | 'bottom-left'
  | 'bottom-left-strip'
  | 'bottom-right';

export type ScannerRoiSource = 'opencv' | 'lightweight' | 'fixed fallback';

export interface ScannerRoiImage {
  region: ScannerRoiRegion;
  image: string;
  label?: string;
  source?: ScannerRoiSource;
}

export interface ScannerCardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface ScannerRoiExtractionResult {
  rois: ScannerRoiImage[];
  source: ScannerRoiSource;
  detection: {
    status: ScannerRoiSource;
    confidence?: number;
    processingMs: number;
    reason?: string;
    error?: string;
    cardPreview?: string;
  };
}

export interface ScannerMatch {
  catalogCardId: number | string;
  name: string;
  setCode?: string | null;
  number?: string | null;
  imageUrl?: string | null;
}

export interface ScannerRecognitionCandidate {
  rawText?: string | null;
  region: ScannerRoiRegion;
  setCode?: string | null;
  number?: string | null;
  correctedFromSetCode?: string | null;
  correctedFromNumber?: string | null;
  key?: string | null;
  status: 'resolved' | 'ambiguous' | 'unresolved' | 'no_card' | 'error';
  match?: ScannerMatch | null;
  alternatives?: ScannerMatch[];
  confidence?: number | null;
}

export type ScannerParsedAttempt =
  | string
  | {
      setCode?: string | null;
      number?: string | null;
      correctedFromSetCode?: string | null;
      correctedFromNumber?: string | null;
      rawText?: string | null;
      normalized?: string | null;
      key?: string | null;
    };

export interface ScannerRecognitionDebugRegion {
  index: number;
  region: ScannerRoiRegion;
  rawText?: string | null;
  confidence?: number | null;
  parsedAttempts?: ScannerParsedAttempt[];
  errors?: string[];
}

export interface ScannerRecognitionResult {
  candidates: ScannerRecognitionCandidate[];
  debug?: {
    regions?: ScannerRecognitionDebugRegion[];
  };
}

export interface ScannerRecognizerClient {
  recognize(images: ScannerRoiImage[]): Promise<ScannerRecognitionResult>;
}

export const makeResolvedScannerKey = (
  candidate: ScannerRecognitionCandidate,
) => {
  if (candidate.match?.catalogCardId) {
    return `catalog:${candidate.match.catalogCardId}`;
  }

  if (candidate.setCode && candidate.number) {
    return (
      candidate.key || `${candidate.setCode}:${candidate.number}`
    ).toLowerCase();
  }

  return null;
};

export function selectBestScannerCandidate(
  result: ScannerRecognitionResult,
): ScannerRecognitionCandidate | null {
  const candidates = result.candidates ?? [];
  const resolved = candidates
    .filter((candidate) => candidate.status === 'resolved')
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  if (resolved[0]) {
    return resolved[0];
  }

  return (
    candidates.find(
      (candidate) =>
        candidate.status === 'ambiguous' &&
        Boolean(candidate.setCode && candidate.number),
    ) ??
    candidates.find(
      (candidate) =>
        candidate.status === 'unresolved' &&
        Boolean(candidate.setCode && candidate.number),
    ) ??
    null
  );
}

export interface StabilizerState {
  pendingKey: string | null;
  pendingCount: number;
  latchedKey: string | null;
  absenceCount: number;
}

export interface StabilizerDecision {
  state: StabilizerState;
  shouldAdd: boolean;
}

export const createInitialStabilizerState = (): StabilizerState => ({
  pendingKey: null,
  pendingCount: 0,
  latchedKey: null,
  absenceCount: 0,
});

interface StabilizerOptions {
  requiredRepeats?: number;
  absenceSamplesToReset?: number;
}

export function updateScannerStabilizer(
  state: StabilizerState,
  detectedKey: string | null,
  options: StabilizerOptions = {},
): StabilizerDecision {
  const requiredRepeats = options.requiredRepeats ?? 2;
  const absenceSamplesToReset = options.absenceSamplesToReset ?? 2;

  if (!detectedKey) {
    const absenceCount = state.absenceCount + 1;
    return {
      shouldAdd: false,
      state: {
        pendingKey: null,
        pendingCount: 0,
        latchedKey:
          absenceCount >= absenceSamplesToReset ? null : state.latchedKey,
        absenceCount,
      },
    };
  }

  const pendingCount =
    detectedKey === state.pendingKey ? state.pendingCount + 1 : 1;
  const hasStabilized = pendingCount >= requiredRepeats;
  const shouldAdd = hasStabilized && detectedKey !== state.latchedKey;

  return {
    shouldAdd,
    state: {
      pendingKey: detectedKey,
      pendingCount,
      latchedKey: shouldAdd || hasStabilized ? detectedKey : state.latchedKey,
      absenceCount: 0,
    },
  };
}

export interface ScannerRoiPreprocessOptions {
  scale?: number;
  threshold?: number;
  invert?: boolean;
}

export function preprocessScannerRoiCanvas(
  canvas: HTMLCanvasElement,
  options: ScannerRoiPreprocessOptions = {},
) {
  const context = canvas.getContext('2d');
  const getImageData = context?.getImageData?.bind(context);
  const putImageData = context?.putImageData?.bind(context);

  if (!context || !getImageData || !putImageData) {
    return;
  }

  const threshold = options.threshold ?? 145;
  const invert = options.invert ?? true;
  const imageData = getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const luminance =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const bright = luminance >= threshold;
    const value = invert ? (bright ? 0 : 255) : bright ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  putImageData(imageData, 0, 0);
}

interface ScannerRoiDefinition {
  region: ScannerRoiRegion;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: 'clockwise';
  paddingPx?: number;
  scale?: number;
}

const CARD_RELATIVE_ROIS: ScannerRoiDefinition[] = [
  {
    region: 'bottom-left-strip',
    label: 'bottom-left ID only',
    x: 0.05,
    y: 0.91,
    width: 0.58,
    height: 0.07,
  },
  {
    region: 'bottom-left',
    x: 0.04,
    y: 0.76,
    width: 0.7,
    height: 0.2,
  },
  {
    region: 'bottom-right',
    label: 'bottom-right ID only',
    x: 0.8,
    y: 0.58,
    width: 0.16,
    height: 0.36,
    rotate: 'clockwise',
    paddingPx: 144,
    scale: 6,
  },
  {
    region: 'bottom-right',
    label: 'bottom-right wide',
    x: 0.68,
    y: 0.52,
    width: 0.28,
    height: 0.44,
    rotate: 'clockwise',
    paddingPx: 96,
    scale: 4,
  },
];

const FIXED_FRAME_ROIS: ScannerRoiDefinition[] = [
  {
    region: 'bottom-left-strip',
    x: 0.03,
    y: 0.885,
    width: 0.56,
    height: 0.095,
  },
  {
    region: 'bottom-left',
    x: 0.03,
    y: 0.74,
    width: 0.7,
    height: 0.24,
  },
  {
    region: 'bottom-right',
    label: 'bottom-right ID only',
    x: 0.62,
    y: 0.62,
    width: 0.24,
    height: 0.36,
    rotate: 'clockwise',
    paddingPx: 144,
    scale: 6,
  },
  {
    region: 'bottom-right',
    label: 'bottom-right wide',
    x: 0.54,
    y: 0.62,
    width: 0.32,
    height: 0.34,
    rotate: 'clockwise',
    paddingPx: 96,
    scale: 4,
  },
];

const clampBounds = (bounds: ScannerCardBounds, width: number, height: number) => ({
  x: Math.max(0, Math.min(width - 1, bounds.x)),
  y: Math.max(0, Math.min(height - 1, bounds.y)),
  width: Math.max(1, Math.min(width - bounds.x, bounds.width)),
  height: Math.max(1, Math.min(height - bounds.y, bounds.height)),
});

export function detectCardBoundsFromCanvas(
  canvas: HTMLCanvasElement,
): ScannerCardBounds | null {
  const context = canvas.getContext('2d');
  const getImageData = context?.getImageData?.bind(context);

  if (!context || !getImageData || canvas.width < 20 || canvas.height < 20) {
    return null;
  }

  const imageData = getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const saturation = max - min;
      const likelyCardPixel = luminance < 225 && (saturation > 18 || luminance < 175);

      if (likelyCardPixel) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const coverage = hits / (canvas.width * canvas.height);

  if (
    hits < 80 ||
    coverage < 0.04 ||
    width < canvas.width * 0.28 ||
    height < canvas.height * 0.35
  ) {
    return null;
  }

  const padX = width * 0.04;
  const padY = height * 0.04;
  const padded = clampBounds(
    {
      x: minX - padX,
      y: minY - padY,
      width: width + padX * 2,
      height: height + padY * 2,
      confidence: Math.min(0.95, coverage * 3),
    },
    canvas.width,
    canvas.height,
  );

  return { ...padded, confidence: Math.min(0.95, coverage * 3) };
}

type OpenCvModule = Record<string, any>;
let openCvLoadPromise: Promise<OpenCvModule> | null = null;

async function loadOpenCv(): Promise<OpenCvModule> {
  openCvLoadPromise ??= import('@techstark/opencv-js').then((module) => {
    const cv = (module as { default?: OpenCvModule }).default ?? module;
    if (cv instanceof Promise) {
      return cv;
    }
    return cv as OpenCvModule;
  });

  return openCvLoadPromise;
}

function orderQuadPoints(points: Array<{ x: number; y: number }>) {
  const sortedBySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const sortedByDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return {
    topLeft: sortedBySum[0],
    bottomRight: sortedBySum[sortedBySum.length - 1],
    topRight: sortedByDiff[0],
    bottomLeft: sortedByDiff[sortedByDiff.length - 1],
  };
}

async function detectCardWithOpenCv(
  frameCanvas: HTMLCanvasElement,
): Promise<{
  canvas: HTMLCanvasElement;
  confidence: number;
  reason?: string;
} | null> {
  const cv = await loadOpenCv();
  const mats: Array<{ delete?: () => void }> = [];

  try {
    const src = cv.imread(frameCanvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    const closed = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    mats.push(src, gray, blurred, edges, kernel, closed, contours, hierarchy);

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 50, 150);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let best: { points: Array<{ x: number; y: number }>; area: number } | null = null;
    const frameArea = frameCanvas.width * frameCanvas.height;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      mats.push(contour, approx);
      cv.approxPolyDP(contour, approx, 0.03 * peri, true);
      const area = Math.abs(cv.contourArea(approx));

      if (approx.rows === 4 && area > frameArea * 0.08) {
        const points = Array.from({ length: 4 }, (_, pointIndex) => ({
          x: approx.intPtr(pointIndex, 0)[0],
          y: approx.intPtr(pointIndex, 0)[1],
        }));
        const ordered = orderQuadPoints(points);
        const topWidth = Math.hypot(ordered.topRight.x - ordered.topLeft.x, ordered.topRight.y - ordered.topLeft.y);
        const bottomWidth = Math.hypot(ordered.bottomRight.x - ordered.bottomLeft.x, ordered.bottomRight.y - ordered.bottomLeft.y);
        const leftHeight = Math.hypot(ordered.bottomLeft.x - ordered.topLeft.x, ordered.bottomLeft.y - ordered.topLeft.y);
        const rightHeight = Math.hypot(ordered.bottomRight.x - ordered.topRight.x, ordered.bottomRight.y - ordered.topRight.y);
        const ratio = Math.max(topWidth, bottomWidth) / Math.max(1, Math.max(leftHeight, rightHeight));
        const normalizedRatio = ratio < 1 ? 1 / ratio : ratio;

        if (normalizedRatio >= 1.25 && normalizedRatio <= 1.7 && (!best || area > best.area)) {
          best = { points, area };
        }
      }
    }

    if (!best) {
      return null;
    }

    const ordered = orderQuadPoints(best.points);
    const outputWidth = 744;
    const outputHeight = 1040;
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = outputWidth;
    dstCanvas.height = outputHeight;
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered.topLeft.x,
      ordered.topLeft.y,
      ordered.topRight.x,
      ordered.topRight.y,
      ordered.bottomRight.x,
      ordered.bottomRight.y,
      ordered.bottomLeft.x,
      ordered.bottomLeft.y,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      outputWidth,
      0,
      outputWidth,
      outputHeight,
      0,
      outputHeight,
    ]);
    const transform = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    mats.push(srcTri, dstTri, transform, warped);
    cv.warpPerspective(src, warped, transform, new cv.Size(outputWidth, outputHeight));
    cv.imshow(dstCanvas, warped);

    return {
      canvas: dstCanvas,
      confidence: Math.min(0.98, best.area / frameArea),
    };
  } finally {
    for (const mat of mats.reverse()) {
      mat.delete?.();
    }
  }
}

function renderScannerRoi(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  definition: ScannerRoiDefinition,
  roiSource: ScannerRoiSource,
): ScannerRoiImage {
  const { region, label, x, y, width, height, rotate, paddingPx = 0, scale = 3 } = definition;
  const sx = Math.max(0, Math.min(sourceWidth - 1, sourceWidth * x));
  const sy = Math.max(0, Math.min(sourceHeight - 1, sourceHeight * y));
  const sw = Math.min(sourceWidth - sx, sourceWidth * width);
  const sh = Math.min(sourceHeight - sy, sourceHeight * height);
  const contentWidth = Math.max(1, Math.round((rotate ? sh : sw) * scale));
  const contentHeight = Math.max(1, Math.round((rotate ? sw : sh) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = contentWidth + paddingPx * 2;
  canvas.height = contentHeight + paddingPx * 2;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to prepare scan regions in this browser.');
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (rotate === 'clockwise') {
    context.translate(paddingPx + contentWidth, paddingPx);
    context.rotate(Math.PI / 2);
    context.drawImage(source, sx, sy, sw, sh, 0, 0, contentHeight, contentWidth);
  } else {
    context.drawImage(source, sx, sy, sw, sh, paddingPx, paddingPx, contentWidth, contentHeight);
  }

  preprocessScannerRoiCanvas(canvas, { invert: true, threshold: 145 });

  return { region, label, source: roiSource, image: canvas.toDataURL('image/jpeg', 0.9) };
}

export async function extractScannerRoisWithDebugFromVideo(
  video: HTMLVideoElement,
): Promise<ScannerRoiExtractionResult> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Camera preview is not ready.');
  }

  const startedAt = performance.now();
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameContext = frameCanvas.getContext('2d');

  if (!frameContext) {
    throw new Error('Unable to inspect the camera frame in this browser.');
  }

  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

  try {
    const openCvDetection = await detectCardWithOpenCv(frameCanvas);
    if (openCvDetection) {
      return {
        source: 'opencv',
        rois: CARD_RELATIVE_ROIS.map((definition) =>
          renderScannerRoi(
            openCvDetection.canvas,
            openCvDetection.canvas.width,
            openCvDetection.canvas.height,
            definition,
            'opencv',
          ),
        ),
        detection: {
          status: 'opencv',
          confidence: openCvDetection.confidence,
          processingMs: performance.now() - startedAt,
          cardPreview: openCvDetection.canvas.toDataURL('image/jpeg', 0.85),
        },
      };
    }
  } catch (error) {
    // OpenCV is optional/lazy-loaded; keep scanner usable with lightweight/fixed fallback.
    const openCvError = error instanceof Error ? error.message : 'OpenCV detector failed';
    const detectedBounds = detectCardBoundsFromCanvas(frameCanvas);
    if (!detectedBounds) {
      return {
        source: 'fixed fallback',
        rois: FIXED_FRAME_ROIS.map((definition) =>
          renderScannerRoi(video, video.videoWidth, video.videoHeight, definition, 'fixed fallback'),
        ),
        detection: {
          status: 'fixed fallback',
          processingMs: performance.now() - startedAt,
          reason: 'opencv unavailable and no card-like bounds detected',
          error: openCvError,
        },
      };
    }
  }

  const detectedBounds = detectCardBoundsFromCanvas(frameCanvas);

  if (detectedBounds) {
    const bounds = clampBounds(detectedBounds, frameCanvas.width, frameCanvas.height);
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = Math.max(1, Math.round(bounds.width));
    cardCanvas.height = Math.max(1, Math.round(bounds.height));
    const cardContext = cardCanvas.getContext('2d');

    if (cardContext) {
      cardContext.drawImage(
        frameCanvas,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        cardCanvas.width,
        cardCanvas.height,
      );

      return {
        source: 'lightweight',
        rois: CARD_RELATIVE_ROIS.map((definition) =>
          renderScannerRoi(
            cardCanvas,
            cardCanvas.width,
            cardCanvas.height,
            definition,
            'lightweight',
          ),
        ),
        detection: {
          status: 'lightweight',
          confidence: detectedBounds.confidence,
          processingMs: performance.now() - startedAt,
          cardPreview: cardCanvas.toDataURL('image/jpeg', 0.85),
        },
      };
    }
  }

  return {
    source: 'fixed fallback',
    rois: FIXED_FRAME_ROIS.map((definition) =>
      renderScannerRoi(video, video.videoWidth, video.videoHeight, definition, 'fixed fallback'),
    ),
    detection: {
      status: 'fixed fallback',
      processingMs: performance.now() - startedAt,
      reason: detectedBounds ? 'card crop canvas unavailable' : 'no card-like bounds detected',
    },
  };
}

export async function extractScannerRoisFromVideo(
  video: HTMLVideoElement,
): Promise<ScannerRoiImage[]> {
  const result = await extractScannerRoisWithDebugFromVideo(video);
  return result.rois;
}
