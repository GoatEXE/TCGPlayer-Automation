import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { scannerRecognizerClient } from '../api/scannerClient';
import type {
  ScannerParsedAttempt,
  ScannerRecognitionCandidate,
  ScannerRecognitionDebugRegion,
  ScannerRecognizerClient,
  ScannerRoiImage,
  ScannerRoiSource,
  StabilizerState,
} from '../utils/scannerRecognition';
import {
  createInitialStabilizerState,
  extractScannerRoisWithDebugFromVideo,
  makeResolvedScannerKey,
  selectBestScannerCandidate,
  updateScannerStabilizer,
} from '../utils/scannerRecognition';
import type { PointerEvent } from 'react';
import {
  getCameraAvailability,
  getCameraErrorMessage,
} from '../utils/cameraSupport';

type CameraState = 'idle' | 'starting' | 'active' | 'error';
type DisplayFit = 'fit' | 'fill';

type CameraCapabilities = MediaTrackCapabilities & {
  zoom?: {
    min: number;
    max: number;
  };
  focusMode?: string[];
  pointsOfInterest?: boolean;
};

type CameraConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
  focusMode?: string;
  pointsOfInterest?: Array<{ x: number; y: number }>;
};

type SupportedCameraConstraints = MediaTrackSupportedConstraints & {
  pointsOfInterest?: boolean;
};

const PREFERRED_CAMERA_ZOOM = 1;

interface ScanAddCardsProps {
  onExit?: () => void;
  recognizer?: ScannerRecognizerClient;
}

type SessionCardStatus = 'resolved' | 'ambiguous' | 'unresolved' | 'committed';

interface ScanSessionRow {
  key: string;
  catalogCardId?: number | string;
  name: string;
  setCode?: string | null;
  number?: string | null;
  quantity: number;
  confidence?: number | null;
  status: SessionCardStatus;
  lastSeenAt: number;
}

const SCAN_SAMPLE_INTERVAL_MS = 850;

export function ScanAddCards({
  onExit,
  recognizer = scannerRecognizerClient,
}: ScanAddCardsProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [lastRoiPreviews, setLastRoiPreviews] = useState<ScannerRoiImage[]>([]);
  const [lastRoiSource, setLastRoiSource] = useState<ScannerRoiSource | null>(
    null,
  );
  const [lastCardPreview, setLastCardPreview] = useState<string | null>(null);
  const [lastDetectionSummary, setLastDetectionSummary] = useState(
    'Detection has not run yet.',
  );
  const [lastOcrSummary, setLastOcrSummary] = useState('No OCR response yet.');
  const [lastOcrCandidates, setLastOcrCandidates] = useState<
    ScannerRecognitionCandidate[]
  >([]);
  const [lastOcrDebugRegions, setLastOcrDebugRegions] = useState<
    ScannerRecognitionDebugRegion[]
  >([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [sessionRows, setSessionRows] = useState<ScanSessionRow[]>([]);
  const [scanFeedback, setScanFeedback] = useState(
    'Start the camera and hold a card in view.',
  );
  const [isReviewing, setIsReviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [focusMode, setFocusMode] = useState<string | null>(null);
  const [canUsePointFocus, setCanUsePointFocus] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayFit, setDisplayFit] = useState<DisplayFit>('fit');
  const [diagnostics, setDiagnostics] = useState(
    'Camera diagnostics will appear after Start.',
  );
  const inFlightRecognitionRef = useRef(false);
  const stabilizerRef = useRef<StabilizerState>(createInitialStabilizerState());

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    inFlightRecognitionRef.current = false;
    stabilizerRef.current = createInitialStabilizerState();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setFocusMode(null);
    setCanUsePointFocus(false);
    setCameraState('idle');
  };

  const handleExit = () => {
    stopCamera();
    onExit?.();
  };

  const handleDone = () => {
    stopCamera();
    setIsReviewing(true);
  };

  useEffect(() => stopCamera, []);

  const rowFromCandidate = (
    candidate: ScannerRecognitionCandidate,
    key: string,
  ): ScanSessionRow => ({
    key,
    catalogCardId: candidate.match?.catalogCardId,
    name:
      candidate.match?.name ||
      [candidate.setCode, candidate.number].filter(Boolean).join(' ') ||
      candidate.rawText ||
      'Unresolved card',
    setCode: candidate.match?.setCode ?? candidate.setCode,
    number: candidate.match?.number ?? candidate.number,
    quantity: 1,
    confidence: candidate.confidence,
    status: candidate.match?.catalogCardId
      ? 'resolved'
      : candidate.status === 'ambiguous'
        ? 'ambiguous'
        : 'unresolved',
    lastSeenAt: Date.now(),
  });

  const formatConfidence = (confidence: number | null | undefined) =>
    confidence == null ? '' : ` (${Math.round(confidence * 100)}%)`;

  const formatParsedAttempt = (attempt: ScannerParsedAttempt) => {
    if (typeof attempt === 'string') {
      return attempt;
    }

    const parsed = [attempt.setCode, attempt.number].filter(Boolean).join(' ');
    const fallback = attempt.normalized || attempt.key || attempt.rawText || 'unparsed';
    const correctedFrom = [
      attempt.correctedFromSetCode,
      attempt.correctedFromNumber,
    ]
      .filter(Boolean)
      .join(' ');

    return correctedFrom
      ? `${parsed || fallback} (from ${correctedFrom})`
      : parsed || fallback;
  };

  const describeOcrCandidate = (
    candidate: ScannerRecognitionCandidate | undefined,
  ) => {
    if (!candidate) {
      return null;
    }

    const parsed = [
      candidate.match?.setCode ?? candidate.setCode,
      candidate.match?.number ?? candidate.number,
    ]
      .filter(Boolean)
      .join(' ');
    const correctedFrom = [
      candidate.correctedFromSetCode,
      candidate.correctedFromNumber,
    ]
      .filter(Boolean)
      .join(' ');
    const raw = parsed || candidate.rawText || candidate.match?.name || 'raw OCR empty';
    const correction = correctedFrom ? ` (from ${correctedFrom})` : '';
    return `${candidate.status}${formatConfidence(candidate.confidence)}: ${raw}${correction}`;
  };

  const describeOcrDebugRegion = (
    debugRegion: ScannerRecognitionDebugRegion | undefined,
  ) => {
    if (!debugRegion) {
      return 'Waiting for OCR debug for this crop.';
    }

    const raw = debugRegion.rawText?.trim() || 'raw OCR empty';
    const attempts = debugRegion.parsedAttempts?.length
      ? ` attempts: ${debugRegion.parsedAttempts.map(formatParsedAttempt).join(', ')}`
      : '';
    const errors = debugRegion.errors?.length
      ? ` errors: ${debugRegion.errors.join('; ')}`
      : '';
    return `raw${formatConfidence(debugRegion.confidence)}: ${raw}${attempts}${errors}`;
  };

  const getRegionDebug = (index: number) =>
    lastOcrDebugRegions.find((debugRegion) => debugRegion.index === index);

  const summarizeRecognition = (
    candidates: ScannerRecognitionCandidate[],
    debugRegions: ScannerRecognitionDebugRegion[],
  ) => {
    if (debugRegions.length > 0) {
      return debugRegions
        .slice(0, 4)
        .map(
          (debugRegion) =>
            `${debugRegion.region} #${debugRegion.index + 1}: ${describeOcrDebugRegion(debugRegion)}`,
        )
        .join('\n');
    }

    if (candidates.length === 0) {
      return 'Waiting for per-crop OCR debug.';
    }

    return candidates
      .slice(0, 4)
      .map((candidate) => `${candidate.region}: ${describeOcrCandidate(candidate)}`)
      .join('\n');
  };

  const addOrIncrementCandidate = (
    candidate: ScannerRecognitionCandidate,
    key: string,
  ) => {
    const nextRow = rowFromCandidate(candidate, key);
    setSessionRows((rows) => {
      const existing = rows.find((row) => row.key === key);

      if (!existing) {
        return [...rows, nextRow];
      }

      return rows.map((row) =>
        row.key === key
          ? {
              ...row,
              quantity: row.quantity + 1,
              confidence: candidate.confidence ?? row.confidence,
              lastSeenAt: Date.now(),
              status: row.status === 'committed' ? row.status : nextRow.status,
            }
          : row,
      );
    });
    setScanFeedback(`Added ${nextRow.name}`);
  };

  const sampleLiveFrame = async () => {
    if (inFlightRecognitionRef.current || cameraState !== 'active') {
      return;
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    inFlightRecognitionRef.current = true;

    try {
      const extraction = await extractScannerRoisWithDebugFromVideo(video);
      const rois = extraction.rois;
      if (isSettingsOpen) {
        setLastRoiPreviews(rois);
        setLastRoiSource(extraction.source);
        setLastCardPreview(extraction.detection.cardPreview ?? null);
        setLastDetectionSummary(
          `${extraction.detection.status}${extraction.detection.confidence == null ? '' : ` · ${Math.round(extraction.detection.confidence * 100)}%`} · ${Math.round(extraction.detection.processingMs)}ms${extraction.detection.reason ? ` · ${extraction.detection.reason}` : ''}`,
        );
      }
      const result = await recognizer.recognize(rois);
      const candidates = result.candidates ?? [];
      const debugRegions = result.debug?.regions ?? [];
      setLastOcrCandidates(candidates);
      setLastOcrDebugRegions(debugRegions);
      setLastOcrSummary(summarizeRecognition(candidates, debugRegions));
      const candidate = selectBestScannerCandidate(result);
      const resolvedKey = candidate ? makeResolvedScannerKey(candidate) : null;
      const decision = updateScannerStabilizer(
        stabilizerRef.current,
        resolvedKey,
      );
      stabilizerRef.current = decision.state;

      if (decision.shouldAdd && candidate && resolvedKey) {
        addOrIncrementCandidate(candidate, resolvedKey);
      } else if (candidate?.status === 'unresolved') {
        setScanFeedback(
          candidate.rawText
            ? `Read “${candidate.rawText}” — not matched yet`
            : 'Card text detected, but no match yet.',
        );
      } else if (resolvedKey) {
        setScanFeedback('Card detected — hold steady…');
      } else {
        setScanFeedback('Looking for the card ID…');
      }
    } catch (error) {
      setScanFeedback(
        error instanceof Error ? error.message : 'Live scan failed.',
      );
    } finally {
      inFlightRecognitionRef.current = false;
    }
  };

  useEffect(() => {
    if (cameraState !== 'active' || isReviewing) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void sampleLiveFrame();
    }, SCAN_SAMPLE_INTERVAL_MS);

    void sampleLiveFrame();

    return () => window.clearInterval(intervalId);
    // sampleLiveFrame reads refs plus current scanner state; restarting only when
    // camera/review/recognizer/debug panel changes avoids resetting the scan cadence on each row update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState, isReviewing, recognizer, isSettingsOpen]);

  const getVideoTrack = () => streamRef.current?.getVideoTracks()[0];

  const getCameraCapabilities = (track: MediaStreamTrack) =>
    track.getCapabilities?.() as CameraCapabilities | undefined;

  const updateDiagnostics = (
    track: MediaStreamTrack | undefined,
    note?: string,
  ) => {
    if (!track) {
      setDiagnostics(note ?? 'No active camera track.');
      return;
    }

    const settings = track.getSettings?.();
    const capabilities = getCameraCapabilities(track);
    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints?.() as
        | SupportedCameraConstraints
        | undefined;

    setDiagnostics(
      [
        note,
        `label: ${track.label || '(unlabeled camera)'}`,
        `deviceId: ${settings?.deviceId ?? '(not reported)'}`,
        `width: ${settings?.width ?? '-'} height: ${settings?.height ?? '-'}`,
        `frameRate: ${settings?.frameRate ?? '-'}`,
        `facingMode: ${settings?.facingMode ?? '-'}`,
        `zoom: ${(settings as { zoom?: number } | undefined)?.zoom ?? '-'}`,
        `focusMode: ${(settings as { focusMode?: string } | undefined)?.focusMode ?? '-'}`,
        `capabilities.zoom: ${capabilities?.zoom ? `${capabilities.zoom.min}-${capabilities.zoom.max}` : '-'}`,
        `capabilities.focusMode: ${capabilities?.focusMode?.join(', ') ?? '-'}`,
        `capabilities.pointsOfInterest: ${String(Boolean(capabilities?.pointsOfInterest))}`,
        `supported.pointsOfInterest: ${String(Boolean(supportedConstraints?.pointsOfInterest))}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  };

  const refreshVideoDevices = async () => {
    if (!navigator.mediaDevices.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    setVideoDevices(devices.filter((device) => device.kind === 'videoinput'));
  };

  const applyNativeZoom = async (
    track: MediaStreamTrack,
    capabilities: CameraCapabilities | undefined,
  ) => {
    const nativeZoom = capabilities?.zoom;

    if (
      !nativeZoom ||
      !Number.isFinite(nativeZoom.min) ||
      !Number.isFinite(nativeZoom.max) ||
      nativeZoom.max <= nativeZoom.min
    ) {
      return;
    }

    const preferredZoom = Math.min(
      nativeZoom.max,
      Math.max(nativeZoom.min, PREFERRED_CAMERA_ZOOM),
    );

    try {
      await track.applyConstraints({
        advanced: [{ zoom: preferredZoom } as CameraConstraintSet],
      });
    } catch {
      updateDiagnostics(
        track,
        `zoom constraint rejected for ${preferredZoom}x`,
      );
    }
  };

  const canApplyPointFocus = (capabilities: CameraCapabilities | undefined) => {
    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints?.() as
        | SupportedCameraConstraints
        | undefined;

    return Boolean(
      capabilities?.pointsOfInterest || supportedConstraints?.pointsOfInterest,
    );
  };

  const getPreferredFocusMode = (
    capabilities: CameraCapabilities | undefined,
  ) => {
    const modes = capabilities?.focusMode ?? [];

    if (modes.includes('continuous')) {
      return 'continuous';
    }

    if (modes.includes('single-shot')) {
      return 'single-shot';
    }

    return null;
  };

  const applyFocusMode = async (
    track: MediaStreamTrack,
    mode: string | null,
  ) => {
    if (!mode) {
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [{ focusMode: mode } as CameraConstraintSet],
      });
    } catch {
      updateDiagnostics(track, `focus constraint rejected for ${mode}`);
    }
  };

  const refocusCamera = async () => {
    const track = getVideoTrack();

    if (!track) {
      return;
    }

    await applyFocusMode(track, focusMode);
  };

  const focusAtPoint = async (x: number, y: number) => {
    const track = getVideoTrack();

    if (!track || !focusMode) {
      return;
    }

    const pointFocusMode =
      focusMode === 'single-shot' ? 'single-shot' : 'continuous';

    try {
      await track.applyConstraints({
        advanced: [
          {
            focusMode: pointFocusMode,
            pointsOfInterest: [{ x, y }],
          } as CameraConstraintSet,
        ],
      });
    } catch {
      updateDiagnostics(track, 'tap-to-focus point constraint rejected');
      await applyFocusMode(track, focusMode);
    }
  };

  const handlePreviewFocus = (event: PointerEvent<HTMLDivElement>) => {
    if (!canUsePointFocus || cameraState !== 'active') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    void focusAtPoint(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  };

  const startCamera = async (deviceId = selectedDeviceId) => {
    const availability = getCameraAvailability({
      isSecureContext: window.isSecureContext,
      mediaDevices: navigator.mediaDevices,
    });

    if (!availability.ok) {
      setCameraState('error');
      setMessage(
        availability.reason === 'insecure-context'
          ? 'Camera access requires HTTPS or localhost. Open this app from a secure address on your phone.'
          : 'This browser does not support camera access from web pages.',
      );
      return;
    }

    setCameraState('starting');
    setMessage(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1440 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1440 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      streamRef.current = stream;
      await refreshVideoDevices();

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack
        ? getCameraCapabilities(videoTrack)
        : undefined;
      const preferredFocusMode = getPreferredFocusMode(capabilities);
      const pointFocusSupported = canApplyPointFocus(capabilities);
      const trackSettings = videoTrack?.getSettings?.();
      setFocusMode(preferredFocusMode);
      setCanUsePointFocus(Boolean(preferredFocusMode && pointFocusSupported));
      setSelectedDeviceId(deviceId || trackSettings?.deviceId || '');

      if (videoTrack) {
        await applyFocusMode(videoTrack, preferredFocusMode);
        await applyNativeZoom(videoTrack, capabilities);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (videoTrack) {
        await applyFocusMode(videoTrack, preferredFocusMode);
        updateDiagnostics(videoTrack);
      }

      setCameraState('active');
    } catch (error) {
      stopCamera();
      setCameraState('error');
      setMessage(getCameraErrorMessage(error));
      setDiagnostics(
        error instanceof Error ? error.message : 'Camera start failed.',
      );
    }
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  const captureFrame = () => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setMessage('Camera preview is not ready yet. Try again in a moment.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      setMessage('Unable to capture a preview frame in this browser.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedFrame(canvas.toDataURL('image/jpeg', 0.9));
    void extractScannerRoisWithDebugFromVideo(video)
      .then((extraction) => {
        setLastRoiPreviews(extraction.rois);
        setLastRoiSource(extraction.source);
        setLastCardPreview(extraction.detection.cardPreview ?? null);
        setLastDetectionSummary(
          `${extraction.detection.status}${extraction.detection.confidence == null ? '' : ` · ${Math.round(extraction.detection.confidence * 100)}%`} · ${Math.round(extraction.detection.processingMs)}ms${extraction.detection.reason ? ` · ${extraction.detection.reason}` : ''}`,
        );
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to capture scan region previews.',
        ),
      );
    setCaptureCount((count) => count + 1);
    setMessage(
      'Debug frame and scan regions captured locally for preview only. Nothing was uploaded.',
    );
  };

  const undoLast = () => {
    setSessionRows((rows) => {
      const last = rows.at(-1);
      if (!last) {
        return rows;
      }

      if (last.quantity > 1) {
        return rows.map((row) =>
          row.key === last.key ? { ...row, quantity: row.quantity - 1 } : row,
        );
      }

      return rows.slice(0, -1);
    });
  };

  const removeRow = (key: string) => {
    setSessionRows((rows) => rows.filter((row) => row.key !== key));
  };

  const updateRowQuantity = (key: string, quantity: number) => {
    setSessionRows((rows) =>
      rows.map((row) =>
        row.key === key
          ? { ...row, quantity: Math.max(1, Math.floor(quantity) || 1) }
          : row,
      ),
    );
  };

  const addToCollection = async () => {
    const resolvedRows = sessionRows.filter(
      (row) => row.catalogCardId && row.status !== 'committed',
    );

    if (resolvedRows.length === 0) {
      setMessage('No resolved cards are ready to add.');
      return;
    }

    setIsCommitting(true);
    setMessage(null);

    try {
      const collections = await api.getCollections();
      const defaultCollection =
        collections.collections.find((collection) => collection.isDefault) ??
        collections.collections[0];

      if (!defaultCollection) {
        throw new Error('No collection is available yet.');
      }

      await api.addCollectionItemsBulk(defaultCollection.id, {
        items: resolvedRows.map((row) => ({
          catalogCardId: row.catalogCardId as number | string,
          quantity: row.quantity,
          condition: 'Near Mint',
          finish: 'normal',
          language: 'English',
          source: 'scanner',
        })),
      });

      setSessionRows((rows) =>
        rows.map((row) =>
          row.catalogCardId ? { ...row, status: 'committed' } : row,
        ),
      );
      setMessage(`Added ${resolvedRows.length} card group(s) to collection.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Add to collection failed.',
      );
    } finally {
      setIsCommitting(false);
    }
  };

  if (isReviewing) {
    const resolvedCount = sessionRows.filter((row) => row.catalogCardId).length;

    return (
      <section
        className="scan-section scan-review-section"
        aria-label="Scan review"
      >
        <div className="scan-review-header">
          <button
            type="button"
            className="scan-exit-button"
            onClick={handleExit}
          >
            ← Back to App
          </button>
          <div>
            <span className="scan-context-label">Scan session done</span>
            <h2>Review Captured Cards</h2>
          </div>
          <button
            type="button"
            className="scan-control-button"
            onClick={() => {
              setIsReviewing(false);
              void startCamera();
            }}
          >
            Resume
          </button>
        </div>

        <div className="scan-review-card">
          <div className="scan-review-summary">
            <strong>
              {sessionRows.reduce((sum, row) => sum + row.quantity, 0)} cards
            </strong>
            <span>{resolvedCount} resolved groups</span>
          </div>

          {sessionRows.length === 0 ? (
            <p className="scan-review-empty">
              No cards were detected in this session.
            </p>
          ) : (
            <ul className="scan-review-list" aria-label="Captured cards">
              {sessionRows.map((row) => (
                <li key={row.key} className="scan-review-row">
                  <div>
                    <strong>{row.name}</strong>
                    <span>
                      {[row.setCode, row.number].filter(Boolean).join(' · ') ||
                        row.key}
                    </span>
                    <small>
                      {row.status} · confidence{' '}
                      {row.confidence == null
                        ? '-'
                        : `${Math.round(row.confidence * 100)}%`}
                    </small>
                  </div>
                  <label>
                    Qty
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(event) =>
                        updateRowQuantity(row.key, Number(event.target.value))
                      }
                    />
                  </label>
                  <button type="button" onClick={() => removeRow(row.key)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <div className="scan-message scan-review-message" role="status">
              {message}
            </div>
          )}

          <div className="scan-review-actions">
            <button
              type="button"
              className="scan-control-button"
              onClick={undoLast}
              disabled={sessionRows.length === 0}
            >
              Undo Last
            </button>
            <button
              type="button"
              className="scan-capture-button scan-add-collection-button"
              onClick={() => void addToCollection()}
              disabled={isCommitting || resolvedCount === 0}
            >
              <span>{isCommitting ? 'Adding…' : 'Add to Collection'}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="scan-section" aria-label="Scan and add cards">
      <div className="scan-topbar">
        <button type="button" className="scan-exit-button" onClick={handleExit}>
          ← Back to App
        </button>
        <div className="scan-title-block">
          <span className="scan-context-label">Riftbound duplicates</span>
          <h2>Scan / Add Cards</h2>
        </div>
        <button
          type="button"
          className="scan-settings-summary"
          onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
          aria-expanded={isSettingsOpen}
          aria-label="Camera settings"
        >
          Camera
        </button>
      </div>

      {isSettingsOpen && (
        <aside className="scan-settings-panel" aria-label="Scanner settings">
          <label>
            Camera / lens
            <select
              value={selectedDeviceId}
              onChange={(event) => handleDeviceChange(event.target.value)}
              disabled={cameraState === 'starting' || videoDevices.length === 0}
            >
              <option value="">Default rear camera</option>
              {videoDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preview framing
            <select
              value={displayFit}
              onChange={(event) =>
                setDisplayFit(event.target.value as DisplayFit)
              }
            >
              <option value="fit">Fit frame (less cropped)</option>
              <option value="fill">Fill screen (cropped)</option>
            </select>
          </label>
          <pre className="scan-diagnostics">{diagnostics}</pre>
          <div className="scan-debug-panel" aria-label="Scanner debug details">
            <strong>What OCR sees</strong>
            <span className="scan-debug-note">
              Mode: {lastRoiSource ?? 'waiting'} · If the ID is not visible
              here, framing/crop is wrong. If it is visible but raw OCR is empty
              or wrong, OCR tuning is next.
            </span>
            <pre>{lastDetectionSummary}</pre>
            {lastCardPreview && (
              <figure className="scan-card-preview">
                <img src={lastCardPreview} alt="Detected normalized card crop" />
                <figcaption>Detected card crop used for card-relative ROIs</figcaption>
              </figure>
            )}
            <pre>{lastOcrSummary}</pre>
            {lastOcrCandidates.length > 0 && (
              <div className="scan-candidate-list" aria-label="Overall OCR candidates">
                <strong>Overall candidates</strong>
                {lastOcrCandidates.slice(0, 4).map((candidate, index) => (
                  <span key={`${candidate.region}-${candidate.key ?? index}`}>
                    {candidate.region}: {describeOcrCandidate(candidate)}
                  </span>
                ))}
              </div>
            )}
            {lastRoiPreviews.length > 0 && (
              <div className="scan-roi-grid" aria-label="What OCR sees previews">
                {lastRoiPreviews.map((roi, index) => {
                  const roiDebug = getRegionDebug(index);
                  const label = roi.label ?? `${roi.region} #${index + 1}`;

                  return (
                    <figure key={`${roi.region}-${index}`}>
                      <a
                        href={roi.image}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${label} OCR crop full size`}
                      >
                        <img src={roi.image} alt={`${label} OCR crop`} />
                      </a>
                      <figcaption>
                        <strong>{label}</strong>
                        <span>{describeOcrDebugRegion(roiDebug)}</span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="scan-layout">
        <div className="scan-camera-card">
          <div
            className={`scan-preview-shell ${canUsePointFocus ? 'scan-preview-tap-focus' : ''}`}
            onPointerDown={handlePreviewFocus}
          >
            <video
              ref={videoRef}
              className={`scan-video scan-video-${displayFit}`}
              playsInline
              muted
              autoPlay
              aria-label="Live camera preview"
              onLoadedMetadata={() => {
                void refocusCamera();
                updateDiagnostics(getVideoTrack());
              }}
            />
            {cameraState !== 'active' && (
              <div className="scan-placeholder">
                <span>📷</span>
                <p>Start the camera to open the scanner preview.</p>
              </div>
            )}
            <div
              className="scan-status-pill"
              aria-label="Scan session status"
              aria-live="polite"
            >
              <span>
                {cameraState === 'active'
                  ? 'Camera ready'
                  : cameraState === 'starting'
                    ? 'Starting camera…'
                    : 'Camera off'}
              </span>
              <strong>
                {sessionRows.reduce((sum, row) => sum + row.quantity, 0)} added
                · {captureCount} debug
              </strong>
            </div>
            {focusMode && cameraState === 'active' && (
              <button
                type="button"
                className="scan-focus-button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => void refocusCamera()}
              >
                Focus
              </button>
            )}
          </div>

          {capturedFrame && (
            <div
              className="scan-capture-preview"
              aria-label="Latest local preview"
            >
              <img src={capturedFrame} alt="Captured card preview" />
              <button
                type="button"
                className="scan-clear-preview"
                onClick={() => setCapturedFrame(null)}
              >
                Clear
              </button>
            </div>
          )}

          <div className="scan-live-feedback" role="status" aria-live="polite">
            {scanFeedback}
          </div>

          {sessionRows.length > 0 && (
            <div
              className="scan-session-tray"
              aria-label="Captured session cards"
            >
              <strong>
                {sessionRows.reduce((sum, row) => sum + row.quantity, 0)}{' '}
                captured
              </strong>
              <button type="button" onClick={undoLast}>
                Undo
              </button>
            </div>
          )}

          {message && (
            <div
              className={`scan-message ${cameraState === 'error' ? 'scan-message-error' : ''}`}
              role={cameraState === 'error' ? 'alert' : 'status'}
            >
              {message}
            </div>
          )}

          <div className="scan-actions" aria-label="Scanner controls">
            {cameraState === 'active' ? (
              <button
                type="button"
                className="scan-control-button scan-control-secondary"
                onClick={stopCamera}
                aria-label="Stop camera"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="scan-control-button scan-control-secondary"
                onClick={() => void startCamera()}
                disabled={cameraState === 'starting'}
                aria-label="Start camera"
              >
                {cameraState === 'starting' ? 'Starting…' : 'Start'}
              </button>
            )}
            <button
              type="button"
              className="scan-capture-button scan-debug-capture-button"
              onClick={captureFrame}
              disabled={cameraState !== 'active'}
              aria-label="Capture frame debug fallback"
            >
              <span>Debug</span>
            </button>
            <button
              type="button"
              className="scan-control-button scan-control-secondary"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
