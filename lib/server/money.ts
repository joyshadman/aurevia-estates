import "server-only";

// Money and land size at the server to client boundary (spec 0002). Prices are
// whole taka in `bigint`; React props and AI tool output carry plain numbers.

export function toTaka(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Amount out of safe range: ${value}`);
  }
  return Number(value);
}

export function fromTaka(value: number): bigint {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Not a whole positive taka amount: ${value}`);
  }
  if (!Number.isSafeInteger(value)) throw new RangeError(`Amount out of safe range: ${value}`);
  return BigInt(value);
}

// Accepts Prisma's `Decimal` (anything with `toNumber`).
export function toKatha(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}
