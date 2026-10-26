// Fact sheet rules shared by the server and the editor (spec 0006, AC-14).

export const factSheetMax = 4000;

// The bracketed placeholders still in a body, like `[OFFICE HOURS]`, once each.
// The assistant never repeats them (AC-7), so the editor lists what's left to fill in.
export function factSheetPlaceholders(body: string): string[] {
  return [...new Set(body.match(/\[[^\[\]\n]{1,60}\]/g) ?? [])];
}
