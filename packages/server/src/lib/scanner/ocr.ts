import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCatalogCode } from '../catalog/normalize.js';
import type { DecodedImageDataUrl } from './data-url.js';

export type ScannerOcrRegion =
  | 'bottom-left'
  | 'bottom-left-strip'
  | 'bottom-right'
  | 'native';

export interface ScannerOcrInput extends DecodedImageDataUrl {
  region: ScannerOcrRegion;
}

export interface ScannerOcrResult {
  rawText: string;
  confidence: number;
}

export interface ScannerOcrService {
  recognize(input: ScannerOcrInput): Promise<ScannerOcrResult>;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const PREPROCESS_TIMEOUT_MS = 2_500;
const STATUS_TIMEOUT_MS = 1_500;
const OCR_CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-:#|';
const PRIMARY_PSM = '7';
const FALLBACK_PSM_VALUES = ['13', '11'] as const;
const BASE_PREPROCESS_VARIANTS = [
  'normalized-gray',
  'inverted-threshold',
] as const;
const HORIZONTAL_PREPROCESS_VARIANTS = [
  'bottom-slice',
  'bottom-slice-inverted-threshold',
] as const;
const BOTTOM_RIGHT_PREPROCESS_VARIANTS = [
  'left-id-crop',
  'left-id-crop-inverted-threshold',
] as const;

export type PreprocessVariant =
  | 'original'
  | (typeof BASE_PREPROCESS_VARIANTS)[number]
  | (typeof HORIZONTAL_PREPROCESS_VARIANTS)[number]
  | (typeof BOTTOM_RIGHT_PREPROCESS_VARIANTS)[number];

interface OcrImageInput {
  filePath: string;
  variant: PreprocessVariant;
}

interface PreprocessedImage extends OcrImageInput {
  variant: Exclude<PreprocessVariant, 'original'>;
}

export interface TesseractCliStatus {
  binary: string;
  available: boolean;
  version?: string;
}

export function getTesseractBinary(): string {
  return process.env.TESSERACT_BIN || 'tesseract';
}

export function getImageMagickBinary(): string {
  return process.env.IMAGEMAGICK_BIN || process.env.MAGICK_BIN || 'magick';
}

export function buildTesseractOcrArgs(
  filePath: string,
  psm = PRIMARY_PSM,
): string[] {
  return [
    filePath,
    'stdout',
    '--oem',
    '1',
    '--psm',
    psm,
    '-l',
    'eng',
    '-c',
    'user_defined_dpi=300',
    '-c',
    'preserve_interword_spaces=1',
    '-c',
    `tessedit_char_whitelist=${OCR_CHAR_WHITELIST}`,
    'tsv',
  ];
}

export function getPreprocessVariantsForRegion(
  region: ScannerOcrRegion,
): Array<Exclude<PreprocessVariant, 'original'>> {
  if (region === 'bottom-right') {
    return [...BASE_PREPROCESS_VARIANTS, ...BOTTOM_RIGHT_PREPROCESS_VARIANTS];
  }

  if (region === 'native') {
    return [...BASE_PREPROCESS_VARIANTS];
  }

  return [...BASE_PREPROCESS_VARIANTS, ...HORIZONTAL_PREPROCESS_VARIANTS];
}

export function buildImageMagickPreprocessArgs(
  inputPath: string,
  outputPath: string,
  variant: PreprocessVariant,
): string[] {
  const cropArgs = variant.startsWith('bottom-slice')
    ? ['-gravity', 'South', '-crop', '100%x45%+0+0', '+repage']
    : variant.startsWith('left-id-crop')
      ? ['-gravity', 'SouthWest', '-crop', '65%x45%+0+0', '+repage']
      : [];
  const resizeArgs =
    variant.startsWith('bottom-slice') || variant.startsWith('left-id-crop')
      ? ['-resize', '250%']
      : [];
  const isInvertedThreshold =
    variant === 'inverted-threshold' ||
    variant === 'bottom-slice-inverted-threshold' ||
    variant === 'left-id-crop-inverted-threshold';

  const commonArgs = [
    inputPath,
    '-auto-orient',
    ...cropArgs,
    ...resizeArgs,
    '-colorspace',
    'Gray',
    '-contrast-stretch',
    '1%x5%',
  ];

  if (isInvertedThreshold) {
    return [
      ...commonArgs,
      '-negate',
      '-threshold',
      '55%',
      '-strip',
      outputPath,
    ];
  }

  return [...commonArgs, '-strip', outputPath];
}

function extensionForMimeType(
  mimeType: DecodedImageDataUrl['mimeType'],
): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
  }
}

export function isPunctuationOnlyOcrText(rawText: string): boolean {
  const trimmed = rawText.trim();
  return trimmed !== '' && !/[A-Z0-9]/i.test(trimmed);
}

export function shouldRunFallbackOcrPasses(result: ScannerOcrResult): boolean {
  return parseCatalogCode(result.rawText) === null;
}

export function getFallbackPsmValues(): string[] {
  return [...FALLBACK_PSM_VALUES];
}

export function mergeScannerOcrResults(
  results: ScannerOcrResult[],
): ScannerOcrResult {
  const rawTexts = results
    .map((result) => result.rawText.trim())
    .filter(
      (rawText, index, values) =>
        rawText !== '' && values.indexOf(rawText) === index,
    );

  return {
    rawText: rawTexts.join('\n'),
    confidence:
      results.length > 0
        ? Math.max(...results.map((result) => result.confidence))
        : 0,
  };
}

export function parseTesseractTsvOutput(output: string): ScannerOcrResult {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  const headerColumns = lines[0]?.split('\t') ?? [];
  const confidenceIndex = headerColumns.indexOf('conf');
  const textIndex = headerColumns.indexOf('text');
  const words: string[] = [];
  const confidences: number[] = [];

  if (confidenceIndex === -1 || textIndex === -1) {
    return { rawText: '', confidence: 0 };
  }

  for (const line of lines.slice(1)) {
    const columns = line.split('\t');
    const confidence = Number.parseFloat(columns[confidenceIndex] || '');
    const text = columns.slice(textIndex).join('\t').trim();

    if (text !== '') {
      words.push(text);
    }

    if (text !== '' && Number.isFinite(confidence) && confidence >= 0) {
      confidences.push(confidence);
    }
  }

  return {
    rawText: words.join(' ').trim(),
    confidence:
      confidences.length > 0
        ? Math.round(
            confidences.reduce((total, value) => total + value, 0) /
              confidences.length,
          ) / 100
        : 0,
  };
}

async function spawnToExitCode(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { windowsHide: true });
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve(null);
      }
    }, timeoutMs);

    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function createPreprocessedImages(
  inputPath: string,
  region: ScannerOcrRegion,
): Promise<PreprocessedImage[]> {
  const binary = getImageMagickBinary();
  const images: PreprocessedImage[] = [];

  for (const variant of getPreprocessVariantsForRegion(region)) {
    const outputPath = path.join(
      tmpdir(),
      `tcgplayer-scanner-${randomUUID()}-${variant}.png`,
    );
    const code = await spawnToExitCode(
      binary,
      buildImageMagickPreprocessArgs(inputPath, outputPath, variant),
      PREPROCESS_TIMEOUT_MS,
    );

    if (code === 0) {
      images.push({ filePath: outputPath, variant });
      continue;
    }

    await unlink(outputPath).catch(() => undefined);

    if (process.env.SCANNER_OCR_DEBUG === 'true') {
      console.warn(
        `Scanner OCR preprocessing skipped for ${variant}; ImageMagick exited ${code ?? 'without a code'}`,
      );
    }
  }

  return images;
}

async function runTesseractOnce(
  filePath: string,
  psm: string,
): Promise<ScannerOcrResult> {
  const binary = getTesseractBinary();

  return new Promise((resolve) => {
    const child = spawn(binary, buildTesseractOcrArgs(filePath, psm), {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ rawText: '', confidence: 0 });
      }
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ rawText: '', confidence: 0 });
      }
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        if (process.env.SCANNER_OCR_DEBUG === 'true' && stderr.trim() !== '') {
          console.warn(`Tesseract OCR failed: ${stderr.trim()}`);
        }
        resolve({ rawText: '', confidence: 0 });
        return;
      }

      resolve(parseTesseractTsvOutput(stdout));
    });
  });
}

function getFocusedOcrImages(images: OcrImageInput[]): OcrImageInput[] {
  const focusedImages = images.filter(
    (image) =>
      image.variant === 'bottom-slice' ||
      image.variant === 'bottom-slice-inverted-threshold' ||
      image.variant === 'left-id-crop' ||
      image.variant === 'left-id-crop-inverted-threshold',
  );

  return focusedImages.length > 0 ? focusedImages : images;
}

async function runTesseract(
  images: OcrImageInput[],
): Promise<ScannerOcrResult> {
  const primaryResults = await Promise.all(
    images.map((image) => runTesseractOnce(image.filePath, PRIMARY_PSM)),
  );
  const primaryMerged = mergeScannerOcrResults(primaryResults);

  if (!shouldRunFallbackOcrPasses(primaryMerged)) {
    return primaryMerged;
  }

  const focusedImages = getFocusedOcrImages(images);
  const fallbackResults = await Promise.all(
    getFallbackPsmValues().flatMap((psm) =>
      focusedImages.map((image) => runTesseractOnce(image.filePath, psm)),
    ),
  );

  return mergeScannerOcrResults([...primaryResults, ...fallbackResults]);
}

export async function checkTesseractCliStatus(): Promise<TesseractCliStatus> {
  const binary = getTesseractBinary();

  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (status: TesseractCliStatus) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(status);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ binary, available: false });
    }, STATUS_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', () => finish({ binary, available: false }));
    child.on('close', (code) => {
      if (code !== 0) {
        finish({ binary, available: false });
        return;
      }

      const versionText = `${stdout}\n${stderr}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      finish({
        binary,
        available: true,
        ...(versionText ? { version: versionText } : {}),
      });
    });
  });
}

export class TesseractCliOcrService implements ScannerOcrService {
  async recognize(input: ScannerOcrInput): Promise<ScannerOcrResult> {
    const extension = extensionForMimeType(input.mimeType);
    const filePath = path.join(
      tmpdir(),
      `tcgplayer-scanner-${randomUUID()}.${extension}`,
    );

    const temporaryFiles = [filePath];

    try {
      await writeFile(filePath, input.buffer);
      const preprocessedImages = await createPreprocessedImages(
        filePath,
        input.region,
      );
      temporaryFiles.push(...preprocessedImages.map((image) => image.filePath));
      return await runTesseract([
        { filePath, variant: 'original' },
        ...preprocessedImages,
      ]);
    } finally {
      await Promise.all(
        temporaryFiles.map((temporaryFile) =>
          unlink(temporaryFile).catch(() => undefined),
        ),
      );
    }
  }
}

let defaultOcrService: ScannerOcrService | null = null;

export function getDefaultScannerOcrService(): ScannerOcrService {
  defaultOcrService ??= new TesseractCliOcrService();
  return defaultOcrService;
}
