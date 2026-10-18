// Runs once when a server instance starts. Validates env up front so a missing
// variable fails at boot rather than on the first request that needs it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/lib/server/env");
    const { publicEnv } = await import("@/lib/env");
    serverEnv();
    publicEnv();
  }
}
