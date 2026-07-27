export interface ParsedCatalogCode {
  setCode: string;
  number: string;
  normalizedNumber: string;
}

export function normalizeSetCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOcrDigitConfusions(value: string): string {
  return value
    .replace(/[Oo]/g, '0')
    .replace(/[Ii|]/g, '1')
    .replace(/(?<=\d)L(?=\d)/g, '1');
}

function normalizeSpecialFaceNumber(value: string): string | null {
  const match = normalizeOcrDigitConfusions(value)
    .replace(/\s+/g, '')
    .toUpperCase()
    .match(/^([TR])0*(\d{1,3})([A-Z]?)$/);

  if (!match) {
    return null;
  }

  const [, prefix, number, suffix] = match;
  if (prefix === 'T' && suffix) {
    return null;
  }

  return `${prefix}${number.padStart(2, '0')}${suffix}`;
}

export function normalizeCollectorNumber(value: string): string {
  const compact = value
    .trim()
    .replace(/^#/, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .toUpperCase();

  const tokenPairMatch = compact.match(
    /^(T[0-9OIL|]{1,3})(?:\/{1,2})?(T[0-9OIL|]{1,3})$/,
  );
  if (tokenPairMatch) {
    const leftToken = normalizeSpecialFaceNumber(tokenPairMatch[1]);
    const rightToken = normalizeSpecialFaceNumber(tokenPairMatch[2]);
    if (leftToken && rightToken) {
      return `${leftToken}//${rightToken}`;
    }
  }

  const specialFaceNumber = normalizeSpecialFaceNumber(compact);
  if (specialFaceNumber) {
    return specialFaceNumber;
  }

  const splitMatch = compact.match(/^0*(\d+)([A-Z-]*)\/0*(\d+)([A-Z-]*)$/);
  if (splitMatch) {
    const [, cardNumber, cardSuffix, setTotal, totalSuffix] = splitMatch;
    return `${Number.parseInt(cardNumber, 10)}${cardSuffix}/${Number.parseInt(
      setTotal,
      10,
    )}${totalSuffix}`;
  }

  const singleMatch = compact.match(/^0*(\d+)([A-Z-]*)$/);
  if (singleMatch) {
    const [, cardNumber, suffix] = singleMatch;
    return `${Number.parseInt(cardNumber, 10)}${suffix}`;
  }

  return compact;
}

function hasPlausibleRawCollectorNumber(rawNumber: string): boolean {
  return (
    (rawNumber.match(/\d/g) ?? []).length >= 2 ||
    /\b[TR]\s*[0-9OIL|]{1,3}[A-Z]?\b/i.test(rawNumber)
  );
}

function toParsedCatalogCode(
  rawSetCode: string,
  rawNumber: string,
): ParsedCatalogCode | null {
  if (!hasPlausibleRawCollectorNumber(rawNumber)) {
    return null;
  }

  const setCode = normalizeSetCode(rawSetCode);
  if (/^[TR]\d{2,3}[A-Z]?$/.test(setCode)) {
    return null;
  }

  const rawNormalizedNumber = normalizeOcrDigitConfusions(rawNumber).replace(
    /\s+/g,
    '',
  );
  const normalizedNumber = normalizeCollectorNumber(rawNormalizedNumber);
  const number = /^[TR]/.test(normalizedNumber)
    ? normalizedNumber
    : rawNormalizedNumber;

  return {
    setCode,
    number,
    normalizedNumber,
  };
}

const setCodePattern = '[A-Z][A-Z0-9]{1,9}';
const numberPattern = '[0-9OIL|]{1,4}[A-Z-]?\\s*\\/\\s*[0-9OIL|]{1,4}[A-Z-]?';
const compactTrailingSetNumberPattern =
  '[0-9OIL|]{1,4}[A-Z-]?\\s*\\/\\s*[0-9OIL|]{1,4}';
const tokenFacePattern = 'T\\s*[0-9OIL|]{1,3}';
const specialFacePattern = '(?:T\\s*[0-9OIL|]{1,3}|R\\s*[0-9OIL|]{1,3}[A-Z]?)';
const tokenPairPattern = `${tokenFacePattern}\\s*(?:\\/{1,2}|\\s+)\\s*${tokenFacePattern}`;

function isTokenFaceAttempt(attempt: ParsedCatalogCode): boolean {
  return /^T\d{2,3}$/.test(attempt.normalizedNumber);
}

function tokenPairContainsFace(tokenPair: string, tokenFace: string): boolean {
  return tokenPair.split('//').includes(tokenFace);
}

function uniqueCatalogCodeAttempts(
  attempts: ParsedCatalogCode[],
): ParsedCatalogCode[] {
  const seen = new Set<string>();
  const uniqueAttempts: ParsedCatalogCode[] = [];

  for (const attempt of attempts) {
    if (
      isTokenFaceAttempt(attempt) &&
      uniqueAttempts.some(
        (existingAttempt) =>
          existingAttempt.setCode === attempt.setCode &&
          tokenPairContainsFace(
            existingAttempt.normalizedNumber,
            attempt.normalizedNumber,
          ),
      )
    ) {
      continue;
    }

    const key = `${attempt.setCode}:${attempt.normalizedNumber}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueAttempts.push(attempt);
  }

  return uniqueAttempts;
}

function parseSearchableCatalogCodes(searchable: string): ParsedCatalogCode[] {
  const attempts: ParsedCatalogCode[] = [];
  const patterns: Array<{
    regex: RegExp;
    toAttempt: (match: RegExpExecArray) => ParsedCatalogCode | null;
  }> = [
    {
      regex: new RegExp(
        `\\b(${setCodePattern})\\b\\s*#?\\s*(${tokenPairPattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[1], match[2]),
    },
    {
      regex: new RegExp(
        `\\b(${tokenPairPattern})\\b\\s*#?\\s*(${setCodePattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[2], match[1]),
    },
    {
      regex: new RegExp(
        `\\b(${setCodePattern})\\b\\s*#?\\s*(${specialFacePattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[1], match[2]),
    },
    {
      regex: new RegExp(
        `\\b(${specialFacePattern})\\b\\s*#?\\s*(${setCodePattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[2], match[1]),
    },
    {
      regex: new RegExp(
        `\\b(${setCodePattern})\\b\\s*#?\\s*(${numberPattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[1], match[2]),
    },
    {
      regex: new RegExp(
        `\\b(${compactTrailingSetNumberPattern})([A-Z]{2,6})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[2], match[1]),
    },
    {
      regex: new RegExp(`\\b([A-Z]{2,6})(${numberPattern})\\b`, 'g'),
      toAttempt: (match) => toParsedCatalogCode(match[1], match[2]),
    },
    {
      regex: new RegExp(
        `\\b(${numberPattern})\\b\\s*#?\\s*(${setCodePattern})\\b`,
        'g',
      ),
      toAttempt: (match) => toParsedCatalogCode(match[2], match[1]),
    },
  ];

  for (const { regex, toAttempt } of patterns) {
    for (const match of searchable.matchAll(regex)) {
      const attempt = toAttempt(match);
      if (attempt) {
        attempts.push(attempt);
      }
    }
  }

  return uniqueCatalogCodeAttempts(attempts);
}

function compactSeparatedOcrCharacters(value: string): string {
  let compacted = value.replace(/\s*\/\s*/g, '/');
  let previous = '';

  while (compacted !== previous) {
    previous = compacted;
    compacted = compacted.replace(
      /\b([A-Z0-9OIL|])\s+(?=[A-Z0-9OIL|]\b)/g,
      '$1',
    );
  }

  return compacted.replace(/\s+/g, ' ').trim();
}

export function parseCatalogCodeAttempts(value: string): ParsedCatalogCode[] {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
  const searchable = normalized
    .replace(/[•·∙●○◦©*]+/g, ' ')
    .replace(/[|:;,._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return uniqueCatalogCodeAttempts([
    ...parseSearchableCatalogCodes(searchable),
    ...parseSearchableCatalogCodes(compactSeparatedOcrCharacters(searchable)),
  ]);
}

export function parseCatalogCode(value: string): ParsedCatalogCode | null {
  return parseCatalogCodeAttempts(value)[0] ?? null;
}
