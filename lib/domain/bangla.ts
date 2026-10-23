// Bangla text helpers (spec 0006). Pure, shared by the chat turn, the grounding
// check, and the eval.

const banglaDigits = "০১২৩৪৫৬৭৮৯";

export function normalizeBanglaDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
}

// Share of letters (and their vowel signs) written in Bangla script, 0 to 1.
// Digits, punctuation, and emoji are ignored; text without letters gives 0.
export function banglaScriptShare(text: string): number {
  const letters = text.match(/[\p{L}\p{M}]/gu) ?? [];
  if (letters.length === 0) return 0;
  const bangla = letters.filter((char) => char >= "ঀ" && char <= "৿").length;
  return bangla / letters.length;
}

export type ChatLocale = "en" | "bn";

// The language a reply was written in: Bangla when over half its letters are
// Bangla script, else English; empty text keeps the fallback (the toggle).
export function replyLocale(text: string, fallback: ChatLocale): ChatLocale {
  if (!/[\p{L}\p{M}]/u.test(text)) return fallback;
  return banglaScriptShare(text) > 0.5 ? "bn" : "en";
}
