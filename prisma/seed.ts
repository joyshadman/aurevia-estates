// `prisma db seed` (spec 0002, AC-2). Safe to rerun.
//   npx prisma db seed               areas and amenities only (every environment)
//   npx prisma db seed -- --sample   plus the sample agent and listings (local, staging)
//
// Runs outside Next.js, so it builds its own Prisma client and never imports
// `server-only` modules.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { listingInput } from "../lib/domain/listing-schema";
import { listingSlug } from "../lib/domain/slug";
import { amenities, areas, factSheetPlaceholder, sampleAgent, sampleListings } from "./seed-data";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DIRECT_URL or DATABASE_URL to seed.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });
const withSample = process.argv.includes("--sample");

async function seedReference() {
  // Created only when the slug is missing, so agent edits survive a rerun.
  const a = await db.area.createMany({ data: areas, skipDuplicates: true });
  const m = await db.amenity.createMany({ data: amenities, skipDuplicates: true });
  console.log(`areas: ${a.count} added, amenities: ${m.count} added`);

  // Only into an empty table, so an agent's saved versions are never touched (spec 0006).
  if ((await db.assistantFactSheet.count()) === 0) {
    await db.assistantFactSheet.create({ data: { body: factSheetPlaceholder, createdAt: new Date() } });
    console.log("fact sheet: placeholder version added");
  }
}

async function seedSample() {
  await db.profile.upsert({ where: { id: sampleAgent.id }, create: sampleAgent, update: sampleAgent });

  const areaIds = new Map((await db.area.findMany({ select: { id: true, slug: true } })).map((a) => [a.slug, a.id]));
  const amenityIds = new Map(
    (await db.amenity.findMany({ select: { id: true, slug: true } })).map((a) => [a.slug, a.id]),
  );
  const idOf = (map: Map<string, string>, slug: string) => {
    const id = map.get(slug);
    if (!id) throw new Error(`Unknown slug in seed data: ${slug}`);
    return id;
  };

  for (const sample of sampleListings) {
    // The same type rules the listing form uses (AC-5), so sample data is valid data.
    const input = listingInput.parse({
      ...sample,
      areaId: idOf(areaIds, sample.areaSlug),
      amenityIds: sample.amenitySlugs.map((slug) => idOf(amenityIds, slug)),
    });
    const data = {
      propertyType: input.propertyType,
      status: "PUBLISHED" as const,
      title: input.title,
      description: input.description,
      priceBdt: BigInt(input.priceBdt),
      priceNegotiable: input.priceNegotiable,
      areaId: input.areaId,
      addressLine: input.addressLine,
      latitude: input.latitude,
      longitude: input.longitude,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      builtUpSqft: input.builtUpSqft,
      landKatha: input.landKatha,
      floorNumber: input.floorNumber,
      totalFloors: input.totalFloors,
      parkingSpaces: input.parkingSpaces,
      completionStatus: input.completionStatus,
      handoverDate: input.handoverDate ? new Date(input.handoverDate) : null,
      assignedAgentId: sampleAgent.id,
      publishedAt: new Date(sample.publishedAt),
    };

    await db.$transaction(async (tx) => {
      const listing = await tx.listing.upsert({
        where: { refCode: sample.refCode },
        create: {
          ...data,
          refCode: sample.refCode,
          slug: listingSlug(sample.title, sample.refCode),
          createdById: sampleAgent.id,
        },
        update: data,
      });
      await tx.listingPhoto.deleteMany({ where: { listingId: listing.id } });
      await tx.listingPhoto.createMany({
        data: sample.photoUrls.map((url, index) => ({
          listingId: listing.id,
          url,
          sortOrder: index,
          isCover: index === 0,
          alt: input.title,
        })),
      });
      await tx.listingAmenity.deleteMany({ where: { listingId: listing.id } });
      await tx.listingAmenity.createMany({
        data: input.amenityIds.map((amenityId) => ({ listingId: listing.id, amenityId })),
      });
    });
  }

  // New listings must not collide with the fixed sample refs.
  await db.$executeRaw`
    SELECT setval('listing_ref_seq', greatest((SELECT max(substring(ref_code from 5)::int) FROM listings), 1010))`;
  console.log(`sample: 1 agent, ${sampleListings.length} listings`);
}

async function main() {
  try {
    await seedReference();
    if (withSample) await seedSample();
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
