import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { transitionListing } from "@/lib/server/listing-status";
import { listSaved, savedForChat, savedLimit, savedListingIds, savedPageSize, setSaved } from "@/lib/server/saved-homes";
import { createListing, createProfile } from "./support/fixtures";

// Spec 0013 (assumed): saved homes.

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

describe("saving and unsaving", () => {
  it("saves PUBLISHED homes only, idempotently, and keeps a home that later leaves PUBLISHED", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    const { actor: other } = await createProfile("VISITOR");
    const home = await createListing(agent, { publish: true });
    const draft = await createListing(agent);

    expect(await setSaved(visitor, home.id, true)).toEqual({ ok: true });
    expect(await setSaved(visitor, home.id, true)).toEqual({ ok: true });
    expect(await setSaved(visitor, draft.id, true)).toEqual({ ok: false, reason: "not_found" });
    expect(await savedListingIds(visitor)).toEqual([home.id]);
    // Each visitor sees only their own.
    expect(await savedListingIds(other)).toEqual([]);

    await transitionListing(home.id, "UNPUBLISHED", agent);
    expect(await savedListingIds(visitor)).toEqual([home.id]);
    expect(await savedForChat(visitor)).toEqual([]);
    const page = await listSaved(visitor);
    expect(page.items).toEqual([{ listingId: home.id, available: false, title: home.title }]);

    // Unsaving works whatever the status, and twice is harmless.
    expect(await setSaved(visitor, home.id, false)).toEqual({ ok: true });
    expect(await setSaved(visitor, home.id, false)).toEqual({ ok: true });
    expect(await savedListingIds(visitor)).toEqual([]);
  });

  it(`stops at ${savedLimit} homes, but re-saving one already saved still works`, async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    const drafts: string[] = [];
    for (let i = 0; i < savedLimit; i++) drafts.push((await createListing(agent)).id);
    await db.savedHome.createMany({ data: drafts.map((listingId) => ({ userId: visitor.id, listingId })) });
    const home = await createListing(agent, { publish: true });

    expect(await setSaved(visitor, home.id, true)).toEqual({ ok: false, reason: "limit" });
    await setSaved(visitor, drafts[0], false);
    expect(await setSaved(visitor, home.id, true)).toEqual({ ok: true });
    expect(await setSaved(visitor, home.id, true)).toEqual({ ok: true });
    expect(await db.savedHome.count({ where: { userId: visitor.id } })).toBe(savedLimit);

    // Two quick saves at the edge never pass the cap together.
    const more = [await createListing(agent, { publish: true }), await createListing(agent, { publish: true })];
    await setSaved(visitor, drafts[1], false);
    const results = await Promise.all(more.map((l) => setSaved(visitor, l.id, true)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.savedHome.count({ where: { userId: visitor.id } })).toBe(savedLimit);
  }, 120_000);
});

describe("the saved list and the chat tab", () => {
  it("pages newest first without repeats, and the chat lists available homes only", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    const ids: string[] = [];
    for (let i = 0; i < savedPageSize + 3; i++) {
      const home = await createListing(agent, { publish: true });
      await setSaved(visitor, home.id, true);
      ids.push(home.id);
    }
    const first = await listSaved(visitor);
    expect(first.items).toHaveLength(savedPageSize);
    expect(first.items[0]).toMatchObject({ listingId: ids.at(-1), available: true });
    const second = await listSaved(visitor, first.nextCursor!);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.items, ...second.items].map((i) => i.listingId);
    expect(seen).toEqual([...ids].reverse());
    // A broken cursor starts again at the top.
    expect((await listSaved(visitor, "nonsense")).items[0].listingId).toBe(ids.at(-1));

    const chat = await savedForChat(visitor);
    expect(chat).toHaveLength(20);
    expect(chat[0]).toMatchObject({ listingId: ids.at(-1), priceBdt: 9_500_000 });
  }, 60_000);
});
