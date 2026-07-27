import { describe, expect, it } from 'vitest';
import {
  buildImageMagickPreprocessArgs,
  buildTesseractOcrArgs,
  getFallbackPsmValues,
  getPreprocessVariantsForRegion,
  isPunctuationOnlyOcrText,
  mergeScannerOcrResults,
  parseTesseractTsvOutput,
  shouldRunFallbackOcrPasses,
} from '../ocr.js';

const TSV_HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

describe('scanner OCR command options', () => {
  it('uses settings optimized for short single-line card identifiers', () => {
    expect(buildTesseractOcrArgs('/tmp/roi.png')).toEqual([
      '/tmp/roi.png',
      'stdout',
      '--oem',
      '1',
      '--psm',
      '7',
      '-l',
      'eng',
      '-c',
      'user_defined_dpi=300',
      '-c',
      'preserve_interword_spaces=1',
      '-c',
      'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-:#|',
      'tsv',
    ]);
  });

  it('uses bottom-slice preprocessing only for horizontal ROI regions', () => {
    expect(getPreprocessVariantsForRegion('bottom-left')).toEqual([
      'normalized-gray',
      'inverted-threshold',
      'bottom-slice',
      'bottom-slice-inverted-threshold',
    ]);
    expect(getPreprocessVariantsForRegion('bottom-left-strip')).toEqual([
      'normalized-gray',
      'inverted-threshold',
      'bottom-slice',
      'bottom-slice-inverted-threshold',
    ]);
    expect(getPreprocessVariantsForRegion('bottom-right')).toEqual([
      'normalized-gray',
      'inverted-threshold',
      'left-id-crop',
      'left-id-crop-inverted-threshold',
    ]);
  });

  it('builds gray and inverted-threshold ImageMagick commands without assuming natural-color input', () => {
    expect(
      buildImageMagickPreprocessArgs(
        '/tmp/in.jpg',
        '/tmp/gray.png',
        'normalized-gray',
      ),
    ).toEqual([
      '/tmp/in.jpg',
      '-auto-orient',
      '-colorspace',
      'Gray',
      '-contrast-stretch',
      '1%x5%',
      '-strip',
      '/tmp/gray.png',
    ]);
    expect(
      buildImageMagickPreprocessArgs(
        '/tmp/in.jpg',
        '/tmp/inverted.png',
        'inverted-threshold',
      ),
    ).toEqual([
      '/tmp/in.jpg',
      '-auto-orient',
      '-colorspace',
      'Gray',
      '-contrast-stretch',
      '1%x5%',
      '-negate',
      '-threshold',
      '55%',
      '-strip',
      '/tmp/inverted.png',
    ]);
    expect(
      buildImageMagickPreprocessArgs(
        '/tmp/in.jpg',
        '/tmp/slice.png',
        'bottom-slice-inverted-threshold',
      ),
    ).toEqual([
      '/tmp/in.jpg',
      '-auto-orient',
      '-gravity',
      'South',
      '-crop',
      '100%x45%+0+0',
      '+repage',
      '-resize',
      '250%',
      '-colorspace',
      'Gray',
      '-contrast-stretch',
      '1%x5%',
      '-negate',
      '-threshold',
      '55%',
      '-strip',
      '/tmp/slice.png',
    ]);
    expect(
      buildImageMagickPreprocessArgs(
        '/tmp/in.jpg',
        '/tmp/right-id.png',
        'left-id-crop-inverted-threshold',
      ),
    ).toEqual([
      '/tmp/in.jpg',
      '-auto-orient',
      '-gravity',
      'SouthWest',
      '-crop',
      '65%x45%+0+0',
      '+repage',
      '-resize',
      '250%',
      '-colorspace',
      'Gray',
      '-contrast-stretch',
      '1%x5%',
      '-negate',
      '-threshold',
      '55%',
      '-strip',
      '/tmp/right-id.png',
    ]);
  });
});

describe('scanner OCR fallback decisions and result merging', () => {
  it('treats punctuation-only text as unhelpful and uses additional fallback PSMs', () => {
    expect(isPunctuationOnlyOcrText('-')).toBe(true);
    expect(isPunctuationOnlyOcrText('UNL')).toBe(false);
    expect(getFallbackPsmValues()).toEqual(['13', '11']);
    expect(shouldRunFallbackOcrPasses({ rawText: '-', confidence: 0.85 })).toBe(
      true,
    );
    expect(
      shouldRunFallbackOcrPasses({
        rawText: 'DUSK ROSE LAB',
        confidence: 0.85,
      }),
    ).toBe(true);
    expect(
      shouldRunFallbackOcrPasses({
        rawText: 'UNL • 209/219',
        confidence: 0.85,
      }),
    ).toBe(false);
  });

  it('keeps raw text from punctuation-only primary OCR and ID-focused fallback variants', () => {
    expect(
      mergeScannerOcrResults([
        { rawText: '-', confidence: 0.85 },
        { rawText: '', confidence: 0 },
        { rawText: 'UNL • 209/219', confidence: 0.72 },
      ]),
    ).toEqual({ rawText: '-\nUNL • 209/219', confidence: 0.85 });
  });

  it('keeps raw text from normal and processed variants for downstream parsing', () => {
    expect(
      mergeScannerOcrResults([
        { rawText: '', confidence: 0 },
        { rawText: 'UNL', confidence: 0.4 },
        { rawText: 'UNL 002/219', confidence: 0.81 },
        { rawText: 'UNL 002/219', confidence: 0.5 },
      ]),
    ).toEqual({ rawText: 'UNL\nUNL 002/219', confidence: 0.81 });
  });
});

describe('scanner OCR TSV parsing', () => {
  it('does not surface a TSV header or empty rows as OCR text', () => {
    expect(
      parseTesseractTsvOutput(
        `${TSV_HEADER}\n1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t`,
      ),
    ).toEqual({ rawText: '', confidence: 0 });
  });

  it('extracts recognized words and averages confidence for text rows only', () => {
    expect(
      parseTesseractTsvOutput(
        [
          TSV_HEADER,
          '1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t',
          '5\t1\t1\t1\t1\t1\t10\t10\t30\t10\t92.5\tUNL',
          '5\t1\t1\t1\t1\t2\t45\t10\t60\t10\t87.5\t002/219',
        ].join('\n'),
      ),
    ).toEqual({ rawText: 'UNL 002/219', confidence: 0.9 });
  });
});
