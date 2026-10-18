import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI runs outside Next.js, so load the same env files Next uses.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// Migrations go through DIRECT_URL (spec 0001); runtime uses DATABASE_URL.
// `prisma generate` needs no connection, so the datasource is only set when the
// URL exists (lets `postinstall` run on machines without a database).
// SHADOW_DATABASE_URL is optional: `migrate dev` and the drift check
// (`migrate diff --from-migrations`) replay migrations there (spec 0002, AC-14).
const directUrl = process.env.DIRECT_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `prisma db seed` loads areas and amenities; add `-- --sample` for demo data.
    seed: "tsx prisma/seed.ts",
  },
  ...(directUrl ? { datasource: { url: directUrl, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
