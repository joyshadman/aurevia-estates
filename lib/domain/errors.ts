// Errors the pure domain modules throw (spec 0002). Server only errors live in
// `lib/server/errors.ts`.

export class InvalidTransitionError extends Error {
  constructor(
    readonly entity: "listing" | "lead" | "viewing",
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${entity} transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}
