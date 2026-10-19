// Operator scripts for agent access (spec 0004, AC-14):
//   npm run agent:promote -- <email> --env <local|staging|production>
//   npm run agent:demote  -- <email> --env <local|staging|production>
//   npm run mfa:reset     -- <email> --env <local|staging|production>
// Each loads the env file for `--env` (`.env.local`, `.env.staging`, or
// `.env.production`; all git ignored), prints the target project, and on
// production asks you to type the email again. Runs as
// `tsx --conditions react-server`, so `server-only` imports resolve.
import { config } from "dotenv";
import { userInfo } from "node:os";
import { createInterface } from "node:readline/promises";

const [command, ...rest] = process.argv.slice(2);
const envFlag = rest.indexOf("--env");
const target = envFlag >= 0 ? rest[envFlag + 1] : undefined;
const email = rest.find((arg, i) => !arg.startsWith("--") && i !== envFlag + 1)?.trim().toLowerCase();

if (!["promote", "demote", "mfa-reset"].includes(command ?? "") || !email || !["local", "staging", "production"].includes(target ?? "")) {
  console.error("Usage: agent-access <promote|demote|mfa-reset> <email> --env <local|staging|production>");
  process.exit(1);
}
config({ path: `.env.${target}`, quiet: true, override: true });

// Imported after the env file loads; server modules read the environment on first use.
const modules = Promise.all([import("@supabase/supabase-js"), import("../lib/server/db"), import("../lib/server/report")]);

async function main() {
  const [{ createClient }, { db }, { reportEvent }] = await modules;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.${target}`);
  console.log(`Target: ${new URL(url).hostname.split(".")[0]} (${target})`);

  const profile = await db.profile.findFirst({ where: { email: email!, deletedAt: null }, select: { id: true, role: true, email: true } });
  if (!profile) throw new Error(`No account with the email ${email}.`);

  if (target === "production") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const again = (await rl.question("Type the email again to confirm: ")).trim().toLowerCase();
    rl.close();
    if (again !== email) throw new Error("The emails don't match. Nothing changed.");
  }

  if (command === "promote" || command === "demote") {
    const role = command === "promote" ? "AGENT" : "VISITOR";
    await db.profile.update({ where: { id: profile.id }, data: { role } });
    console.log(`${email} is now ${role}. It takes effect on their next request.`);
  } else {
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: profile.id });
    if (error) throw error;
    for (const factor of data.factors) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: profile.id });
      if (deleteError) throw deleteError;
    }
    // Without a factor, agent pages send them to setup, which needs a sign in
    // from the last 15 minutes, so an old session can't reach agent data.
    // TODO(spec 0004): also end their sessions; `auth.sessions` lives in the
    // Supabase database, which the Prisma connection (Neon) can't reach.
    console.log(`Removed ${data.factors.length} authenticator(s) from ${email}.`);
  }
  console.log("Ask the agent to sign in and add their authenticator now.");
  reportEvent(`operator.${command}`, { email, env: target, operator: userInfo().username });
}

main()
  .catch((error: unknown) => {
    const code = (error as { code?: string }).code;
    if (code === "ETIMEDOUT" || code === "ECONNREFUSED") console.error(`Can't reach the database in .env.${target} (${code}).`);
    else console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => (await modules)[1].db.$disconnect());
