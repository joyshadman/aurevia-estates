import "server-only";

// Errors thrown by the data model's server modules (spec 0002). `ForbiddenError`
// lives in `lib/server/auth.ts`; `InvalidTransitionError` in `lib/domain/errors.ts`.

// A status changed between the read and the guarded write. Nothing was changed.
export class StaleStatusError extends Error {
  constructor(entity: string, id: string) {
    super(`The ${entity} ${id} changed while you were editing it. Reload and try again.`);
    this.name = "StaleStatusError";
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`No ${entity} ${id}`);
    this.name = "NotFoundError";
  }
}

// `missing` lists every publish precondition the listing fails, for the form to show.
export class PublishBlockedError extends Error {
  constructor(readonly missing: string[]) {
    super(`Cannot publish yet: ${missing.join(", ")}`);
    this.name = "PublishBlockedError";
  }
}

export class LastCoverError extends Error {
  constructor() {
    super("A published listing must keep a cover photo. Choose another cover first.");
    this.name = "LastCoverError";
  }
}

export class MessageIdConflictError extends Error {
  constructor(messageId: string) {
    super(`Message id ${messageId} belongs to another conversation`);
    this.name = "MessageIdConflictError";
  }
}

export class ListingNotBookableError extends Error {
  constructor(listingId: string) {
    super(`Listing ${listingId} is not open for viewings`);
    this.name = "ListingNotBookableError";
  }
}
