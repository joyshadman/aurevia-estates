import pg from "pg";
import { testDatabaseUrl } from "./database";

// Forces a real race on one row. A separate connection holds `FOR UPDATE` on it
// while `calls` start: each one reads the old status (plain reads are not
// blocked), then waits on its guarded update. Once every call is stuck on the
// lock, it is released and they run one after another, so the later ones see a
// status that changed after they read it.
export async function raceOnRow<T>(table: "leads" | "listings" | "viewings", id: string, calls: (() => Promise<T>)[]) {
  const lock = new pg.Client({ connectionString: testDatabaseUrl });
  await lock.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(`SELECT 1 FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    let settled = false;
    const results = Promise.allSettled(calls.map((call) => call())).finally(() => (settled = true));

    const deadline = Date.now() + 10_000;
    for (;;) {
      // Statistics views are frozen for the length of a transaction, and this
      // connection is inside one, so drop the snapshot before every look.
      await lock.query("SELECT pg_stat_clear_snapshot()");
      const { rows } = await lock.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
      );
      if (rows[0].waiting >= calls.length) break;
      if (settled || Date.now() > deadline) {
        await lock.query("ROLLBACK");
        const outcomes = (await results).map((r) => (r.status === "fulfilled" ? "fulfilled" : String(r.reason)));
        throw new Error(`Only ${rows[0].waiting} of ${calls.length} calls reached the lock: ${outcomes.join("; ")}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await lock.query("ROLLBACK");
    return await results;
  } finally {
    await lock.end();
  }
}
