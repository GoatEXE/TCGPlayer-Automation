export function normalizeSetCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeCollectorDigitConfusions(value: string): string {
  return value
    .replace(/[Oo]/g, '0')
    .replace(/[Ii|]/g, '1')
    .replace(/(?<=\d)L(?=\d)/g, '1');
}

function normalizeSpecialFaceNumber(value: string): string | null {
  const match = normalizeCollectorDigitConfusions(value)
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
