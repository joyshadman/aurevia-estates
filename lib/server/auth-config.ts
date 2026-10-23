import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { BetterAuthPlugin } from "better-auth/types";
import { publicEnv } from "@/lib/env";
import { replaceUnprovenPassword, sendVerificationOTP } from "@/lib/server/auth-emails";
import { authError } from "@/lib/server/auth-errors";
import { db } from "@/lib/server/db";
import { authEnv, serverEnv } from "@/lib/server/env";

// The one Better Auth instance (spec 0008, *Better Auth configuration*), read by
// `lib/server/auth.ts`, the route handler, and the scripts. Built on first use,
// like `db`, so `next build` never needs runtime secrets.

const hour = 60 * 60;
const day = 24 * hour;

// An agent's session ends 12 hours after it was created and is never extended (AC-15).
export const agentSessionMs = 12 * hour * 1000;

// Paths reached over HTTP: Google's callback and Better Auth's own status pages.
// Everything else 404s, so the only way into auth is our server actions calling
// `auth.api.*`, which never pass through the HTTP router (AC-4). An allow list
// rather than `disabledPaths` (an exact match list), so a new endpoint is closed
// by default.
const openPaths = new Set(["/callback/google", "/error", "/ok"]);

const closedEndpoints = () =>
  ({
    id: "closed-endpoints",
    async onRequest(request, ctx) {
      const basePath = new URL(ctx.baseURL).pathname.replace(/\/$/, "");
      const path = new URL(request.url).pathname.slice(basePath.length) || "/";
      if (!openPaths.has(path)) return { response: new Response("Not Found", { status: 404 }) };
    },
  }) satisfies BetterAuthPlugin;

// Paths where Better Auth creates the session that follows a correct
// authenticator code (AC-8, spec 0008 *State transitions*).
const twoFactorVerifyPaths = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

function createAuth() {
  const site = publicEnv().NEXT_PUBLIC_SITE_URL;
  const env = authEnv();

  return betterAuth({
    appName: "Aurevia Estates",
    baseURL: site,
    secret: serverEnv().BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(site).origin],
    database: prismaAdapter(db, { provider: "postgresql" }),
    advanced: {
      // Ids are left to Prisma's `uuid(7)` default. A custom generator would make
      // Better Auth's deterministic reservation ids plain text, which a uuid
      // column rejects; with "uuid" they are uuid shaped too.
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip"] },
    },
    user: {
      modelName: "profile",
      fields: { name: "fullName", image: "avatarUrl" },
      // `input: false`: no auth request can set them (spec 0008, *Key invariants*).
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "VISITOR", input: false },
        phone: { type: "string", required: false, input: false },
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      modelName: "session",
      expiresIn: 30 * day,
      updateAge: day,
      freshAge: 15 * 60,
      // Read from the database on every request, so revocation is immediate (AC-8).
      cookieCache: { enabled: false },
      additionalFields: {
        twoFactorVerifiedAt: { type: "date", required: false, input: false },
      },
    },
    account: {
      modelName: "account",
      // No `trustedProviders`: Google links only when it reports the email verified (AC-5).
      accountLinking: { enabled: true },
    },
    verification: { modelName: "verification" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      // AC-3: sign up creates the account but no session.
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              // AC-6: the name and photo from Google, display data only.
              mapProfileToUser: (profile) => ({ name: profile.name ?? "", image: profile.picture }),
            },
          }
        : undefined,
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            return { data: { ...user, email: user.email.toLowerCase(), name: user.name?.trim() ?? "" } };
          },
        },
      },
      session: {
        create: {
          async before(session, ctx) {
            const profile = await db.profile.findUnique({
              where: { id: session.userId },
              select: { role: true, deletedAt: true },
            });
            // AC-6: a deleted account gets no session at all.
            if (!profile || profile.deletedAt) throw authError("ACCOUNT_DELETED", "This account has been deleted");
            const data = { ...session };
            if (ctx?.path && twoFactorVerifyPaths.has(ctx.path)) data.twoFactorVerifiedAt = new Date();
            if (profile.role === "AGENT") data.expiresAt = new Date(Date.now() + agentSessionMs);
            return { data };
          },
        },
        update: {
          // The daily refresh must not stretch an agent's 12 hours to 30 days
          // (AC-15). The update carries no user, so find the session by its cookie.
          async before(session, ctx) {
            if (!session.expiresAt || !ctx) return;
            const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
            if (!token) return;
            const row = await db.session.findUnique({ where: { token }, select: { user: { select: { role: true } } } });
            if (row?.user.role === "AGENT") return { data: { ...session, expiresAt: undefined } };
          },
        },
      },
      account: {
        create: {
          // AC-5: linking Google to a never verified account replaces any
          // password set on it first; Google has now verified the address.
          async before(account) {
            if (account.providerId === "credential") return;
            const profile = await db.profile.findUnique({ where: { id: account.userId }, select: { emailVerified: true } });
            if (profile && !profile.emailVerified) {
              await replaceUnprovenPassword(account.userId);
              await db.profile.update({ where: { id: account.userId }, data: { emailVerified: true } });
            }
          },
        },
      },
    },
    plugins: [
      closedEndpoints(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        sendVerificationOTP,
      }),
      // One authenticator plus backup codes (AC-9). No trusted devices and no
      // `skipVerificationOnEnable`: 2FA turns on only after a correct first code.
      // Confirmed in 1.7.12: that first code replaces the session, so the
      // `session.create.before` hook above stamps `twoFactorVerifiedAt` on it.
      twoFactor({ issuer: "Aurevia Estates", twoFactorCookieMaxAge: 600 }),
      // Last, so it sees every cookie the other plugins set.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
