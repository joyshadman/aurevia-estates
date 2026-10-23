import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { safeNext } from "@/lib/auth/safe-next";

// What Better Auth's email callback can't be told directly (spec 0008, *Email
// codes and links*). The callback only receives the email, code, and type, so
// the action that asks for a code opens this store around its `auth.api.*`
// call. No store (any other caller) means the link carries no `next`.

type AuthRequest = {
  // Where the email link lands after sign in, already through `safeNext`.
  next: string | null;
  // The signed in "set a first password" request (AC-10, AC-13): its email is
  // awaited. A reset from `/sign-in` is always sent after the response, so it
  // takes the same time whether or not the account exists.
  awaitResetEmail: boolean;
};

const store = new AsyncLocalStorage<AuthRequest>();

export function withAuthRequest<T>(
  input: { next?: string | null; awaitResetEmail?: boolean },
  run: () => Promise<T>,
): Promise<T> {
  return store.run({ next: safeNext(input.next), awaitResetEmail: input.awaitResetEmail === true }, run);
}

export function authRequest(): AuthRequest {
  return store.getStore() ?? { next: null, awaitResetEmail: false };
}
