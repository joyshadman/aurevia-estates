import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

// UI checks that need no real backend run against placeholder values: no test
// here signs in, so the database and Resend are never called.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${port}`,
    url: `http://localhost:${port}/styleguide`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
      // hCaptcha test keys: the widget always passes and siteverify always succeeds.
      NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "10000000-ffff-ffff-ffff-000000000001",
      HCAPTCHA_SECRET: "0x0000000000000000000000000000000000000000",
      RESEND_API_KEY: "re_e2e_placeholder",
      AUTH_EMAIL_FROM: "Aurevia Estates <e2e@aurevia.example>",
      // spec 0008: 32+ characters, a fixed test value.
      BETTER_AUTH_SECRET: "e2e-placeholder-secret-0123456789abcdef",
      DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:5/e2e",
    },
  },
});
