// `npm run agent:demote -- <email> --env <staging|production>` (spec 0008, AC-14):
// sets the user's role to VISITOR. It takes effect on their next request, since
// every check reads the role from the database.
import { confirmOnProduction, findProfile, finish, loadEnv, parseArgs, reminder, report } from "./operator";

async function main() {
  const target = parseArgs(process.argv.slice(2));
  loadEnv(target);
  await confirmOnProduction(target);

  const profile = await findProfile(target.email);
  const { db } = await import("@/lib/server/db");
  await db.profile.update({ where: { id: profile.id }, data: { role: "VISITOR" } });

  console.log(`${target.email}: ${profile.role} → VISITOR`);
  console.log(reminder);
  await report("agent_demote", target, profile.id, { from: profile.role, to: "VISITOR" });
  await finish();
}

void main();
