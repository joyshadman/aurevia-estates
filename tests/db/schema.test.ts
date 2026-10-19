import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { amenities, areas, sampleListings } from "@/prisma/seed-data";
import { prismaEnv } from "./support/database";

// Spec 0002: AC-1 (migrations, RLS, no API grants), AC-2 (seed), AC-14 (drift).

// Prisma's own bookkeeping table, not an app table.
const migrationsTable = "_prisma_migrations";

async function appTables() {
  const rows = await db.$queryRaw<{ name: string; rls: boolean }[]>`
    SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> ${migrationsTable}
    ORDER BY c.relname`;
  return rows;
}

describe("AC-1: migrations, row level security, and grants", () => {
  it("creates every slice 1 table", async () => {
    const names = (await appTables()).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ai_usage_daily", "amenities", "areas", "chat_messages", "conversations", "lead_activities", "leads",
        "listing_amenities", "listing_photos", "listing_recommendations", "listings", "profiles", "search_briefs",
        "viewings",
      ]),
    );
  });

  it("enables RLS on every app table, with no policies", async () => {
    const tables = await appTables();
    expect(tables.filter((t) => !t.rls)).toEqual([]);
    const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_policies WHERE schemaname = 'public'`;
    expect(count).toBe(BigInt(0));
  });

  it("leaves anon and authenticated with no grant on any app table or the ref sequence", async () => {
    const grants = await db.$queryRaw<{ grantee: string; table_name: string; privilege_type: string }[]>`
      SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND table_name <> ${migrationsTable}`;
    expect(grants).toEqual([]);
    const [sequence] = await db.$queryRaw<{ anon: boolean; authenticated: boolean }[]>`
      SELECT has_sequence_privilege('anon', 'listing_ref_seq', 'USAGE') AS anon,
             has_sequence_privilege('authenticated', 'listing_ref_seq', 'USAGE') AS authenticated`;
    expect(sequence).toEqual({ anon: false, authenticated: false });
  });

  it("denies the anon role a read of listings and profiles", async () => {
    for (const table of ["listings", "profiles"]) {
      const attempt = db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE anon");
        return tx.$queryRawUnsafe(`SELECT * FROM ${table} LIMIT 1`);
      });
      await expect(attempt).rejects.toThrow(/permission denied/);
    }
  });
});

describe("AC-2: seed", () => {
  const counts = async () => ({
    areas: await db.area.count({ where: { slug: { in: areas.map((a) => a.slug) } } }),
    amenities: await db.amenity.count({ where: { slug: { in: amenities.map((a) => a.slug) } } }),
    samples: await db.listing.count({ where: { refCode: { in: sampleListings.map((l) => l.refCode) } } }),
  });

  it("loads the areas, the amenity list, and the sample listings", async () => {
    expect(await counts()).toEqual({ areas: areas.length, amenities: amenities.length, samples: sampleListings.length });
    const zindabazar = await db.area.findUniqueOrThrow({ where: { slug: "zindabazar" } });
    expect(zindabazar.nameBn).toBe("জিন্দাবাজার");
  });

  it("creates no duplicates when run again", async () => {
    const before = await counts();
    execFileSync("npx", ["tsx", "prisma/seed.ts", "--sample"], { env: prismaEnv, stdio: "pipe" });
    expect(await counts()).toEqual(before);
  });

  it("moves the ref sequence past the fixed sample refs", async () => {
    const [{ value }] = await db.$queryRaw<{ value: bigint }[]>`SELECT last_value AS value FROM listing_ref_seq`;
    expect(value >= BigInt(1010)).toBe(true);
  });
});

describe("AC-14: no drift", () => {
  it("matches the migrations to schema.prisma", () => {
    const run = () =>
      execFileSync(
        "npx",
        ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"],
        { env: prismaEnv, stdio: "pipe" },
      );
    expect(run).not.toThrow();
  });
});
