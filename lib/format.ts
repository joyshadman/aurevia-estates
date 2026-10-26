// Display formats (spec 0003). Prices use international grouping, as chosen.

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const upToTwoDecimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function assertFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}

export function formatPrice(bdt: number): string {
  assertFinite(bdt, "price");
  if (bdt < 0) throw new RangeError("price must not be negative");
  return `BDT ${wholeNumber.format(bdt)}`;
}

export function formatSqft(sqft: number): string {
  assertFinite(sqft, "sqft");
  return `${wholeNumber.format(sqft)} sqft`;
}

export function formatKatha(katha: number): string {
  assertFinite(katha, "katha");
  return `${upToTwoDecimals.format(katha)} katha`;
}

const dhakaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });
const dhakaShortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
const dhakaLongDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });

// A conversation's date in the chat list, in `Asia/Dhaka`: "Today", "12 Oct",
// or "12 Oct 2025" for another year.
export function formatChatDate(at: string | Date, now = new Date()): string {
  const day = dhakaDay.format(new Date(at));
  const today = dhakaDay.format(now);
  if (day === today) return "Today";
  return day.slice(0, 4) === today.slice(0, 4) ? dhakaShortDate.format(new Date(at)) : dhakaLongDate.format(new Date(at));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  assertFinite(count, "count");
  return `${wholeNumber.format(count)} ${count === 1 ? singular : plural}`;
}
