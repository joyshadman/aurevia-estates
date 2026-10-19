import { afterAll } from "vitest";
import { testDatabaseUrl } from "./database";

// What `serverEnv()` and `publicEnv()` read. The Supabase values are never used
// for a network call: the one test that needs a session mocks the client.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable";

afterAll(async () => {
  const { db } = await import("@/lib/server/db");
  await db.$disconnect();
});
