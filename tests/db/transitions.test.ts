import { beforeAll, describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/lib/domain/errors";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { StaleStatusError } from "@/lib/server/errors";
import { transitionLead } from "@/lib/server/lead-status";
import { transitionListing } from "@/lib/server/listing-status";
import { transitionViewing } from "@/lib/server/viewing-status";
import { createListing, createProfile, bookViewing } from "./support/fixtures";
import { raceOnRow } from "./support/race";

// Spec 0002, AC-11: status changes only through the transition functions, which
// reject bad moves and bad actors, and fail cleanly on a concurrent change.

let agent: Actor;
let otherAgent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
  ({ actor: otherAgent } = await createProfile("AGENT"));
});

async function book() {
  const listing = await createListing(agent, { publish: true });
  const { actor: visitor } = await createProfile("VISITOR");
  return bookViewing(
    { listingId: listing.id, requestedFor: new Date(Date.now() + 86_400_000), name: "Rahim", phone: "+8801711111111" },
    visitor,
  );
}

describe("AC-11: leads", () => {
  it("lets one of two concurrent moves win and fails the other with StaleStatusError", async () => {
    const { lead } = await book();
    await transitionLead(lead.id, "CONTACTED", agent);

    const results = await raceOnRow("leads", lead.id, [
      () => transitionLead(lead.id, "QUALIFIED", agent),
      () => transitionLead(lead.id, "QUALIFIED", otherAgent),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(StaleStatusError);

    const saved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe("QUALIFIED");
    expect(saved.contactedAt).toBeInstanceOf(Date);
    const changes = await db.leadActivity.findMany({ where: { leadId: lead.id, type: "STATUS_CHANGE" } });
    expect(changes.map((a) => `${a.fromStatus}>${a.toStatus}`).sort()).toEqual(["CONTACTED>QUALIFIED", "NEW>CONTACTED"]);
  });

  it("keeps the first contacted_at and records a note", async () => {
    const { lead } = await book();
    const contacted = await transitionLead(lead.id, "QUALIFIED", agent, "  Wants a corner unit  ");
    const won = await transitionLead(lead.id, "WON", agent);
    expect(won.contactedAt).toEqual(contacted.contactedAt);
    const note = await db.leadActivity.findFirstOrThrow({ where: { leadId: lead.id, toStatus: "QUALIFIED" } });
    expect(note.body).toBe("Wants a corner unit");
  });

  it("rejects moves out of a terminal state and moves by a non agent, with no change", async () => {
    const { lead } = await book();
    await transitionLead(lead.id, "LOST", agent);
    await expect(transitionLead(lead.id, "CONTACTED", agent)).rejects.toBeInstanceOf(InvalidTransitionError);

    const { lead: open } = await book();
    const { actor: visitor } = await createProfile("VISITOR");
    await expect(transitionLead(open.id, "CONTACTED", visitor)).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await db.lead.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("NEW");
    expect(await db.leadActivity.count({ where: { leadId: open.id, type: "STATUS_CHANGE" } })).toBe(0);
  });
});

describe("AC-11: viewings", () => {
  it("confirms with a time, completes, and writes VIEWING_CHANGE activities", async () => {
    const { lead, viewing } = await book();
    const when = new Date(Date.now() + 2 * 86_400_000);
    await expect(transitionViewing(viewing.id, "CONFIRMED", agent)).rejects.toThrow(/confirmedFor/);

    const confirmed = await transitionViewing(viewing.id, "CONFIRMED", agent, { confirmedFor: when });
    expect(confirmed.confirmedFor).toEqual(when);
    await transitionViewing(viewing.id, "COMPLETED", agent);
    await expect(transitionViewing(viewing.id, "CONFIRMED", agent, { confirmedFor: when })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );

    const changes = await db.leadActivity.findMany({
      where: { leadId: lead.id, type: "VIEWING_CHANGE", fromStatus: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    expect(changes.map((a) => `${a.fromStatus}>${a.toStatus}`)).toEqual(["REQUESTED>CONFIRMED", "CONFIRMED>COMPLETED"]);
    expect((await db.viewing.findUniqueOrThrow({ where: { id: viewing.id } })).status).toBe("COMPLETED");
  });

  it("rejects a CONFIRMED viewing without a time in SQL", async () => {
    const { viewing } = await book();
    await expect(
      db.viewing.update({ where: { id: viewing.id }, data: { status: "CONFIRMED" } }),
    ).rejects.toThrow(/viewings_confirmed_time_ck/);
  });
});

describe("AC-11: listings", () => {
  it("rejects SOLD to PUBLISHED, and sets sold_at on SOLD", async () => {
    const listing = await createListing(agent, { publish: true });
    const sold = await transitionListing(listing.id, "SOLD", agent);
    expect(sold.soldAt).toBeInstanceOf(Date);
    await expect(transitionListing(listing.id, "PUBLISHED", agent)).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("SOLD");
  });

  it("stops a seller publishing directly, and lets any agent approve a submitted listing", async () => {
    const { actor: seller } = await createProfile("SELLER");
    const listing = await createListing(seller, { withCover: true });
    expect(listing.assignedAgentId).toBeNull();
    await expect(transitionListing(listing.id, "PUBLISHED", seller)).rejects.toBeInstanceOf(InvalidTransitionError);

    await transitionListing(listing.id, "PENDING_REVIEW", seller);
    const published = await transitionListing(listing.id, "PUBLISHED", otherAgent);
    expect(published).toMatchObject({ status: "PUBLISHED", assignedAgentId: otherAgent.id });
    expect(published.publishedAt).toBeInstanceOf(Date);
  });

  it("keeps the first published_at when a listing is published again", async () => {
    const listing = await createListing(agent, { publish: true });
    await transitionListing(listing.id, "UNPUBLISHED", agent);
    const again = await transitionListing(listing.id, "PUBLISHED", agent);
    expect(again.publishedAt).toEqual(listing.publishedAt);
  });

  it("refuses an agent who neither created nor is assigned the listing", async () => {
    const listing = await createListing(agent, { publish: true });
    await expect(transitionListing(listing.id, "UNPUBLISHED", otherAgent)).rejects.toThrow("Forbidden");
  });

  it("fails one of two concurrent changes with StaleStatusError", async () => {
    const listing = await createListing(agent, { publish: true });
    const results = await raceOnRow("listings", listing.id, [
      () => transitionListing(listing.id, "UNPUBLISHED", agent),
      () => transitionListing(listing.id, "SOLD", agent),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(StaleStatusError);
  });

  it("applies the same moves one after another when they do not overlap", async () => {
    const listing = await createListing(agent, { publish: true });
    await transitionListing(listing.id, "UNPUBLISHED", agent);
    expect((await transitionListing(listing.id, "SOLD", agent)).status).toBe("SOLD");
  });
});
