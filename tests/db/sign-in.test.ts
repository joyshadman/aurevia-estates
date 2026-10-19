import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { ensureProfile } from "@/lib/server/sign-in";
import { uuidv7 } from "@/lib/server/uuid";

// Spec 0004, AC-6: the profile exists before the first redirect after sign in.

const user = (meta: Record<string, unknown> = {}): User =>
  ({ id: uuidv7(), email: `new.${Date.now()}.${Math.random()}@test.example`, user_metadata: meta }) as unknown as User;

describe("AC-6: ensureProfile", () => {
  it("creates a VISITOR profile with Google's name and photo, once", async () => {
    const google = user({ name: "Rahim Uddin", picture: "https://lh3.googleusercontent.com/a/photo" });
    const [a, b] = await Promise.all([ensureProfile(google), ensureProfile(google)]);
    expect(a).toEqual({ role: "VISITOR", deletedAt: null });
    expect(b).toEqual(a);
    expect(await db.profile.findUniqueOrThrow({ where: { id: google.id } })).toMatchObject({
      email: google.email,
      fullName: "Rahim Uddin",
      avatarUrl: "https://lh3.googleusercontent.com/a/photo",
    });
  });

  it("never changes an existing profile, and reports a tombstone", async () => {
    const existing = user();
    await ensureProfile(existing);
    await db.profile.update({ where: { id: existing.id }, data: { role: "AGENT", fullName: "Kept", deletedAt: new Date() } });
    const again = await ensureProfile({ ...existing, user_metadata: { full_name: "Changed" } } as User);
    expect(again.role).toBe("AGENT");
    expect(again.deletedAt).toBeInstanceOf(Date);
    expect((await db.profile.findUniqueOrThrow({ where: { id: existing.id } })).fullName).toBe("Kept");
  });
});
