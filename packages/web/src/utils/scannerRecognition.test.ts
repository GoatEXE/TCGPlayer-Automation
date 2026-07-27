import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractScannerRoisFromVideo,
  selectBestScannerCandidate,
  updateScannerStabilizer,
  createInitialStabilizerState,
  makeResolvedScannerKey,
  preprocessScannerRoiCanvas,
  detectCardBoundsFromCanvas,
} from './scannerRecognition';

describe('scannerRecognition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('selects the highest-confidence resolved candidate', () => {
    expect(
      selectBestScannerCandidate({
        candidates: [
          { region: 'bottom-left', status: 'unresolved', confidence: 0.9 },
          {
            region: 'bottom-right',
            status: 'resolved',
            confidence: 0.55,
            match: { catalogCardId: 'a', name: 'A' },
          },
          {
            region: 'bottom-left',
            status: 'resolved',
            confidence: 0.8,
            match: { catalogCardId: 'b', name: 'B' },
          },
        ],
      })?.match?.name,
    ).toBe('B');
  });

  it('ignores OCR noise candidates that do not include a parsed card identifier', () => {
    const noisyCandidate = {
      region: 'bottom-left' as const,
      status: 'unresolved' as const,
      key: 'bottom-left:0',
      rawText: 'level page_num block_num par_num line_num word_num',
    };

    expect(
      selectBestScannerCandidate({ candidates: [noisyCandidate] }),
    ).toBeNull();
    expect(makeResolvedScannerKey(noisyCandidate)).toBeNull();
  });

  it('keeps unresolved card-like detections eligible for stabilization', () => {
    const candidate = {
      region: 'bottom-left' as const,
      status: 'unresolved' as const,
      key: 'UNL:2/219',
      setCode: 'UNL',
      number: '002/219',
    };

    expect(selectBestScannerCandidate({ candidates: [candidate] })).toBe(
      candidate,
    );
    expect(makeResolvedScannerKey(candidate)).toBe('unl:2/219');
  });

  it('requires repeated stable keys, latches, and resets after absence', () => {
    let state = createInitialStabilizerState();

    let decision = updateScannerStabilizer(state, 'catalog:1');
    expect(decision.shouldAdd).toBe(false);
    state = decision.state;

    decision = updateScannerStabilizer(state, 'catalog:1');
    expect(decision.shouldAdd).toBe(true);
    state = decision.state;

    decision = updateScannerStabilizer(state, 'catalog:1');
    expect(decision.shouldAdd).toBe(false);
    state = decision.state;

    state = updateScannerStabilizer(state, null).state;
    state = updateScannerStabilizer(state, null).state;

    decision = updateScannerStabilizer(state, 'catalog:1');
    state = decision.state;
    decision = updateScannerStabilizer(state, 'catalog:1');
    expect(decision.shouldAdd).toBe(true);
  });

  it('extracts forgiving bottom ID and bottom-right ROI images from a video frame', async () => {
    const drawImage = vi.fn();
    const translate = vi.fn();
    const rotate = vi.fn();
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,roi');
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, translate, rotate, fillRect: vi.fn(), fillStyle: '' }),
        toDataURL,
      } as unknown as HTMLCanvasElement;
    });

    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 1000 });
    Object.defineProperty(video, 'videoHeight', { value: 1600 });

    const rois = await extractScannerRoisFromVideo(video);

    expect(rois).toEqual([
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
    expect(drawImage).toHaveBeenCalledTimes(5);
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 1000, 1600);
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      video,
      30,
      1416,
      560,
      152,
      0,
      0,
      1680,
      456,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      3,
      video,
      30,
      1184,
      700,
      384,
      0,
      0,
      2100,
      1152,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      4,
      video,
      620,
      992,
      240,
      576,
      0,
      0,
      1440,
      3456,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      5,
      video,
      540,
      992,
      320,
      544,
      0,
      0,
      1280,
      2176,
    );
    expect(translate).toHaveBeenCalledWith(3600, 144);
    expect(translate).toHaveBeenCalledWith(2272, 96);
    expect(rotate).toHaveBeenCalledTimes(2);
    expect(rotate).toHaveBeenCalledWith(Math.PI / 2);
  });

  it('extracts card-relative ROIs when a card-like frame is detected', async () => {
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
      data[index] = 245;
      data[index + 1] = 245;
      data[index + 2] = 245;
      data[index + 3] = 255;
    }

    for (let y = 20; y < 82; y += 1) {
      for (let x = 28; x < 72; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 80;
        data[index + 1] = 110;
        data[index + 2] = 150;
        data[index + 3] = 255;
      }
    }

    const drawImage = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage,
          translate: vi.fn(),
          rotate: vi.fn(),
          fillRect: vi.fn(),
          fillStyle: '',
          getImageData: () => ({ data: new Uint8ClampedArray(data) }),
          putImageData: vi.fn(),
        }),
        toDataURL: () => 'data:image/jpeg;base64,roi',
      } as unknown as HTMLCanvasElement;
    });

    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: width });
    Object.defineProperty(video, 'videoHeight', { value: height });

    const rois = await extractScannerRoisFromVideo(video);

    expect(rois).toHaveLength(4);
    expect(rois.every((roi) => roi.source === 'lightweight')).toBe(true);
    expect(rois[0]).toMatchObject({
      region: 'bottom-left-strip',
      label: 'bottom-left ID only',
    });
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      0,
      0,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('detects a card-like bounding box from a bright frame', () => {
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let index = 0; index < data.length; index += 4) {
      data[index] = 245;
      data[index + 1] = 245;
      data[index + 2] = 245;
      data[index + 3] = 255;
    }

    for (let y = 20; y < 82; y += 1) {
      for (let x = 28; x < 72; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 80;
        data[index + 1] = 110;
        data[index + 2] = 150;
        data[index + 3] = 255;
      }
    }

    const canvas = {
      width,
      height,
      getContext: () => ({
        getImageData: () => ({ data }),
      }),
    } as unknown as HTMLCanvasElement;

    const bounds = detectCardBoundsFromCanvas(canvas);

    expect(bounds).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(bounds?.x).toBeLessThanOrEqual(28);
    expect(bounds?.y).toBeLessThanOrEqual(20);
    expect(bounds?.width).toBeGreaterThan(44);
    expect(bounds?.height).toBeGreaterThan(62);
  });

  it('converts bright-on-dark ROI pixels to high-contrast dark text on white', () => {
    const imageData = {
      data: new Uint8ClampedArray([
        240, 240, 240, 255,
        20, 20, 20, 255,
      ]),
    } as ImageData;
    const putImageData = vi.fn();
    const canvas = {
      width: 2,
      height: 1,
      getContext: () => ({
        getImageData: () => imageData,
        putImageData,
      }),
    } as unknown as HTMLCanvasElement;

    preprocessScannerRoiCanvas(canvas, { threshold: 145, invert: true });

    expect(Array.from(imageData.data)).toEqual([
      0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    expect(putImageData).toHaveBeenCalledWith(imageData, 0, 0);
  });
});
