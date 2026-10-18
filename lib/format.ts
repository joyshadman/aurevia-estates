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

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  assertFinite(count, "count");
  return `${wholeNumber.format(count)} ${count === 1 ? singular : plural}`;
}
