import { beforeAll, describe, expect, it } from "vitest";
import { publishChecklist } from "@/lib/domain/publish-checklist";
import {
  addPhoto,
  createDraft,
  deleteDraft,
  getListingForEdit,
  listAgencyListings,
  markListingSold,
  movePhoto,
  publishWithSave,
  reassignListing,
  removePhoto,
  saveListing,
  setCoverPhoto,
  unpublishListing,
  updatePhotoAlt,
} from "@/lib/server/agent-listings";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { searchPublishedListings } from "@/lib/server/listings";
import { resolveLocation } from "@/lib/server/location";
import { checkPhotoUrl, normalizePhotoUrl } from "@/lib/server/photo-links";
import { createAmenity, createArea, createListing, createProfile, expectConstraint, firstArea } from "./support/fixtures";

// Spec 0005: agent listing management.

// A scripted `fetch`: each URL answers with the given status and headers.
type Reply = { status: number; headers?: Record<string, string> };
function fakeFetch(replies: Record<string, Reply>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const reply = replies[url];
    if (!reply) throw new TypeError(`fetch failed: ${url}`);
    return new Response(reply.status >= 300 && reply.status < 400 ? null : "x", {
      status: reply.status,
      headers: reply.headers,
    });
  }) as typeof fetch;
}

const jpeg = (size = 1000): Reply => ({
  status: 206,
  headers: { "content-type": "image/jpeg", "content-range": `bytes 0-0/${size}` },
});

let photoN = 0;
const unsplash = () => `https://images.unsplash.com/photo-test-${Date.now()}-${photoN++}`;
const okFetch = (url: string) => fakeFetch({ [url]: jpeg() });

const longDescription = "A bright family apartment with a south facing balcony, close to schools and markets.";

let agent: Actor;
let colleague: Actor;
let visitor: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT", { fullName: "Nadia Rahman" }));
  ({ actor: colleague } = await createProfile("AGENT", { fullName: "Mahbub Alam" }));
  ({ actor: visitor } = await createProfile("VISITOR"));
});

async function newDraft(actor = agent, overrides: { title?: string; propertyType?: "APARTMENT" | "PLOT" } = {}) {
  const area = await firstArea();
  const result = await createDraft(
    { title: overrides.title ?? "Garden view apartment", propertyType: overrides.propertyType ?? "APARTMENT", areaId: area.id },
    actor,
  );
  if (!result.ok) throw new Error(result.reason);
  const listing = await db.listing.findUniqueOrThrow({ where: { id: result.id } });
  return { id: listing.id, token: listing.updatedAt.toISOString(), listing };
}

const apartmentFields = {
  addressLine: "House 12, Road 4, Uposhohor",
  priceBdt: 12_500_000,
  bedrooms: 3,
  bathrooms: 2,
  builtUpSqft: 1450,
  floorNumber: 5,
  completionStatus: "READY" as const,
  latitude: 24.8949,
  longitude: 91.8687,
  description: longDescription,
};

async function addOkPhoto(id: string, token: string, actor = agent) {
  const url = unsplash();
  const result = await addPhoto({ listingId: id, expectedUpdatedAt: token, url }, actor, { fetch: okFetch(url) });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("AC-2, AC-5: create a draft, fill it, publish", () => {
  it("creates a draft with ref, slug, creator, and assignee, leaving price, address, and description empty", async () => {
    const { listing } = await newDraft();
    expect(listing.status).toBe("DRAFT");
    expect(listing.refCode).toMatch(/^AUR-\d{4,}$/);
    expect(listing.slug).toContain(listing.refCode.toLowerCase());
    expect(listing.createdById).toBe(agent.id);
    expect(listing.assignedAgentId).toBe(agent.id);
    expect([listing.priceBdt, listing.addressLine, listing.description]).toEqual([null, null, null]);
    expect(listing.updatedAt.getMilliseconds() * 1000).toBe(listing.updatedAt.getTime() % 1000 * 1000);
  });

  it("refuses a short title and an unknown area", async () => {
    const result = await createDraft({ title: "Flat", propertyType: "APARTMENT", areaId: crypto.randomUUID() }, agent);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(Object.keys((result as { fieldErrors: object }).fieldErrors)).toContain("title");
  });

  it("publishes with unsaved edits in one step and the listing reaches search", async () => {
    const { id, token } = await newDraft();
    const photo = await addOkPhoto(id, token);
    const result = await publishWithSave({ id, expectedUpdatedAt: photo.updatedAt, fields: apartmentFields }, agent);
    expect(result).toMatchObject({ ok: true });
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("PUBLISHED");
    expect(row.description).toBe(longDescription);
    expect(row.updatedAt.toISOString()).toBe((result as { updatedAt: string }).updatedAt);

    const { items } = await searchPublishedListings({ areaIds: [row.areaId], limit: 24 });
    expect(items.map((i) => i.refCode)).toContain(row.refCode);
  });

  it("refuses to publish an incomplete draft and writes nothing", async () => {
    const { id, token } = await newDraft();
    const result = await publishWithSave(
      { id, expectedUpdatedAt: token, fields: { addressLine: "Somewhere", description: "Too short" } },
      agent,
    );
    expect(result).toMatchObject({ ok: false, reason: "incomplete" });
    expect((result as { missing: string[] }).missing).toEqual(
      expect.arrayContaining(["Price", "At least one photo", "Map location"]),
    );
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.addressLine).toBeNull();
    expect(row.status).toBe("DRAFT");
  });

  it("the database refuses a published listing without a price", async () => {
    const listing = await createListing(agent, { publish: true });
    await expectConstraint(
      db.listing.update({ where: { id: listing.id }, data: { priceBdt: null } }),
      "listings_published_complete_ck",
    );
  });

  it("never publishes without a cover when the only photo is removed at the same moment", async () => {
    const { id, token } = await newDraft();
    const photo = await addOkPhoto(id, token);
    const publish = publishWithSave({ id, expectedUpdatedAt: photo.updatedAt, fields: apartmentFields }, agent);
    const remove = removePhoto({ photoId: photo.photo.id, expectedUpdatedAt: photo.updatedAt }, agent);
    const [published, removed] = await Promise.all([publish, remove]);
    const row = await db.listing.findUniqueOrThrow({ where: { id }, include: { photos: true } });
    if (row.status === "PUBLISHED") {
      expect(row.photos.some((p) => p.isCover)).toBe(true);
      expect(removed).toMatchObject({ ok: false, reason: "last_cover" });
    } else {
      expect(published).toMatchObject({ ok: false });
      expect(row.photos).toHaveLength(0);
    }
  });
});

describe("AC-3, AC-4, AC-9: partial saves and type rules", () => {
  it("leaves omitted fields alone, clears null ones, and keeps amenities without a list", async () => {
    const amenity = await createAmenity();
    const { id, token } = await newDraft();
    const first = await saveListing(
      { id, expectedUpdatedAt: token, fields: { priceBdt: 9_000_000, addressLine: "Road 1", amenityIds: [amenity.id] } },
      agent,
    );
    expect(first.ok).toBe(true);
    const second = await saveListing(
      { id, expectedUpdatedAt: (first as { updatedAt: string }).updatedAt, fields: { addressLine: null, bedrooms: 2 } },
      agent,
    );
    expect(second.ok).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id }, include: { amenities: true } });
    expect(row.priceBdt).toBe(BigInt(9_000_000));
    expect(row.addressLine).toBeNull();
    expect(row.bedrooms).toBe(2);
    expect(row.amenities.map((a) => a.amenityId)).toEqual([amenity.id]);
  });

  it("treats empty text as a clear", async () => {
    const { id, token } = await newDraft();
    const result = await saveListing({ id, expectedUpdatedAt: token, fields: { description: "   " } }, agent);
    expect(result.ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).description).toBeNull();
  });

  it("clears fields the type must leave empty, even when sent", async () => {
    const { id, token } = await newDraft(agent, { propertyType: "PLOT" });
    const result = await saveListing({ id, expectedUpdatedAt: token, fields: { bedrooms: 4, landKatha: 5.5 } }, agent);
    expect(result.ok).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.bedrooms).toBeNull();
    expect(row.landKatha?.toNumber()).toBe(5.5);
  });

  it("clears the old type's fields on a type change and the handover date when ready", async () => {
    const { id, token } = await newDraft();
    const first = await saveListing(
      {
        id,
        expectedUpdatedAt: token,
        fields: { floorNumber: 3, bedrooms: 2, completionStatus: "UNDER_CONSTRUCTION", handoverDate: "2027-06-30" },
      },
      agent,
    );
    expect(first.ok).toBe(true);
    const second = await saveListing(
      { id, expectedUpdatedAt: (first as { updatedAt: string }).updatedAt, fields: { propertyType: "PLOT", landKatha: 3 } },
      agent,
    );
    expect(second.ok).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect([row.floorNumber, row.bedrooms, row.completionStatus, row.handoverDate]).toEqual([null, null, null, null]);
  });

  it("refuses to save a published listing into an incomplete state", async () => {
    const listing = await createListing(agent, { publish: true, description: longDescription });
    const result = await saveListing(
      { id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString(), fields: { addressLine: null } },
      agent,
    );
    expect(result).toMatchObject({ ok: false, reason: "incomplete" });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).addressLine).not.toBeNull();
  });

  it("puts a saved published change into search at once", async () => {
    const listing = await createListing(agent, { publish: true, description: longDescription });
    const result = await saveListing(
      { id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString(), fields: { priceBdt: 7_777_777 } },
      agent,
    );
    expect(result.ok).toBe(true);
    const { items } = await searchPublishedListings({ minPrice: 7_777_777, maxPrice: 7_777_777 });
    expect(items.map((i) => i.refCode)).toContain(listing.refCode);
  });
});

describe("AC-6, AC-14: price and description rules", () => {
  it("refuses zero, fractions, and prices over ten billion", async () => {
    const { id, token } = await newDraft();
    for (const priceBdt of [0, 12.5, 10_000_000_001]) {
      const result = await saveListing({ id, expectedUpdatedAt: token, fields: { priceBdt } }, agent);
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("accepts up to 3,000 characters on a draft, not more", async () => {
    const { id, token } = await newDraft();
    const over = await saveListing({ id, expectedUpdatedAt: token, fields: { description: "a".repeat(3001) } }, agent);
    expect(over).toMatchObject({ ok: false, reason: "invalid" });
    const ok = await saveListing({ id, expectedUpdatedAt: token, fields: { description: "Short note." } }, agent);
    expect(ok.ok).toBe(true);
  });

  it("checklist needs 50 to 3,000 characters to publish", () => {
    const base = { propertyType: "PLOT" as const, landKatha: 3, priceBdt: 1, addressLine: "x", latitude: 24.9, longitude: 91.8 };
    const photos = [{ isCover: true }];
    expect(publishChecklist({ ...base, description: "a".repeat(49) }, photos).complete).toBe(false);
    expect(publishChecklist({ ...base, description: "a".repeat(50) }, photos).complete).toBe(true);
    expect(publishChecklist({ ...base, description: "a".repeat(3001) }, photos).complete).toBe(false);
  });
});

describe("AC-7: location", () => {
  it("reads plain coordinates, long links, and short links, rounded to 6 decimals", async () => {
    expect(await resolveLocation("24.89491234, 91.8687")).toEqual({ ok: true, latitude: 24.894912, longitude: 91.8687 });
    expect(
      await resolveLocation("https://www.google.com/maps/place/Sylhet/@24.9,91.87,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d24.8949!4d91.8687"),
    ).toEqual({ ok: true, latitude: 24.8949, longitude: 91.8687 });
    expect(await resolveLocation("https://www.google.com/maps/@24.91,91.86,17z")).toEqual({
      ok: true,
      latitude: 24.91,
      longitude: 91.86,
    });
    const fetch = fakeFetch({
      "https://maps.app.goo.gl/abc123": { status: 302, headers: { location: "https://www.google.com/maps?q=24.9,91.85" } },
      "https://www.google.com/maps?q=24.9,91.85": { status: 200 },
    });
    expect(await resolveLocation("maps.app.goo.gl/abc123", { fetch })).toEqual({ ok: true, latitude: 24.9, longitude: 91.85 });
  });

  // The AC-7 rectangle contains Kolkata (22.57, 88.36), so Delhi stands in for
  // "outside Bangladesh"; refusing Kolkata needs a border shape, not a rectangle.
  it("refuses Delhi, other sites, and the consent page", async () => {
    expect(await resolveLocation("28.6139, 77.209")).toEqual({ ok: false, reason: "outside_bangladesh" });
    expect(await resolveLocation("https://example.com/maps/@24.9,91.87")).toEqual({ ok: false, reason: "location_unreadable" });
    const fetch = fakeFetch({
      "https://maps.app.goo.gl/xyz": { status: 302, headers: { location: "https://consent.google.com/m?continue=x" } },
    });
    expect(await resolveLocation("https://maps.app.goo.gl/xyz", { fetch })).toEqual({ ok: false, reason: "location_unreadable" });
  });

  it("refuses coordinates outside Bangladesh on a direct save", async () => {
    const { id, token } = await newDraft();
    const result = await saveListing({ id, expectedUpdatedAt: token, fields: { latitude: 28.6139, longitude: 77.209 } }, agent);
    expect(result).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { latitude: expect.any(String) } });
  });
});

describe("AC-8: photo links", () => {
  it("converts Drive share links and refuses other hosts, http, and Cloudinary fetch", () => {
    expect(normalizePhotoUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing")).toMatchObject({
      ok: true,
      url: "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp=w2000",
      isDrive: true,
    });
    expect(normalizePhotoUrl("http://images.unsplash.com/photo-1")).toEqual({ ok: false, reason: "host_not_allowed" });
    expect(normalizePhotoUrl("https://evil.images.unsplash.com.example.com/x")).toEqual({ ok: false, reason: "host_not_allowed" });
    expect(normalizePhotoUrl("https://res.cloudinary.com/demo/image/fetch/https://x.com/a.jpg")).toEqual({
      ok: false,
      reason: "host_not_allowed",
    });
    expect(normalizePhotoUrl("https://res.cloudinary.com/demo/image/upload/v1/house.jpg")).toMatchObject({ ok: true });
  });

  it("checks type, size, private Drive files, removed Imgur images, and bad redirects", async () => {
    const pdf = "https://i.imgur.com/doc.pdf";
    expect(await checkPhotoUrl(pdf, { fetch: fakeFetch({ [pdf]: { status: 200, headers: { "content-type": "application/pdf" } } }) })).toEqual({
      ok: false,
      reason: "not_an_image",
    });
    const big = "https://i.imgur.com/big.jpg";
    expect(await checkPhotoUrl(big, { fetch: fakeFetch({ [big]: jpeg(20 * 1024 * 1024) }) })).toEqual({ ok: false, reason: "too_large" });
    const gone = "https://i.imgur.com/gone.jpg";
    expect(
      await checkPhotoUrl(gone, { fetch: fakeFetch({ [gone]: { status: 302, headers: { location: "/removed.png" } } }) }),
    ).toEqual({ ok: false, reason: "image_removed" });
    const drive = "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp=w2000";
    expect(
      await checkPhotoUrl(drive, {
        isDrive: true,
        fetch: fakeFetch({ [drive]: { status: 302, headers: { location: "https://accounts.google.com/signin" } } }),
      }),
    ).toEqual({ ok: false, reason: "drive_not_shared" });
    const hop = "https://images.unsplash.com/redirects";
    expect(
      await checkPhotoUrl(hop, { fetch: fakeFetch({ [hop]: { status: 301, headers: { location: "http://10.0.0.1/a.jpg" } } }) }),
    ).toEqual({ ok: false, reason: "redirect_not_allowed" });
    expect(await checkPhotoUrl("https://images.unsplash.com/down", { fetch: fakeFetch({}) })).toEqual({ ok: false, reason: "unreachable" });
  });

  it("makes the first photo the cover, refuses duplicates and the 21st photo", async () => {
    const { id, token } = await newDraft();
    const url = unsplash();
    const first = await addPhoto({ listingId: id, expectedUpdatedAt: token, url }, agent, { fetch: okFetch(url) });
    expect(first).toMatchObject({ ok: true, photo: { isCover: true, alt: "Garden view apartment" } });
    const again = await addPhoto({ listingId: id, expectedUpdatedAt: (first as { updatedAt: string }).updatedAt, url }, agent, {
      fetch: okFetch(url),
    });
    expect(again).toMatchObject({ ok: false, reason: "duplicate" });

    await db.listingPhoto.createMany({
      data: Array.from({ length: 19 }, (_, i) => ({ listingId: id, url: `https://images.unsplash.com/fill-${id}-${i}`, sortOrder: i + 1, alt: "x" })),
    });
    const extra = unsplash();
    const current = (await db.listing.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    expect(await addPhoto({ listingId: id, expectedUpdatedAt: current, url: extra }, agent, { fetch: okFetch(extra) })).toMatchObject({
      ok: false,
      reason: "photo_limit",
    });
  });

  it("moves, sets cover, edits alt, and hands a draft's cover to the next photo on removal", async () => {
    const { id, token } = await newDraft();
    const a = await addOkPhoto(id, token);
    const b = await addOkPhoto(id, a.updatedAt);
    const moved = await movePhoto({ photoId: b.photo.id, expectedUpdatedAt: b.updatedAt, direction: "up" }, agent);
    expect(moved.ok).toBe(true);
    let photos = await db.listingPhoto.findMany({ where: { listingId: id }, orderBy: { sortOrder: "asc" } });
    expect(photos.map((p) => p.id)).toEqual([b.photo.id, a.photo.id]);

    const alt = await updatePhotoAlt(
      { photoId: a.photo.id, expectedUpdatedAt: (moved as { updatedAt: string }).updatedAt, alt: "Living room" },
      agent,
    );
    expect(alt.ok).toBe(true);
    const removed = await removePhoto({ photoId: a.photo.id, expectedUpdatedAt: (alt as { updatedAt: string }).updatedAt }, agent);
    expect(removed.ok).toBe(true);
    photos = await db.listingPhoto.findMany({ where: { listingId: id } });
    expect(photos).toEqual([expect.objectContaining({ id: b.photo.id, isCover: true })]);
  });

  it("refuses to remove a published listing's cover", async () => {
    const { id, token } = await newDraft();
    const a = await addOkPhoto(id, token);
    const b = await addOkPhoto(id, a.updatedAt);
    const published = await publishWithSave({ id, expectedUpdatedAt: b.updatedAt, fields: apartmentFields }, agent);
    expect(published.ok).toBe(true);
    const tokenNow = (published as { updatedAt: string }).updatedAt;
    expect(await removePhoto({ photoId: a.photo.id, expectedUpdatedAt: tokenNow }, agent)).toMatchObject({ ok: false, reason: "last_cover" });
    const cover = await setCoverPhoto({ photoId: b.photo.id, expectedUpdatedAt: tokenNow }, agent);
    expect(cover.ok).toBe(true);
    expect(await removePhoto({ photoId: a.photo.id, expectedUpdatedAt: (cover as { updatedAt: string }).updatedAt }, agent)).toMatchObject({
      ok: true,
    });
  });
});

describe("AC-10: lifecycle", () => {
  it("unpublish removes from search; publish again restores; mark sold makes it read only", async () => {
    const listing = await createListing(agent, { publish: true, description: longDescription });
    const off = await unpublishListing({ id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString() }, agent);
    expect(off.ok).toBe(true);
    let found = await searchPublishedListings({ minPrice: 9_500_000, maxPrice: 9_500_000, limit: 24 });
    expect(found.items.map((i) => i.refCode)).not.toContain(listing.refCode);

    const on = await publishWithSave({ id: listing.id, expectedUpdatedAt: (off as { updatedAt: string }).updatedAt, fields: {} }, agent);
    expect(on.ok).toBe(true);
    found = await searchPublishedListings({ minPrice: 9_500_000, maxPrice: 9_500_000, limit: 24 });
    expect(found.items.map((i) => i.refCode)).toContain(listing.refCode);

    const sold = await markListingSold({ id: listing.id, expectedUpdatedAt: (on as { updatedAt: string }).updatedAt }, agent);
    expect(sold.ok).toBe(true);
    const edit = await getListingForEdit(listing.id, agent);
    expect(edit?.status).toBe("SOLD");
    expect(edit?.canEdit).toBe(false);
    expect(
      await saveListing({ id: listing.id, expectedUpdatedAt: (sold as { updatedAt: string }).updatedAt, fields: { title: "Changed title" } }, agent),
    ).toMatchObject({ ok: false, reason: "stale_status" });
  });

  it("deletes a draft and refuses to delete anything else", async () => {
    const { id } = await newDraft();
    expect(await deleteDraft({ id }, agent)).toEqual({ ok: true });
    expect(await db.listing.findUnique({ where: { id } })).toBeNull();

    const listing = await createListing(agent, { publish: true, description: longDescription });
    const off = await unpublishListing({ id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString() }, agent);
    expect(off.ok).toBe(true);
    expect(await deleteDraft({ id: listing.id }, agent)).toMatchObject({ ok: false, reason: "not_deletable" });
  });
});

describe("AC-11, AC-12: reassign and editing rights", () => {
  it("moves open leads with a SYSTEM note, leaves closed ones, and hands over editing", async () => {
    const listing = await createListing(agent, { publish: true, description: longDescription });
    const { actor: buyerA } = await createProfile("VISITOR");
    const { actor: buyerB } = await createProfile("VISITOR");
    const { actor: buyerC } = await createProfile("VISITOR");
    const lead = (visitorId: string, status: "NEW" | "CONTACTED" | "WON") =>
      db.lead.create({
        data: { source: "CHAT_BOOKING", status, visitorId, listingId: listing.id, assignedAgentId: agent.id, contactName: "Buyer", contactPhone: "+8801712345678" },
      });
    const [open1, open2, won] = await Promise.all([lead(buyerA.id, "NEW"), lead(buyerB.id, "CONTACTED"), lead(buyerC.id, "WON")]);

    // The colleague creates nothing here, so first hand the listing from creator to colleague and back.
    const result = await reassignListing(
      { id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString(), agentId: colleague.id },
      agent,
    );
    expect(result).toMatchObject({ ok: true, movedLeads: 2 });

    const leads = await db.lead.findMany({ where: { id: { in: [open1.id, open2.id, won.id] } }, include: { activities: true } });
    const byId = new Map(leads.map((l) => [l.id, l]));
    expect(byId.get(open1.id)?.assignedAgentId).toBe(colleague.id);
    expect(byId.get(open2.id)?.assignedAgentId).toBe(colleague.id);
    expect(byId.get(won.id)?.assignedAgentId).toBe(agent.id);
    expect(byId.get(open1.id)?.activities[0]).toMatchObject({
      type: "SYSTEM",
      body: "Reassigned from Nadia Rahman to Mahbub Alam with the listing",
    });

    // The colleague can now edit; the creator still can too.
    const edit = await getListingForEdit(listing.id, colleague);
    expect(edit?.canEdit).toBe(true);

    // Same agent again changes nothing.
    const same = await reassignListing(
      { id: listing.id, expectedUpdatedAt: (result as { updatedAt: string }).updatedAt, agentId: colleague.id },
      colleague,
    );
    expect(same).toMatchObject({ ok: true, movedLeads: 0 });
    expect(same).not.toHaveProperty("formStale");
  });

  it("a former assignee who is not the creator loses rights", async () => {
    const { actor: third } = await createProfile("AGENT", { fullName: "Third Agent" });
    const listing = await createListing(agent);
    const toColleague = await reassignListing(
      { id: listing.id, expectedUpdatedAt: listing.updatedAt.toISOString(), agentId: colleague.id },
      agent,
    );
    const toThird = await reassignListing(
      { id: listing.id, expectedUpdatedAt: (toColleague as { updatedAt: string }).updatedAt, agentId: third.id },
      colleague,
    );
    expect(toThird.ok).toBe(true);
    expect((await getListingForEdit(listing.id, colleague))?.canEdit).toBe(false);
    expect(
      await saveListing({ id: listing.id, expectedUpdatedAt: (toThird as { updatedAt: string }).updatedAt, fields: { bedrooms: 1 } }, colleague),
    ).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("refuses visitors, deleted agents, and other agents' saves", async () => {
    const listing = await createListing(agent);
    const token = listing.updatedAt.toISOString();
    expect(await saveListing({ id: listing.id, expectedUpdatedAt: token, fields: { bedrooms: 1 } }, colleague)).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    expect(await saveListing({ id: listing.id, expectedUpdatedAt: token, fields: { bedrooms: 1 } }, visitor)).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    const { profile: gone } = await createProfile("AGENT");
    await db.profile.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect(await reassignListing({ id: listing.id, expectedUpdatedAt: token, agentId: gone.id }, agent)).toMatchObject({
      ok: false,
      reason: "invalid_agent",
    });
    expect(await reassignListing({ id: listing.id, expectedUpdatedAt: token, agentId: visitor.id }, agent)).toMatchObject({
      ok: false,
      reason: "invalid_agent",
    });
    const read = await getListingForEdit(listing.id, colleague);
    expect(read).toMatchObject({ canEdit: false, creatorName: "Nadia Rahman" });
  });
});

describe("AC-13: conflicts", () => {
  it("a stale save is refused, a stale photo action applies with formStale, own actions never conflict", async () => {
    const { id, token } = await newDraft();
    const b = await saveListing({ id, expectedUpdatedAt: token, fields: { bedrooms: 2 } }, agent);
    expect(b.ok).toBe(true);

    // A still holds `token`.
    const url = unsplash();
    const photo = await addPhoto({ listingId: id, expectedUpdatedAt: token, url }, agent, { fetch: okFetch(url) });
    expect(photo).toMatchObject({ ok: true, formStale: true });
    expect(await saveListing({ id, expectedUpdatedAt: token, fields: { bedrooms: 5 } }, agent)).toEqual({ ok: false, reason: "stale" });
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).bedrooms).toBe(2);

    // In one session, the returned token carries forward.
    const url2 = unsplash();
    const own = await addPhoto({ listingId: id, expectedUpdatedAt: (photo as { updatedAt: string }).updatedAt, url: url2 }, agent, {
      fetch: okFetch(url2),
    });
    expect(own).toMatchObject({ ok: true });
    expect(own).not.toHaveProperty("formStale");
    const save = await saveListing({ id, expectedUpdatedAt: (own as { updatedAt: string }).updatedAt, fields: { bedrooms: 4 } }, agent);
    expect(save.ok).toBe(true);
  });
});

describe("AC-1: the listings table", () => {
  it("filters by tab, mine, and search, shows advisor and open leads, and pages without repeats", async () => {
    const { actor: pager } = await createProfile("AGENT", { email: "pager.person@test.example" });
    const area = await createArea();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push((await createListing(pager, { areaId: area.id, title: `Pager home ${i}` })).id);
    const listing = await db.listing.findUniqueOrThrow({ where: { id: ids[0] } });

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listAgencyListings({ tab: "drafts", cursor }, pager);
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual([...ids].sort());

    const byCode = await listAgencyListings({ q: listing.refCode.toLowerCase() }, pager);
    expect(byCode.rows.map((r) => r.id)).toEqual([listing.id]);
    expect(byCode.rows[0]).toMatchObject({ advisor: "pager.person", openLeads: 0, priceBdt: 9_500_000 });

    // Not "mine" for another agent unless they turn the toggle off.
    expect((await listAgencyListings({ q: listing.refCode }, agent)).rows).toHaveLength(0);
    expect((await listAgencyListings({ q: listing.refCode, mine: false }, agent)).rows).toHaveLength(1);
    expect((await listAgencyListings({ tab: "published", q: "Pager home" }, pager)).rows).toHaveLength(0);

    await db.listing.update({ where: { id: listing.id }, data: { assignedAgentId: null } });
    const unassigned = await listAgencyListings({ q: listing.refCode }, pager);
    expect(unassigned.rows[0].advisor).toBe("Unassigned");
  });
});
