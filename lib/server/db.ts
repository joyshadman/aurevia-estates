import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { serverEnv } from "@/lib/server/env";

// The one Prisma client (spec 0001): a module level singleton with a small pool
// per serverless instance, over the pooled connection. Created on first use, not
// at import, so `next build` never needs runtime secrets.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL, max: 3 });
    // A transaction may need a fresh connection (the pool's idle ones close
    // after a long model call), and a cold TLS handshake can outlast Prisma's
    // 2 second default. A chat save must not fail on that (spec 0006, AC-2).
    globalForPrisma.prisma = new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 15_000 } });
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
