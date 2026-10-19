import { listingInput, type ListingInput } from "@/lib/domain/listing-schema";
import type { UserRole } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { findOrCreateLeadAndViewing, type BookingInput } from "@/lib/server/bookings";
import { nextListingRef, publishListing } from "@/lib/server/listings";
import { uuidv7 } from "@/lib/server/uuid";

// Test data builders. Every row gets fresh ids, so tests never collide with each
// other or with the seed.

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createProfile(role: UserRole, data: { email?: string | null; fullName?: string } = {}) {
  const id = uuidv7();
  const profile = await db.profile.create({
    data: { id, role, email: data.email === undefined ? `${role.toLowerCase()}.${unique()}@test.example` : data.email, fullName: data.fullName },
  });
  const actor: Actor = { id: profile.id, role: profile.role };
  return { profile, actor };
}

export async function createArea() {
  const slug = `test-area-${unique()}`;
  return db.area.create({ data: { slug, nameEn: slug, nameBn: slug, centerLat: 24.9, centerLng: 91.87, sortOrder: 999 } });
}

export async function firstArea() {
  return db.area.findFirstOrThrow({ orderBy: { slug: "asc" } });
}

export async function createAmenity() {
  const slug = `test-amenity-${unique()}`;
  return db.amenity.create({ data: { slug, label: slug, sortOrder: 999 } });
}

type ListingOptions = Partial<ListingInput> & { publish?: boolean; withCover?: boolean };

// A valid apartment draft by default. `publish` adds a cover and publishes it
// through `publishListing`, so it gets `published_at` like a real listing.
export async function createListing(agent: Actor, options: ListingOptions = {}) {
  const { publish = false, withCover = publish, ...overrides } = options;
  const areaId = overrides.areaId ?? (await firstArea()).id;
  const input = listingInput.parse({
    propertyType: "APARTMENT",
    title: `Test apartment ${unique()}`,
    description: "A test listing.",
    priceBdt: 9_500_000,
    areaId,
    addressLine: "House 1, Road 1",
    latitude: 24.9,
    longitude: 91.87,
    bedrooms: 3,
    bathrooms: 2,
    builtUpSqft: 1450,
    floorNumber: 4,
    completionStatus: "READY",
    ...overrides,
  });

  const listing = await db.$transaction(async (tx) => {
    const { refCode, slug } = await nextListingRef(input.title, tx);
    const { amenityIds, priceBdt, handoverDate, ...fields } = input;
    return tx.listing.create({
      data: {
        ...fields,
        priceBdt: BigInt(priceBdt),
        handoverDate: handoverDate ? new Date(handoverDate) : null,
        refCode,
        slug,
        createdById: agent.id,
        assignedAgentId: agent.role === "AGENT" ? agent.id : null,
        amenities: { create: amenityIds.map((amenityId) => ({ amenityId })) },
      },
    });
  });

  if (withCover) {
    await db.listingPhoto.create({
      data: { listingId: listing.id, url: "https://example.com/cover.jpg", sortOrder: 0, isCover: true, alt: listing.title },
    });
  }
  return publish ? publishListing(listing.id, agent) : listing;
}

export async function createConversation(actor: Actor, startListingId?: string) {
  return db.conversation.create({ data: { userId: actor.id, startListingId } });
}

// Fails unless the write is rejected by the named constraint (raw or Prisma).
export async function expectConstraint(promise: Promise<unknown>, name: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (error === undefined) throw new Error(`Expected ${name} to reject the write, but it succeeded`);
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  if (!text.includes(name)) throw new Error(`Expected ${name}, got: ${text.slice(0, 400)}`);
}

// A booking in its own transaction (spec 0007 moved the transaction to the caller).
export async function bookViewing(input: Omit<BookingInput, "contactWhatsapp"> & { contactWhatsapp?: boolean }, visitor: Actor) {
  return db.$transaction((tx) => findOrCreateLeadAndViewing(tx, { contactWhatsapp: true, ...input }, visitor));
}
