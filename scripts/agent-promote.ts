// `npm run agent:promote -- <email> --env <staging|production>` (spec 0008, AC-14):
// sets the user's role to AGENT. It takes effect on their next request, since
// every check reads the role from the database.
import { confirmOnProduction, findProfile, finish, loadEnv, parseArgs, reminder, report } from "./operator";

async function main() {
  const target = parseArgs(process.argv.slice(2));
  loadEnv(target);
  await confirmOnProduction(target);

  const profile = await findProfile(target.email);
  const { db } = await import("@/lib/server/db");
  await db.profile.update({ where: { id: profile.id }, data: { role: "AGENT" } });

  console.log(`${target.email}: ${profile.role} → AGENT`);
  console.log(reminder);
  await report("agent_promote", target, profile.id, { from: profile.role, to: "AGENT" });
  await finish();
}

void main();
