import "server-only";

// Errors thrown by the data model's server modules (spec 0002).
// `InvalidTransitionError` lives in `lib/domain/errors.ts`.

// The actor may not touch this row. Lives here, not in `auth.ts`, so services
// load outside Next (the eval, the operator scripts) without `next/navigation`.
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

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

// The visitor already has an active viewing for this home at another time
// (spec 0007, AC-6). Thrown inside the booking transaction so nothing it wrote is kept.
export type ExistingViewing = { viewingId: string; start: string; status: "REQUESTED" | "CONFIRMED" };

export class AlreadyBookedError extends Error {
  constructor(readonly existing: ExistingViewing) {
    super(`An active viewing ${existing.viewingId} already exists for this home`);
    this.name = "AlreadyBookedError";
  }
}

// An insert only message id that already exists (spec 0006: a resent message).
export class DuplicateMessageError extends Error {
  constructor(messageId: string) {
    super(`Message ${messageId} was already sent`);
    this.name = "DuplicateMessageError";
  }
}

// The chat turn refused before calling the model (spec 0006). `status` and
// `reason` become the HTTP response; nothing about the turn was saved.
export type TurnRefusalReason = "not_found" | "turn_in_progress" | "duplicate_message" | "not_retryable" | "daily_limit";

export class TurnRefusedError extends Error {
  constructor(
    readonly status: 404 | 409 | 429,
    readonly reason: TurnRefusalReason,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`Chat turn refused: ${reason}`);
    this.name = "TurnRefusedError";
  }
}
