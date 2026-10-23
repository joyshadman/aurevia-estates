import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";

// Runs `work` inside the caller's transaction when one is passed, else in a new
// one. Lets spec 0002's writers join a larger action's transaction and row lock
// (spec 0005, *API surface*).
export function inTransaction<T>(
  tx: Prisma.TransactionClient | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return tx ? work(tx) : db.$transaction(work);
}
