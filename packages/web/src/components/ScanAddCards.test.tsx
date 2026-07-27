import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ScanAddCards } from './ScanAddCards';

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value,
  });
}

function setMediaDevices(mediaDevices: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices,
  });
}

describe('ScanAddCards', () => {
  it('renders full-screen scanner chrome with compact overlaid status', () => {
    render(<ScanAddCards />);

    expect(
      screen.getByRole('heading', { name: /scan \/ add cards/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /camera settings/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/scan session status/i)).toHaveTextContent(
      /0 added · 0 debug/i,
    );
    expect(screen.getByLabelText(/live camera preview/i)).toHaveClass(
      'scan-video-fit',
    );
    expect(screen.queryByText(/market total/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/positioning guide/i)).not.toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setMediaDevices(undefined);
    setSecureContext(true);
  });

  it('shows a secure-context camera warning before requesting permission', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    setSecureContext(false);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /requires HTTPS or localhost/i,
    );
  });

  it('applies fixed 1.0x native zoom when the active camera supports it', async () => {
    const user = userEvent.setup();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const track = {
      applyConstraints,
      getCapabilities: () => ({ zoom: { min: 1, max: 3, step: 0.1 } }),
      stop,
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));

    expect(await screen.findByText(/camera ready/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/native camera zoom/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/native zoom level/i),
    ).not.toBeInTheDocument();
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: 1 }],
    });
  });

  it('clamps fixed native zoom when the camera min is above 1.0x', async () => {
    const user = userEvent.setup();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      applyConstraints,
      getCapabilities: () => ({ zoom: { min: 1.1, max: 1.4 } }),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));

    expect(await screen.findByText(/camera ready/i)).toBeInTheDocument();
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: 1.1 }],
    });
  });

  it('lists cameras in settings, shows diagnostics, and restarts with selected deviceId', async () => {
    const user = userEvent.setup();
    const firstTrackStop = vi.fn();
    const secondTrackStop = vi.fn();
    const makeTrack = (label: string, deviceId: string, stop: () => void) => ({
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({ zoom: { min: 1, max: 2 } }),
      getSettings: () => ({
        deviceId,
        facingMode: 'environment',
        frameRate: 30,
        height: 1080,
        width: 1920,
      }),
      label,
      stop,
    });
    const firstTrack = makeTrack('Back Camera', 'back-1', firstTrackStop);
    const secondTrack = makeTrack('Macro Camera', 'macro-2', secondTrackStop);
    const firstStream = {
      getTracks: () => [firstTrack],
      getVideoTracks: () => [firstTrack],
    } as unknown as MediaStream;
    const secondStream = {
      getTracks: () => [secondTrack],
      getVideoTracks: () => [secondTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);
    const enumerateDevices = vi.fn().mockResolvedValue([
      { deviceId: 'front-1', kind: 'videoinput', label: 'Front Camera' },
      { deviceId: 'macro-2', kind: 'videoinput', label: 'Macro Camera' },
      { deviceId: 'mic-1', kind: 'audioinput', label: 'Mic' },
    ]);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    setSecureContext(true);
    setMediaDevices({ enumerateDevices, getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));
    await user.click(screen.getByRole('button', { name: /camera settings/i }));

    expect(await screen.findByLabelText(/scanner settings/i)).toHaveTextContent(
      /Back Camera/i,
    );
    expect(screen.getByLabelText(/scanner settings/i)).toHaveTextContent(
      /width: 1920 height: 1080/i,
    );
    expect(screen.getByLabelText(/preview framing/i)).toHaveValue('fit');

    await user.selectOptions(screen.getByLabelText(/preview framing/i), 'fill');

    expect(screen.getByLabelText(/live camera preview/i)).toHaveClass(
      'scan-video-fill',
    );

    await user.selectOptions(
      screen.getByLabelText(/camera \/ lens/i),
      'macro-2',
    );

    expect(firstTrackStop).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: {
        deviceId: { exact: 'macro-2' },
        width: { ideal: 1440 },
        height: { ideal: 1920 },
        aspectRatio: { ideal: 9 / 16 },
      },
    });
    expect(screen.getByLabelText(/scanner settings/i)).toHaveTextContent(
      /label: Macro Camera/i,
    );
  });

  it('applies continuous autofocus and exposes a compact focus button when supported', async () => {
    const user = userEvent.setup();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      applyConstraints,
      getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));

    expect(
      await screen.findByRole('button', { name: /focus/i }),
    ).toBeInTheDocument();
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });

    expect(applyConstraints).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: /focus/i }));

    expect(applyConstraints).toHaveBeenCalledTimes(3);
  });

  it('uses point focus when tapping the preview and the browser advertises support', async () => {
    const user = userEvent.setup();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      applyConstraints,
      getCapabilities: () => ({
        focusMode: ['continuous'],
        pointsOfInterest: true,
      }),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    const { container } = render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));
    await screen.findByRole('button', { name: /focus/i });

    const preview = container.querySelector('.scan-preview-shell');
    expect(preview).toBeTruthy();
    vi.spyOn(preview as Element, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(preview as Element, { clientX: 25, clientY: 50 });

    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [
        {
          focusMode: 'continuous',
          pointsOfInterest: [{ x: 0.25, y: 0.25 }],
        },
      ],
    });
  });

  it('auto-adds a stable live recognition without pressing capture', async () => {
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recognizer = {
      recognize: vi.fn().mockResolvedValue({
        candidates: [
          {
            region: 'bottom-left',
            status: 'resolved',
            key: 'RB-001',
            confidence: 0.92,
            match: {
              catalogCardId: 'card-1',
              name: 'Poro Herder',
              setCode: 'RBT',
              number: '001',
            },
          },
        ],
      }),
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      value: 1600,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(), fillStyle: '' }),
        toDataURL: () => 'data:image/jpeg;base64,roi',
      } as unknown as HTMLCanvasElement;
    });
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards recognizer={recognizer} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    expect(
      await screen.findByText(/added poro herder/i, {}, { timeout: 2500 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/captured session cards/i)).toHaveTextContent(
      /1 captured/i,
    );
    expect(recognizer.recognize).toHaveBeenCalledTimes(2);
    expect(recognizer.recognize).toHaveBeenCalledWith([
      {
        region: 'bottom-left-strip',
        source: 'fixed fallback',
        image: 'data:image/jpeg;base64,roi',
      },
      {
        region: 'bottom-left',
        source: 'fixed fallback',
        image: 'data:image/jpeg;base64,roi',
      },
      {
        region: 'bottom-right',
        label: 'bottom-right ID only',
        source: 'fixed fallback',
        image: 'data:image/jpeg;base64,roi',
      },
      {
        region: 'bottom-right',
        label: 'bottom-right wide',
        source: 'fixed fallback',
        image: 'data:image/jpeg;base64,roi',
      },
    ]);

    await waitFor(() => expect(recognizer.recognize).toHaveBeenCalledTimes(3), {
      timeout: 2500,
    });
    expect(screen.getByLabelText(/captured session cards/i)).toHaveTextContent(
      /1 captured/i,
    );
  });

  it('does not add OCR TSV/header noise to the review session', async () => {
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recognizer = {
      recognize: vi.fn().mockResolvedValue({
        candidates: [
          {
            region: 'bottom-left',
            status: 'unresolved',
            key: 'bottom-left:0',
            confidence: 0,
            rawText: 'level page_num block_num par_num line_num word_num',
          },
        ],
      }),
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      value: 1600,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(), fillStyle: '' }),
        toDataURL: () => 'data:image/jpeg;base64,roi',
      } as unknown as HTMLCanvasElement;
    });
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards recognizer={recognizer} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));
    await waitFor(() => expect(recognizer.recognize).toHaveBeenCalled(), {
      timeout: 2500,
    });

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(screen.getByText(/no cards were detected/i)).toBeInTheDocument();
    expect(screen.queryByText(/level page_num/i)).not.toBeInTheDocument();
  });

  it('shows debug ROI previews and last OCR text in camera settings', async () => {
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recognizer = {
      recognize: vi.fn().mockResolvedValue({
        candidates: [
          {
            region: 'bottom-left-strip',
            status: 'resolved',
            confidence: 0.42,
            rawText: 'UN 002/219',
            setCode: 'UNL',
            number: '002/219',
            correctedFromSetCode: 'UN',
          },
        ],
        debug: {
          regions: [
            {
              index: 0,
              region: 'bottom-left-strip',
              rawText: 'UNL • 002/219',
              confidence: 0.42,
              parsedAttempts: [
                {
                  setCode: 'UNL',
                  number: '002/219',
                  correctedFromSetCode: 'UN',
                },
              ],
              errors: [],
            },
            {
              index: 1,
              region: 'bottom-left',
              rawText: '',
              confidence: 0,
              parsedAttempts: [],
              errors: ['no text'],
            },
            {
              index: 2,
              region: 'bottom-right',
              rawText: '',
              confidence: 0,
              parsedAttempts: [],
              errors: [],
            },
            {
              index: 3,
              region: 'bottom-right',
              rawText: 'UNL • 209/219',
              confidence: 0.51,
              parsedAttempts: [
                { setCode: 'UN', number: '209/219' },
                { setCode: 'JNL', number: '209/719' },
              ],
              errors: [],
            },
          ],
        },
      }),
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      value: 1600,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(), fillStyle: '' }),
        toDataURL: () => 'data:image/jpeg;base64,roi',
      } as unknown as HTMLCanvasElement;
    });
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards recognizer={recognizer} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));
    await waitFor(() => expect(recognizer.recognize).toHaveBeenCalled(), {
      timeout: 2500,
    });
    fireEvent.click(screen.getByRole('button', { name: /capture frame debug/i }));
    fireEvent.click(screen.getByRole('button', { name: /camera settings/i }));

    expect(await screen.findByLabelText(/what ocr sees previews/i)).toBeInTheDocument();
    expect(screen.getByText(/if the id is not visible here/i)).toBeInTheDocument();
    expect(screen.getByAltText(/bottom-left #2 OCR crop/i)).toBeInTheDocument();
    expect(screen.getByAltText(/bottom-left-strip #1 OCR crop/i)).toBeInTheDocument();
    expect(screen.getByAltText(/bottom-right ID only OCR crop/i)).toBeInTheDocument();
    expect(screen.getByAltText(/bottom-right wide OCR crop/i)).toBeInTheDocument();
    expect(screen.getAllByText(/raw \(42%\): UNL • 002\/219 attempts: UNL 002\/219 \(from UN\)/i)).toHaveLength(2);
    expect(screen.getByLabelText(/overall ocr candidates/i)).toHaveTextContent(
      /bottom-left-strip: resolved \(42%\): UNL 002\/219 \(from UN\)/i,
    );
    expect(screen.queryByText(/candidate: resolved/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/raw \(0%\): raw OCR empty errors: no text/i)).toHaveLength(2);
    expect(screen.getAllByText(/raw \(51%\): UNL • 209\/219 attempts: UN 209\/219, JNL 209\/719/i)).toHaveLength(2);
  });

  it('shows captured rows in Done review and removes rows', async () => {
    const track = {
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      getCapabilities: () => ({}),
      stop: vi.fn(),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const recognizer = {
      recognize: vi.fn().mockResolvedValue({
        candidates: [
          {
            region: 'bottom-left',
            status: 'resolved',
            confidence: 0.9,
            match: { catalogCardId: 'card-2', name: 'Battle Cat' },
          },
        ],
      }),
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      value: 1600,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(), fillStyle: '' }),
        toDataURL: () => 'data:image/jpeg;base64,roi',
      } as unknown as HTMLCanvasElement;
    });
    setSecureContext(true);
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards recognizer={recognizer} />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));
    await screen.findByText(/added battle cat/i, {}, { timeout: 2500 });

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(
      screen.getByRole('heading', { name: /review captured cards/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/battle cat/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(screen.queryByText(/battle cat/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no cards were detected/i)).toBeInTheDocument();
  });

  it('shows a permission-denied message when the browser rejects camera access', async () => {
    const user = userEvent.setup();
    setSecureContext(true);
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    setMediaDevices({ getUserMedia });

    render(<ScanAddCards />);

    await user.click(screen.getByRole('button', { name: /start camera/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /permission was denied/i,
    );
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1440 },
        height: { ideal: 1920 },
        aspectRatio: { ideal: 9 / 16 },
      },
    });
  });
});
