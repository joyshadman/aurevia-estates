-- Spec 0014 (saved homes), *Data model*: one row per user and listing they
-- saved. No row level security block (prisma/AGENTS.md: new tables skip it).

CREATE TABLE "saved_homes" (
    "profile_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_homes_pkey" PRIMARY KEY ("profile_id","listing_id")
);

CREATE INDEX "saved_homes_profile_id_created_at_idx" ON "saved_homes"("profile_id", "created_at" DESC);

CREATE INDEX "saved_homes_listing_id_idx" ON "saved_homes"("listing_id");

ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
