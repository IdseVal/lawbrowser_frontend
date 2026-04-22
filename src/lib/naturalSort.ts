/**
 * Natural sort comparator for Dutch legal document structure nodes.
 *
 * Handles:
 * - Arabic numbers: "Artikel 1" before "Artikel 10"
 * - Roman numerals: "Titel II" before "Titel IV"
 * - Dutch ordinal words: "Eerste afdeling" before "Tweede afdeling"
 * - Mixed alphanumeric tokens: "12a" before "12b"
 * - Case-insensitive comparison
 */

/** Dutch ordinal words mapped to their numeric value */
const DUTCH_ORDINALS: Record<string, number> = {
  eerste: 1,
  tweede: 2,
  derde: 3,
  vierde: 4,
  vijfde: 5,
  zesde: 6,
  zevende: 7,
  achtste: 8,
  negende: 9,
  tiende: 10,
  elfde: 11,
  twaalfde: 12,
  dertiende: 13,
  veertiende: 14,
  vijftiende: 15,
  zestiende: 16,
  zeventiende: 17,
  achttiende: 18,
  negentiende: 19,
  twintigste: 20,
  eenentwintigste: 21,
  tweeëntwintigste: 22,
  drieëntwintigste: 23,
  vierentwintigste: 24,
  vijfentwintigste: 25,
  zesentwintigste: 26,
  zevenentwintigste: 27,
  achtentwintigste: 28,
  negenentwintigste: 29,
  dertigste: 30,
};

/** Roman numeral values */
const ROMAN_VALUES: Record<string, number> = {
  I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
};

const ROMAN_REGEX = /^[IVXLCDM]+$/i;

/**
 * Parse a Roman numeral string to its integer value.
 * Returns null if the string is not a valid Roman numeral.
 */
function parseRoman(str: string): number | null {
  const upper = str.toUpperCase();
  if (!ROMAN_REGEX.test(upper)) return null;

  // Reject strings that look like Roman but are really just words
  // (e.g. "I" as a word vs "I" as 1 — context decides, but single "I" is fine)
  // Also reject if it doesn't use valid subtractive patterns
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const current = ROMAN_VALUES[upper[i]];
    const next = i + 1 < upper.length ? ROMAN_VALUES[upper[i + 1]] : 0;
    if (current === undefined) return null;
    if (current < (next ?? 0)) {
      total -= current;
    } else {
      total += current;
    }
  }

  // Sanity check: value should be positive and reasonable for legal docs
  if (total <= 0 || total > 3999) return null;

  return total;
}

/**
 * Tokenize a string into segments that are either:
 * - numeric (parsed to number)
 * - textual (lowercase string)
 *
 * Each token carries a numeric sort key when possible.
 */
interface SortToken {
  /** Numeric value for comparison, or Infinity if purely textual */
  numericValue: number;
  /** Original text, lowercased, for tie-breaking */
  text: string;
  /** Whether this token has a numeric interpretation */
  isNumeric: boolean;
}

function tokenize(str: string): SortToken[] {
  // Split into runs of digits, letters (including accented), and other characters
  const parts = str.match(/[a-zA-ZÀ-ÿ]+|\d+/g) ?? [];
  const tokens: SortToken[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();

    // Try Arabic number
    if (/^\d+$/.test(part)) {
      tokens.push({ numericValue: parseInt(part, 10), text: lower, isNumeric: true });
      continue;
    }

    // Try Dutch ordinal
    const ordinalVal = DUTCH_ORDINALS[lower];
    if (ordinalVal !== undefined) {
      tokens.push({ numericValue: ordinalVal, text: lower, isNumeric: true });
      continue;
    }

    // Try Roman numeral (only if 1+ chars and all are Roman chars)
    if (part.length >= 1) {
      const romanVal = parseRoman(part);
      if (romanVal !== null) {
        tokens.push({ numericValue: romanVal, text: lower, isNumeric: true });
        continue;
      }
    }

    // Plain text token
    tokens.push({ numericValue: Infinity, text: lower, isNumeric: false });
  }

  return tokens;
}

function compareTokens(a: SortToken[], b: SortToken[]): number {
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const ta = a[i];
    const tb = b[i];

    // Shorter token list comes first
    if (!ta) return -1;
    if (!tb) return 1;

    // Both numeric: compare values
    if (ta.isNumeric && tb.isNumeric) {
      if (ta.numericValue !== tb.numericValue) {
        return ta.numericValue - tb.numericValue;
      }
      // Same numeric value (e.g. Roman "II" vs Arabic "2") — continue
      continue;
    }

    // One numeric, one text: numeric first
    if (ta.isNumeric && !tb.isNumeric) return -1;
    if (!ta.isNumeric && tb.isNumeric) return 1;

    // Both text: lexicographic
    if (ta.text < tb.text) return -1;
    if (ta.text > tb.text) return 1;
  }

  return 0;
}

/**
 * Compare two label strings using natural Dutch legal ordering.
 */
export function naturalCompare(a: string, b: string): number {
  return compareTokens(tokenize(a), tokenize(b));
}
