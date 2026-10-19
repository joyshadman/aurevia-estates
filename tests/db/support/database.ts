// Where the database tests run. Defaults to the local Podman Postgres; override
// with TEST_DATABASE_URL and SHADOW_DATABASE_URL. Refuses any host that is not
// this machine, because the setup drops and rebuilds the whole `public` schema.
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function local(name: string, fallback: string): string {
  const url = process.env[name] || fallback;
  const { hostname } = new URL(url);
  if (!localHosts.has(hostname)) {
    throw new Error(`${name} must point at a local throwaway database, not ${hostname}.`);
  }
  return url;
}

export const testDatabaseUrl = local("TEST_DATABASE_URL", "postgresql://postgres:shadow@127.0.0.1:54329/aurevia_test");
export const shadowDatabaseUrl = local("SHADOW_DATABASE_URL", "postgresql://postgres:shadow@127.0.0.1:54329/shadow");

// Env for Prisma CLI calls. `prisma.config.ts` loads `.env.local` with dotenv,
// which never overrides a variable that is already set.
export const prismaEnv = {
  ...process.env,
  DIRECT_URL: testDatabaseUrl,
  DATABASE_URL: testDatabaseUrl,
  SHADOW_DATABASE_URL: shadowDatabaseUrl,
};
