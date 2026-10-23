// Shared steps for the operator scripts (spec 0008, AC-14, *Scripts*):
// `agent:promote`, `agent:demote`, and `mfa:reset`. Each takes
// `<email> --env <staging|production>`, loads `.env.<env>` (git ignored), prints
// the target database host, asks for the email again on production, refuses unknown
// emails, and reports the run to Sentry with the operator's machine user name.
//
// Run with `tsx --conditions=react-server`, so `server-only` imports resolve.
import * as Sentry from "@sentry/nextjs";
import { config } from "dotenv";
import { userInfo } from "node:os";
import { createInterface } from "node:readline/promises";

export type Target = { env: "staging" | "production"; email: string };

export function parseArgs(argv: string[]): Target {
  const envIndex = argv.indexOf("--env");
  const env = envIndex >= 0 ? argv[envIndex + 1] : undefined;
  const email = argv.find((arg, i) => !arg.startsWith("--") && i !== envIndex + 1)?.trim().toLowerCase();
  if (!email || (env !== "staging" && env !== "production")) {
    console.error("Usage: npm run <script> -- <email> --env <staging|production>");
    process.exit(2);
  }
  return { env, email };
}

// Loads the env file before any server module reads `process.env` (they parse on first use).
export function loadEnv(target: Target) {
  const result = config({ path: `.env.${target.env}`, override: true, quiet: true });
  if (result.error) {
    console.error(`Could not read .env.${target.env}. Create it with that project's keys first.`);
    process.exit(2);
  }
  // The Neon branch host, never the credentials in the URL.
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Target: ${target.env} (database ${host})`);

  Sentry.init({ dsn: process.env.SENTRY_DSN || undefined, enabled: Boolean(process.env.SENTRY_DSN), tracesSampleRate: 0 });
}

export async function confirmOnProduction(target: Target) {
  if (target.env !== "production") return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Production. Type the email again to confirm: `)).trim().toLowerCase();
  rl.close();
  if (typed !== target.email) {
    console.error("The emails don't match. Nothing changed.");
    process.exit(1);
  }
}

export async function findProfile(email: string) {
  const { db } = await import("@/lib/server/db");
  const profile = await db.profile.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!profile) {
    console.error(`No account with the email ${email}. Nothing changed.`);
    await finish(1);
  }
  return profile!;
}

export async function report(script: string, target: Target, userId: string, detail: Record<string, unknown> = {}) {
  Sentry.captureMessage(`operator.${script}`, {
    level: "info",
    extra: { env: target.env, userId, operator: userInfo().username, ...detail },
  });
}

export async function finish(code = 0): Promise<never> {
  await Sentry.flush(5000);
  const { db } = await import("@/lib/server/db");
  await db.$disconnect().catch(() => undefined);
  process.exit(code);
}

export const reminder = "Ask the agent to sign in and turn on 2FA now.";
