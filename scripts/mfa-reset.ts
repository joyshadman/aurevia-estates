// `npm run mfa:reset -- <email> --env <staging|production>` (spec 0008, AC-14,
// *Scripts*): turns 2FA off, deletes its secret and backup codes, and ends every
// session for the user, in one transaction, for an agent who lost their phone.
import { confirmOnProduction, findProfile, finish, loadEnv, parseArgs, reminder, report } from "./operator";

async function main() {
  const target = parseArgs(process.argv.slice(2));
  loadEnv(target);
  await confirmOnProduction(target);

  const profile = await findProfile(target.email);
  const { db } = await import("@/lib/server/db");
  const [twoFactors, , sessions] = await db.$transaction([
    db.twoFactor.deleteMany({ where: { userId: profile.id } }),
    db.profile.update({ where: { id: profile.id }, data: { twoFactorEnabled: false } }),
    db.session.deleteMany({ where: { userId: profile.id } }),
  ]);

  console.log(`${target.email}: removed ${twoFactors.count} authenticator(s), ended ${sessions.count} session(s).`);
  console.log(reminder);
  await report("mfa_reset", target, profile.id, { authenticators: twoFactors.count, sessions: sessions.count });
  await finish();
}

void main();
