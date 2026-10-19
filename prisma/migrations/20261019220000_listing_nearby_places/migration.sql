-- Nearby places (spec 0011, AC-5, AC-6). Additive only: two enums and a table.
-- The unique (listing_id, sort_order) index also serves lookups by listing.

-- CreateEnum
CREATE TYPE "nearby_place_kind" AS ENUM ('SCHOOL', 'HEALTH', 'MOSQUE', 'MARKET', 'SHOPPING', 'PARK', 'TRANSPORT', 'LANDMARK', 'OTHER');

-- CreateEnum
CREATE TYPE "travel_mode" AS ENUM ('WALK', 'DRIVE');

-- CreateTable
CREATE TABLE "listing_nearby_places" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "nearby_place_kind" NOT NULL,
    "minutes" SMALLINT NOT NULL,
    "mode" "travel_mode" NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "listing_nearby_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_nearby_places_listing_id_sort_order_key" ON "listing_nearby_places"("listing_id", "sort_order");

-- AddForeignKey
ALTER TABLE "listing_nearby_places" ADD CONSTRAINT "listing_nearby_places_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Checks Prisma can't express (spec 0011, data model).
ALTER TABLE listing_nearby_places
  ADD CONSTRAINT listing_nearby_places_name_ck CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT listing_nearby_places_minutes_ck CHECK (minutes BETWEEN 1 AND 120);

-- Row level security on, no policies: only the server (table owner) reads it.
ALTER TABLE listing_nearby_places ENABLE ROW LEVEL SECURITY;

-- Revoke the Supabase API roles where they exist (guarded, as in core_slice1).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE listing_nearby_places FROM %I', r);
    END IF;
  END LOOP;
END
$$;
