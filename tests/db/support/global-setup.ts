import { execFileSync } from "node:child_process";
import pg from "pg";
import { prismaEnv, testDatabaseUrl } from "./database";

// Rebuilds the test database once per run: an empty `public` schema with the
// Supabase API roles and their default grants (as a Supabase project has them),
// then every migration, then the seed with sample data.
export async function setup() {
  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
    `);
  } finally {
    await client.end();
  }

  const run = (args: string[]) => execFileSync("npx", args, { env: prismaEnv, stdio: "pipe" });
  run(["prisma", "migrate", "deploy"]);
  run(["tsx", "prisma/seed.ts", "--sample"]);
}
