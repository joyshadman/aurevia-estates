// Text rules for the assistant (spec 0006): language detection and listing
// codes. Pure, so the eval, the turn, and the tests share them.

export type ChatLocale = "en" | "bn";

const banglaLetter = /[ঀ-৿]/u;
const latinLetter = /[A-Za-z]/;

// Share of letters in Bangla script, out of Bangla and Latin letters; null when
// the text has no letters at all (only numbers, emoji, punctuation).
export function banglaShare(text: string): number | null {
  let bangla = 0;
  let latin = 0;
  for (const char of text) {
    if (banglaLetter.test(char)) bangla++;
    else if (latinLetter.test(char)) latin++;
  }
  return bangla + latin === 0 ? null : bangla / (bangla + latin);
}

// The language a text is written in, or `fallback` when it gives no signal.
// Romanized Bangla counts as English (AC-8).
export function detectLocale(text: string, fallback: ChatLocale): ChatLocale {
  const share = banglaShare(text);
  if (share === null) return fallback;
  return share > 0.5 ? "bn" : "en";
}

const banglaDigits = "০১২৩৪৫৬৭৮৯";

export function normalizeBanglaDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
}

// Every `AUR-1042` style code in a text, uppercased, Bangla digits normalized.
export function findListingCodes(text: string): string[] {
  const codes = normalizeBanglaDigits(text).match(/AUR-\d{4,}/gi) ?? [];
  return [...new Set(codes.map((code) => code.toUpperCase()))];
}

// Normalizes one code the model passes to a tool; null when it isn't one.
export function parseListingCode(value: string): string | null {
  const match = normalizeBanglaDigits(value.trim()).match(/^AUR-?(\d{4,})$/i);
  return match ? `AUR-${match[1]}` : null;
}

const minTitleLength = 20;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Grounding (spec 0006): codes in the reply that the conversation never showed,
// plus long titles of other published listings named as a whole phrase.
export function findUngrounded(
  text: string,
  shownCodes: Set<string>,
  otherListings: { refCode: string; title: string }[],
): string[] {
  const hits = findListingCodes(text).filter((code) => !shownCodes.has(code));
  for (const listing of otherListings) {
    if (listing.title.length < minTitleLength || shownCodes.has(listing.refCode)) continue;
    const phrase = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(listing.title)}($|[^\\p{L}\\p{N}])`, "iu");
    if (phrase.test(text) && !hits.includes(listing.refCode)) hits.push(listing.refCode);
  }
  return hits;
}
